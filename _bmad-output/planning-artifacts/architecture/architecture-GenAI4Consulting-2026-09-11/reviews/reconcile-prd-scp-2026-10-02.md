# Réconciliation spine ↔ PRD §4.5 + Sprint Change Proposal 2026-10-02

- **Spine relue :** `ARCHITECTURE-SPINE.md` (updated 2026-10-02)
- **Entrées :** PRD `prd.md` (§3 Glossaire, FR-4, FR-6, §4.5 FR-25..FR-31 + NFR, §6.1/§6.2, Constraints « Données envoyées au modèle IA ») ; `sprint-change-proposal-2026-10-02.md` §5.3, amendements §7 et §8 (qui priment sur §5.x).
- **Méthode :** pour chaque exigence à conséquence architecturale, recherche d'un AD, d'une convention, du seed ou d'une ligne Deferred qui la couvre ; contrôle croisé avec `.memlog.md` et le code actuel (`db/schema.ts`, `actions/document.ts`, `integrations/ports/drive-provider.ts`) quand une décision semble n'exister qu'hors spine.
- **Résultat :** 12 écarts (4 hauts, 4 moyens, 4 faibles). Copie UI exclue.

## Ce qui a bien atterri

AD-1 à 4 modes (démo → mock Contexte seul, livrables Drive indisponibles ; non configuré ; non connecté → aucune donnée ; connecté → Google), résolu par une seule fonction de `actions/` (amendements §7/§8). AD-9 étendu (zones de texte y compris dans les groupes ; tableaux/images/notes ignorés). AD-12 (OAuth serveur, singleton `GOOGLE_CONNECTION`, un compte par poste, refresh token jamais renvoyé). AD-13 (import sans écriture, unicité `(projectId, driveFileId)`, clic = réouverture, réimport explicite conservant les suggestions dont l'ancre existe, `requiredRevisionId`, nouvelle révision de référence après succès, outil dédié suggestions ancrées seules, révision globale → ancrées). AD-3 (suggestions Drive à la demande, jamais à l'import). AD-11 (`usedAsContext`, document `drive` seulement sur sélection). Deferred : sous-dossiers, formats non Slides, OQ-7, Octopod/Mattermost.

## Écarts

### E1 — [Haut] DOCUMENT n'a ni identifiant Drive ni type de fichier

- **Source :** PRD FR-27 (« Seuls les Google Docs, Slides et Sheets peuvent être choisis… les autres fichiers sont listés mais non sélectionnables », « porte une mention ») ; SCP §8 « Envoi au modèle IA sur choix explicite ».
- **Constat :** le seed `DOCUMENT` = `{id, projectId, name, source, folderPath, content, usedAsContext}`. Rien ne porte le `fileId` Drive dont `exportText(fileId)` a besoin, ni le `mimeType` qui décide de la sélectionnabilité. Le code actuel réutilise l'id du provider comme clé primaire (`actions/document.ts`, upsert sur `document.id`) — ce qui viole la convention « `crypto.randomUUID()` » et met ids mock et ids Google dans le même espace de clés.
- **À ajouter :** `DOCUMENT.driveFileId` (nullable, unique par `(projectId, driveFileId)`) et `DOCUMENT.mimeType` (ou un booléen `selectable` dérivé) ; règle « seuls les types Docs/Slides/Sheets peuvent passer `usedAsContext = true` », appliquée côté `actions/` (pas seulement UI).

### E2 — [Haut] La règle « jamais lu ni envoyé automatiquement » et la synchro ne sont pas dans la spine

- **Source :** PRD Constraints « Données envoyées au modèle IA » (« Le dossier n'est jamais lu ni envoyé automatiquement ») ; FR-27 (choix visible et réversible) ; SCP §5.3 « sync-then-read inchangé ».
- **Constat :** la décision de fraîcheur (« texte exporté à la sélection, puis rafraîchi au chargement du projet ») n'existe que dans `.memlog.md`. La spine ne dit pas : (a) que `listFiles` ne renvoie que des métadonnées et que `exportText` n'est appelé que pour un document `usedAsContext = true` ; (b) que la resynchro ne doit pas écraser `content` d'un document sélectionné par une valeur vide (le code actuel fait `onConflictDoUpdate … content: doc.content` depuis la liste) ; (c) ce que devient une ligne dont le fichier a disparu/été renommé dans Drive ; (d) que la désélection vide `content`. Le commentaire du seed (« vide pour un document drive non sélectionné ») est la seule trace.
- **À ajouter :** une règle (dans AD-11 ou un AD dédié) fixant le cycle synchro → sélection → export → désélection, et l'interdiction d'appeler `exportText` hors sélection.

### E3 — [Haut] Données drive mock et réelles mélangées dans la même table, envoyables hors mode connecté

- **Source :** FR-6 (« il n'est simulé qu'en mode démo… aucun drive simulé ne prend le relais ») ; FR-25 (hors démo sans compte : « aucun contenu de drive » ; en démo : « aucune mention de Google ») ; SCP §7.
- **Constat :** le mode est résolu à chaque appel (AD-1), mais les lignes `DOCUMENT source = 'drive'` persistent en base sans marqueur d'origine. Après bascule démo → réel (ou déconnexion, ou changement de compte), le panneau Contexte relirait des documents simulés ou ceux d'un autre état ; et AD-11 envoie *tout* `DOCUMENT usedAsContext = true` sans condition de mode — un fichier réel sélectionné resterait envoyé au modèle en mode « non connecté » ou démo.
- **À ajouter :** un discriminant (`source = 'drive_mock' | 'drive'` ou colonne `origin`) ou une purge à la bascule de mode, et une condition dans AD-11 : seuls les documents drive du mode courant sont lus/envoyés.

### E4 — [Haut] Aucune référence « dernier état Drive » pour savoir quels blocs ont changé

- **Source :** FR-30 (« réécrit… le texte des zones modifiées par des suggestions acceptées ») ; FR-29 / SCP §8 Réimport (« les changements acceptés mais non enregistrés sont perdus, après un avertissement ») ; SCP §5.4 (bouton « désactivé sans changement accepté en attente »).
- **Constat :** AD-13 dit « ne réécrit que le texte des blocs modifiés » mais `LIVRABLE.content` ne garde que le texte courant. Rien ne permet de calculer le diff à l'enregistrement, ni de savoir s'il existe des changements non enregistrés (avertissement de réimport, état du bouton).
- **À ajouter :** une référence persistée — p. ex. `blocks[].driveText` (texte au dernier import/enregistrement) ou une colonne `driveContent` — mise à jour à l'import, au réimport et après un enregistrement réussi ; « modifié » = `text ≠ driveText`.

### E5 — [Moyen] Un 400 n'est pas forcément un conflit ; validité limitée du `revisionId`

- **Source :** FR-30 (refus « si le fichier a été modifié », message proposant de réimporter) ; SCP §5.4 (états « en conflit » et « en erreur » distincts) ; PRD §6.2 / AD-12 (un compte par poste, reconnexion possible).
- **Constat :** AD-13 assimile le 400 de `batchUpdate` au conflit. Or un 400 couvre aussi toute requête invalide (zone supprimée, `deleteText` sur texte vide…). De plus, la documentation Slides (`WriteControl`) indique qu'un `revisionId` n'est garanti que 24 h et n'est pas partageable entre utilisateurs — à vérifier : si c'est confirmé, un enregistrement le lendemain de l'import, ou après changement de compte Google, serait refusé à tort comme « conflit ».
- **À ajouter :** règle de classification des erreurs (conflit de révision vs requête invalide vs auth) dans AD-13 ; stratégie pour un `revisionId` expiré (p. ex. relire la révision et comparer le texte des blocs avant d'écrire, ou rafraîchir la référence à la réouverture).

### E6 — [Moyen] Résolution du dossier par nom exact : contrat du port muet

- **Source :** FR-26 (nom exact casse et accents compris ; absent ou en double → message ; jamais de création) ; FR-27 / SCP §8 (sous-dossiers non parcourus) ; FR-31 (création « dans le dossier Drive du projet »).
- **Constat :** `listFiles(projectName)` et `createPresentation(projectName, …)` prennent un nom, mais la spine ne fixe ni le résultat typé « dossier absent / en double » (les 4 modes d'AD-1 sont globaux, ces états sont par projet), ni l'égalité stricte (la requête Drive `name = '…'` doit être confirmée ou doublée d'une comparaison en code), ni l'exclusion des éléments à la corbeille et des raccourcis, ni l'interdiction de créer le dossier. `createPresentation` doit réutiliser la même résolution et échouer plutôt que créer.
- **À ajouter :** une fonction unique de résolution du dossier (adaptateur Google) retournant `found | missing | duplicate`, utilisée par `listFiles` et `createPresentation`, avec « jamais de création » explicite.

### E7 — [Moyen] Sort des livrables `source = 'drive'` hors du mode `connected`

- **Source :** FR-25 (démo : « le panneau Livrables ne montre que les livrables de l'app » ; non connecté : « livrables déjà ouverts dans l'app ») ; SCP §8 Mode démo ; FR-26 (dossier racine non configuré).
- **Constat :** AD-1 dit « fonctions de livrables Drive indisponibles » mais un livrable Drive déjà importé est une ligne de l'app. La spine ne dit pas s'il est listé, ouvrable, si l'on peut y demander des suggestions, ni que « Enregistrer dans Drive » / « Réimporter » sont désactivés, en démo, non connecté et non configuré.
- **À ajouter :** une ligne dans AD-1/AD-13 : quelles actions sur un livrable `drive` sont disponibles par mode.

### E8 — [Moyen] FR-31 : proposition de diapositives non persistée, outil non conditionné au mode

- **Source :** FR-31 (« créé qu'après validation explicite… depuis la proposition affichée dans la conversation », titre proposé par l'agent) ; SCP §5.4 (carte « Créer dans Drive » / « Ajuster ») ; FR-25 (FR-31 indisponible en démo).
- **Constat :** `MESSAGE` n'a qu'un `content` texte ; rien ne stocke la proposition structurée (titre + diapositives) entre la réponse de l'agent et le clic, ni après rechargement. AD-11 assemble les outils à partir des seules skills chargées : rien n'interdit d'exposer l'outil de proposition quand le mode n'est pas `connected`. AD-2 implique que `createPresentation` est appelé par une Server Action au clic, jamais par le handler d'outil, mais ce n'est pas dit pour ce cas.
- **À ajouter :** emplacement de la proposition (p. ex. `MESSAGE.payload` JSON ou table dédiée) ; exposition de l'outil conditionnée au mode drive dans `buildRequest.ts` ; création uniquement depuis `actions/` au clic, puis import (AD-13) avec `LIVRABLE.conversationId` = conversation d'origine.

### E9 — [Faible] Réimport : suggestions orphelines et périmées

- **Source :** FR-29 / SCP §8 Réimport.
- **Constat :** AD-13 conserve les suggestions dont l'ancre existe encore, mais ne dit pas ce que deviennent les autres (supprimées ? marquées ?), ni une suggestion `pending` dont le bloc a changé de texte dans Drive (elle porte sur un texte qui n'existe plus). L'index unique partiel reste valide, mais le comportement est à fixer pour que deux implémentations ne divergent pas.

### E10 — [Faible] Jetons : fuite par les messages d'erreur ; jeton révoqué

- **Source :** NFR §4.5 (« ne quittent jamais le poste et ne sont jamais exposés au navigateur ») ; FR-25 (état connecté visible).
- **Constat :** la convention `{ ok: false, error }` ne dit pas que l'erreur doit être un message mappé — une erreur brute de la librairie Google (objet de requête, en-têtes `Authorization`) renvoyée au client exposerait le jeton d'accès. Rien non plus sur un refresh token révoqué ou expiré (`invalid_grant`) : la ligne `GOOGLE_CONNECTION` existe, donc le mode reste `connected` alors que tout échoue ; ni sur la révocation côté Google à la déconnexion.
- **À ajouter :** dans AD-12, « les erreurs Google sont traduites en message dans `actions/`, jamais transmises brutes » et « `invalid_grant` → suppression de la ligne → mode `disconnected` ».

### E11 — [Faible] Seed et précédence des modes incomplets

- **Source :** SCP §7/§8 (démo indépendante de Google ; racine non configurée).
- **Constat :** AD-1 lit `APP_STATE.demoModeActive`, absent de l'entité `APP_STATE` du seed (présent dans `db/schema.ts`). L'ordre de précédence (démo > non configuré > non connecté > connecté) n'est implicite que par l'ordre d'énumération — p. ex. démo actif + racine absente doit donner `demo`. `DOCUMENT.usedAsContext` est au seed mais sans valeur par défaut explicite au niveau colonne.
- **À ajouter :** `demoModeActive` au seed ; précédence écrite dans AD-1.

### E12 — [Faible] Export texte des Sheets

- **Source :** FR-27 (« contenu exporté en texte »), SCP §2.
- **Constat :** l'export Drive d'un Google Sheets en `text/csv` ne couvre que la première feuille. `exportText(fileId)` laisse ouvert le choix du format par type ; si toutes les feuilles sont attendues, il faut l'API Sheets (nouvelle dépendance, absente de la Stack) ou accepter la limite. À trancher et noter (règle ou Deferred).
