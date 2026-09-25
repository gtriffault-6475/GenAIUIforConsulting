import type { ProposedLivrableContent } from '@/skills/propose_livrable_content';

// spec-mode-demo-scripte.md — Mode démo scripté (réponses canned sans clé
// API réelle). Pure, aucun accès `db/` (même convention que
// `skills/propose_starting_point.ts`/`skills/models.ts`) : ce fichier ne
// fait que décrire le script et le faire correspondre au message/prompt en
// cours — c'est `skills/buildRequest.ts`'s `sendToAgent` (AD-11, seul point
// d'assemblage) qui l'invoque et qui, pour l'entrée avec `toolCall`,
// exécute réellement `executeTool` (vraie transaction DB, AD-2 inchangé).
//
// Décision utilisateur (Checkpoint 1) : script complet uniquement pour
// `proj-acme-rfp`, repli générique pour `proj-audit-mission` — atteint ici
// non pas via un `projectId` explicite (aucune fonction ci-dessous n'en
// reçoit un) mais simplement parce que le vocabulaire de ce script est
// celui d'une réponse RFP Acme Corp : une conversation sur
// `proj-audit-mission`, dont le vocabulaire est différent, ne matche
// naturellement aucun mot-clé et retombe sur le repli générique — le
// comportement demandé, sans code dédié à ce second projet.

// spec-toggle-mode-demo-ui.md retires `isDemoModeActive()` (which lived
// here, reading `process.env.DEMO_MODE`): the demo mode's activation state
// is now a persisted `db` column (`appState.demoModeActive`,
// `actions/demo.ts`'s `getDemoModeActive`/`setDemoModeActive`), read
// directly by `skills/buildRequest.ts`'s `sendToAgent` — never through this
// file, which stays pure (no `db` access, per this file's header comment)
// and unconcerned with *whether* the demo mode is active, only with *what*
// it says once it is.

export type DemoChatEntry = {
  keywords: string[];
  reply: string;
  toolCall?: ProposedLivrableContent;
};

// Repli générique du chat scripté — jamais un `assistantFailed`, jamais un
// message qui ressemble à une panne (I/O Matrix : "réponse de repli
// générique mais plausible, jamais un échec").
export const DEMO_FALLBACK_REPLY =
  "Je ne suis pas certain de bien cerner votre demande -- pourriez-vous préciser ce que vous souhaitez que je fasse sur ce document ?";

// Liste ordonnée, thème réponse RFP Acme Corp (cohérent avec les skills
// `references`/`rfp-drafting` déjà chargées sur `proj-acme-rfp` et avec
// `CONVENTIONS.md` : vouvoiement, sobre, jamais de point d'exclamation).
// Au moins une entrée porte un `toolCall` (déclenche
// `propose_livrable_content` via le même `executeTool` que le chemin
// réel, `matchDemoChatEntry` ci-dessous n'exécute rien elle-même) — la
// première entrée. Correspondance par mots-clés avec repli générique,
// jamais un ordonnancement séquentiel strict (Décisions, Checkpoint 1) :
// n'importe quelle entrée peut être déclenchée à n'importe quel tour de
// conversation, tant que le dernier message utilisateur contient un de
// ses mots-clés.
//
// Le mot-clé de salutation ("bonjour") est délibérément la DERNIÈRE
// entrée, pas la première : trouvé lors de la vérification indépendante
// (orchestrateur) qu'un message tout à fait naturel comme "Bonjour,
// pourriez-vous rédiger une réponse à l'appel d'offres ?" matchait la
// salutation en premier avec l'ordre initial (salutation en tête de
// liste), empêchant l'entrée à `toolCall` -- la plus importante du script
// -- de se déclencher. `matchDemoChatEntry` prend le premier match dans
// l'ordre du tableau, donc toute entrée plus spécifique doit précéder la
// salutation, jamais l'inverse.
export const DEMO_CHAT_SCRIPT: DemoChatEntry[] = [
  {
    keywords: [
      'rédige',
      'rédiger',
      'rédigez',
      "réponse à l'appel d'offres",
      'projet de réponse',
      'écris la réponse',
      'écrire la réponse',
    ],
    reply:
      "J'ai préparé un premier projet de réponse à l'appel d'offres, structuré en trois parties, avec des suggestions d'amélioration sur chacune. Vous pouvez les retrouver dans le panneau Livrables.",
    toolCall: {
      title: "Réponse à l'appel d'offres — Acme Corp",
      blocks: [
        "Le cabinet propose une équipe pluridisciplinaire disposant d'une maîtrise éprouvée du cadre réglementaire applicable au secteur d'Acme Corp, construite au fil de missions comparables menées ces trois dernières années.",
        "Sur des missions de portée et de secteur similaires, le cabinet a accompagné plusieurs acteurs dans la refonte de leurs processus de conformité, avec des résultats mesurables sur les délais de mise en œuvre.",
        "L'équipe proposée pour cette mission est disponible dès la date de démarrage souhaitée par Acme Corp et reste stable sur toute la durée prévue, sans recours à des ressources externes non nommées à ce stade.",
      ],
      suggestions: [
        {
          blockIndex: 0,
          text: "Préciser le nombre d'années d'expérience spécifique au secteur d'Acme Corp plutôt qu'une formulation générale.",
        },
        {
          blockIndex: 1,
          text: 'Ajouter un exemple chiffré de résultat obtenu sur une mission comparable, si disponible.',
        },
      ],
    },
  },
  {
    keywords: ['référence', 'références', 'mission similaire', "expérience du cabinet"],
    reply:
      "Je vous propose de mettre en avant nos missions récentes menées pour des acteurs du secteur d'Acme Corp, en insistant sur les résultats obtenus plutôt que sur la seule liste des clients.",
  },
  {
    keywords: ['expert', 'experts', 'équipe', 'expertise'],
    reply:
      "Je vous propose de présenter l'équipe proposée par profil et années d'expérience sur des missions similaires, plutôt qu'une simple liste de noms.",
  },
  {
    keywords: ['bonjour', 'bonsoir', 'salut'],
    reply:
      "Je vous propose de structurer la réponse autour de trois axes : la maîtrise du domaine réglementaire, nos références sur des missions similaires, et la disponibilité de l'équipe proposée.",
  },
];

// Premier match (sous-chaîne insensible à la casse) sur `keywords`, dans
// l'ordre de `DEMO_CHAT_SCRIPT` — `null` si aucune entrée ne correspond ;
// le repli est alors la responsabilité de l'appelant (`DEMO_FALLBACK_REPLY`,
// exporté séparément, jamais injecté ici).
export function matchDemoChatEntry(latestUserMessage: string): DemoChatEntry | null {
  const normalized = latestUserMessage.toLowerCase();
  return (
    DEMO_CHAT_SCRIPT.find((entry) =>
      entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
    ) ?? null
  );
}

// Clé exacte = le `label` de `domain/workflow.ts`'s `STEPS` (jamais la
// `key` technique `qualification`/etc.). `skills/propose_starting_point.ts`
// injecte déjà ce label tel quel dans son prompt synthétique (`Le
// consultant vient d'ouvrir l'étape "${stepLabel}"`), donc une
// correspondance par sous-chaîne sur ce texte suffit à identifier l'étape
// sans paramètre supplémentaire à `sendToAgent`.
export const DEMO_STEP_SUGGESTIONS: Record<string, string> = {
  Qualification:
    "Je vous propose de recenser les exigences clés du cahier des charges d'Acme Corp afin de qualifier précisément le périmètre de la réponse.",
  Références:
    "Je vous propose de rechercher, parmi les missions déjà réalisées par le cabinet, celles pertinentes pour le secteur d'Acme Corp.",
  Experts:
    "Je vous propose d'identifier, parmi les consultants disponibles, ceux dont l'expertise correspond le mieux aux exigences du cahier des charges d'Acme Corp.",
  Rédaction:
    "Je vous propose de démarrer la rédaction de la réponse à l'appel d'offres en structurant le document autour des exigences prioritaires d'Acme Corp.",
};

// Repli générique — n'est atteint que si `promptText` ne contient aucun
// des 4 libellés ci-dessus, un cas que `propose_starting_point.ts` ne
// produit jamais aujourd'hui (son seul appelant, `getStartingSuggestion`,
// passe toujours un `stepLabel` de `domain/workflow.ts`'s `STEPS`) mais que
// cette fonction ne suppose pas garanti pour autant.
export const DEMO_STEP_FALLBACK_SUGGESTION =
  "Je vous propose de commencer par clarifier, avec le consultant, l'objectif précis de cette étape avant de poursuivre.";

export function matchDemoStepSuggestion(promptText: string): string {
  const matchedLabel = Object.keys(DEMO_STEP_SUGGESTIONS).find((label) =>
    promptText.includes(label),
  );
  return matchedLabel
    ? DEMO_STEP_SUGGESTIONS[matchedLabel]
    : DEMO_STEP_FALLBACK_SUGGESTION;
}

// Tour 2 (bad_spec) : `skills/rework_suggestion.ts`'s `reworkSuggestionContent`
// est un 3e appelant réel de `sendToAgent`, oublié par l'Intent d'origine
// ("couvre les deux appelants existants") -- il partage exactement la même
// forme d'appel que `proposeStartingPoint` (ni `tool` ni `executeTool`, un
// seul tour `history`), donc rien au niveau du type ne les distingue.
// `DEMO_REWORK_MARKER` est une sous-chaîne exacte, tirée mot pour mot du
// prompt synthétique de `reworkSuggestionContent` ("Le consultant demande
// de retravailler cette suggestion avec les précisions suivantes") --
// jamais présente dans celui de `proposeStartingPoint` ("Le consultant
// vient d'ouvrir l'étape..."), donc aucune ambiguïté entre les deux à
// vérifier avant `matchDemoStepSuggestion` dans `sendToAgent`. Le prompt de
// `reworkSuggestionContent` exige une réponse "uniquement par le nouveau
// texte de la suggestion reformulée, sans préambule ni commentaire" --
// `DEMO_REWORK_REPLY` respecte cette contrainte (pas de phrase d'
// introduction comme les autres réponses canned).
export const DEMO_REWORK_MARKER = 'retravailler cette suggestion';

export const DEMO_REWORK_REPLY =
  "Préciser cette suggestion en tenant compte des éléments demandés, avec un exemple concret si disponible.";

export function isDemoReworkPrompt(promptText: string): boolean {
  return promptText.includes(DEMO_REWORK_MARKER);
}
