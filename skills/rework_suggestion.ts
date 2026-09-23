import type { LoadedSkillInstructions, SendToAgentResult } from '@/skills/buildRequest';
import { sendToAgent } from '@/skills/buildRequest';
import { MODELS } from '@/skills/models';

// Story 4.3 — Traitement d'une suggestion ancrée (AD-11). Third real caller
// of `skills/buildRequest.ts`'s `sendToAgent`, alongside `sendMessage`
// (`actions/message.ts`) and `proposeStartingPoint`
// (`skills/propose_starting_point.ts`) — every `@anthropic-ai/sdk` call
// still goes through that single assembly point. Neither `tool` nor
// `executeTool` is passed (the spec's Always: "sans outil, juste une
// reformulation") — this is a plain text-in/text-out call, never a second
// `propose_livrable_content` cycle. Never persists anything itself: the
// caller (`actions/suggestion.ts`'s `reworkSuggestion`) decides what to do
// with the result (write the new text on success, restore the old text on
// failure).
//
// Always uses `MODELS[0].id` (Claude Sonnet 5), same reasoning as
// `proposeStartingPoint`: the floating rework field (`SuggestionCard.tsx`)
// has no model selector of its own — there is no user-chosen model to
// honor here, unlike `sendMessage`.
export async function reworkSuggestionContent({
  blockText,
  suggestionText,
  instructions,
  loadedSkills,
}: {
  blockText: string;
  suggestionText: string;
  instructions: string;
  loadedSkills: LoadedSkillInstructions[];
}): Promise<SendToAgentResult> {
  // One synthetic user turn, same shape as `proposeStartingPoint`'s prompt:
  // `sendToAgent` has no separate "instruction" channel beyond the loaded
  // skills' own system prompt, so the tone/format constraints
  // (CONVENTIONS.md: vouvoiement, sobre, jamais de point d'exclamation,
  // jamais d'emoji) and the "reply with only the new text" constraint both
  // travel inside this same message.
  const prompt = [
    `Voici le paragraphe actuel du livrable : "${blockText}"`,
    `Voici la suggestion d'amélioration actuellement proposée sur ce paragraphe : "${suggestionText}"`,
    `Le consultant demande de retravailler cette suggestion avec les précisions suivantes : "${instructions}"`,
    'Répondez uniquement par le nouveau texte de la suggestion reformulée, sans préambule ni commentaire, en vouvoyant, sans emoji ni point d\'exclamation.',
  ].join(' ');

  return sendToAgent({
    loadedSkills,
    history: [{ role: 'user', content: prompt }],
    model: MODELS[0].id,
  });
}
