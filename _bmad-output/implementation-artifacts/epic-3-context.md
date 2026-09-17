# Epic 3 Context: Orchestrateur de workflow

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pour le cas d'usage avant-vente, le consultant ne doit jamais atterrir face à une conversation vide sans savoir par où commencer. Cet épic construit l'orchestrateur qui le guide activement : un stepper à 4 étapes fixes qui structure sa progression et qu'il peut naviguer librement, et une suggestion proactive de l'IA à chaque ouverture d'étape qui propose une première action concrète. Pour le cas d'usage "livrable de mission", ce même orchestrateur doit rester invisible — la conversation y reste libre, sans étape imposée. C'est le cœur du parcours avant-vente (UJ-1) et un différenciateur clé du round 1 : transformer une page blanche en point de départ actionnable.

## Stories

- Story 3.1: Stepper de workflow (avant-vente)
- Story 3.2: Workflow du cas "livrable de mission"
- Story 3.3: Suggestion proactive de démarrage

## Requirements & Constraints

- Le stepper affiche 4 étapes fixes et simultanément visibles pour le round 1 : Qualification → Références → Experts → Rédaction. Aucune étape dédiée n'existe pour le cas "livrable de mission" — la méthode de qualification avant-vente elle-même n'est pas formalisée au-delà de ces 4 labels (question ouverte du PRD, non résolue ici).
- Cliquer une étape l'active immédiatement et met à jour la conversation affichée en dessous ; les états visuels (passée = check, active = pleine, à venir = neutre) doivent se distinguer clairement.
- Un projet de type mission ne doit jamais afficher de stepper avant-vente ; le consultant y crée et utilise une conversation libre, sans étape associée.
- À l'ouverture d'un projet ou d'une nouvelle étape avec une conversation vide, une suggestion proactive de l'IA propose une action concrète, dans le style visuel réservé au contenu IA (fond plein, jamais de bordure colorée). Une seule suggestion proactive visible à la fois.
- "Oui, commençons" accepte la suggestion et avance le stepper à l'étape correspondante ; "Plus tard" la masque sans faire avancer le stepper.
- Une suggestion déjà traitée (masquée ou acceptée) dans une conversation ne réapparaît jamais spontanément dans cette même conversation ; elle peut réapparaître sur un changement d'étape ou une nouvelle session (rechargement de page).
- Pas plus d'une surface flottante ouverte à la fois nulle part dans le produit (contrainte transversale, sans point d'entrée flottant spécifique identifié dans cet épic).

## Technical Decisions

- `CONVERSATION.stepKey` (nullable) rattache une conversation à une étape fixe du stepper ; contrainte unique sur `(projectId, stepKey)` quand `stepKey` n'est pas nul — une seule conversation par étape et par projet. Le cas "livrable de mission" (Story 3.2) crée une conversation avec `stepKey = null`, un état valide et non ambigu, pas une absence de configuration.
- `PROJECT.activeConversationId` reste la seule source de vérité sur ce qui est affiché — jamais dérivé d'un champ d'étape. Cliquer une étape trouve-ou-crée sa conversation puis met à jour `activeConversationId` ; le stepper affiché se lit depuis `activeConversation.stepKey`, jamais l'inverse.
- Toute transition d'état du stepper est une fonction pure dans `domain/workflow.ts`, appelée par `actions/conversation.ts` qui seule persiste le résultat (`domain/` n'importe ni `db/`, ni `integrations/`, ni `actions/`, ni React).
- L'état masquée/acceptée d'une suggestion proactive vit uniquement en mémoire côté client (state React), clé par `conversationId` — jamais une ligne de la table `SUGGESTION` (qui ne concerne que les suggestions ancrées de l'Epic 4). Un rechargement de page réinitialise naturellement cet état : c'est ce qui produit à la fois la non-réapparition dans la conversation en cours et la réapparition possible en nouvelle session, sans champ DB ni notion de session à construire.
- Le texte de la suggestion proactive est généré à la volée par un point d'assemblage dédié (`skills/propose_starting_point.ts`), jamais persisté — à ne pas confondre avec les suggestions ancrées de l'éditeur (Epic 4, AD-3), qui elles sont écrites en base au moment de la génération d'un livrable.
- Server Actions : retour typé `{ ok: true, data } | { ok: false, error }`, jamais d'exception non attrapée remontant à l'UI (convention transversale déjà posée en Epic 1).

## UX & Interaction Patterns

- Stepper positionné en haut de l'espace de travail, au-dessus de la zone de conversation.
- Suggestion proactive positionnée en haut de la zone de conversation, à l'ouverture d'un projet ou d'une étape ; utilise le composant `ai-suggestion-card` (fond `ai-tint` plein, jamais de bordure gauche colorée) — premier consommateur réel de ce composant de token.
- Le violet (`ai-accent`) reste réservé à tout ce qui vient de l'IA (la suggestion proactive elle-même, son bouton d'acceptation) — jamais décoratif.
- Voix : professionnelle, vouvoiement, microcopy sobre, sans emoji ni point d'exclamation (ex. le texte de la suggestion propose une action concrète et factuelle, jamais formulée comme une question enjouée).
- Plancher d'accessibilité : l'ordre de tabulation suit l'ordre de lecture ; `Échap` ferme systématiquement le dernier élément flottant ouvert (sans point d'entrée flottant propre à cet épic, cette règle s'applique par héritage aux surfaces déjà ouvertes).

## Cross-Story Dependencies

- La Story 3.1 (stepper) est un prérequis pour la Story 3.3 (suggestion proactive) : la suggestion, une fois acceptée, avance le stepper à l'étape correspondante — elle dépend donc du mécanisme trouve-ou-crée-une-conversation-par-étape posé en 3.1.
- La Story 3.2 (cas mission) est indépendante de 3.1/3.3 dans son résultat visible (aucun stepper, aucune suggestion imposée) mais partage le même modèle `CONVERSATION.stepKey` : c'est le cas `stepKey = null` de la même mécanique, pas un système parallèle.
- Cet épic réutilise directement les conversations et l'`activeConversationId` posés par l'Epic 2 (Story 2.1/2.2) : une étape du stepper ne fait qu'activer ou créer une conversation selon le même mécanisme que "Nouvelle conversation".
- Les suggestions ancrées de l'Éditeur assisté (Epic 4, FR-20) sont un mécanisme distinct de la suggestion proactive de cet épic, bien que les deux réutilisent le même composant visuel `ai-suggestion-card` et le même principe "jamais persisté sans validation explicite" — ne pas fusionner leur implémentation.
