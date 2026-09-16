# Epic 2 Context: Espace multi-agents

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Une fois connecté à un projet, le consultant a besoin d'une surface de travail réelle pour dialoguer avec l'agent : une ou plusieurs conversations privées par projet, un catalogue visible des skills spécialisées chargées sur ce projet, le contrôle du modèle IA qui répond, et une vue des livrables déjà en cours de rédaction. Cet épic construit cette surface — « l'espace de travail » — pour que le consultant puisse organiser ses échanges par sujet ou par étape, avoir confiance dans la confidentialité d'une conversation, et reprendre un document déjà entamé. C'est l'enabler direct des deux parcours clés (réponse RFP, note de mission) et de la barre de succès du round 1 : se connecter, trouver les bonnes skills, les utiliser sans friction.

## Stories

- Story 2.1: Conversations multiples et sélection active
- Story 2.2: Création d'une nouvelle conversation
- Story 2.3: Confidentialité de la conversation
- Story 2.4: Panneau Skills
- Story 2.5: Sélection du modèle et envoi d'un message
- Story 2.6: Panneau Livrables

## Requirements & Constraints

- Un projet peut avoir plusieurs conversations distinctes, chacune listée séparément ; une seule est active à la fois, visuellement distinguée des autres ; cliquer une conversation l'active et affiche son historique au centre. Pas de suppression/renommage de conversation en round 1.
- « Nouvelle conversation » crée un fil vide et l'active immédiatement.
- La confidentialité des conversations est une contrainte dure, pas une préférence : aucune surface (présente ou future) ne peut exposer le contenu d'une conversation ailleurs que dans sa propre vue. Seuls les livrables/assets qu'une conversation produit sont visibles au reste de l'équipe projet — jamais la conversation elle-même.
- Le panneau Skills liste les skills chargées sur le projet ; le point d'entrée « Ajouter une skill » reste visible même sur une liste vide — jamais un état d'erreur. Le mécanisme réel de rattachement d'une skill à un projet est hors scope de cet épic (question ouverte, résolue en architecture uniquement comme une forme de stockage).
- Le sélecteur de modèle du composer n'offre qu'une liste fermée de modèles IA — il ne doit jamais faire apparaître un choix d'agent ou de skill ; ce choix se fait exclusivement via le panneau Skills. `Entrée` envoie le message.
- Envoyer un message assemble le prompt système à partir des skills chargées du projet, de l'historique de la conversation active, et du modèle choisi.
- Le panneau Livrables liste les documents en cours ; quand aucun n'existe encore, il affiche une invite courte pour en créer un — jamais une zone vide silencieuse.
- Pas plus d'une surface flottante ouverte à la fois nulle part dans le produit (s'applique ici au point d'entrée d'ajout de skill).
- Barre de succès du round 1 (brief/PRD) : un testeur doit pouvoir se connecter, trouver les skills/agents dont il a besoin, et les utiliser sans blocage — cet épic porte l'essentiel de cette barre.

## Technical Decisions

- La mutation ne passe jamais que par des Server Actions (`actions/conversation.ts`) ; les composants n'importent jamais `db/` ou `integrations/` directement, ils appellent une action ou une lecture `domain/`.
- Les skills sont un catalogue TypeScript (`skills/catalog.ts`), jamais du contenu DB libre. Tout outil exposé par une skill est nommé `${skillKey}.${toolName}` pour que deux skills ne puissent jamais entrer en collision. `project_skill` ne stocke que `(projectId, skillKey)` avec une contrainte unique sur cette paire — pas de chargement en double.
- `PROJECT.activeConversationId` (FK nullable) est la seule source de vérité pour la conversation affichée — jamais dérivée d'un champ d'étape. `CONVERSATION.stepKey` (nullable) rattache une conversation à une étape fixe du workflow avant-vente (concern de l'Epic 3) ; il reste `null` pour les conversations libres/mission, un état valide et non ambigu.
- Un unique `OverlayProvider` (client, racine de l'app) gouverne toute surface flottante via `openOverlay(id)`/`closeOverlay()` ; ouvrir l'une ferme automatiquement la précédente. Aucun composant ne garde son propre `isOpen` local pour une surface plein écran ou superposée. Les expansions en ligne (un panneau qui grandit dans le flux normal) ne sont pas concernées.
- Un point d'assemblage unique, `skills/buildRequest.ts`, construit chaque appel Messages API `@anthropic-ai/sdk` : le prompt système concatène les instructions des skills chargées (ordre de chargement), l'historique est celui, ordonné, de la conversation active, le modèle est celui choisi dans le composer pour ce message — jamais un défaut caché.
- Les Server Actions retournent `{ ok: true, data } | { ok: false, error }`, jamais une exception non attrapée remontant à l'UI. Les ids sont des clés primaires texte `crypto.randomUUID()`.
- Entités pertinentes : `CONVERSATION {id, projectId, title, stepKey?}`, `MESSAGE {id, conversationId, role, content, model}`, `PROJECT_SKILL {projectId, skillKey}`, `LIVRABLE {id, projectId, conversationId?, title, content}` (cet épic ne fait que lister les livrables ; l'édition du contenu relève de l'Epic 4).
- Aucun modèle d'auth/multi-utilisateur n'existe encore en round 1 — la confidentialité des conversations (FR-10) n'a aucun mécanisme d'application réel au-delà du fait que l'UI ne fait apparaître aucune autre conversation ; un futur champ `ownerId` est le correctif anticipé, hors scope ici.

## UX & Interaction Patterns

- Grille à trois colonnes : sidebar gauche 240px fixe (liste des conversations, puis panneau Skills), centre flexible (conversation active + composer), sidebar droite 300px fixe (panneaux Contexte / Livrables / Mattermost, Contexte et Mattermost possédés par l'Epic 1).
- Liste des conversations : la ligne active utilise le style `nav-row-active` (fond selected-tint, texte gras) ; l'entrée « Nouvelle conversation » crée et active un fil.
- Panneau Skills : une carte par skill ; le violet (`ai-accent`) réservé à l'icône de skill et à tout élément d'origine IA — jamais décoratif. L'état vide garde « Ajouter une skill » comme premier élément, jamais un message d'erreur.
- Composer : champ de saisie + menu déroulant de modèle fermé (ex. Sonnet 5 / Opus 5 / Haiku 4.5, utilisant `{elevation.dropdown}` puisqu'il flotte) + bouton d'envoi ; `Entrée` envoie, `Échap` ferme le menu de modèle.
- Panneau Livrables (sidebar droite) : liste de cartes de documents en cours ; l'état vide est une invite courte, pas une boîte vide. Cliquer un livrable est censé ouvrir l'Éditeur assisté, mais cette vue de destination est hors scope ici (voir Cross-Story Dependencies).
- Voix : professionnelle, vouvoiement, microcopy sobre, sans emoji/exclamation — ex. « Écrivez à l'IA… » et non « Posez-moi votre question ! ».
- Plancher d'accessibilité : l'ordre de tabulation suit l'ordre de lecture ; `Échap` ferme le dernier élément flottant ouvert (menu de modèle, point d'entrée d'ajout de skill).

## Cross-Story Dependencies

- Le clic-through de la Story 2.6, d'un livrable listé vers l'Éditeur assisté, est livré par la Story 4.1 (Epic 4), qui construit cette vue de destination — cet épic ne livre que la liste et son état vide.
- La Story 2.5 (sélection du modèle + envoi) dépend d'une conversation active existante (Story 2.1) et des skills chargées du projet (Story 2.4), puisque le prompt système assemblé combine les deux avec le modèle choisi.
- La Story 2.2 (nouvelle conversation) et la Story 2.1 (sélection) partagent le même mécanisme `activeConversationId` — créer une conversation est en réalité un cas particulier de « devient active ».
- Le mécanisme technique de rattachement d'une skill à un projet (point d'entrée « Ajouter une skill » de la Story 2.4) est explicitement différé au-delà de cet épic (PRD OQ-6) ; seuls l'affichage du catalogue et le point d'entrée sont dans le scope ici.
