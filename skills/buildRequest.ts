import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { APP_STATE_ID, appState } from '@/db/schema';
import {
  DEMO_FALLBACK_REPLY,
  DEMO_REWORK_REPLY,
  isDemoReworkPrompt,
  matchDemoChatEntry,
  matchDemoStepSuggestion,
} from '@/skills/demoScript';

// spec-toggle-mode-demo-ui.md — the demo mode's activation state moved
// from an environment variable (`DEMO_MODE`, read once via
// `skills/demoScript.ts`'s now-removed `isDemoModeActive`) to a persisted
// `db` column (`appState.demoModeActive`, `actions/demo.ts`), so a toggle
// clicked in the UI takes effect on the very next agent call, with no
// server restart. This is a narrow, documented `db` read directly inside
// `skills/`, the same exception already made a few lines below for
// `process.env['ANTHROPIC_API_KEY']` (`new Anthropic()`'s own default
// behavior) — both are infrastructure/assembly concerns local to this one
// function, not business logic that belongs in `actions/`. Kept as a
// plain top-level function (not exported) rather than added to
// `skills/demoScript.ts`, which stays pure and `db`-free (that file's own
// header comment) — only *what* the demo mode says is that file's
// concern, never *whether* it is active.
//
// Tour 2 (bmad-review, blind-hunter + edge-case-hunter convergence): this
// read has its own `try/catch`, unlike Tour 1, so a transient DB error here
// can never escape `sendToAgent` as an uncaught exception -- the function's
// own header comment already promises every failure comes back as
// `{ok:false,error}`, never an unhandled throw. Every real caller today
// (`sendMessage`, `getStartingSuggestion`, `reworkSuggestion`) happens to
// wrap its own call in a try/catch too, so this was never reachable as a
// user-visible crash -- but relying on that elsewhere is fragile, and this
// function should keep its own promise regardless of what callers do.
// Degrades to `false` (the real path) on failure, the same fail-safe
// direction as `getDemoModeActive`/`app/layout.tsx` elsewhere in this spec.
async function isDemoModeActive(): Promise<boolean> {
  try {
    const [state] = await db
      .select({ demoModeActive: appState.demoModeActive })
      .from(appState)
      .where(eq(appState.id, APP_STATE_ID));

    return state?.demoModeActive ?? false;
  } catch (error) {
    console.error('sendToAgent: failed to read demoModeActive, falling back to the real path', error);
    return false;
  }
}

// AD-11 — the single assembly point for every `@anthropic-ai/sdk` Messages
// API call. No other Server Action may instantiate an Anthropic client —
// `actions/message.ts`'s `sendMessage` is the only caller today, and
// any future caller (Epic 4's tool-using skills) must route through here
// too, so the system prompt and history are always assembled the same way
// regardless of which Server Action triggered the call.
//
// `ANTHROPIC_API_KEY` is read only here, via `new Anthropic()`'s own
// default behavior of reading `process.env['ANTHROPIC_API_KEY']` — never
// passed through a component prop or exposed to the client (Story 2.5's
// Boundaries).

export type LoadedSkillInstructions = {
  skillKey: string;
  instructions: string;
};

export type BuildRequestMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SendToAgentResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

// Story 4.2 — Génération des suggestions ancrées à l'écriture (AD-11,
// Design Notes). The result of running a tool the model asked for — never
// touches `db` itself (AD-2): the caller supplies a closure
// (`actions/message.ts`'s `sendMessage` builds one around
// `actions/livrable.ts`'s `createLivrableWithSuggestions`) that does the
// actual persistence and reports back only success/failure plus the text
// to hand the model as its `tool_result`.
export type ExecuteToolResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

// Extracts the final natural-language reply from a Messages API response —
// shared by both the no-tool path (Story 2.5, unchanged) and the second
// call of the tool cycle below (Design Notes step 4). Concatenates every
// text block rather than taking only the first: normally a reply is one
// block, but nothing guarantees that.
function extractText(response: Anthropic.Message): SendToAgentResult {
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');

  if (!text) {
    return {
      ok: false,
      error: "La réponse de l'agent ne contient aucun texte exploitable.",
    };
  }

  return { ok: true, content: text };
}

// Story 2.5 — Sélection du modèle et envoi d'un message. Builds the system
// prompt from the loaded skills' instructions (load order, per AD-11),
// maps the conversation history to alternating Messages API turns, and
// calls the Messages API with the model chosen in the composer for this
// one message (never a hidden default). No streaming, ever.
//
// Story 4.2 adds the optional `tool`/`executeTool` pair (Design Notes): when
// both are supplied and the model's first reply asks to use the tool, this
// runs the full tool cycle (at most 2 `messages.create` calls, still no
// streaming) before returning. `propose_starting_point.ts` passes neither,
// so its call takes the exact same single-call path as before this story —
// strictly unchanged behavior.
//
// Everything here — client construction and every API call alike — is
// wrapped in a single `try/catch` so a missing/invalid `ANTHROPIC_API_KEY`,
// a network failure, or any other SDK error always comes back as
// `{ok:false,error}` and never as an uncaught exception reaching the
// caller (`sendMessage`) or the UI.
export async function sendToAgent({
  loadedSkills,
  history,
  model,
  tool,
  executeTool,
}: {
  loadedSkills: LoadedSkillInstructions[];
  history: BuildRequestMessage[];
  model: string;
  tool?: Anthropic.Tool;
  executeTool?: (input: unknown) => Promise<ExecuteToolResult>;
}): Promise<SendToAgentResult> {
  // Mode démo scripté (spec-mode-demo-scripte.md, activation désormais
  // pilotée depuis l'UI par spec-toggle-mode-demo-ui.md) — interception
  // tout en haut du corps de la fonction, avant toute construction de
  // client Anthropic (Code Map: "avant `new Anthropic()`"), donc avant
  // même le calcul de `systemPrompt`/`turns` ci-dessous qui n'a de sens que
  // pour un vrai appel. `isDemoModeActive` (déclarée juste au-dessus) est
  // le seul point de lecture de `appState.demoModeActive` : explicite
  // uniquement (une colonne `NULL`/`false`, jamais une bascule automatique
  // sur simple absence de clé API — Décisions, Checkpoint 1) — une vraie
  // panne de clé dans un déploiement mal configuré reste donc un vrai
  // échec visible (Boundaries: Always), inchangée par ce bloc puisqu'il ne
  // s'exécute jamais dans ce cas.
  if (await isDemoModeActive()) {
    try {
      // Chemin chat (`sendMessage`, Design Notes) : `tool`/`executeTool`
      // sont toujours fournis ensemble par cet appelant, jamais l'un sans
      // l'autre. `matchDemoChatEntry` cherche sur le dernier tour `user`
      // de `history` (jamais `turns`, qui n'existe pas dans cette branche).
      if (tool && executeTool) {
        const latestUserTurn = [...history]
          .reverse()
          .find((entry) => entry.role === 'user');
        const entry = latestUserTurn
          ? matchDemoChatEntry(latestUserTurn.content)
          : null;

        if (!entry) {
          return { ok: true, content: DEMO_FALLBACK_REPLY };
        }

        if (entry.toolCall) {
          // Même closure que le chemin réel (Design Notes) — vraie
          // transaction DB, AD-2 inchangé : le livrable/les suggestions
          // créés sont de vraies lignes, seul l'appel API est simulé. Le
          // contenu scripté est entièrement maîtrisé par ce fichier, donc
          // une vraie panne ici (ex. une erreur DB) n'est pas "l'absence de
          // clé API" que le mode démo simule — un bug réel mérite de rester
          // visible (Tour 2, findings convergents blind-hunter/edge-case-
          // hunter) exactement comme le chemin réel ci-dessous le fait déjà
          // pour son propre échec d'outil, plutôt que d'afficher une
          // réponse canned qui prétendrait à tort qu'un livrable a été créé.
          const toolResult = await executeTool(entry.toolCall);
          if (!toolResult.ok) {
            console.error(
              'sendToAgent (mode démo) : executeTool a échoué sur une entrée scriptée',
              toolResult.error,
            );
            return { ok: false, error: toolResult.error };
          }
        }

        return { ok: true, content: entry.reply };
      }

      // Deux appelants réels partagent cette même forme d'appel (ni `tool`
      // ni `executeTool`, un seul tour `history`) : `proposeStartingPoint`
      // et `reworkSuggestionContent` (Tour 2, bad_spec -- oublié par
      // l'Intent d'origine, voir Spec Change Log). `isDemoReworkPrompt`
      // vérifie d'abord un marqueur exact du prompt de ce dernier avant de
      // retomber sur la correspondance par étape, sans quoi une demande de
      // retravail recevait par erreur une suggestion de démarrage d'étape
      // sans rapport (le bug trouvé par la lentille verification-gap).
      const promptText = history[0]?.content ?? '';
      if (isDemoReworkPrompt(promptText)) {
        return { ok: true, content: DEMO_REWORK_REPLY };
      }
      return { ok: true, content: matchDemoStepSuggestion(promptText) };
    } catch (error) {
      // Même filet de sécurité que le chemin réel ci-dessous : une panne
      // inattendue dans le script lui-même (jamais un vrai appel réseau,
      // puisqu'aucun n'est fait dans cette branche) ne doit jamais remonter
      // comme une exception non attrapée.
      console.error('sendToAgent (mode démo) failed', error);
      return {
        ok: false,
        error: "L'appel à l'agent IA a échoué.",
      };
    }
  }

  try {
    const systemPrompt = loadedSkills
      .map((skill) => skill.instructions)
      .join('\n\n');

    // The Messages API requires strictly alternating `user`/`assistant`
    // turns. Round 1 always inserts one user message per `sendMessage`
    // call, but a prior call whose assistant reply failed (see
    // `sendMessage`'s `assistantFailed` path) leaves no assistant row
    // between that user message and the next one — merging consecutive
    // same-role turns (joined by a blank line) keeps every request valid
    // regardless of that history, rather than letting the SDK reject it.
    const turns: BuildRequestMessage[] = [];
    for (const entry of history) {
      const last = turns[turns.length - 1];
      if (last && last.role === entry.role) {
        last.content = `${last.content}\n\n${entry.content}`;
      } else {
        turns.push({ role: entry.role, content: entry.content });
      }
    }

    if (turns.length === 0) {
      return { ok: false, error: "Aucun message à envoyer à l'agent." };
    }

    const anthropic = new Anthropic();

    const apiMessages: Anthropic.MessageParam[] = turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(tool ? { tools: [tool] } : {}),
      messages: apiMessages,
    });

    // No tool cycle: either this call was made without a `tool`/
    // `executeTool` pair (`propose_starting_point.ts`'s exact path,
    // strictly unchanged), or the model simply chose not to use the tool
    // it was offered — both fall back to the original text-extraction
    // path, exactly as before this story.
    if (response.stop_reason !== 'tool_use' || !tool || !executeTool) {
      return extractText(response);
    }

    // Design Notes' tool cycle, step 2: a single `tool_use` block is
    // expected — "un seul tool_use géré par réponse, un seul outil
    // existe" (Never). `.find` rather than assuming the first block is
    // guaranteed correct if the model ever also emits leading text.
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      // `stop_reason === 'tool_use'` with no actual tool_use block would be
      // an SDK/API inconsistency, not a case this cycle can recover from —
      // fall back to whatever text is present rather than throwing.
      return extractText(response);
    }

    // Step 2: run the caller's tool — never touches `db` from here (AD-2).
    const toolResult = await executeTool(toolUseBlock.input);

    // Step 3: the first call's own `response.content` becomes the next
    // `assistant` turn verbatim, followed by a `user` turn carrying the
    // `tool_result` (marked `is_error` on failure) so the model can react
    // to it either way.
    const toolResultMessage: Anthropic.MessageParam = {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: toolResult.ok ? toolResult.content : toolResult.error,
          ...(toolResult.ok ? {} : { is_error: true }),
        },
      ],
    };

    // Step 4: second (and last) `messages.create` call with the extended
    // history — no `tools` this time, so the model cannot chain a further
    // tool_use (Never: "un seul tool_use géré par réponse"). Its text
    // reply is the final result `sendToAgent` returns.
    const secondResponse = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [
        ...apiMessages,
        { role: 'assistant', content: response.content },
        toolResultMessage,
      ],
    });

    return extractText(secondResponse);
  } catch (error) {
    // Deliberately generic: this catches everything from a missing/invalid
    // API key to a rate limit, a content-policy refusal, or a network
    // failure — naming one specific cause here would misdiagnose the
    // others. The real cause is logged server-side for troubleshooting;
    // the user-facing message only states the outcome, per CONVENTIONS.md.
    console.error('sendToAgent failed', error);
    return {
      ok: false,
      error: "L'appel à l'agent IA a échoué.",
    };
  }
}
