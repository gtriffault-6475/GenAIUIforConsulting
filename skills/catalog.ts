// AD-4 — Skill = catalogue code, chargement = table de jointure. Every
// skill is a fixed TypeScript constant here, never free-form DB content:
// `PROJECT_SKILL` (`db/schema.ts`) stores only the join `(projectId,
// skillKey)` — `actions/skill.ts` resolves each row's `skillKey` against
// this catalog at read time. `instructions` is a plain text field for now
// (no `@anthropic-ai/sdk` tool wired to any entry yet — that assembly
// point, `skills/buildRequest.ts`, arrives with Story 2.5/Epic 4; see
// `epic-2-context.md`'s AD-11). Three illustrative OCTO-domain entries for
// Story 2.4 — `references` reprises the PRD glossary's own example
// ("recherche de références"); `rfp-drafting`/`mission-scoping` mirror
// this epic's two seed projects (`integrations/mock/project-provider.ts`:
// the RFP response and the mission note).
export type Skill = {
  key: string;
  name: string;
  description: string;
  instructions: string;
};

export const SKILL_CATALOG: Record<string, Skill> = {
  references: {
    key: 'references',
    name: 'Recherche de références clients',
    description:
      "Identifie, parmi les missions déjà menées par le cabinet, celles pertinentes pour le secteur et le besoin du client, à citer dans une réponse ou une note.",
    instructions:
      "Vous recherchez, parmi les missions déjà réalisées par le cabinet, celles pertinentes pour le secteur et le besoin décrits par le consultant, et vous en résumez la portée et les résultats.",
  },
  'rfp-drafting': {
    key: 'rfp-drafting',
    name: "Rédaction de réponse RFP",
    description:
      "Aide à structurer et rédiger une réponse à un appel d'offres à partir du cahier des charges et du positionnement du cabinet.",
    instructions:
      "Vous aidez à rédiger une réponse à un appel d'offres, en structurant le contenu autour des exigences du cahier des charges et du positionnement du cabinet.",
  },
  'mission-scoping': {
    key: 'mission-scoping',
    name: 'Note de cadrage de mission',
    description:
      'Aide à structurer une note de cadrage de mission : contexte, objectifs, périmètre et livrables attendus.',
    instructions:
      "Vous aidez à rédiger une note de cadrage de mission, en couvrant le contexte, les objectifs, le périmètre et les livrables attendus.",
  },
};
