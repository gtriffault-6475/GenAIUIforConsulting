import type Anthropic from '@anthropic-ai/sdk';

export const MAX_PROPOSED_SLIDES = 30;

// Story 5.6 — offered only in a conversation without livrable while Google
// Drive is connected (`domain/agent-tools.ts`). The agent proposes the
// outline of a new presentation; nothing is created by the tool itself:
// `actions/message.ts` stores the proposal with the reply, and the deck is
// only created in Drive when the consultant clicks "Créer dans Drive".
export const PROPOSE_PRESENTATION_TOOL: Anthropic.Tool = {
  name: 'propose_presentation',
  description:
    "Propose au consultant une nouvelle présentation Google Slides (titre et diapositives dans l'ordre). À appeler systématiquement dès que le consultant demande une présentation, des slides, des diapositives, un deck ou un support de présentation — y compris s'il parle de « livrable » pour désigner ce support. N'écrivez pas le plan ou le contenu des diapositives dans votre réponse à la place de cet outil, sauf si le consultant demande explicitement un plan en texte. Rien n'est créé : le consultant voit la proposition sous votre réponse et décide de la créer dans le Drive du projet, au modèle OCTO, ou de vous demander de l'ajuster ; votre réponse la présente en une ou deux phrases.",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Le titre de la présentation (aussi le nom du fichier dans Drive).',
      },
      slides: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PROPOSED_SLIDES,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Le titre de la diapositive.' },
            content: {
              type: 'string',
              description:
                'Le texte du corps de la diapositive, une idée par ligne. Vide pour la diapositive de couverture si besoin.',
            },
          },
          required: ['title', 'content'],
        },
        description:
          'Les diapositives dans l’ordre ; la première sert de couverture (titre de la présentation et sous-titre).',
      },
    },
    required: ['title', 'slides'],
  },
};

export type ProposedSlide = { title: string; content: string };
export type ProposedPresentation = { title: string; slides: ProposedSlide[] };

export function parseProposePresentationInput(
  input: unknown,
): { ok: true; data: ProposedPresentation } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Entrée invalide : un objet est attendu.' };
  }
  const { title, slides } = input as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') {
    return { ok: false, error: 'Entrée invalide : "title" doit être une chaîne non vide.' };
  }
  if (!Array.isArray(slides) || slides.length === 0 || slides.length > MAX_PROPOSED_SLIDES) {
    return {
      ok: false,
      error: `Entrée invalide : "slides" doit contenir entre 1 et ${MAX_PROPOSED_SLIDES} diapositives.`,
    };
  }

  const data: ProposedSlide[] = [];
  for (const [index, entry] of slides.entries()) {
    const candidate = (entry ?? {}) as Record<string, unknown>;
    const slideTitle = candidate.title ?? '';
    const content = candidate.content ?? '';
    if (typeof slideTitle !== 'string' || typeof content !== 'string') {
      return {
        ok: false,
        error: `Entrée invalide : la diapositive ${index + 1} doit avoir "title" et "content" (chaînes).`,
      };
    }
    if (slideTitle.trim() === '' && content.trim() === '') {
      return { ok: false, error: `Entrée invalide : la diapositive ${index + 1} est vide.` };
    }
    data.push({ title: slideTitle.trim(), content: content.trim() });
  }
  return { ok: true, data: { title: title.trim(), slides: data } };
}

// Reads a stored proposal's `slides` column back; tolerant (a malformed
// row yields `[]`, shown as an empty proposal, never a crash).
export function parseStoredSlides(raw: string): ProposedSlide[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        title: typeof item.title === 'string' ? item.title : '',
        content: typeof item.content === 'string' ? item.content : '',
      }));
  } catch {
    return [];
  }
}
