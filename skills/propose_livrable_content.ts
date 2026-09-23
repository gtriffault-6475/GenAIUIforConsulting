import type Anthropic from '@anthropic-ai/sdk';

// Story 4.2 — Génération des suggestions ancrées à l'écriture (AD-3). The
// agent's first real `@anthropic-ai/sdk` tool. Available on *every*
// `sendMessage` call (`actions/message.ts`), never gated behind a
// loaded skill the way `skills/catalog.ts`'s entries are — this tool lives
// outside `SKILL_CATALOG` entirely, and only its own `description` below
// guides the model toward calling it. Per this spec's Boundaries, block
// ids are always generated server-side (`crypto.randomUUID()`, in
// `actions/livrable.ts`): the model only ever supplies plain paragraph
// text (`blocks: string[]`) and per-block suggestions addressed by
// position (`blockIndex`), never an id itself.
export const PROPOSE_LIVRABLE_CONTENT_TOOL: Anthropic.Tool = {
  name: 'propose_livrable_content',
  description:
    "Crée un nouveau livrable (document) pour le projet à partir d'un contenu rédigé, avec des suggestions d'amélioration ancrées à des paragraphes précis. À utiliser uniquement quand le consultant demande explicitement la rédaction d'un document (par exemple une réponse à un appel d'offres ou une note de cadrage de mission) — jamais pour une simple réponse conversationnelle qui ne produit pas de document.",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Le titre du livrable créé.',
      },
      blocks: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Le contenu du livrable, découpé en paragraphes ordonnés (un paragraphe de texte par élément du tableau).',
      },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            blockIndex: {
              type: 'number',
              description:
                "L'index, à partir de 0, du paragraphe de \"blocks\" ciblé par cette suggestion.",
            },
            text: {
              type: 'string',
              description: "Le texte de la suggestion d'amélioration.",
            },
          },
          required: ['blockIndex', 'text'],
        },
        description:
          "Suggestions d'amélioration sur le contenu proposé, chacune ancrée à un paragraphe de \"blocks\" par sa position.",
      },
    },
    required: ['title', 'blocks', 'suggestions'],
  },
};

export type ProposedLivrableContent = {
  title: string;
  blocks: string[];
  suggestions: { blockIndex: number; text: string }[];
};

export type ParseProposeLivrableContentInputResult =
  | { ok: true; data: ProposedLivrableContent }
  | { ok: false; error: string };

// Pure validation, no I/O (per the Code Map's own words) — `tool_use.input`
// is typed `unknown` by the SDK itself, and nothing guarantees a model's
// tool call actually matches `input_schema` above at runtime. Returns
// `{ok:false}` on any mismatch rather than throwing, so the caller
// (`actions/message.ts`'s `executeTool`, via `skills/buildRequest.ts`)
// can turn a malformed call into a `tool_result` with `is_error: true`
// instead of an uncaught exception reaching `sendMessage`.
export function parseProposeLivrableContentInput(
  input: unknown,
): ParseProposeLivrableContentInputResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Entrée invalide : un objet est attendu.' };
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') {
    return {
      ok: false,
      error: 'Entrée invalide : "title" doit être une chaîne non vide.',
    };
  }

  if (
    !Array.isArray(candidate.blocks) ||
    candidate.blocks.length === 0 ||
    !candidate.blocks.every((block) => typeof block === 'string')
  ) {
    return {
      ok: false,
      error:
        'Entrée invalide : "blocks" doit être un tableau non vide de chaînes.',
    };
  }
  const blocks = candidate.blocks as string[];

  if (!Array.isArray(candidate.suggestions)) {
    return {
      ok: false,
      error: 'Entrée invalide : "suggestions" doit être un tableau.',
    };
  }

  const suggestions: { blockIndex: number; text: string }[] = [];
  const seenBlockIndexes = new Set<number>();
  for (const entry of candidate.suggestions) {
    if (typeof entry !== 'object' || entry === null) {
      return {
        ok: false,
        error:
          'Entrée invalide : chaque suggestion doit être un objet {blockIndex, text}.',
      };
    }
    const entryCandidate = entry as Record<string, unknown>;
    const { blockIndex, text } = entryCandidate;

    if (typeof blockIndex !== 'number' || typeof text !== 'string') {
      return {
        ok: false,
        error:
          'Entrée invalide : chaque suggestion doit avoir "blockIndex" (nombre) et "text" (chaîne).',
      };
    }

    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= blocks.length) {
      return {
        ok: false,
        error: `Entrée invalide : "blockIndex" (${blockIndex}) est hors des bornes de "blocks".`,
      };
    }

    // Two suggestions targeting the same block would both resolve to the
    // same block id in `createLivrableWithSuggestions`, and the second
    // SUGGESTION insert would violate the partial unique index
    // (`db/schema.ts`: one pending anchored suggestion per block) mid-
    // transaction, rolling back the LIVRABLE row along with every other
    // valid suggestion. Reject here, before that transaction ever runs.
    if (seenBlockIndexes.has(blockIndex)) {
      return {
        ok: false,
        error: `Entrée invalide : plusieurs suggestions ciblent le même paragraphe (blockIndex ${blockIndex}).`,
      };
    }
    seenBlockIndexes.add(blockIndex);

    suggestions.push({ blockIndex, text });
  }

  return { ok: true, data: { title: candidate.title, blocks, suggestions } };
}
