// AD-4 — Skill = catalogue code, chargement = table de jointure. Every
// skill is a fixed TypeScript constant here, never free-form DB content:
// `PROJECT_SKILL` (`db/schema.ts`) stores only the join `(projectId,
// skillKey)` — `actions/skill.ts` resolves each row's `skillKey` against
// this catalog at read time. `instructions` is a plain text field for now
// (no `@anthropic-ai/sdk` tool wired to any entry yet — that assembly
// point, `skills/buildRequest.ts`, arrives with Story 2.5/Epic 4; see
// `epic-2-context.md`'s AD-11). Story 2.4 started with three illustrative
// OCTO-domain entries — `references` reprises the PRD glossary's own
// example ("recherche de références"); `rfp-drafting`/`mission-scoping`
// mirror this epic's two seed projects (`integrations/mock/project-provider.ts`:
// the RFP response and the mission note). The other ten were added so the
// demo catalogue popup reads as a firm-wide catalogue (see below).
export type Skill = {
  key: string;
  name: string;
  description: string;
  // spec-demo-catalogue-skills.md — free-form label used by the demo
  // catalogue popup (`SkillCatalogDialog.tsx`) to group entries; its list
  // of categories is derived from this field, never hardcoded.
  category: string;
  instructions: string;
};

export const SKILL_CATALOG: Record<string, Skill> = {
  // Grouped by category so the demo catalogue popup (which lists entries
  // and derives its categories in insertion order) reads in a deliberate
  // order. spec-demo-enrichissement-catalogue-skills.md added all entries
  // but `references`/`rfp-drafting`/`mission-scoping`; their `instructions`
  // are real, since any of them can be loaded on a project and end up in
  // the system prompt (AD-11).
  'rfp-drafting': {
    key: 'rfp-drafting',
    name: "Rédaction de réponse RFP",
    category: 'Avant-vente',
    description:
      "Aide à structurer et rédiger une réponse à un appel d'offres à partir du cahier des charges et du positionnement du cabinet.",
    instructions:
      "Vous aidez à rédiger une réponse à un appel d'offres, en structurant le contenu autour des exigences du cahier des charges et du positionnement du cabinet.",
  },
  'rfp-qualification': {
    key: 'rfp-qualification',
    name: "Qualification d'appel d'offres (go / no-go)",
    category: 'Avant-vente',
    description:
      "Évalue l'opportunité de répondre à un appel d'offres : adéquation au savoir-faire du cabinet, chances de gain, risques et effort de réponse.",
    instructions:
      "Vous aidez à décider s'il faut répondre à un appel d'offres. Évaluez l'adéquation du besoin avec le savoir-faire du cabinet, la relation avec le client, la concurrence probable, les risques et l'effort de réponse, puis proposez une recommandation go / no-go argumentée.",
  },
  'pricing-estimation': {
    key: 'pricing-estimation',
    name: 'Chiffrage et plan de charge',
    category: 'Avant-vente',
    description:
      "Aide à estimer la charge d'une mission par lot et par profil, et à construire un plan de charge cohérent avec le planning proposé.",
    instructions:
      "Vous aidez à chiffrer une mission. Décomposez-la en lots, estimez la charge par profil de consultant, rendez explicites les hypothèses de chiffrage et les risques, et vérifiez la cohérence entre la charge, l'équipe et le planning proposés. N'inventez jamais de taux journaliers ni de grille tarifaire : si le consultant ne les fournit pas, raisonnez en jours-hommes et signalez les tarifs comme à compléter.",
  },
  'mission-scoping': {
    key: 'mission-scoping',
    name: 'Note de cadrage de mission',
    category: 'Cadrage de mission',
    description:
      'Aide à structurer une note de cadrage de mission : contexte, objectifs, périmètre et livrables attendus.',
    instructions:
      "Vous aidez à rédiger une note de cadrage de mission, en couvrant le contexte, les objectifs, le périmètre et les livrables attendus.",
  },
  'workshop-facilitation': {
    key: 'workshop-facilitation',
    name: "Préparation d'atelier",
    category: 'Cadrage de mission',
    description:
      "Aide à concevoir un atelier client : objectifs, participants, déroulé minuté, formats d'animation et livrables de sortie.",
    instructions:
      "Vous aidez à préparer un atelier avec un client. Proposez les objectifs, les participants attendus, un déroulé minuté, des formats d'animation adaptés et les livrables à produire à l'issue de l'atelier.",
  },
  references: {
    key: 'references',
    name: 'Recherche de références clients',
    category: 'Capitalisation',
    description:
      "Identifie, parmi les missions déjà menées par le cabinet, celles pertinentes pour le secteur et le besoin du client, à citer dans une réponse ou une note.",
    instructions:
      "Vous recherchez, parmi les missions déjà réalisées par le cabinet, celles pertinentes pour le secteur et le besoin décrits par le consultant, et vous en résumez la portée et les résultats.",
  },
  'expert-finder': {
    key: 'expert-finder',
    name: "Recherche d'experts du cabinet",
    category: 'Capitalisation',
    description:
      "Identifie les compétences et les profils du cabinet à mobiliser sur un sujet, pour une réponse à appel d'offres ou une mission.",
    instructions:
      "Vous aidez à identifier les profils du cabinet à mobiliser sur un sujet. À partir du besoin décrit, listez les compétences clés attendues, le type d'expérience recherché et le rôle de chaque profil dans l'équipe proposée. Vous n'avez pas accès à l'annuaire du cabinet : ne nommez et n'inventez jamais de personnes, décrivez des profils.",
  },
  'architecture-review': {
    key: 'architecture-review',
    name: "Revue d'architecture",
    category: 'Architecture & tech',
    description:
      "Structure l'analyse d'une architecture existante : points forts, dette technique, risques et recommandations priorisées.",
    instructions:
      "Vous aidez à mener une revue d'architecture. À partir des éléments fournis, analysez les points forts, la dette technique, les risques (sécurité, performance, exploitabilité, évolutivité) et proposez des recommandations priorisées selon leur impact et leur effort.",
  },
  'cloud-migration': {
    key: 'cloud-migration',
    name: 'Stratégie de migration cloud',
    category: 'Architecture & tech',
    description:
      "Aide à définir une trajectoire de migration vers le cloud : inventaire applicatif, choix de stratégie par application, vagues et prérequis.",
    instructions:
      "Vous aidez à construire une stratégie de migration vers le cloud. Pour chaque application décrite, proposez une stratégie (conserver, réhéberger, replateformer, refondre, remplacer, décommissionner), puis organisez la migration en vagues avec leurs prérequis et leurs risques.",
  },
  'genai-use-cases': {
    key: 'genai-use-cases',
    name: "Cas d'usage d'IA générative",
    category: 'Data & IA',
    description:
      "Identifie et priorise des cas d'usage d'IA générative pour un client, selon leur valeur métier, leur faisabilité et leurs risques.",
    instructions:
      "Vous aidez à identifier des cas d'usage d'IA générative pour un client. Proposez des cas d'usage concrets rattachés à ses processus métier, évaluez pour chacun la valeur attendue, la faisabilité (données, intégration) et les risques (conformité, fiabilité), puis priorisez-les.",
  },
  'data-maturity': {
    key: 'data-maturity',
    name: 'Diagnostic de maturité data',
    category: 'Data & IA',
    description:
      "Évalue la maturité d'une organisation sur ses données (gouvernance, qualité, plateforme, usages, compétences) et propose une feuille de route.",
    instructions:
      "Vous aidez à établir un diagnostic de maturité data. Évaluez l'organisation sur la gouvernance, la qualité des données, la plateforme, les usages et les compétences, situez chaque axe sur une échelle de maturité, puis proposez une feuille de route par étapes.",
  },
  'agile-diagnostic': {
    key: 'agile-diagnostic',
    name: "Diagnostic agile d'une équipe",
    category: 'Delivery & livrables',
    description:
      "Analyse les pratiques de delivery d'une équipe (organisation, rituels, flux, qualité) et propose des axes d'amélioration concrets.",
    instructions:
      "Vous aidez à réaliser le diagnostic des pratiques de delivery d'une équipe. Analysez son organisation, ses rituels, la gestion de son flux de travail et ses pratiques de qualité, identifiez les principaux irritants et proposez des axes d'amélioration concrets et priorisés.",
  },
  'executive-summary': {
    key: 'executive-summary',
    name: 'Synthèse exécutive',
    category: 'Delivery & livrables',
    description:
      "Condense un livrable ou une analyse en une synthèse d'une page pour un comité de direction : constats, recommandations, décisions attendues.",
    instructions:
      "Vous aidez à rédiger une synthèse exécutive destinée à un comité de direction. Tenez en une page : le contexte en une phrase, les constats clés, les recommandations et les décisions attendues, dans un langage direct et sans jargon technique.",
  },
};
