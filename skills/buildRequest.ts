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

// Story 4.2 — Génération des suggestions ancrées à l'écriture (AD-11,
// Design Notes). The result of running a tool the model asked for — never
// touches `db` itself (AD-2): the caller supplies a closure
// (`actions/conversation.ts`'s `sendMessage` builds one around
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
