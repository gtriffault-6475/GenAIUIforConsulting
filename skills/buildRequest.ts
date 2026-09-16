import Anthropic from '@anthropic-ai/sdk';

// AD-11 — the single assembly point for every `@anthropic-ai/sdk` Messages
// API call. No other Server Action may instantiate an Anthropic client —
// `actions/conversation.ts`'s `sendMessage` is the only caller today, and
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

// Story 2.5 — Sélection du modèle et envoi d'un message. Builds the system
// prompt from the loaded skills' instructions (load order, per AD-11),
// maps the conversation history to alternating Messages API turns, and
// calls the Messages API with the model chosen in the composer for this
// one message (never a hidden default). No streaming, no tool use (Never,
// per the spec) — one blocking call, the full reply returned at once.
//
// Everything here — client construction and the API call alike — is
// wrapped in a single `try/catch` so a missing/invalid `ANTHROPIC_API_KEY`,
// a network failure, or any other SDK error always comes back as
// `{ok:false,error}` and never as an uncaught exception reaching the
// caller (`sendMessage`) or the UI.
export async function sendToAgent({
  loadedSkills,
  history,
  model,
}: {
  loadedSkills: LoadedSkillInstructions[];
  history: BuildRequestMessage[];
  model: string;
}): Promise<SendToAgentResult> {
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

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
    });

    // Concatenate every text block rather than taking only the first: with
    // no tool use, a reply is normally one block, but nothing guarantees
    // that — picking just `.find(...)`'s first match would silently drop
    // any further text the model returned.
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
