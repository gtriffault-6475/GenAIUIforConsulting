# Epic 4 Context: Éditeur assisté par IA

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le consultant ouvre un livrable depuis le panneau Livrables et travaille avec des suggestions IA déjà ancrées à des paragraphes précis — sans jamais rien avoir eu à demander. Cet épic construit le cœur de la promesse de différenciation du produit : l'IA commente en marge du document plutôt que de s'y substituer, et le consultant garde la main à chaque instant (accepter, rejeter, retravailler, ou ignorer). C'est le climax des deux parcours cibles (réponse avant-vente et note de mission) : les suggestions doivent être déjà là à l'ouverture, perçues comme instantanées, jamais comme un chargement IA visible.

## Stories

- Story 4.1: Ouverture d'un livrable
- Story 4.2: Génération des suggestions ancrées à l'écriture
- Story 4.3: Traitement d'une suggestion ancrée
- Story 4.4: Révision globale
- Story 4.5: Contrôle du consultant sur le document final

## Requirements & Constraints

- Ouvrir un livrable depuis le panneau Livrables affiche son contenu dans une vue Éditeur assisté distincte de l'espace de travail, avec un fil d'Ariane pour y revenir — jamais de pile de plus d'un niveau de surface flottante/modale.
- Les suggestions ancrées ciblent un paragraphe précis et sont affichées dans un panneau dédié en marge ; une seule suggestion en attente par paragraphe à la fois.
- Pour chaque suggestion ancrée : Accepter applique la modification au paragraphe ciblé, Rejeter l'ignore sans modifier le document, Retravailler ouvre un champ pour préciser la demande et renvoie une nouvelle proposition en attente.
- Une suggestion traitée (acceptée ou rejetée) reste visible, visuellement atténuée, plutôt que de disparaître — le consultant doit pouvoir retrouver ses décisions passées sans effort.
- Les trois états d'une suggestion (en attente / acceptée / rejetée) se distinguent par autre chose que la seule couleur (icône de validation, libellé texte) — plancher d'accessibilité transversal.
- Le consultant peut soumettre une demande de révision globale, distincte des suggestions ancrées, pour un ajustement qui ne cible pas un paragraphe précis.
- Aucune modification IA (ancrée ou globale) ne s'applique sans acceptation explicite ; il n'existe aucun mode d'auto-application. Tant qu'une suggestion n'est pas traitée, le contenu du livrable reste inchangé.
- Le délai entre l'ouverture d'un livrable et l'affichage des suggestions ancrées existantes doit être perçu comme instantané — pas de chargement IA visible qui casserait le sentiment de guidage déjà présent.
- Le champ de retravail s'ouvre au-dessus de l'écran courant, jamais empilé sur une autre surface flottante déjà ouverte.
- Voix : vouvoiement, registre professionnel sobre, jamais d'emoji ni de point d'exclamation (ex. "Acceptée" / "Rejetée", sans icône festive).

## Technical Decisions

- Les suggestions ancrées sont produites par l'agent dans le même appel outil qui crée ou modifie le contenu d'un livrable (`propose_livrable_content`), et persistées avant que la réponse ne soit renvoyée à l'UI. Ouvrir l'Éditeur assisté ne fait qu'un `SELECT` — jamais d'appel à `@anthropic-ai/sdk` déclenché à la lecture.
- `LIVRABLE.content` est un JSON `{ blocks: [{ id, text }] }` — chaque bloc a un `id` stable (`crypto.randomUUID()`), assigné à la création et jamais réutilisé. `SUGGESTION.anchorRef` référence toujours un `id` de bloc, jamais une position : l'ordre des autres blocs n'affecte jamais la résolution de l'ancre.
- Enum d'état de suggestion unique et partagé UI/DB : `pending | accepted | rejected | revising`, défini une seule fois dans `domain/suggestion.ts`.
- Index unique partiel SQLite `(livrableId, anchorRef) WHERE status = 'pending' AND type = 'anchored'` — garantit une seule suggestion ancrée en attente par paragraphe. Les suggestions `global` (`anchorRef` nul) n'ont pas cette contrainte ; plusieurs révisions globales en attente restent possibles.
- Une demande de révision globale est postée comme message utilisateur dans `LIVRABLE.conversationId` (la conversation d'origine du livrable, jamais une nouvelle conversation). L'agent y répond en ré-invoquant le même outil `propose_livrable_content`, qui met à jour `LIVRABLE.content` et régénère les suggestions ancrées concernées. Elle ne crée jamais de suggestion ancrée automatiquement avant que l'agent n'ait traité la demande.
- Toute transition d'état d'une suggestion (accepter/rejeter/retravailler) est une fonction pure dans `domain/suggestion.ts`, appelée par `actions/suggestion.ts` qui seule persiste le résultat. Un handler d'outil dans `skills/` ne mute jamais la base directement.
- Cette feature vit dans `actions/livrable.ts`, `actions/suggestion.ts`, `domain/suggestion.ts`, `skills/propose_livrable_content.ts`.
- Server Actions : retour typé `{ ok: true, data } | { ok: false, error }`, jamais d'exception non attrapée remontant à l'UI (convention transversale).

## UX & Interaction Patterns

- Fil d'Ariane en haut de l'Éditeur assisté pour revenir à l'espace de travail ; jamais de pile de plus d'un niveau de surface flottante.
- Suggestions ancrées présentées avec le composant `ai-suggestion-card` (fond `ai-tint` plein, jamais de bordure gauche colorée) et repérées par un ancrage de paragraphe (`¶N`). Le paragraphe ciblé dans le document utilise aussi le fond `ai-tint` pour se signaler comme zone IA.
- Le bouton "Accepter" (et toute action qui valide/déclenche un contenu venant de l'IA, ex. "Envoyer la demande de retravail") utilise le composant `button-ai-primary` (fond `ai-accent`) — premier consommateur réel de ce composant de token, avec `ai-suggestion-card` qui le rejoint dans cet épic pour les suggestions ancrées. Ne jamais utiliser cette variante pour une action purement utilisateur.
- Une suggestion acceptée ou rejetée s'estompe visuellement (texte en `text-muted`) mais reste dans le panneau — pas de disparition immédiate.
- "Retravailler" ouvre un champ via l'`OverlayProvider` partagé (une seule surface flottante à la fois) ; `Échap` ferme systématiquement le dernier élément flottant ouvert ou annule un retravail en cours.
- Le champ de révision globale est distinct des suggestions ancrées, positionné en bas du panneau IA de l'éditeur ; il ne cible jamais un paragraphe précis.
- Le violet (`ai-accent`) reste réservé à ce qui vient de l'IA — jamais décoratif ; une zone IA se signale par un fond plein, jamais une bordure colorée.
- Voix sobre : "Acceptée" / "Rejetée" sans icône festive, jamais "validée avec succès" ni formulation enjouée.
- Plancher d'accessibilité : ordre de tabulation = ordre de lecture ; les 3 états de suggestion se distinguent par autre chose que la couleur (icône check pour acceptée, libellé texte pour rejetée).

## Cross-Story Dependencies

- La Story 4.1 (ouverture d'un livrable) est un prérequis direct pour toutes les autres stories de l'épic : elle construit la vue Éditeur assisté que 4.2–4.5 peuplent et manipulent. Elle dépend aussi du panneau Livrables livré en Epic 2 (Story 2.6), dont le clic sur un livrable est le point d'entrée.
- La Story 4.2 (génération à l'écriture) est un prérequis pour la Story 4.3 (traitement) : il faut des suggestions déjà persistées pour pouvoir les accepter/rejeter/retravailler. Elle réutilise le mécanisme d'appel agent posé en Epic 2 (`skills/buildRequest.ts`, sélection de modèle) mais l'étend avec l'outil dédié `propose_livrable_content`.
- La Story 4.4 (révision globale) dépend de la conversation d'origine du livrable (`LIVRABLE.conversationId`, posée par la Story 2.1/2.2 pour la création de conversations) et réutilise le même mécanisme de génération que la Story 4.2, plutôt que d'inventer un second chemin.
- La Story 4.5 (contrôle du consultant) n'introduit pas de nouvel écran : c'est une contrainte transversale vérifiée à travers 4.2, 4.3 et 4.4 (aucune suggestion, ancrée ou globale, ne modifie le document avant acceptation explicite).
- Cet épic partage le composant `ai-suggestion-card` avec la suggestion proactive de l'Epic 3 (Story 3.3) — même principe visuel et même règle "jamais appliqué sans validation explicite", mais les deux mécanismes restent distincts : la suggestion proactive n'est jamais une ligne de la table `SUGGESTION`.
- Le mécanisme d'ajout d'une skill (Epic 2) et le champ de retravail (cet épic) partagent le même `OverlayProvider` unique posé en Story 1.1 — aucune des deux fonctionnalités ne doit gérer son propre état `isOpen` local.
