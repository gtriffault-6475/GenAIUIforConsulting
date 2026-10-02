# Revue rubric — ARCHITECTURE-SPINE (mise à jour Google Drive du 2026-10-02)

- **Cible :** `ARCHITECTURE-SPINE.md` (AD-1, AD-3, AD-9, AD-10, AD-11 amendées ; AD-12, AD-13 nouvelles ; Conventions, Stack, Structural Seed, Capability Map, Deferred)
- **Référentiels :** PRD §4.5 (FR-25..FR-31), §Constraints and Guardrails ; code brownfield (`integrations/index.ts`, `integrations/ports/drive-provider.ts`, `integrations/mock/drive-provider.ts`, `actions/document.ts`, `actions/message.ts`, `actions/livrable.ts`, `actions/demo.ts`, `skills/buildRequest.ts`, `skills/propose_livrable_content.ts`, `db/schema.ts`, `.gitignore`)
- **Vérifications externes :** doc Google Slides API (`Presentation.revisionId`), registre npm (2026-10-02)
- **Date :** 2026-10-02

## Verdict

**À reprendre avant de découper les stories de l'Epic Drive.** La mise à jour est solide sur le câblage (résolution du mode drive en un seul point, exception AD-2 bornée pour l'OAuth, contrôle de concurrence via `writeControl`, isolation du mode démo, scope OAuth justifié). Mais elle laisse trois vrais points de divergence ouverts sur le cœur de la boucle Drive : la référence de révision n'est pas durable (C1), le canal par lequel l'agent travaille sur un livrable Drive n'est pas défini et la règle d'AD-13 n'a pas de point d'application dans le code actuel (C2), et l'état "modifié mais pas encore enregistré" n'a aucune représentation (M3). Plusieurs règles amendées contredisent aussi le code existant sans le dire (M4).

| # | Sévérité | Sujet | ADs |
| --- | --- | --- | --- |
| C1 | Critique | `revisionId` Slides valable 24 h seulement : la règle d'enregistrement casse FR-30 | AD-13 |
| C2 | Critique | Pas de canal agent pour un livrable Drive ; l'interdiction de `propose_livrable_content` n'a pas de point d'application | AD-3, AD-10, AD-13 |
| M3 | Majeur | "Blocs modifiés" et "changements non enregistrés" ne sont pas modélisés | AD-9, AD-13 |
| M4 | Majeur | Contradictions avec le code non ratifiées (lecture de `demoModeActive`, port, sync `DOCUMENT`, assemblage) | AD-1, AD-2, AD-11 |
| M5 | Majeur | FR-31 : forme et persistance de la proposition de diapositives non décidées | AD-13, Deferred |
| m6 | Mineur | Contrat d'erreur du port drive et transitions de mode (dossier absent ou en double, jeton révoqué) | AD-1, AD-12 |
| m7 | Mineur | Enveloppe opérationnelle Google (client OAuth, redirect URI, distribution des secrets, quotas) | AD-12, Deferred |
| m8 | Mineur | Cohérence de détail (nommage d'outil, ERD, Capability Map, sens de "bloc") | AD-4, AD-9, Seed |

---

## Findings

### C1 — Critique — `revisionId` n'est pas une référence durable (AD-13)

**Constat.** AD-13 conserve `LIVRABLE.driveRevisionId` = `revisionId` lu à l'import, puis l'envoie dans `writeControl.requiredRevisionId` à l'enregistrement. Or la référence officielle de `Presentation.revisionId` précise qu'un revision ID n'est garanti valide que **24 heures** après avoir été renvoyé, et qu'il ne peut pas être partagé entre utilisateurs (vérifié sur developers.google.com, 2026-10-02). Le memlog note seulement que la doc a été vérifiée pour le 400 en cas de discordance.

**Conséquence.** Un consultant qui importe un deck le lundi et enregistre le mardi aura un `requiredRevisionId` expiré. Selon ce que fait Google, l'enregistrement est refusé alors que le fichier n'a pas changé, ce qui viole FR-30 ("refusé seulement si le fichier a changé"). Le consultant doit alors réimporter et perd ses changements acceptés (FR-29). Deux implémentations diverge­ront aussi sur le contournement : relire avant d'écrire, ignorer le refus, ou forcer.

**Correction proposée.** Séparer la **référence durable** du **verrou court** :
- référence durable stockée à l'import et après chaque enregistrement : le champ Drive `version` (`files.get?fields=version`, entier monotone sur toute modification) ou, à défaut, le texte de référence de chaque bloc (voir M3) ;
- à l'enregistrement : `readPresentation` → comparer avec la référence durable (conflit = refus FR-30) → `batchUpdate` avec le `revisionId` **fraîchement relu** dans `requiredRevisionId`, ce qui ferme la fenêtre de course de quelques millisecondes.
Renommer en conséquence `LIVRABLE.driveRevisionId` (ou ajouter `driveVersion`) et réécrire la phrase "après succès, le nouveau `revisionId` devient `driveRevisionId`".

### C2 — Critique — Livrable Drive : pas de canal agent, règle d'AD-13 sans point d'application

**Constat.**
1. AD-3 dit que les suggestions d'un livrable Drive sont produites "à la demande du consultant par l'outil dédié d'AD-13" ; AD-10 dit que la révision globale est postée dans `LIVRABLE.conversationId`. AD-13 ne dit pas si l'import crée une conversation. Dans le code, `requestGlobalRevision` (`actions/livrable.ts` l. 452) renvoie une erreur quand `conversationId` est nul. Un livrable importé sans conversation n'a donc ni révision globale (exigée par FR-29) ni canal pour "demander des suggestions".
2. Le code relie implicitement **un livrable à une conversation** : `sendMessage` (`actions/message.ts` l. 190-195 et 280-285) retrouve "le" livrable via `where livrable.conversationId = conversationId` et propose **toujours** `PROPOSE_LIVRABLE_CONTENT_TOOL`. Si un livrable Drive porte un `conversationId` (cas naturel de FR-31 : "depuis la conversation"), le chemin actuel lui offrira `propose_livrable_content` et l'écrasera par `updateLivrableWithSuggestions`. C'est exactement ce qu'AD-13 interdit, et rien dans la spine ne dit **où** le choix d'outil selon `LIVRABLE.source` est fait.
3. La cardinalité "un livrable par conversation", sur laquelle repose tout le code d'AD-10, n'est écrite nulle part dans la spine (pas d'unicité sur `LIVRABLE.conversationId`). Avec FR-31, une même conversation peut produire un livrable local **et** une présentation.

**Correction proposée.** Ajouter à AD-13 (ou à AD-10) :
- le canal : l'import crée une conversation dédiée (`stepKey = null`) liée par `LIVRABLE.conversationId`, **ou** "Demander des suggestions" est une Server Action hors chat. Les deux marchent, mais il faut en choisir un ;
- le point d'application : une seule fonction d'`actions/` choisit l'outil offert à `sendToAgent` à partir de `LIVRABLE.source` du livrable ciblé (`drive` → outil dédié uniquement ; `local` → `propose_livrable_content`) ;
- la cardinalité : une contrainte unique partielle sur `LIVRABLE.conversationId`, ou à défaut une règle explicite qui désigne le livrable ciblé quand une conversation en a plusieurs.

### M3 — Majeur — "Blocs modifiés" et "changements non enregistrés" sans représentation (AD-9, AD-13)

**Constat.** AD-13 : "ne réécrit que le texte des blocs modifiés". FR-29 : la réimportation avertit que "les changements acceptés mais non enregistrés sont perdus". Aucun champ ne permet de savoir quels blocs ont changé depuis l'import ou le dernier enregistrement. `content` ne garde que le texte courant. Deux implémentations divergeront : diff contre une relecture Drive, drapeau `dirty`, ou suggestions `accepted` depuis le dernier enregistrement (mais `SUGGESTION` n'a pas de date d'acceptation, et une édition faite par "retravailler" passe aussi par là).

**Correction proposée.** Étendre AD-9 : pour un livrable adossé à Slides, chaque bloc porte `driveText` (le texte tel qu'il est dans Drive à l'import ou au dernier enregistrement). Un bloc est modifié si `text !== driveText`. Un enregistrement réussi aligne `driveText` sur `text`. Le même champ sert à la détection de conflit de C1 : si le texte Drive relu d'un bloc à écrire diffère de `driveText`, il y a conflit. Mettre à jour le Structural Seed (`{blocks:[{id,text,slideId?,driveText?}]}`).

### M4 — Majeur — Contradictions avec le code brownfield non ratifiées

La spine amendée décrit l'état cible sans dire ce qu'elle remplace. Pour un brownfield, chaque écart doit être soit ratifié, soit déclaré comme migration :

1. **Lecture du mode démo.** AD-1 : une seule fonction d'`actions/` est "seule à lire `APP_STATE.demoModeActive`". Le code a deux lecteurs : `actions/demo.ts` `getDemoModeActive` et `skills/buildRequest.ts` `isDemoModeActive`, qui importe `db/` directement, ce qui viole aussi AD-2 ("seuls les fichiers de `actions/` importent `db/`"). Le commentaire de `buildRequest.ts` qualifie cette lecture d'exception documentée, ce que la spine ne reconnaît pas. Il faut trancher : migrer (`sendToAgent` reçoit le mode en paramètre) ou inscrire l'exception.
2. **Port drive.** Le port actuel est `listDocuments(projectId): OctopodDocument[]`, avec contenu inclus. Le mock est indexé par `projectId` (`proj-acme-rfp`). `integrations/index.ts` exporte des **constantes** (`export const driveProvider = mockDriveProvider`), pas une fabrique. La spine fixe `listFiles(projectName)` + `exportText`, avec une fabrique paramétrée par mode. C'est cohérent comme cible, mais la spine devrait dire que `listDocuments` disparaît, que le mock est réindexé par nom de projet et que l'export constant devient une fabrique. Sinon une story gardera les deux.
3. **Synchronisation `DOCUMENT`.** `actions/document.ts` `listDocuments` fait un upsert qui **écrase `content`** depuis le provider et ne supprime jamais une ligne. La spine impose "content vide pour un document drive non sélectionné" et "`usedAsContext` jamais écrasé", mais ne dit pas : (a) ce qui arrive à une ligne `drive` dont le fichier a disparu du dossier, surtout si elle est sélectionnée ; (b) ce qui arrive aux lignes `drive` du mock (`doc-acme-rfp`…) quand on passe de `demo` à `connected`. Elles resteraient affichées dans le panneau Contexte en mode réel, ce que FR-25 interdit, et elles ont le même `source = 'drive'` que les vraies. Une règle de purge est nécessaire, par exemple : la sync supprime les lignes `drive` absentes du listing courant, ou bien les lignes portent leur mode d'origine.
4. **Fraîcheur du contexte drive.** Le memlog décide "texte exporté à la sélection, puis rafraîchi au chargement du projet (sync-then-read)", mais cette décision n'apparaît dans aucune règle de la spine. C'est pourtant un point de divergence (quand appeler `exportText`). À remonter dans AD-11 ou AD-1.
5. **Assemblage (AD-11).** La règle place l'injection des documents dans `skills/buildRequest.ts`, mais ce fichier ne peut pas lire `DOCUMENT` sans enfreindre AD-2. Les documents doivent donc lui être passés par `actions/`, et la règle devrait le dire. Par ailleurs, le code injecte déjà le contenu courant du livrable comme fausse skill (`__current_livrable_context`, `actions/message.ts` l. 255-290), un deuxième ingrédient du prompt système que la spine ignore. Enfin, la règle ne précise pas quels appelants reçoivent les documents (`sendMessage` seulement, ou aussi `propose_starting_point` et `rework_suggestion`).

### M5 — Majeur — FR-31 : proposition de diapositives non décidée

**Constat.** FR-31 : l'agent propose des diapositives, le fichier n'est créé "qu'après validation explicite du consultant, depuis la proposition affichée dans la conversation". AD-13 dit seulement "La création passe par `createPresentation` puis par le même import". Ne sont pas décidés : l'outil qui porte la proposition (nom, schéma `slides`), l'endroit où elle est persistée entre la réponse et le clic de validation (le code pose que `MESSAGE` ne stocke jamais l'échange outil), et la manière d'offrir un deuxième outil (`sendToAgent` n'accepte qu'un seul `tool`, et le cycle est verrouillé à un seul `tool_use`). Le Deferred "Mise en page (OQ-7)" ne couvre que le gabarit visuel, pas cette forme. Deux stories pourraient l'inventer différemment, par exemple un message structuré d'un côté et une table de propositions de l'autre.

**Correction proposée.** Fixer dans AD-13 : un outil dédié (nom, schéma `{title, slides:[{title, body}]}`) qui ne crée rien ; la proposition est persistée (par exemple une colonne JSON nullable sur `MESSAGE`, ou une table `PRESENTATION_PROPOSAL`) ; une Server Action de validation appelle `createPresentation` puis l'import ; `sendToAgent` évolue vers une liste d'outils.

### m6 — Mineur — Contrat d'erreur du port et transitions de mode

- FR-26 distingue "dossier absent", "dossier en double" et "racine non configurée". Les quatre modes d'AD-1 ne couvrent que le dernier ; le retour de `listFiles` en cas d'absence ou de doublon n'est pas typé. Proposer un résultat discriminé du port (`{ok:false, reason:'folder_missing'|'folder_duplicate'|'auth_revoked'}`).
- Refresh token révoqué ou expiré (`invalid_grant`) : qui fait passer en `disconnected` ? La ligne `GOOGLE_CONNECTION` est-elle supprimée ? À fixer dans AD-12.
- La priorité entre les modes est implicite (demo > unconfigured > disconnected > connected). Mieux vaut l'écrire.

### m7 — Mineur — Enveloppe opérationnelle Google

Le Deferred "Auth, multi-utilisateur, déploiement" reste juste pour l'hébergement. En revanche, l'intégration ajoute une dépendance opérationnelle réelle que la spine ne place ni en décision ni en question ouverte :
- qui crée le projet GCP et le client OAuth "Interne" (cela suppose un domaine Google Workspace OCTO et que tous les testeurs en fassent partie) ;
- la redirect URI enregistrée (`http://localhost:<port>/api/google/oauth/callback`) : le port est-il fixe ?
- comment `GOOGLE_CLIENT_SECRET` et `GOOGLE_DRIVE_ROOT_FOLDER_ID` sont distribués aux testeurs (même client pour tous ?), et la mise à jour de `.env.local.example` ;
- les quotas Slides et Drive (écritures par minute et par utilisateur), sans doute sans effet en round 1 mais à mentionner ;
- le stockage du `state` anti-CSRF (cookie httpOnly ?) et le cache de l'access token.

À noter en positif : `*.db` est ignoré par git (`.gitignore`), donc le refresh token stocké en clair dans `local.db` ne risque pas d'être commité. Le chiffrement au repos n'est pas exigé par le PRD.

### m8 — Mineur — Cohérence de détail

- **AD-4** impose le préfixe `${skillKey}.` pour les outils de skill. L'outil dédié d'AD-13, l'outil de FR-31 et `propose_livrable_content` sont des outils globaux, hors catalogue. Il faut préciser qu'ils échappent à la règle et les nommer.
- **AD-9** dit "chaque bloc (paragraphe)", mais un bloc Slides est une **zone de texte entière**, qui peut contenir plusieurs paragraphes. `deleteText`+`insertText` sur la zone aplatit la mise en forme interne. FR-30 l'accepte, mais AD-9 devrait dire "bloc = zone de texte" pour Slides.
- **ERD** : la relation `APP_STATE |o--o| GOOGLE_CONNECTION` n'a aucune colonne FK. Les deux sont des singletons indépendants, donc soit retirer la relation, soit l'annoter "sans FK".
- **Capability Map 4.5** : il manque `actions/message.ts` (choix d'outil, C2) et le nouveau fichier `skills/` de l'outil dédié.
- **AD-12 Binds** cite "NFR §4.5" : il vaudrait mieux citer aussi la contrainte "Le mode démo ne dépend jamais d'une connexion Google" (déjà couverte par AD-1).

---

## Grille "good spine"

| Critère | Évaluation |
| --- | --- |
| Fixe les vrais points de divergence, n'en rate aucun | **Partiel.** Bien fixés : sélection de l'adaptateur, stockage du jeton, identité des blocs Slides, unicité `(projectId, driveFileId)`, interdiction de régénérer un deck. Manqués : référence durable (C1), canal agent et point d'application (C2), état non enregistré (M3), proposition FR-31 (M5), purge et fraîcheur de `DOCUMENT` (M4.3-4). |
| Chaque Rule est applicable et empêche bien sa divergence | **Partiel.** AD-12 et AD-1 sont applicables. Celle d'AD-13 sur `writeControl` ne tient pas au-delà de 24 h. Son interdiction de `propose_livrable_content` n'a pas de point d'application, et le chemin `sendMessage` actuel la contredit. |
| Rien sous Deferred ne permet à deux unités de diverger | **Globalement OK.** Les plafonds de contexte (valeurs seulement) et OQ-7 (gabarit seulement) sont sains, à condition que la forme de la proposition FR-31 sorte de ce flou (M5). |
| Tech nommée vérifiée et actuelle | **OK.** `@googleapis/drive` 26.0.1, `@googleapis/slides` 10.0.1 et `google-auth-library` 11.1.0 sont les dernières versions sur npm au 2026-10-02. Next 16.3.5 et `@anthropic-ai/sdk` 0.126.0 sont cohérents avec la Stack. Seule réserve, la sémantique de `revisionId` (C1). |
| Ratifie le brownfield au lieu de le contredire | **Non, sur 5 points** (M4) : lecteur de `demoModeActive` dans `skills/`, port et export constant, sync qui écrase `content`, injection du livrable hors `buildRequest.ts`, cardinalité conversation→livrable implicite (C2). |
| Couvre les capacités du PRD | **Partiel.** FR-25 à FR-28 sont couverts. FR-29 l'est sans canal de suggestion ni de révision globale (C2). FR-30 est fragile (C1, M3). FR-31 n'est couvert qu'au niveau du port (M5). La garde-fou "données envoyées au modèle" est bien couverte par AD-11. |
| Chaque dimension est décidée, différée ou ouverte (y compris l'enveloppe opérationnelle) | **Partiel.** Déploiement : différé explicitement, c'est correct. Fournisseur et infra Google (client OAuth, redirect URI, secrets, quotas) : non traités (m7). Exploitation : pas de règle pour la révocation de jeton (m6). |

## Points forts à conserver

- Une seule fonction de résolution du mode drive dans `actions/`, une seule fabrique dans `integrations/index.ts`, et `integrations/` qui ne lit jamais la base. C'est le bon endroit pour fermer la divergence.
- Une exception à AD-2 limitée à deux route handlers et justifiée (une redirection OAuth ne peut pas être une Server Action), avec écriture via `actions/google-connection.ts`.
- Un `objectId` Slides comme `id` de bloc : l'invariant AD-9 "ancre = id, jamais position" est réutilisé tel quel.
- Une unicité `(projectId, driveFileId)` et une réimportation explicite qui conserve les suggestions dont l'ancre existe encore.
- `usedAsContext` comme seul interrupteur d'envoi au modèle : il traduit directement la garde-fou PRD sur les données.
