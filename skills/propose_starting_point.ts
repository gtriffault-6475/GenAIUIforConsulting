import type { LoadedSkillInstructions, SendToAgentResult } from '@/skills/buildRequest';
import { sendToAgent } from '@/skills/buildRequest';
import { MODELS } from '@/skills/models';

// Story 3.3 — Suggestion proactive de démarrage. Second real caller of
// `skills/buildRequest.ts`'s `sendToAgent` (AD-11) alongside `sendMessage`
// (`actions/message.ts`) — every `@anthropic-ai/sdk` call still goes
// through that single assembly point, this file only shapes the prompt
// and picks the model. Never persists anything (AD-7): the caller
// (`actions/conversation.ts`'s `getStartingSuggestion`) hands the result
// straight to the client, nothing is written to MESSAGE or any other
// table here.
//
// Always uses `MODELS[0].id` (Claude Sonnet 5) — a proactive suggestion is
// generated before the consultant has chosen anything in the composer, so
// there is no user-selected model yet to honor (unlike `sendMessage`,
// which always sends the composer's own choice).
export async function proposeStartingPoint({
  stepLabel,
  loadedSkills,
}: {
  stepLabel: string;
  loadedSkills: LoadedSkillInstructions[];
}): Promise<SendToAgentResult> {
  // One synthetic user turn — `sendToAgent` has no separate "instruction"
  // channel beyond the loaded skills' own system prompt, so the tone and
  // format constraints (CONVENTIONS.md: vouvoiement, sobre, jamais de
  // point d'exclamation, jamais une question enjouée) travel inside this
  // same message rather than requiring a change to `buildRequest.ts`.
  const prompt = [
    `Le consultant vient d'ouvrir l'étape "${stepLabel}" d'une démarche avant-vente ; la conversation est vide.`,
    'Proposez, en une ou deux phrases, une première action concrète et factuelle pour démarrer cette étape.',
    "N'utilisez ni point d'exclamation, ni formulation de question enjouée, ni emoji : énoncez l'action proposée sobrement, en vouvoyant.",
  ].join(' ');

  return sendToAgent({
    loadedSkills,
    history: [{ role: 'user', content: prompt }],
    model: MODELS[0].id,
  });
}
