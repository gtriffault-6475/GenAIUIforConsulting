---
title: "Sprint Change Proposal — Intégration réelle de Google Drive (livrables Slides et contexte)"
created: 2026-10-02
status: approved
approved: 2026-10-02
author: Gautier.triffault (porteur de projet), avec Claude (workflow bmad-correct-course)
mode: incrémental — 5 propositions approuvées une à une
scope: Major
---

# Sprint Change Proposal — Intégration réelle de Google Drive

## 1. Résumé du changement

**Déclencheur :** nouvelle exigence du porteur de projet (2026-10-02), pas une story en échec.

**Problème :** les livrables n'existent aujourd'hui que dans la base locale SQLite de l'app, et le drive du projet est simulé. Les consultants OCTO produisent en pratique leurs livrables — souvent des présentations — dans le Google Drive du projet. Pour être utile au-delà de la démo, l'app doit pouvoir, dans les deux sens :

- **créer** une présentation dans le dossier Drive du projet ;
- **lire** les présentations existantes de ce dossier et y **apporter des modifications** avec l'IA.

**Organisation Drive :** un dossier racine commun, puis un sous-dossier par projet, créé au préalable par l'utilisateur, portant exactement le nom du projet.

**Éléments de preuve :**
- PRD §6.2 : les intégrations réelles sont différées « une fois le round 1 validé », avec une note demandant de cadrer ce point explicitement avant toute suite.
- L'appel réel à l'API Claude fonctionne de bout en bout depuis le 2026-09-30 (PR #2, test avec une vraie clé). C'était le dernier prérequis technique côté IA.

## 2. Décisions prises pendant le cadrage

| Sujet | Décision |
|---|---|
| Authentification Google | OAuth avec le compte du consultant (client OAuth « Interne »), un seul compte par poste |
| Écriture dans un fichier existant | Les suggestions sont validées dans l'Éditeur assisté de l'app, puis une action explicite réécrit le fichier Drive |
| Formats | Google Slides uniquement |
| Dossier d'un projet | Sous-dossier du dossier racine dont le nom est exactement celui du projet |
| Panneau Contexte | Lit aussi le vrai Drive dans cet epic : Docs, Slides et Sheets sont exportés en texte pour l'agent, les autres fichiers sont listés sans être lus |
| Octopod, Mattermost | Restent simulés |
| Mode démo | Inchangé : ne dépend jamais de Google |

## 3. Analyse d'impact

**Epics :**
- Epics 1 à 4 : terminés, toujours valides, non modifiés. Epic 3 reste `in-progress`, sa rétrospective étant optionnelle (sans lien avec ce changement).
- Nouvel **Epic 5 — Livrables et contexte Google Drive**, avec 6 stories, placé après les autres sans resséquencement.

**Conflits avec les documents :**
- **PRD :** FR-6 et §5/§6.1/§6.2 sont en conflit direct ; ajout d'une feature §4.5 (FR-25 à FR-31), d'une entrée au glossaire et d'OQ-7.
- **Architecture :** AD-1 (port drive en lecture seule, mocks uniquement), AD-9 (blocs de paragraphes) ; nouveaux AD-12 (OAuth) et AD-13 (réécriture contrôlée) ; nouvelles colonnes et table.
- **UX (`EXPERIENCE.md`) :** panneaux Livrables et Contexte, connexion Google, diapositives dans l'éditeur, enregistrement dans Drive, états d'erreur.

**Impact technique :**
- Projet Google Cloud et client OAuth « Interne » à créer.
- Variables d'environnement : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
- Nouvelle dépendance cliente Google, choisie à la story 5.1.
- Deux route handlers OAuth : exception assumée et documentée à AD-2.
- Migrations : LIVRABLE (`driveFileId`, `driveRevisionId`, `source`) et nouvelle table GOOGLE_CONNECTION.
- README à compléter : mise en place Google Cloud.
- Toujours aucune CI ni test automatisé : décision existante, inchangée.

## 4. Voie retenue

**Ajustement direct, avec un élargissement ciblé du périmètre round 1.**
- Pas de retour arrière : rien n'est à défaire.
- Le MVP n'est pas réduit, il est élargi uniquement au drive et aux livrables Slides.

- **Effort :** élevé (6 stories, dont une connexion OAuth et une réécriture Slides).
- **Risque :** moyen. Il est concentré sur :
  1. l'OAuth (configuration Google Workspace, consentement) ;
  2. la perte de mise en forme du texte réécrit dans une zone — c'est accepté, et le consultant en est prévenu ;
  3. les quotas et la latence de l'API Google, à surveiller.
- **Pourquoi ce choix :** les décisions (blocs adossés aux `objectId` Slides, contrôle de révision natif via `requiredRevisionId`, adaptateur simulé conservé derrière le même port) prolongent l'architecture existante au lieu de la casser. Le mode démo, qui reste l'usage principal à ce stade, est protégé.

## 5. Propositions de modification détaillées (toutes approuvées)

### 5.1 PRD — périmètre et intégrations simulées

- **FR-6** devient : « Pour le round 1, les données issues d'Octopod et de Mattermost sont simulées (mockées) côté système, mais aucune indication visible n'en informe le consultant. Le drive du projet est un vrai Google Drive (§4.5) ; en mode démo, ou tant que le compte Google n'est pas connecté, il reste simulé avec la même exigence de crédibilité. »
- **§5 Non-Goals :** « Ne connecte pas réellement Octopod ni Mattermost en round 1 (FR-6) ; le drive, lui, est connecté (§4.5). »
- **§6.1 :** ajout de « Intégration réelle de Google Drive pour les livrables (Google Slides) et le panneau Contexte (§4.5) ». Le mock ne couvre plus qu'Octopod et Mattermost.
- **§6.2 :** intégrations réelles différées pour Octopod et Mattermost seulement. Ajout de deux lignes hors scope : formats autres que Google Slides (Google Docs, .pptx, .docx) ; connexions Google multi-utilisateur (un seul compte par poste).
- **Glossaire :** « Livrable » précise qu'un livrable peut être adossé à une présentation Google Slides du dossier Drive du projet (créée par l'app ou importée). Nouvelle entrée « Dossier Drive du projet ».

### 5.2 PRD — nouvelle feature §4.5 « Livrables et contexte Google Drive »

- **FR-25 Connexion du compte Google.** OAuth, une fois ; l'état connecté/non connecté est visible ; déconnexion possible ; sans compte ou en démo, l'app se comporte comme aujourd'hui ; la connexion survit au redémarrage.
- **FR-26 Dossier Drive du projet.** Recherche par nom exact sous le dossier racine ; dossier absent ou en double → message clair, jamais de création.
- **FR-27 Panneau Contexte depuis le vrai Drive.** Liste en lecture seule ; Docs, Slides et Sheets exportés en texte comme contexte ; autres fichiers listés sans être lus ; FR-4 inchangé.
- **FR-28 Présentations du dossier dans le panneau Livrables**, distinguées des livrables déjà ouverts.
- **FR-29 Import d'une présentation comme livrable.** Une zone de texte = un paragraphe, regroupés par diapositive ; l'import ne modifie jamais le fichier ; sur un livrable adossé à Drive, l'IA ne propose que des suggestions ancrées sur les zones existantes, sans ajout, suppression ni réordonnancement.
- **FR-30 Enregistrement dans Drive.** Action explicite ; refus si le fichier a changé depuis l'import (réimport proposé, rien n'est écrasé) ; seul le texte est réécrit, avec un avertissement sur la mise en forme ; rien n'est écrit sans cette action.
- **FR-31 Création d'une présentation depuis la conversation.** L'agent propose des diapositives (titre et contenu) ; le fichier Slides est créé dans le dossier du projet, uniquement après validation, puis ouvert comme livrable.
- **NFR de la feature :** jetons et identifiants Google jamais exposés au navigateur ; le mode démo ne dépend jamais de Google.
- **OQ-7 :** mise en page des présentations créées (modèle OCTO ou mise en page Google par défaut), à trancher avant la story 5.6.

### 5.3 Architecture (`ARCHITECTURE-SPINE.md`)

- **AD-1 (modifiée) :** Octopod et Mattermost restent sur `integrations/mock/*`. Le drive a deux adaptateurs derrière le même port `DriveProvider` : `integrations/google/*` quand un compte est connecté et que le mode démo est inactif, `integrations/mock/*` sinon. Le choix se fait uniquement dans `integrations/index.ts`. Le port s'étend : `listFiles(projectName)`, `exportText(fileId)`, `readPresentation(fileId)`, `writePresentationText(fileId, edits, requiredRevisionId)`, `createPresentation(projectName, title, slides)`.
- **AD-9 (étendue) :** pour un livrable Slides, bloc = zone de texte, `id` = `objectId` Slides, `slideId` en plus ; `content = { blocks: [{ id, text, slideId? }] }`. Les ancres restent inchangées.
- **AD-12 (nouvelle, connexion Google) :**
  - flux « authorization code » côté serveur, avec un client OAuth de type « Interne » ;
  - route handlers `app/api/google/oauth/start` et `.../callback`, seule exception à AD-2 : le callback n'écrit que le jeton, via `actions/google-connection.ts` ;
  - refresh token stocké dans la table singleton GOOGLE_CONNECTION, jamais envoyé au client ;
  - variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_DRIVE_ROOT_FOLDER_ID` ;
  - scope `drive`, à confirmer à l'implémentation.
- **AD-13 (nouvelle, réécriture contrôlée) :**
  - `revisionId` mémorisé à l'import (`LIVRABLE.driveRevisionId`) ;
  - écriture via `presentations.batchUpdate` avec `writeControl.requiredRevisionId`, ce qui donne un refus atomique en cas de conflit ;
  - seul le texte des zones modifiées est réécrit ;
  - sur un livrable adossé à Drive, jamais `propose_livrable_content` : un outil dédié produit uniquement des suggestions ancrées.
- **Données :** LIVRABLE + `driveFileId`, `driveRevisionId`, `source` (`local | drive`, défaut `'local'`) ; GOOGLE_CONNECTION `{ id, refreshToken, accountEmail, connectedAt }` ; DOCUMENT `source = 'drive'` alimentée par le vrai Drive (sync-then-read inchangé).
- **Stack :** client Google à choisir à la story 5.1 (`googleapis`, ou `@googleapis/drive` + `@googleapis/slides` + `google-auth-library`).
- **Deferred :** l'intégration réelle reste différée pour Octopod et Mattermost ; la ligne multi-utilisateur précise « un seul compte Google connecté par poste (AD-12) ».

### 5.4 UX (`EXPERIENCE.md`)

- **Panneau Livrables :** deux groupes, « En cours » et « Dans le Drive du projet » ; icône Slides ; un clic sur une présentation Drive l'importe puis l'ouvre.
- **Panneau Contexte :** les vrais fichiers ; mention « non lu par l'agent » pour les formats non Google.
- **Connexion Google :** dans la barre du haut ; bouton neutre, puis adresse du compte et « Se déconnecter » dans un menu (AD-8) ; masquée en démo.
- **Diapositives dans l'éditeur :** regroupement sous « Diapositive N » ; repères ¶N inchangés ; aucun ajout ni suppression de paragraphe.
- **Enregistrer dans Drive :** dans l'en-tête de l'éditeur ; bouton neutre, jamais violet ; désactivé sans changement accepté en attente ; rappel sur la mise en forme avant écriture.
- **Proposition de présentation :** une carte dans la conversation avec « Créer dans Drive » / « Ajuster » ; rien n'est créé sans clic.
- **États :** Google non connecté (contenu simulé + invite discrète) ; dossier introuvable ou en double ; enregistrement en cours, enregistré, en conflit (avec « Réimporter ») ou en erreur.

### 5.5 Epics (`epics.md`) — Epic 5

- Couverture des FR : FR-25 à FR-31 → Epic 5.
- **Story 5.1** — Connexion du compte Google (FR-25)
- **Story 5.2** — Dossier Drive du projet et panneau Contexte réel (FR-26, FR-27)
- **Story 5.3** — Import d'une présentation comme livrable (FR-28, FR-29)
- **Story 5.4** — Suggestions IA sur une présentation importée (FR-29)
- **Story 5.5** — Enregistrement dans Drive (FR-30)
- **Story 5.6** — Création d'une présentation depuis la conversation (FR-31 ; prérequis : OQ-7)

Les critères d'acceptation complets sont ceux approuvés en proposition 5. Ils sont à reporter tels quels dans `epics.md`.

## 6. Plan de passation

**Classification : Major.** Le PRD et l'architecture changent ; un nouvel epic est ajouté.

| Étape | Rôle / skill | Livrable |
|---|---|---|
| 1 | PM — `bmad-prd` (mise à jour) | PRD avec §5.1 et §5.2 appliqués |
| 2 | Architecte — `bmad-architecture` (mise à jour) | Spine avec §5.3 appliqué (AD-1, AD-9, AD-12, AD-13, données, stack, deferred) |
| 3 | UX — `bmad-ux` (mise à jour) | `EXPERIENCE.md` avec §5.4 appliqué |
| 4 | PO — `epics.md` + `bmad-sprint-planning` | Epic 5 et ses stories ajoutés ; `sprint-status.yaml` complété (`epic-5: backlog`, stories `5-1` à `5-6`) |
| 5 | Porteur de projet | Création du projet Google Cloud, du client OAuth « Interne » et du dossier racine Drive ; décision OQ-7 avant la story 5.6 |
| 6 | Dev — `bmad-build`, une story à la fois | Stories 5.1 → 5.6, avec validation de spec à chaque story |

**Critères de succès :**
- depuis l'app, le consultant importe une vraie présentation du dossier du projet, accepte des suggestions IA et enregistre dans Drive ;
- une modification faite en parallèle dans Google Slides n'est jamais écrasée ;
- le mode démo fonctionne à l'identique sans compte Google.

## 7. Amendement (2026-10-02, mise à jour du PRD)

Pendant l'application au PRD, un conflit est apparu entre FR-25 et l'état UX « Google non connecté » approuvés plus haut (« drive simulé + invite *voir les vrais fichiers* ») d'une part, et FR-6 et UX-DR21 (ne jamais révéler qu'une donnée est simulée) d'autre part. Décision du porteur de projet :

- **hors mode démo, sans compte Google connecté :** aucun contenu de drive simulé ; les panneaux Contexte et Livrables n'affichent que l'invite à connecter Google Drive, à côté des documents ajoutés hors-drive et des livrables déjà ouverts dans l'app ;
- **en mode démo :** le drive reste simulé, sans aucune mention de Google.

Ce qui en découle pour la suite :
- §5.2, FR-25 : la première conséquence est remplacée par les deux points ci-dessus, déjà appliqués dans le PRD.
- §5.3, AD-1 : le câblage a trois cas. Démo → adaptateur simulé. Hors démo et compte connecté → adaptateur Google. Hors démo sans compte → état « non connecté » et aucune donnée.
- §5.4, état « Google non connecté » : seulement l'invite, sans contenu simulé.

## 8. Amendement (2026-10-02, relecture du PRD)

Décisions prises par le porteur de projet pendant la relecture du PRD mis à jour. Elles s'imposent aux sections 5.2 à 5.5.

- **Envoi au modèle IA sur choix explicite.** Un fichier du Drive n'est lu et envoyé à l'API Anthropic que si le consultant l'a choisi comme contexte (FR-27), ou s'il importe une présentation puis demande des suggestions (FR-29). Story 5.2 : le panneau Contexte gagne un choix par fichier, visible et réversible. Seuls les Google Docs, Slides et Sheets peuvent être choisis.
- **Mode démo.** Les fonctions de livrables Drive (FR-28 à FR-31) y sont indisponibles : le panneau Livrables ne montre que les livrables de l'app. Seul le panneau Contexte reste simulé. L'adaptateur simulé n'a donc pas à simuler de présentations.
- **Réimport.**
  - Cliquer une présentation déjà importée rouvre son livrable.
  - « Réimporter » est une action explicite : elle remplace le contenu par la version Drive et garde les suggestions dont la zone existe encore.
  - Les changements acceptés mais non enregistrés sont perdus, après un avertissement.
  - Story 5.3 : à ajouter aux critères d'acceptation.
- **Import en texte seul.** Les zones de texte deviennent des blocs, y compris dans un groupe d'éléments. Tableaux, images et notes du présentateur sont ignorés et laissés intacts dans le fichier.
- **Précisions.**
  - Après un enregistrement réussi, la révision enregistrée devient la référence (story 5.5).
  - Sur un livrable Drive, la révision globale ne produit que des suggestions ancrées (story 5.4).
  - Les sous-dossiers ne sont pas parcourus.
  - Si le dossier racine n'est pas configuré, les fonctions Drive sont indisponibles, avec un message qui l'indique.
  - Nouvelle OQ-8 (mode des testeurs), non bloquante.

## 9. Amendement (2026-10-02, mise à jour de l'architecture)

La relecture de la spine d'architecture a modifié deux points de la section 5.3. La spine fait foi.

- **Plus de `driveRevisionId` durable.** Google ne garantit le `revisionId` d'une présentation que 24 heures. Le conflit est donc détecté en comparant le texte : chaque bloc garde `driveText`, le dernier texte connu de Drive. À l'enregistrement, l'app relit la présentation ; si le texte distant d'un bloc a changé, c'est un conflit. Sinon, elle écrit avec le `revisionId` qu'elle vient de lire (AD-13). Les stories 5.3 et 5.5 s'appuient sur `driveText`, pas sur `driveRevisionId`.
- **Nouvelle AD-14.** Une conversation a au plus un livrable. Un livrable Drive reçoit sa propre conversation à l'import. Les outils offerts à l'agent sont choisis en un seul point. Les stories 5.3, 5.4 et 5.6 en dépendent.
