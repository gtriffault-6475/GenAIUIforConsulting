---
name: 'GenAI4Consulting — Revue adversariale de la spine (mise à jour du 2026-10-02)'
type: review
target: _bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
scope: 'AD-1 (modes drive), AD-9 (blocs Slides), AD-11 (documents de contexte), AD-12 (OAuth), AD-13 (livrables adossés à Drive), ajouts ERD — stories 5.1 à 5.6'
method: 'adversariale : paires d''unités conformes à la lettre mais incompatibles entre elles'
created: '2026-10-02'
---

# Revue adversariale — spine du 2026-10-02 (Epic 5, Google Drive)

## Méthode

Pour chaque trou, je construis deux unités d'un niveau en dessous (stories 5.1 à 5.6, ou une story face à du code existant qu'elle doit prolonger). Chacune respecte toutes les AD et conventions à la lettre. Ensemble, elles produisent un système incohérent. Chaque trou se termine par la règle à ajouter ou à resserrer.

J'ai aussi lu le code existant (`db/schema.ts`, `actions/document.ts`, `actions/message.ts`, `actions/livrable.ts`, `skills/buildRequest.ts`, `integrations/*`), car les stories de l'Epic 5 le prolongent. Plusieurs trous viennent d'un écart entre ce que la spine décrit et ce que le code fait déjà.

## Verdict

**Pas prête pour six stories construites indépendamment.** Les décisions de fond (port drive unique, `objectId` comme id de bloc, `requiredRevisionId`, OAuth côté serveur) sont bonnes. Mais la spine laisse sans propriétaire unique trois choses que plusieurs stories touchent toutes :

1. le **lien entre un livrable et sa conversation**, et donc quel outil l'agent reçoit ;
2. l'**état « modifié depuis la dernière synchro Drive »** d'un livrable, dont 5.3, 5.4 et 5.5 ont toutes besoin et qu'aucun champ ne porte ;
3. le **contrat du port drive** : formes de retour, erreurs, et la manière dont l'adaptateur Google reçoit ses identifiants.

Les trous H1 à H4 sont bloquants : ils produisent une perte de données ou un écrasement silencieux, ce que AD-13 doit justement empêcher. H5 à H12 donnent des incohérences visibles ou des corrections coûteuses après coup.

---

## H1 — Un livrable Drive rattaché à une conversation reçoit `propose_livrable_content` (BLOQUANT)

**Où :** AD-10, AD-13, ERD `CONVERSATION |o--o{ LIVRABLE`, `actions/message.ts::sendMessage`.

Le code existant retrouve « le » livrable d'une conversation par `SELECT … FROM livrable WHERE conversationId = ?` sans `LIMIT` ni contrainte d'unicité. Il offre `propose_livrable_content` à **chaque** `sendMessage`, et met à jour ce livrable s'il existe. La spine dit qu'une conversation peut avoir plusieurs livrables (`|o--o{`). AD-13 dit que l'agent n'a « jamais » `propose_livrable_content` sur un livrable Drive, mais ne dit pas **comment** le choix d'outil est fait ni à partir de quoi.

**Paire :**
- **Story 5.6** (création depuis la conversation) : après `createPresentation`, elle passe par « le même import » et renseigne `LIVRABLE.conversationId` = la conversation courante. C'est la lecture naturelle de l'ERD (« conversation d'origine ») et d'AD-10 (« cible d'une révision globale »).
- **Story 5.4** (suggestions sur une présentation importée) : elle ajoute un outil dédié et une branche dans `sendMessage` (« si le livrable de la conversation est `source = 'drive'`, offrir l'outil dédié »). Elle ne retire pas `propose_livrable_content` du chemin par défaut, car AD-13 ne parle que de l'outil offert *sur* un livrable Drive.

**Divergence :** si la conversation de 5.6 avait déjà produit un livrable local plus tôt (cas courant : on rédige, puis on demande « fais-en une présentation »), elle a maintenant deux livrables. Le `SELECT` sans ordre de `sendMessage` en prend un au hasard. Selon le tirage, le message suivant :
- régénère le livrable local avec `propose_livrable_content` ;
- ou applique `propose_livrable_content` au livrable Drive et remplace tout `content` par des blocs aux id `crypto.randomUUID()`. Les `objectId` Slides sont perdus, et le prochain `writePresentationText` vise des zones qui n'existent pas.

Inversement, si 5.3 met `conversationId = null` à l'import depuis le panneau (il n'y a pas de conversation d'origine), alors `requestGlobalRevision` répond « Ce livrable n'a pas de conversation d'origine ». La révision globale sur un livrable Drive, exigée par AD-10, est alors impossible.

**Règle à ajouter (nouvelle AD-14 « Cible et outil d'un appel agent ») :**
- Une conversation porte **au plus un** livrable : contrainte unique partielle `LIVRABLE(conversationId) WHERE conversationId IS NOT NULL`. L'ERD passe à `CONVERSATION |o--o| LIVRABLE`.
- Tout livrable Drive a une conversation : l'import (5.3) et la création (5.6) en créent une dédiée (`stepKey = null`) si le livrable n'en a pas, et le rattachent. 5.6 ne réutilise jamais une conversation qui porte déjà un livrable : elle en crée une nouvelle pour le livrable Drive.
- Le jeu d'outils est choisi par une seule fonction pure, `domain/agentTools.ts::toolsFor(livrable | null)` : aucun livrable ou `source = 'local'` donne `propose_livrable_content` ; `source = 'drive'` donne uniquement l'outil dédié. `sendMessage` n'a plus d'outil par défaut codé en dur.

---

## H2 — Aucun champ ne dit ce qui a changé depuis la dernière synchro Drive (BLOQUANT)

**Où :** AD-9 (« accepter remplace le texte du bloc »), AD-13 (« ne réécrit que le texte des blocs modifiés »), FR-29 (perte des changements non enregistrés au réimport, avec avertissement), UX (« Enregistrer » désactivé sans changement accepté en attente).

Accepter une suggestion écrase `LIVRABLE.content.blocks[i].text`. Une fois cela fait, rien ne garde le texte venu de Drive. « Bloc modifié » n'a donc aucune définition stockée.

**Paire :**
- **Story 5.5** calcule les blocs modifiés en relisant la présentation (`readPresentation`) et en comparant les textes. C'est conforme : AD-13 ne dit pas comment on identifie un bloc modifié.
- **Story 5.3**, pour l'avertissement du réimport, et l'en-tête de l'éditeur, pour griser « Enregistrer », dérivent l'état « non enregistré » des suggestions `accepted`. Une suggestion acceptée n'a pas de date ni de marqueur « enregistré », donc après un premier enregistrement réussi toutes les acceptations passées comptent encore comme non enregistrées.

**Divergence :**
- Le bouton reste actif pour toujours après le premier changement accepté.
- L'avertissement de réimport se déclenche même quand tout est enregistré.
- La comparaison de 5.5 dépend de l'état distant : si un collègue a modifié une autre zone dans Slides, 5.5 la voit comme « modifiée » et la réécrit avec l'ancien texte de l'app. C'est exactement l'écrasement qu'AD-13 interdit. `requiredRevisionId` ne protège pas ici, puisque 5.5 vient de relire et pourrait réutiliser la révision fraîche.

**Règle à resserrer (AD-9 et AD-13) :**
- Un livrable `source = 'drive'` stocke sa **base** : `LIVRABLE.driveBaseContent`, le JSON des blocs tel que lu à l'import, au dernier réimport ou après le dernier enregistrement réussi. Il est écrit uniquement dans ces trois cas, dans la même transaction que `driveRevisionId`.
- « Bloc modifié » = `content.blocks[id].text !== driveBaseContent.blocks[id].text`. C'est une fonction pure, `domain/driveDiff.ts`, seule source de vérité pour le bouton, l'avertissement et `edits`.
- L'enregistrement n'envoie jamais un texte calculé à partir de l'état distant. Il ne relit jamais la présentation pour décider quoi écrire.

---

## H3 — `revisionId` Slides : durée de vie limitée, et confusion avec la révision Drive (BLOQUANT)

**Où :** AD-13 (`driveRevisionId` = `revisionId` Slides, « Google refuse en 400 si la présentation a changé »).

D'après la documentation Google (à confirmer à la story 5.5), un `revisionId` Slides n'est garanti valide que **24 heures** après avoir été renvoyé, et ne se partage pas entre utilisateurs. AD-13 traite tout 400 comme « la présentation a changé ». Par ailleurs, l'API Drive (`files.list` / `files.get`) expose ses propres champs (`headRevisionId`, `modifiedTime`, `version`), qui ne se comparent pas au `revisionId` Slides.

**Paire :**
- **Story 5.5** applique AD-13 à la lettre : tout 400 sur `batchUpdate` donne l'état « en conflit », avec la proposition de réimporter.
- **Story 5.2 / 5.3**, pour afficher « modifié dans Drive depuis l'import » dans le panneau Livrables, compare le `headRevisionId` ou `version` renvoyé par `listFiles` à `LIVRABLE.driveRevisionId`. Cela respecte la spine, qui ne précise pas quelle « révision » le panneau doit comparer.

**Divergence :**
- Un consultant qui importe un lundi et enregistre le mercredi reçoit un « conflit » alors que personne n'a touché le fichier. Il doit réimporter, et les changements acceptés sont perdus, avec avertissement certes. Il ne peut jamais enregistrer un travail qui a duré plus d'un jour.
- Le panneau affiche « modifié » sur toutes les présentations importées, car les deux identifiants ne se comparent jamais.

**Règle à resserrer (AD-13) :**
- `driveRevisionId` ne sert qu'à `writeControl`. Il n'est jamais comparé à un champ de l'API Drive. Si le panneau a besoin d'un signal « modifié depuis l'import », il utilise `LIVRABLE.driveModifiedTime`, lu par l'API Drive à l'import et comparé au `modifiedTime` de `listFiles`.
- L'adaptateur distingue deux erreurs (voir H5) : `revision_conflict` et toute autre erreur. Sur un refus de révision, `actions/livrable.ts` relit la présentation et compare chaque bloc à `driveBaseContent` (H2). Si aucun bloc de la base n'a changé à distance, il relance l'écriture une fois avec le `revisionId` frais. Sinon, c'est un vrai conflit. On respecte ainsi l'esprit d'AD-13 (rien n'est écrasé) sans qu'un identifiant périmé bloque l'enregistrement.

---

## H4 — La resynchro du panneau Contexte efface le texte des fichiers choisis, ou les garde après leur disparition (BLOQUANT)

**Où :** AD-11 (`usedAsContext` « jamais écrasé par la resynchro »), ERD `DOCUMENT.content` (« vide pour un document drive non sélectionné »), patron sync-then-read de `actions/document.ts::listDocuments`.

Aujourd'hui, `listDocuments` fait un upsert de chaque fichier listé avec `content = doc.content` (`onConflictDoUpdate … set content`) et ne supprime jamais rien. La spine protège `usedAsContext` mais ni `content` ni la suppression.

**Paire :**
- **Story 5.2, partie liste :** `listFiles` renvoie des métadonnées sans contenu (c'est le but : ne rien lire sans choix). Le sync garde le patron existant et écrit `content: ''`, conformément à l'ERD (« vide pour un document drive non sélectionné »).
- **Story 5.2, partie sélection** (ou une story suivante qui la reprend) : cocher un fichier appelle `exportText` et stocke le texte dans `DOCUMENT.content`, une seule fois au moment du choix.

**Divergence :**
- À l'ouverture suivante du panneau, le sync remet `content = ''` sur le fichier choisi, et `usedAsContext` reste `true`. `buildRequest` envoie alors un document vide au modèle, sans aucune erreur visible.
- Si le sync ne touche pas `content`, le texte reste figé à la date du choix : un Google Doc modifié depuis n'est jamais relu.
- Un fichier supprimé ou déplacé hors du dossier reste en base avec `usedAsContext = true` et continue de partir chez Anthropic, alors qu'il n'apparaît plus dans Drive.

**Règle à resserrer (AD-11, et nouvelle ligne dans les Consistency Conventions « Synchro drive → DOCUMENT ») :**
- La synchro est la seule à écrire les lignes `source = 'drive'`. Elle met à jour `name`, `folderPath` et `mimeType`, et **ne touche jamais** `content` ni `usedAsContext`.
- Une ligne `drive` dont l'id n'est plus listé est **supprimée** dans la même transaction, avec son choix.
- `content` d'un document `drive` choisi est rafraîchi par `exportText` à chaque assemblage d'appel agent : `actions/` l'exporte, puis le passe à `buildRequest`. Ou bien il est rafraîchi à chaque synchro pour les seuls documents choisis. Il faut trancher l'un des deux et l'écrire ; je recommande le second (une seule lecture réseau, au même moment que la liste).
- `DOCUMENT.id` d'une ligne `drive` = `fileId` Drive, ou mieux `${projectId}:${fileId}` : la clé primaire est globale, et deux projets Octopod de même nom pointent sur le même dossier.

---

## H5 — Le port drive n'a ni formes de retour ni erreurs typées

**Où :** AD-1 (liste des méthodes de `DriveProvider`, sans types), Conventions (`ActionResult` défini pour les Server Actions seulement), FR-26.

**Paire :**
- **Story 5.2** implémente `listFiles(projectName)` côté Google. Pour « dossier introuvable » ou « en double », elle renvoie `[]` dans le premier cas et le premier dossier trouvé dans le second, car le port ne prévoit aucune erreur. L'UI ne peut alors pas afficher le message FR-26.
- **Story 5.6** implémente `createPresentation(projectName, …)`, qui doit aussi résoudre le dossier. Elle lève `new Error('Dossier introuvable')`. Ou bien elle ajoute un cache `PROJECT.driveFolderId` rempli à `selectProject` (FR-26 dit « à la sélection d'un projet »), alors que 5.2 résout le dossier par nom à chaque appel.

Même chose pour `readPresentation` : 5.3 lui fait renvoyer la `Presentation` Slides brute et convertit en blocs dans `actions/livrable.ts`. Mais 5.6 (« puis par le même import ») et le réimport ont besoin de la même conversion, qui finit copiée à trois endroits. Les cas groupe / tableau / notes risquent alors de diverger entre ces copies.

**Divergence :** trois traitements différents du même dossier absent (liste vide, exception, cache périmé). Trois conversions Slides vers blocs. Aucun moyen pour 5.5 de distinguer un conflit de révision d'une autre erreur 400 (H3).

**Règle à resserrer (AD-1) :** la spine fixe les signatures dans `integrations/ports/drive-provider.ts` :
- toutes les méthodes renvoient `DriveResult<T> = { ok: true; data: T } | { ok: false; error: DriveError }`, avec `DriveError = 'folder_not_found' | 'folder_ambiguous' | 'file_not_found' | 'not_a_presentation' | 'revision_conflict' | 'auth_revoked' | 'unavailable'`. Un adaptateur ne lève jamais d'exception ;
- `listFiles` renvoie `{ id, name, mimeType, modifiedTime }[]` ;
- `readPresentation` renvoie déjà le modèle de l'app : `{ title, revisionId, modifiedTime, slides: [{ slideId, index, blocks: [{ id, text }] }] }`. La conversion Slides vers blocs (groupes inclus ; tableaux, images et notes exclus) vit **uniquement** dans l'adaptateur Google ;
- `writePresentationText(fileId, edits: { id, text }[], requiredRevisionId)` renvoie `{ revisionId }` ;
- la résolution du dossier se fait par nom à chaque appel, dans l'adaptateur. Pas de colonne `driveFolderId` en round 1.

---

## H6 — Le « résolveur de mode » unique : nom, ordre de priorité, portée, identifiants

**Où :** AD-1 (« une seule fonction de `actions/` (seule à lire `APP_STATE.demoModeActive`, `GOOGLE_CONNECTION` et la configuration) »).

Dans le code actuel, `demoModeActive` est déjà lu par `skills/buildRequest.ts` (directement en base), `actions/message.ts`, `actions/skill.ts`, `actions/document.ts`, `app/layout.tsx`, `app/page.tsx` et `components/SkillsPanel.tsx`. La phrase « seule à lire » est donc fausse dès qu'on l'écrit.

**Paire :**
- **Story 5.1** la lit à la lettre : elle crée `actions/drive-mode.ts::resolveDriveMode()` et migre tous les lecteurs de `demoModeActive` vers cette fonction, y compris le mode démo de la conversation, qui n'a rien à voir avec le drive.
- **Story 5.2** la lit comme une règle propre au drive. Dans `actions/document.ts`, qui lit déjà `getDemoModeActive()`, elle ajoute son propre test `if (demo) mock else if (!connection) …`, dans un ordre différent : « non connecté » est testé avant « non configuré ».

Autres points flous :
- l'ordre de priorité quand deux conditions sont vraies (démo et non configuré ? non configuré et non connecté ?), alors que l'UX montre un message différent pour chacune ;
- l'absence de `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, qui n'est rattachée à aucun mode ;
- la manière dont l'adaptateur Google obtient le refresh token : `integrations/` ne lit pas la base, mais la fabrique ne reçoit que « le mode » ;
- le nouveau refresh token renvoyé par Google : qui le sauvegarde ?
- un jeton révoqué (`invalid_grant`) : la ligne `GOOGLE_CONNECTION` existe encore, donc le mode reste `connected` pour toujours.

**Divergence :** des panneaux qui affichent des états différents pour la même configuration, et une connexion morte qui n'est jamais détectée.

**Règle à resserrer (AD-1, AD-12) :**
- `DriveMode = 'demo' | 'unconfigured' | 'disconnected' | 'connected'` est défini dans `domain/driveMode.ts`, avec une fonction pure `resolveDriveMode({ demoModeActive, hasRootFolder, hasOAuthClient, connection })`. L'**ordre de priorité est fixe** : `demo` > `unconfigured` (dossier racine **ou** client OAuth absent) > `disconnected` > `connected`.
- Une seule Server Action, `actions/drive-mode.ts::getDriveMode()`, lit les entrées. Toute décision liée au drive (UI, panneaux, filtre de `buildRequest`, choix d'adaptateur) passe par elle. Les autres usages de `demoModeActive` (conversation démo, skills) **ne sont pas** concernés. Il faut remplacer « seule à lire » par « seule source des décisions drive ».
- La fabrique a pour signature `getDriveProvider(mode, credentials?: { refreshToken })`. L'adaptateur Google renvoie `auth_revoked` (H5) sur `invalid_grant`. `actions/google-connection.ts` est le seul à réagir : il supprime la ligne, et le mode passe à `disconnected`. Un nouveau refresh token émis par Google est renvoyé dans le résultat et sauvegardé par cette même action, jamais par l'adaptateur.

---

## H7 — Deux propriétaires de « la liste des présentations du dossier »

**Où :** AD-1 (`listFiles`), FR-27 (panneau Contexte), FR-28 (groupe « Dans le Drive du projet » du panneau Livrables), patron sync-then-read.

**Paire :**
- **Story 5.2** synchronise tout le dossier dans `DOCUMENT`, y compris les fichiers Slides, qui peuvent être choisis comme contexte selon FR-27.
- **Story 5.3** construit le groupe « Dans le Drive du projet » en appelant directement `listFiles` à chaque ouverture du panneau Livrables, filtré sur le type Slides et dédoublonné par rapport à `LIVRABLE.driveFileId`. C'est conforme : AD-1 n'impose pas de passer par `DOCUMENT`.

**Divergence :**
- Deux appels réseau pour le même dossier, à des moments différents, d'où des listes qui ne concordent pas après un ajout dans Drive.
- Surtout, une présentation importée **et** choisie comme contexte part deux fois chez le modèle : une fois comme `DOCUMENT` (export texte figé, H4), une fois comme contenu du livrable (H8). Les deux versions peuvent différer, car le livrable contient des suggestions acceptées mais pas encore enregistrées. L'agent reçoit alors deux textes contradictoires pour le même fichier.

**Règle à ajouter (AD-11, et Conventions) :**
- `DOCUMENT` est le **seul miroir** du listing Drive. Le groupe « Dans le Drive » du panneau Livrables se lit dans `DOCUMENT WHERE source = 'drive' AND mimeType = Slides`, après la même synchro. Il faut ajouter la colonne `DOCUMENT.mimeType` à l'ERD : elle manque, alors que 5.2 en a besoin pour la mention « non lu par l'agent » et pour bloquer le choix.
- Un `DOCUMENT` dont l'id correspond au `driveFileId` d'un livrable du projet est **exclu** de l'assemblage de contexte (`buildRequest`). Le livrable est la seule représentation de ce fichier envoyée au modèle.

---

## H8 — Comment le contenu du livrable arrive au modèle n'est pas dans AD-11, et le format actuel ne permet pas d'ancrer

**Où :** AD-11 (le prompt = skills + documents de contexte + historique), `actions/message.ts` (injecte le livrable courant comme une fausse skill `__current_livrable_context`, numérotée `1.`, `2.`…), FR-29 (« importer puis demander des suggestions vaut choix explicite d'envoi »).

AD-11 ne mentionne pas le livrable courant parmi les éléments du prompt. Le code l'injecte hors de `buildRequest`, avec une numérotation par position et sans les `id` de blocs.

**Paire :**
- **Story 5.4** reprend l'injection existante, conforme à l'usage. L'outil dédié reçoit `¶N` et convertit les positions en `id`, ce qu'AD-9 interdit côté stockage mais pas côté prompt. Les zones `slideId` sont aplaties, et le modèle ne sait pas sur quelle diapositive il travaille.
- **Story 5.6** (ou 5.3, qui crée la conversation du livrable selon H1) laisse l'injection existante se déclencher à **chaque** message de la conversation du livrable Drive, dès le premier « bonjour ». Le contenu de la présentation part alors chez Anthropic sans que le consultant ait demandé de suggestions, ce qui contredit la règle d'envoi sur choix explicite.

**Divergence :** des ancres calculées par position, que la spine voulait justement éviter. Et une fuite de contenu Drive non demandée.

**Règle à resserrer (AD-11) :**
- Le livrable courant est un **quatrième élément** du prompt, assemblé dans `skills/buildRequest.ts` et nulle part ailleurs. Il est rendu avec les `id` de blocs et regroupé par diapositive (`[slide s2 · bloc g7a1] texte`).
- Pour un livrable `source = 'drive'`, il n'est inclus **que** dans les appels qui offrent l'outil dédié (H1). Cet outil n'est offert que sur une demande explicite de suggestions ou de révision globale (bouton de l'éditeur, ou `requestGlobalRevision`), jamais sur un `sendMessage` libre.

---

## H9 — Réimport : le même `objectId` porte un autre texte, contrairement à AD-9

**Où :** AD-9 (« un `id` stable, jamais réutilisé pour un autre texte »), AD-13 (le réimport « conserve les suggestions dont l'`anchorRef` existe encore »).

Un `objectId` Slides survit à une modification du texte dans Google Slides. Après un réimport, le bloc `id = X` a donc un autre texte : l'invariant d'AD-9 est violé par AD-13 elle-même.

**Paire :**
- **Story 5.3** (réimport) conserve toutes les suggestions `pending` dont l'ancre existe encore, à la lettre.
- **Éditeur / `acceptSuggestion`** (existant) remplace le texte du bloc par celui de la suggestion. La suggestion avait été rédigée pour l'ancien texte : elle réécrit sans le savoir un paragraphe que le collègue venait de modifier dans Drive.

**Divergence :** le réimport est fait pour ne pas écraser le travail d'autrui, mais accepter une suggestion conservée l'écrase quand même, au prochain enregistrement.

**Règle à resserrer (AD-9, AD-13) :**
- L'invariant d'AD-9 devient « un `id` ne désigne jamais un autre emplacement ». Le texte peut changer au réimport.
- Le réimport conserve une suggestion `pending` **seulement si** le texte de son bloc est identique dans l'ancienne et la nouvelle base (`driveBaseContent`, H2). Sinon, il la passe à `rejected`, la seule issue possible avec l'enum actuel. Les suggestions `accepted` / `rejected` gardent leur `resolvedPosition`.

---

## H10 — Ordre et numérotation des diapositives

**Où :** AD-9 (`{ id, text, slideId? }`, « l'ordre des autres blocs n'affecte jamais la résolution de l'ancre »), UX (« regroupement sous Diapositive N »).

**Paire :**
- **Story 5.3** stocke les blocs dans l'ordre de lecture et ne garde pas les diapositives sans texte (une diapositive avec seulement une image ne produit aucun bloc).
- **L'éditeur (5.3 ou 5.4)** numérote « Diapositive N » en comptant les `slideId` distincts dans `blocks`.

**Divergence :** dès qu'une diapositive n'a pas de texte, « Diapositive 4 » dans l'app correspond à la diapositive 5 dans Google Slides. Le consultant ne retrouve pas la zone dont parle une suggestion. AD-9 dit aussi que l'ordre ne compte pas, alors que le regroupement et `¶N` en dépendent.

**Règle à resserrer (AD-9) :** un bloc Drive porte `slideIndex` (numéro 1-based de la diapositive dans le fichier, lu à l'import). L'ordre du tableau `blocks` est l'ordre d'affichage, garanti par l'adaptateur : par diapositive, puis par ordre z de la page. « Diapositive N » affiche `slideIndex`, jamais un compte.

---

## H11 — Mode démo, déconnexion, changement de compte : que deviennent les données Drive déjà en base ?

**Où :** AD-1 (`demo` : « fonctions de livrables Drive indisponibles » ; `disconnected` : « aucune donnée drive »), AD-11 (envoie **tout** `DOCUMENT` avec `usedAsContext = true`), AD-12 (« la déconnexion supprime la ligne »), FR-25 (« le panneau Livrables ne montre que les livrables de l'app »).

Le mock et l'adaptateur Google écrivent tous les deux des lignes `DOCUMENT source = 'drive'` dans la même table, pour le même projet. Le panneau lit `WHERE projectId = ?`.

**Paire :**
- **Story 5.2** filtre le panneau Contexte selon le mode à l'affichage, mais ne supprime rien.
- **Story 5.1** (déconnexion) supprime la ligne `GOOGLE_CONNECTION`, comme AD-12 le demande, et rien d'autre.
- **Story 5.3** interprète « livrables de l'app » comme « toutes les lignes `LIVRABLE` », donc les livrables Drive importés restent visibles en démo.

**Divergence :**
- Après déconnexion, ou en mode démo, `buildRequest` continue d'envoyer au modèle les vrais fichiers Drive choisis plus tôt, alors que le panneau affiche « aucune donnée drive » ou le contenu simulé.
- En démo, les documents simulés et les vrais documents se mélangent, et une mention Google peut apparaître (bouton « Enregistrer dans Drive » sur un livrable Drive), ce que FR-25 interdit.
- Après connexion à un autre compte, les `driveFileId` deviennent inaccessibles. 5.5 reçoit une 404 et l'affiche comme une erreur générique.

**Règle à ajouter (AD-1) :**
- Les lignes `DOCUMENT source = 'drive'` portent leur origine : `driveOrigin = 'mock' | 'google'`. La synchro d'un mode supprime les lignes de l'autre origine pour le projet. `buildRequest` n'inclut un document `drive` que si son origine correspond au mode courant (`connected` donne `google`, `demo` donne `mock`). En `disconnected` et en `unconfigured`, aucun document `drive` n'est envoyé.
- En `demo`, `disconnected` et `unconfigured`, le panneau Livrables masque les livrables `source = 'drive'`, et l'éditeur refuse de les ouvrir.
- La déconnexion ne supprime pas les livrables Drive (leur travail accepté est conservé). Une reconnexion sur un autre compte fait ressortir `file_not_found`, affiché comme « présentation inaccessible avec ce compte ».

---

## H12 — Création (5.6) : la proposition de diapositives n'a ni forme ni stockage, et le nom de l'outil est invalide

**Où :** AD-1 (`createPresentation(projectName, title, slides)`, `slides` sans type), Deferred (OQ-7), AD-2 (un handler d'outil ne persiste rien), AD-4 (nom d'outil `${skillKey}.${toolName}`), UX (carte « Créer dans Drive » / « Ajuster »), règle existante « MESSAGE ne stocke jamais l'échange outil ».

**Paire :**
- **Story 5.6, partie agent :** un outil `propose_presentation` renvoie `{ title, slides: [{ title, body }] }`. Comme `MESSAGE` ne stocke que du texte, la carte vit dans un state React, sur le modèle d'AD-7. Un rechargement de page la fait disparaître.
- **Story 5.6, partie création**, ou une reprise après OQ-7 : `createPresentation` attend `slides: { layout, placeholders: Record<string, string> }[]` pour appliquer le modèle OCTO. La spine ne fixe que la signature.

**Divergence :** une carte perdue au rechargement : le consultant demande une présentation, recharge, et la proposition disparaît sans qu'aucun fichier n'ait été créé. Deux formes de `slides` incompatibles entre l'outil et le port. Enfin, `${skillKey}.${toolName}` (AD-4) contient un point, que l'API Messages refuse dans un nom d'outil (motif `^[a-zA-Z0-9_-]+$`, à vérifier sur la version du SDK utilisée). Ce trou date d'avant le 2026-10-02, mais la story 5.4 sera la première à ajouter un outil.

**Règle à ajouter :**
- La forme `PresentationDraft = { title: string; slides: { title: string; body: string }[] }` est fixée dans `domain/` **dès maintenant**. OQ-7 ne décide que la mise en page appliquée par l'adaptateur, pas les données échangées.
- La proposition est persistée : `MESSAGE.attachment` (JSON nullable, `{ kind: 'presentation_draft', draft }`), écrite par l'action appelante. La carte se lit depuis le message.
- « Créer dans Drive » est une Server Action qui reçoit l'`id` du message. Elle est idempotente : `MESSAGE.attachment.createdLivrableId` évite un double fichier sur un double clic.
- AD-4 : le séparateur des noms d'outil passe de `.` à `__`.

---

## Points mineurs (pas de paire conflictuelle forte, à noter dans la spine)

- **AD-11 n'est pas implémentée aujourd'hui :** `buildRequest` n'inclut aucun `DOCUMENT`. La story 5.2 sera la première à le faire, pour les documents `manual` comme pour les `drive`. Cela comprend le document de référence démo, écrit en `source = 'manual'`. La spine devrait dire que 5.2 porte aussi cette mise en conformité, sinon 5.2 limitera son travail au drive.
- **Unicité `(projectId, driveFileId)` :** 5.3 (clic sur le panneau) et 5.6 (après création) importent toutes les deux. L'import doit être un `INSERT … ON CONFLICT DO NOTHING` suivi d'une relecture, sans vérification préalable séparée. Il faut le dire dans AD-13 pour qu'un double clic ne produise pas d'erreur.
- **`state` OAuth (AD-12) :** l'emplacement de stockage (cookie httpOnly ou mémoire) n'est pas fixé. Cela ne concerne que 5.1, donc ce n'est pas un trou entre stories, mais un cookie httpOnly `SameSite=Lax` survit au redémarrage du serveur de dev pendant le flux.

---

## Synthèse des changements proposés à la spine

| Trou | Gravité | Changement |
| --- | --- | --- |
| H1 | Bloquant | Nouvelle AD-14 : au plus un livrable par conversation ; tout livrable Drive a sa conversation ; outils choisis par `domain/agentTools.ts::toolsFor(livrable)` |
| H2 | Bloquant | `LIVRABLE.driveBaseContent` ; « bloc modifié » = diff pur `domain/driveDiff.ts` ; l'enregistrement ne relit jamais pour décider quoi écrire |
| H3 | Bloquant | `revisionId` réservé à `writeControl` ; erreur `revision_conflict` typée ; relance unique si la base distante n'a pas changé ; `driveModifiedTime` pour l'affichage |
| H4 | Bloquant | La synchro ne touche jamais `content` ni `usedAsContext`, supprime les fichiers disparus et rafraîchit les fichiers choisis ; id `${projectId}:${fileId}` |
| H5 | Élevé | Signatures typées du port, `DriveResult` / `DriveError`, conversion Slides → blocs uniquement dans l'adaptateur |
| H6 | Élevé | `domain/driveMode.ts` avec ordre de priorité fixe ; « seule source des décisions drive » ; fabrique `(mode, credentials)` ; `auth_revoked` → suppression par `actions/google-connection.ts` |
| H7 | Élevé | `DOCUMENT` seul miroir du listing (+ `mimeType`) ; un fichier importé comme livrable est exclu du contexte |
| H8 | Élevé | Le livrable courant devient un élément d'AD-11 dans `buildRequest`, rendu avec les `id` ; contenu Drive envoyé seulement sur demande explicite |
| H9 | Moyen | Réimport : une suggestion `pending` n'est conservée que si le texte de base de son bloc est inchangé |
| H10 | Moyen | `slideIndex` sur les blocs Drive ; ordre des blocs garanti par l'adaptateur |
| H11 | Moyen | `DOCUMENT.driveOrigin` ; filtrage de `buildRequest` et des panneaux selon le mode ; comportement défini en déconnexion et en changement de compte |
| H12 | Moyen | `PresentationDraft` fixé ; `MESSAGE.attachment` persisté et idempotent ; séparateur d'outil `__` |
