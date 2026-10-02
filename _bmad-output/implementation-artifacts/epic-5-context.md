# Epic 5 Context: Livrables et contexte Google Drive

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Faire du drive du projet un vrai Google Drive. Le consultant connecte une fois son compte Google. Le panneau Contexte montre alors les vrais fichiers du dossier du projet, et l'agent ne lit que ceux que le consultant a cochés. Le consultant importe les présentations Google Slides du dossier comme livrables, les améliore avec des suggestions IA ancrées, puis réécrit le fichier Drive sur action explicite, sans jamais écraser une modification faite en parallèle dans Slides. Il peut aussi faire créer une nouvelle présentation par l'agent. Le mode démo reste intact et ne dépend jamais de Google. Les livrables cessent ainsi d'être une démonstration enfermée dans l'app : le résultat atterrit dans le fichier que l'équipe partage.

## Stories

- Story 5.1: Connexion du compte Google
- Story 5.2: Dossier Drive du projet et panneau Contexte réel
- Story 5.3: Import d'une présentation comme livrable
- Story 5.4: Suggestions IA sur une présentation importée
- Story 5.5: Enregistrement dans Drive
- Story 5.6: Création d'une présentation depuis la conversation

## Requirements & Constraints

- **Trois situations, jamais de faux drive hors démo.**
  - Démo : le panneau Contexte est simulé et rien ne mentionne Google (ni bouton, ni invite). Les livrables Drive n'existent pas, donc l'adaptateur simulé n'a pas à simuler de présentations.
  - Hors démo sans compte connecté : aucun contenu de drive. Seule l'invite de connexion s'affiche, à côté des documents ajoutés hors-drive et des livrables déjà ouverts.
  - Compte connecté : le vrai dossier du projet.
- **Connexion :** une seule fois, elle survit au redémarrage. Son état est visible et la déconnexion supprime le jeton. Un seul compte Google par poste.
- **Dossier projet :** c'est le sous-dossier du dossier racine qui porte exactement le nom du projet (casse et accents compris). S'il est absent ou en double, un message clair s'affiche ; l'app ne crée jamais ce dossier. Les sous-dossiers ne sont pas parcourus. Si le dossier racine n'est pas configuré, les fonctions Drive sont indisponibles et un message l'indique.
- **Envoi au modèle sur choix explicite :** un fichier Drive n'est envoyé à l'API Anthropic que dans deux cas.
  - Le consultant l'a coché comme contexte. Seuls les Docs, Slides et Sheets peuvent l'être ; le choix est visible et réversible.
  - Le consultant a importé une présentation puis demandé des suggestions.

  Le dossier n'est jamais envoyé automatiquement. Les documents hors-drive (FR-4) sont toujours envoyés comme contexte : c'est une mise en conformité, car ils ne l'ont jamais été jusqu'ici.
- **Import :**
  - Il ne modifie jamais le fichier.
  - Une zone de texte, y compris dans un groupe d'éléments, devient un paragraphe, regroupé par diapositive.
  - Tableaux, images et notes du présentateur sont ignorés et restent intacts dans le fichier.
  - Aucune suggestion n'est générée à l'import.
  - Recliquer une présentation déjà importée rouvre son livrable. "Réimporter" reste une action explicite, précédée d'un avertissement si des changements acceptés ne sont pas enregistrés.
- **IA sur un livrable Drive :** l'IA ne produit que des suggestions ancrées sur les zones existantes. Elle n'ajoute, ne supprime et ne réordonne rien. La révision globale y produit elle aussi des suggestions ancrées.
- **Enregistrement :**
  - Rien n'est écrit sans action explicite.
  - Seul le texte est réécrit, et le consultant est prévenu que la mise en forme peut être simplifiée.
  - Si le fichier a changé dans Drive, l'enregistrement est refusé sans rien écraser.
  - La version enregistrée devient la nouvelle référence.
- **Création :** le fichier n'est créé qu'après un clic de validation. Il porte le titre proposé par l'agent.
- **Sécurité :** les jetons Google ne quittent jamais le poste et n'atteignent jamais le navigateur. Une erreur Google n'est jamais montrée brute au client.
- **Critère de succès :** un testeur importe une vraie présentation, accepte des suggestions et enregistre dans Drive. Une modification parallèle dans Slides n'est jamais écrasée. Le mode démo fonctionne à l'identique sans compte Google.

## Technical Decisions

- **Mode drive (un seul point de décision) :** une fonction unique de `actions/` (`resolveDriveMode`) calcule le mode, dans cet ordre de priorité : `demo` → `unconfigured` → `disconnected` → `connected`. Le mode est passé à la fabrique d'`integrations/index.ts`, seul point de câblage.
  - `demo` utilise l'adaptateur simulé.
  - `connected` utilise `integrations/google/*`.
  - Hors `connected`, Réimporter, Enregistrer et Créer sont indisponibles. Un livrable Drive déjà importé reste consultable et ses suggestions restent traitables.
- **Port `DriveProvider` :** il expose `listFiles(projectName)`, `exportText(fileId)`, `readPresentation(fileId)`, `writePresentationText(fileId, edits, requiredRevisionId)` et `createPresentation(projectName, title, slides)`.
  - Chaque méthode renvoie `{ ok: true, data } | { ok: false, error: DriveError }`, avec `DriveError` ∈ `unconfigured | disconnected | folder_missing | folder_duplicate | token_revoked | not_found | revision_conflict | quota | unknown`.
  - La résolution du dossier projet vit dans l'adaptateur.
  - Sur `token_revoked`, `actions/` supprime `GOOGLE_CONNECTION`, ce qui ramène à `disconnected`.
  - Les erreurs Google sont converties en `DriveError`, puis en message français. Le détail brut n'est que loggé côté serveur.
- **OAuth :**
  - Flux "authorization code" côté serveur, avec un client "Interne" et le scope `https://www.googleapis.com/auth/drive`.
  - Deux route handlers, `app/api/google/oauth/start` et `app/api/google/oauth/callback`. Ce sont la seule exception à la règle "mutation par Server Actions". Ils vérifient un `state` anti-CSRF, et le callback n'écrit que via `actions/google-connection.ts`.
  - Le refresh token vit dans la table singleton `GOOGLE_CONNECTION { id, refreshToken, accountEmail, connectedAt }` et n'est jamais renvoyé au client.
  - Variables d'environnement : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_DRIVE_ROOT_FOLDER_ID`. La redirect URI est `http://localhost:3000/api/google/oauth/callback`.
- **Resynchronisation (sync-then-read, une seule fonction) :**
  - Elle met à jour le nom, le type et la date des fichiers.
  - Elle supprime les fichiers disparus de Drive.
  - Elle purge les lignes `DOCUMENT` dont l'`origin` (`mock | google`) ne correspond pas au mode courant.
  - Elle ne touche jamais `content` ni `usedAsContext`.

  `exportText` n'est appelé que pour un document `usedAsContext`, à sa sélection puis au chargement du projet. Pour une Google Sheet, l'export est le CSV de la première feuille ; Google plafonne l'export à 10 Mo.
- **`DOCUMENT` :** gagne `usedAsContext` (vrai pour `manual` ; faux par défaut pour `drive`), `driveFileId` (unique par projet), `mimeType` et `origin`.
- **Blocs d'un livrable Slides :** `content = { blocks: [{ id, text, slideId, slideNumber, driveText }] }`.
  - `id` est l'`objectId` de la zone de texte, et `slideId` celui de la diapositive.
  - `slideNumber` est le rang de la diapositive dans la présentation, diapositives sans texte comprises.
  - `driveText` est le dernier texte connu de Drive pour cette zone.
  - Les ancres des suggestions restent des `id` de bloc.
- **`LIVRABLE` :** gagne `source` (`local | drive`, défaut `local`) et `driveFileId`, unique par `(projectId, driveFileId)`. Il n'y a pas de `driveRevisionId` durable, car Google ne garantit un `revisionId` que 24 heures.
- **Bloc modifié :** un bloc est modifié quand `text ≠ driveText`. C'est une fonction pure de `domain/`, seule source de l'état du bouton Enregistrer et de l'avertissement de réimport.
- **Cycle d'enregistrement :** relire la présentation, puis comparer.
  - Si le texte distant d'un bloc diffère de son `driveText`, ou si sa zone a disparu, c'est un `revision_conflict` et rien n'est écrit.
  - Sinon, l'app appelle `presentations.batchUpdate` avec `writeControl.requiredRevisionId` égal au `revisionId` qui vient d'être lu. Seules les zones modifiées sont réécrites (`deleteText` + `insertText`).
  - Un refus de révision relance une seule fois le cycle complet.
  - Après succès, `driveText := text` pour les blocs écrits.
  - Les changements non textuels faits dans Slides ne bloquent pas l'enregistrement et ne sont jamais écrasés.
- **Réimport :** il remplace les blocs. Une suggestion n'est conservée que si son `anchorRef` existe encore et que le texte Drive de ce bloc n'a pas changé.
- **Un livrable par conversation :** `LIVRABLE.conversationId` est unique quand il n'est pas nul. Avant de poser cette contrainte, il faut vérifier qu'aucun doublon n'existe déjà en base.
  - Tout livrable Drive, importé ou créé, reçoit une nouvelle conversation dédiée, titrée d'après la présentation.
- **Choix des outils de l'agent :** une seule fonction pure de `domain/` choisit les outils selon la conversation.
  - Sans livrable : `propose_livrable_content`, plus l'outil de proposition de présentation si le mode est `connected`.
  - Livrable local : `propose_livrable_content`.
  - Livrable Drive : uniquement l'outil dédié de suggestions ancrées, jamais `propose_livrable_content`.

  `sendToAgent` accepte une liste d'outils et ne traite toujours qu'un `tool_use` par réponse.
- **`skills/buildRequest.ts` :** il ne lit plus la base, et cesse donc de lire `demoModeActive`. L'action appelante lui transmet tout.
  - Ordre du prompt système : instructions des skills, puis documents de contexte, puis contenu du livrable de la conversation avec ses `id` de blocs.
  - Documents de contexte : les documents `manual` toujours ; les documents `drive` seulement s'ils sont sélectionnés et de l'`origin` du mode courant ; jamais le fichier du livrable de la conversation lui-même, pour ne jamais l'envoyer deux fois.
  - Chaque document est tronqué à un plafond fixe défini dans ce fichier, et la troncature est signalée dans le texte. Le chiffre reste à calibrer.
- **Création :** `createPresentation` appelle Drive `files.create` dans le dossier du projet (type présentation Google), puis Slides `batchUpdate` pour le contenu, et enchaîne sur le même import que la Story 5.3.
- **Dépendances :** `@googleapis/drive` 26.x, `@googleapis/slides` 10.x et `google-auth-library` 11.x.
- **Migration :** le port `listDocuments(projectId)` devient `listFiles(projectName)`, et `integrations/index.ts` passe de constantes à une fabrique.
  - La resynchro actuelle de `actions/document.ts` est à corriger : elle écrase `content`, ne purge pas et réutilise l'id du provider comme clé.

## UX & Interaction Patterns

- **Barre du haut :** un bouton neutre "Connecter Google Drive". Une fois connecté, elle affiche l'adresse du compte et "Se déconnecter" dans un menu, une surface flottante gérée par l'`OverlayProvider`. Ce bloc est masqué en mode démo.
- **Panneau Contexte :** les fichiers Drive, puis les documents hors-drive.
  - Chaque Docs, Slides ou Sheets porte une case "Utiliser comme contexte". C'est un vrai contrôle de formulaire, libellé du nom du fichier.
  - Les autres fichiers portent la mention "non lisible par l'agent", sans case.
- **Panneau Livrables :** deux groupes.
  - "En cours" contient les livrables ouverts dans l'app.
  - "Dans le Drive du projet" contient les présentations pas encore importées. Ce groupe est absent en mode démo.
  - Une icône Slides marque tout élément adossé à Drive, et une présentation importée n'apparaît qu'une fois.
- **Éditeur :**
  - Les paragraphes sont regroupés sous "Diapositive N", avec les repères ¶N inchangés.
  - Il n'y a pas d'édition directe : le texte ne change que par des suggestions acceptées.
  - L'en-tête porte le bouton principal neutre "Enregistrer dans Drive" (jamais violet) et l'action secondaire "Réimporter".
  - Avant l'écriture, un rappel s'affiche : « Seul le texte des zones modifiées est réécrit ; leur mise en forme peut être simplifiée. »
  - Les états en cours, enregistré, conflit et erreur sont annoncés par du texte, pas seulement par la couleur.
- **Proposition de présentation :** une carte dans la conversation, avec "Créer dans Drive" et "Ajuster".
- **Messages d'état :** les copies exactes sont dans `EXPERIENCE.md`, section State Patterns.
  - Non connecté : « Connectez Google Drive pour afficher les fichiers du projet. »
  - Non configuré : « Google Drive n'est pas configuré pour cette installation. »
  - Dossier absent ou en double : « Aucun dossier « {nom} » dans le Drive racine. » ou « Plusieurs dossiers portent le nom « {nom} ». »
  - Conflit : « Ce fichier a été modifié dans Google Slides depuis l'import. Réimportez-le pour repartir de la dernière version. »
  - Erreur : « L'enregistrement dans Drive a échoué. Réessayez. »
  - Livrable Drive hors connexion : « Connectez Google Drive pour enregistrer. »
  - Connexion expirée ou révoquée : l'app revient à "non connecté", sans message technique.
- **Microcopy :** vouvoiement, sans emoji ni point d'exclamation.

## Cross-Story Dependencies

- La Story 5.1 fournit `GOOGLE_CONNECTION`, `resolveDriveMode` et la fabrique. Toutes les autres stories en dépendent.
- La Story 5.2 pose la resynchronisation et le passage des documents de contexte à `buildRequest`. Les Stories 5.3 et 5.4 réutilisent la liste des fichiers et l'assemblage.
- La Story 5.3 pose les blocs Slides, `source` et `driveFileId`, l'unicité du livrable par conversation et la conversation dédiée. Les Stories 5.4, 5.5 et 5.6 en dépendent.
- La Story 5.4 introduit la fonction de choix des outils et `sendToAgent` multi-outils. La Story 5.6 y ajoute l'outil de proposition.
- La Story 5.6 attend un prérequis : OQ-7 (mise en page, modèle OCTO ou mise en page Google par défaut) doit être tranchée. Sa spec doit aussi décider de la forme et de la persistance de la proposition.
- **Prérequis côté porteur de projet :**
  - un projet Google Cloud dans l'organisation Workspace OCTO, avec un client OAuth "Interne" (un administrateur Workspace peut devoir l'approuver) et les API Drive et Slides activées ;
  - un dossier racine Drive et les sous-dossiers des projets.
- Les Epics 1 à 4 sont prolongés sans régression. Le mode démo doit rester identique.
