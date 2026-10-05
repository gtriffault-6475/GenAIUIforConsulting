import type Anthropic from '@anthropic-ai/sdk';

// Story 5.4 — the only tool offered in the conversation of a livrable
// imported from Google Slides (`domain/agent-tools.ts`). It adds anchored
// suggestions on existing zones, identified by their block id; it never
// writes the livrable itself (no added, removed, reordered or retitled
// block). Each suggestion's `text` is the proposed replacement text of the
// zone, exactly like an Epic 4 anchored suggestion.
export const PROPOSE_ANCHORED_SUGGESTIONS_TOOL: Anthropic.Tool = {
  name: 'propose_anchored_suggestions',
  description:
    "Propose des suggestions d'amélioration sur des zones de texte existantes de la présentation liée à cette conversation. Chaque suggestion cible une zone par son identifiant (fourni dans le contenu de la présentation) et donne le nouveau texte proposé pour cette zone. N'ajoute, ne supprime et ne réordonne jamais de zone. À utiliser quand le consultant demande d'améliorer, de reformuler ou de réviser la présentation.",
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            blockId: {
              type: 'string',
              description: "L'identifiant exact de la zone ciblée, tel que fourni entre crochets.",
            },
            text: {
              type: 'string',
              description: 'Le nouveau texte proposé pour toute la zone.',
            },
          },
          required: ['blockId', 'text'],
        },
        description: 'Une suggestion au plus par zone.',
      },
    },
    required: ['suggestions'],
  },
};

export type ProposedAnchoredSuggestions = { blockId: string; text: string }[];

// Epic 5 retrospective (A6): an unknown zone id no longer rejects the
// whole batch — it is passed through and reported zone by zone by
// `addAnchoredSuggestions` (`skippedMissing`), which re-checks the blocks
// inside its own transaction anyway.
export function parseProposeAnchoredSuggestionsInput(
  input: unknown,
): { ok: true; data: ProposedAnchoredSuggestions } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Entrée invalide : un objet est attendu.' };
  }
  const suggestions = (input as Record<string, unknown>).suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return { ok: false, error: 'Entrée invalide : "suggestions" doit être un tableau non vide.' };
  }

  const seen = new Set<string>();
  const data: ProposedAnchoredSuggestions = [];
  for (const entry of suggestions) {
    const candidate = (entry ?? {}) as Record<string, unknown>;
    const { blockId, text } = candidate;
    if (typeof blockId !== 'string' || typeof text !== 'string') {
      return {
        ok: false,
        error: 'Entrée invalide : chaque suggestion doit avoir "blockId" et "text" (chaînes).',
      };
    }
    if (seen.has(blockId)) {
      return { ok: false, error: `Entrée invalide : la zone "${blockId}" est ciblée plusieurs fois.` };
    }
    if (text.trim() === '') {
      return { ok: false, error: `Entrée invalide : le texte proposé pour "${blockId}" est vide.` };
    }
    seen.add(blockId);
    data.push({ blockId, text });
  }
  return { ok: true, data };
}
