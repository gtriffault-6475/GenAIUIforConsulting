# Epic 1 Context: Connexion à un projet Octopod

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cet épic pose les fondations du produit et livre la première capacité utilisateur : le consultant sélectionne un projet Octopod existant et voit immédiatement son contexte hérité — drive et canal Mattermost — sans aucune configuration manuelle. Les intégrations sont simulées mais doivent se comporter et se lire comme des données réelles, sans jamais exposer d'indicateur de donnée factice. C'est le socle sur lequel toute la suite du produit (conversations, workflow, éditeur) s'appuie : sans projet actif, aucune autre surface n'est accessible.

## Stories

- Story 1.1: Scaffolding du projet et fondations partagées (Next.js, tokens, OverlayProvider, accessibilité)
- Story 1.2: Sélection d'un projet Octopod
- Story 1.3: Panneau Contexte (documents du drive, lecture seule)
- Story 1.4: Ajout d'un document hors-drive
- Story 1.5: Panneau Mattermost (aperçu + lien externe)

## Requirements & Constraints

- Un seul projet actif à la fois ; le sélectionner rattache automatiquement son drive et son canal Mattermost, sans étape de configuration.
- Tant qu'aucun projet n'est actif, aucune surface de conversation, skills ou livrables n'est accessible — il n'existe aucun mode "conversation libre" sans projet connecté.
- Le panneau Contexte est strictement lecture seule : aucune action d'édition, suppression ou ajout depuis ce panneau.
- L'ajout d'un document hors-drive doit le rendre immédiatement disponible comme contexte de conversation.
- Le panneau Mattermost n'affiche qu'un aperçu du dernier message et un lien externe — jamais de champ de saisie ou d'envoi.
- Crédibilité du mock : temps de réponse cohérents, aucun placeholder visible, aucun signe que les données Octopod/drive/Mattermost sont simulées.
- Pas de pile de surface flottante à plus d'un niveau : toute nouvelle modale/dropdown s'ouvre au-dessus de l'écran courant, jamais au-dessus d'une autre déjà ouverte.
- Cible desktop uniquement, largeur ≥1280px ; pas de repli mobile/tablette pour ce round.

## Technical Decisions

- Scaffolding Next.js 16 (App Router, Turbopack) standard — pas de starter nommé. Stack pinnée : React 19.x, TypeScript 5.7.x, Drizzle ORM + `node:sqlite` (pas de dépendance native), @anthropic-ai/sdk 0.124.x+, Node.js 24 LTS.
- Arborescence en couches : `app/` (UI) → `actions/` (Server Actions) → `domain/` (règles pures), plus `skills/`, `integrations/{ports,mock}/`, `db/`.
- AD-1 (Ports & Adapters) : `actions/` et `domain/` n'accèdent à Octopod/drive/Mattermost qu'au travers des interfaces `ProjectProvider`, `DriveProvider`, `MattermostProvider` (`integrations/ports/`) ; round 1 n'injecte que `integrations/mock/*`, câblées au point unique `integrations/index.ts`. Un document ajouté manuellement (Story 1.4) n'est pas une donnée Octopod : il ne passe par aucun port, `actions/document.ts` l'écrit directement en base.
- AD-2 (mutation exclusivement par Server Actions) : seuls les fichiers de `actions/` importent `db/` et `integrations/` ; les composants React appellent une Server Action, jamais un accès direct.
- AD-6 (état actif) : `APP_STATE` est une ligne singleton portant `activeProjectId` (nullable) — seule notion de "session" round 1, cohérente avec un fonctionnement mono-poste/mono-utilisateur.
- Modèle de données pertinent : `PROJECT` (`id`, `octopodProjectRef`, `name`, `mattermostChannelRef`, `activeConversationId` nullable), `DOCUMENT` (`id`, `projectId`, `name`, `source: drive | manual`, `folderPath` nullable, `content`), `APP_STATE` (`id` singleton, `activeProjectId` nullable).
- Erreurs des Server Actions : retour typé `{ ok: true, data } | { ok: false, error }`, jamais d'exception non attrapée remontant à l'UI.
- Config : `ANTHROPIC_API_KEY` en variable d'environnement (`.env.local`), pas d'auth ce round.

## UX & Interaction Patterns

- Tokens de design à instancier comme variables partagées : palette (`background`, `surface`, `border`, `text-primary/secondary/muted`, `accent` navy `#3E4C7C`, `ai-accent` violet `#7C5CFC`, `ai-tint`, `selected-tint`, `avatar-bg`, `success`), deux familles typographiques (Space Grotesk pour les moments d'orientation — nom produit, titres, titre de document ; IBM Plex Sans pour le reste, poids 400/600), échelle d'espacement base 4px.
- Grille verrouillée trois colonnes : sidebar gauche 240px fixe, centre flexible, sidebar droite 300px fixe — pas de repli ni de sidebar rétractable ce round.
- Cinq composants de tokens à implémenter : `button-primary` (fond accent, action utilisateur), `button-ai-primary` (fond ai-accent, réservé aux actions qui valident/déclenchent une action IA — jamais pour une action purement utilisateur), `card`, `ai-suggestion-card` (fond `ai-tint` plein, jamais de bordure gauche colorée), `nav-row-active`.
- Règle transversale : le violet (`ai-accent`) est réservé à tout ce qui vient de l'IA, jamais décoratif ni pour la navigation utilisateur ; une zone IA se signale par un fond plein, jamais une bordure colorée.
- `OverlayProvider` unique (client, racine de `app/`) : `openOverlay(id)`/`closeOverlay()` ; ouvrir une surface flottante ferme automatiquement la précédente ; `Échap` ferme systématiquement le dernier élément flottant ouvert. Aucun composant ne détient son propre `isOpen` pour une surface superposée.
- Accessibilité : l'ordre de tabulation suit l'ordre de lecture sur chaque écran (à établir dès le scaffolding, pas seulement pour cet épic).
- Microcopy : vouvoiement, registre professionnel sobre, jamais d'emoji ni de point d'exclamation ni de familiarité — conventions à documenter dès Story 1.1 pour guider tous les libellés des stories suivantes (y compris hors épic 1).
- Sélecteur de projet en haut de l'espace de travail (ou premier lancement) pour se connecter à un projet Octopod existant.
- Panneau Contexte (sidebar droite) : documents/répertoires du drive, présentés en carte (`card`), lecture seule.
- Panneau Mattermost (sidebar droite) : aperçu du dernier message + lien externe vers Mattermost — un point d'entrée, jamais un client de messagerie.
- Patterns explicitement rejetés à respecter : pas de mode "conversation libre" sans projet connecté ; jamais d'indicateur visible de donnée mockée.

## Cross-Story Dependencies

- Story 1.1 est un prérequis strict pour 1.2–1.5 (et pour tous les épics suivants) : arborescence, tokens de design, `OverlayProvider` et conventions de microcopy doivent exister avant toute fonctionnalité.
- Story 1.2 conditionne 1.3, 1.4 et 1.5 : sans projet actif (`APP_STATE.activeProjectId`), aucun panneau Contexte, document ou Mattermost n'a de contenu à afficher.
- Les épics 2, 3 et 4 dépendent des fondations posées ici : `APP_STATE`/`PROJECT` (Epic 2 les étend avec conversations et skills), `OverlayProvider` (réutilisé pour l'ajout de skill et le retravail de suggestion), et la frontière Ports & Adapters (AD-1) qui encadre déjà le pattern d'intégration mock que les épics suivants suivront.
