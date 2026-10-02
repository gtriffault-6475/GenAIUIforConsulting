---
title: "Story 5.3 : Import d'une présentation comme livrable"
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5e8cf141e501b4ee10a3f7457842967300fd6577'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-5-7-documents-de-contexte-envoyes-a-l-agent.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** les présentations Google Slides du dossier Drive du projet apparaissent dans le panneau Contexte, mais on ne peut pas les ouvrir dans l'Éditeur assisté (FR-28, FR-29).

**Approche :** nouvelle méthode du port `readPresentation(fileId)` (`@googleapis/slides` 10.x, `presentations.get`) : titre + diapositives dans l'ordre, chacune avec ses zones de texte (formes à texte, y compris dans les groupes, récursivement) ; tableaux, images, notes ignorés. Le panneau Livrables affiche "En cours" puis "Dans le Drive du projet" (lignes `DOCUMENT` de type Slides de l'origine `google`, pas encore importées). Cliquer importe : nouveau livrable `source = 'drive'`, `drive_file_id`, blocs AD-9 `{ id: objectId, text, slideId, slideNumber, driveText: text }`, et une conversation dédiée titrée d'après la présentation (AD-14) ; une présentation déjà importée rouvre son livrable. L'éditeur regroupe les blocs sous "Diapositive N" et propose "Réimporter" (AD-13).

**Décision (Checkpoint 1) :** le point différé de la 5.7 est traité ici. Nouvelle colonne `project.drive_listing_ok` (booléen nullable) : la resynchro du dossier (Story 5.2) l'écrit à `true` après une liste réussie et à `false` après une liste en échec (dossier absent ou en double, quota, erreur) ; `getAgentContext` n'envoie aucun fichier drive tant qu'elle n'est pas `true` pour le projet (les documents ajoutés à la main restent envoyés). Les états non connecté / non configuré ne l'écrivent pas (aucun fichier drive n'y est envoyé de toute façon).

## Boundaries & Constraints

**Always :** migration `livrable` : `source` (`local | drive`, NOT NULL DEFAULT `'local'`), `drive_file_id` (nullable), index unique `(project_id, drive_file_id)` quand non nul, index unique `conversation_id` quand non nul (AD-14 ; aucun doublon en base vérifié le 2026-10-02). Import et réimport refusés hors mode `connected` ; l'import ne modifie jamais le fichier. Réimporter : action explicite ; si un bloc a `text ≠ driveText` (fonction pure dans `domain/`), avertissement dans la page et confirmation avant ; remplace les blocs ; conserve une suggestion `pending`/`revising` seulement si son `anchorRef` existe encore et que le texte Drive du bloc n'a pas changé (sinon supprimée) ; les suggestions `accepted`/`rejected` restent comme historique. **Garde jusqu'à la Story 5.4 :** sur un livrable `source = 'drive'`, `sendMessage` n'offre aucun outil à l'agent et `requestGlobalRevision` refuse (le champ de révision globale est masqué) — `propose_livrable_content` régénérerait la présentation et ses identifiants. Erreurs Google → `DriveError` → message français ("Impossible d'importer cette présentation.").

**Never :** pas d'"Enregistrer dans Drive" (Story 5.5), pas d'outil de suggestions ancrées ni de choix des outils (Story 5.4), pas de création de présentation (Story 5.6). Livrables locaux et mode démo inchangés (en démo, le groupe "Dans le Drive du projet" n'existe pas).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Import | connecté, clic sur une présentation non importée | livrable + conversation dédiée créés ; éditeur ouvert, regroupé par diapositive | lecture en échec → message, rien créé |
| Déjà importée | présentation avec un livrable du projet | rouvre le livrable ; n'apparaît que dans "En cours" | N/A |
| Contenu non textuel | tableau, image, notes, diapositive sans texte | ignorés ; numérotation des diapositives conservée | N/A |
| Réimport sans changement local | aucun bloc modifié | blocs remplacés par la version Drive | lecture en échec → rien modifié |
| Réimport avec changements | au moins un bloc `text ≠ driveText` | avertissement + confirmation ; sinon rien | N/A |
| Hors connexion | livrable Drive, mode ≠ `connected` | consultable ; "Réimporter" désactivé + "Connectez Google Drive pour enregistrer." | N/A |
| Démo | mode démo | aucun groupe Drive, aucun import | N/A |
| Liste en échec | dernière liste du dossier en échec | aucun fichier drive envoyé à l'agent ; documents manuels envoyés | N/A |
| Garde 5.4 | message ou révision globale sur un livrable Drive | aucun outil offert ; révision globale masquée et refusée côté serveur | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts:280` -- `livrable` (`id`, `projectId`, `conversationId`, `title`, `content`).
- `actions/livrable.ts:128 getLivrable`, `:171 listLivrables`, `:438 requestGlobalRevision` -- lecture, liste (`LivrableSummary`), garde à ajouter.
- `actions/message.ts:~183-200,320` -- résout le livrable de la conversation et passe `PROPOSE_LIVRABLE_CONTENT_TOOL` à `sendToAgent` : garde à ajouter.
- `actions/conversation.ts` -- création de conversation (modèle pour la conversation dédiée).
- `actions/document.ts` -- lignes `DOCUMENT` (`mimeType`, `origin`, `driveFileId`) déjà resynchronisées par la 5.2/5.7.
- `integrations/ports/drive-provider.ts`, `integrations/google/drive.ts` (client OAuth, mapping d'erreurs), `integrations/mock/drive-provider.ts`, `integrations/index.ts` -- ajouter `readPresentation`.
- `components/LivrablesPanel.tsx`, `app/page.tsx` -- deux groupes, icône Slides.
- `app/livrables/[id]/page.tsx:138-195` -- rendu des blocs (ordre, `activeAnchorRefs`), `GlobalRevisionField` ; `domain/suggestion.ts` -- `resolveAnchorPosition`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- `@googleapis/slides` 10.0.1 (exact).
- [x] `db/schema.ts` + migration -- colonnes et index de `livrable` ; `project.drive_listing_ok`.
- [x] `actions/document.ts` -- écrire `drive_listing_ok` à la resynchro ; filtre dans `getAgentContext`.
- [x] Port, adaptateurs, fabrique -- `readPresentation`.
- [x] `domain/` -- `isBlockModified`, regroupement par diapositive.
- [x] `actions/livrable.ts` -- `importPresentation`, `reimportPresentation`, liste des présentations importables, garde de `requestGlobalRevision`.
- [x] `actions/message.ts` -- aucun outil pour un livrable Drive.
- [x] `components/LivrablesPanel.tsx`, `app/page.tsx`, `app/livrables/[id]/page.tsx`, `app/globals.css` -- groupes, import, "Diapositive N", "Réimporter" + avertissement.

**Acceptance Criteria:**
- Given un import, then le fichier Drive n'est jamais modifié et aucun appel IA n'est fait.
- Given un livrable local, then son rendu, ses suggestions et sa révision globale sont inchangés.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npx next build --turbopack` -- expected: build OK

**Manual checks (if no CLI):**
- Banc jetable : `readPresentation` contre une réponse `presentations.get` enregistrée (groupes imbriqués, tableau, diapositive vide) ; import/réimport sur une copie de la base avec un adaptateur simulé temporaire ; démo et livrables locaux inchangés dans le navigateur. Import Google réel : attend les identifiants.

## Implementation Notes

Implémenté par sous-agent. `@googleapis/slides` 10.0.1 (exact). Migration `20261002142112_jittery_shockwave` : `livrable.source` (NOT NULL DEFAULT `'local'`), `livrable.drive_file_id`, index uniques partiels `(project_id, drive_file_id)` et `conversation_id`, `project.drive_listing_origin` (`mock | google`, nullable — remplace le booléen `drive_listing_ok` après revue : un succès vaut pour une origine seulement) (aucun doublon de `conversation_id` vérifié avant, commentaire dans la migration). Port : `readPresentation(fileId)` → `{ title, slides: [{ objectId, textBoxes: [{ objectId, text }] }] }`, toutes les diapositives listées (numérotation conservée) ; Google : `presentations.get` (`fields: title,slides(objectId,pageElements)`, notes exclues), formes à texte y compris dans les groupes (récursif), texte = `textRun` + `autoText` sans le saut de paragraphe final (tabulation verticale des sauts de ligne conservée telle quelle ; affichée comme retour à la ligne), forme vide ou blanche ignorée ; mock et fournisseur en échec : `not_found` / leur erreur. `currentDriveProvider` déplacé dans `actions/current-drive-provider.ts` (module non `'use server'`, partagé avec `actions/livrable.ts`). `domain/livrable.ts` : `isBlockModified`, `hasModifiedBlocks`, `groupBlocksBySlide` (¶N global conservé), `keepsSuggestionAfterReimport`, `toSlideBlocks`. `actions/document.ts` : `listDocuments` écrit `drive_listing_origin` (seulement s'il change) : l'origine courante après une liste réussie et sa resynchro, `null` après une liste en échec, un jeton illisible ou une erreur, en `demo`/`connected` seulement ; `getAgentContext` n'envoie de fichier drive que si elle vaut l'origine du mode courant ; `listDrivePresentations` / `getDrivePresentation(projectId, documentId)` (lignes `google` de type Slides du projet, exigent `google`). `actions/livrable.ts` : `listImportablePresentations` (`null` = pas de groupe Drive : hors `connected` ou dernière liste en échec), `importPresentation(projectId, documentId)` (même garde que le panneau, relit, crée conversation dédiée + livrable dans une transaction, rouvre si déjà importée, conversation active inchangée), `reimportPresentation(livrableId, discardLocalChanges)` (refus hors `connected` avec « Connectez Google Drive pour enregistrer. », `needsConfirmation` si un bloc est modifié, revérifié dans la transaction, contenu illisible → échec sans rien supprimer ; une suggestion ancrée sur un bloc modifié n'est pas conservée ; titre inchangé), garde de `requestGlobalRevision`. `actions/message.ts` : livrable Drive → aucun outil, et son texte n'est pas injecté dans le prompt (envoi au modèle sur choix explicite uniquement). `domain/suggestion.ts` : `applyAcceptedSuggestion` conserve les autres champs du bloc (sinon une acceptation effacerait `slideId`/`slideNumber`/`driveText`). UI : `LivrablesPanel` (groupes « En cours » / « Dans le Drive du projet » seulement quand le groupe Drive existe — panneau identique sinon), `ImportPresentationButton`, `SlidesIcon`, `ReimportPresentation` (confirmation en ligne, état annoncé par du texte), éditeur regroupé sous « Diapositive N », avertissement des changements non enregistrés, révision globale masquée.

Vérifié : `tsc` et `next build --turbopack` OK. Banc jetable (esbuild) : `toPresentationContent` contre une réponse `presentations.get` enregistrée (groupes imbriqués, tableau, image, notes, forme vide, diapositive vide, autoText) ; 52 contrôles import/réimport/contexte sur une copie de la base avec un adaptateur simulé temporaire et un faux serveur Messages API (dont : aucun appel IA à l'import, aucun outil ni texte de présentation envoyés pour un livrable Drive, outil toujours offert ailleurs, règles de conservation des suggestions, lecture en échec → rien modifié, `drive_listing_ok` et filtre du contexte, refus hors connexion, démo sans groupe). Navigateur (serveur de dev, démo) : panneau Livrables et éditeur d'un livrable local inchangés ; éditeur d'un livrable Drive inséré temporairement (puis supprimé) : regroupement, avertissement, « Réimporter » inactif avec le message hors connexion, révision globale masquée. Non vérifié : import Google réel (pas d'identifiants).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence / resolution |
|---|---|---|---|---|---|
| 1 | blind-hunter, edge-case (x2) | `drive_listing_ok` partagé entre origines : une liste démo réussie autorise ensuite des fichiers Google jamais relistés ; jeton illisible en mode connecté → indicateur non remis à zéro. | medium | patch | Vérifié ; remplacé par `drive_listing_origin` (origine de la dernière liste réussie, `null` après tout échec), exigé égal à l'origine courante ; écriture seulement si la valeur change. |
| 2 | blind-hunter, edge-case | `importPresentation` ne vérifie ni le projet de la ligne `DOCUMENT` ni la validité de la dernière liste. | low | patch | Garde ajoutée. |
| 3 | edge-case | Réimport : contenu illisible dans la transaction → `[]` → plus de confirmation et suppression de toutes les suggestions ; avec `discardLocalChanges`, suggestion conservée sur un bloc modifié localement puis rétabli. | low | patch | Échec renvoyé ; suggestion non conservée. |
| 4 | blind-hunter, edge-case | Échec d'import : `router.refresh()` démonte le groupe et son message d'erreur. | low | patch | Rafraîchissement seulement en cas de succès. |
| 5 | edge-case | Clic sur "Réimporter" pendant un réimport en cours. | low | patch | Clics ignorés pendant l'action. |
| 6 | blind-hunter | Groupes du panneau Livrables non étiquetés pour les lecteurs d'écran. | low | patch | `aria-labelledby` sur chaque liste. |
| 7 | blind-hunter, edge-case, verification-gap | L'index unique sur `livrable.conversation_id` échouerait sur une base contenant déjà des doublons. | low | patch | Vérifié absent de la base locale (seule base de l'app mono-poste) ; commentaire dans la migration. |
| 8 | blind-hunter | Le réimport supprime les suggestions non conservées au lieu de les rejeter comme la régénération (historique, course avec un retravail en cours). | low | reject | Conforme à l'intention gelée ("sinon supprimée") ; un retravail en cours échoue proprement sur une ligne absente. |
| 9 | blind-hunter | Message hors connexion "Connectez Google Drive pour enregistrer." sur le réimport. | — | false | Copie exacte d'`EXPERIENCE.md` (état "Livrable Drive hors connexion"). |
| 10 | blind-hunter | Texte automatique (numéros de diapositive) inclus dans `driveText` : un réordonnancement compte comme une modification. | low | reject | Cas rare ; conséquence limitée à la suppression de suggestions sur ces zones. |
| 11 | blind-hunter | La réinitialisation démo détache aussi les livrables Drive de leur conversation. | low | reject | Outil de démo ; les livrables Drive n'existent qu'en mode connecté. |
| 12 | blind-hunter | Présentation sans texte, tableaux ignorés : aucune explication. | low | reject | Comportement spécifié (texte seul, FR-29). |
| 13 | blind-hunter | Masque de champs `presentations.get` trop large ; `\u000b` brut hors de la page de l'éditeur. | low | reject | Optimisation ; affichage secondaire. |
| 14 | edge-case | Lecture de la source du livrable en échec → `sendMessage` échoue pour un livrable local. | low | reject | Lecture SQLite locale ; même comportement que les autres lectures de `sendMessage`. |
| 15 | verification-gap (x5), blind-hunter | Aucun test automatisé : `applyAcceptedSuggestion` qui garde `driveText`, règle de conservation au réimport, garde de liste, absence d'outil pour un livrable Drive, conversion `presentations.get`. | medium | defer | Pas de lanceur de tests (décision existante) ; à rejouer manuellement avec de vrais identifiants. |

Après correctifs de revue : `project.drive_listing_origin` remplace `drive_listing_ok` (migration régénérée `20261002142112_jittery_shockwave` ; la base locale, sur laquelle l'ancienne migration était appliquée, a été remise d'aplomb par le sous-agent après sauvegarde — aucun livrable Drive n'existait) ; garde projet + origine sur l'import ; réimport refusé si le contenu est illisible, suggestion d'un bloc modifié localement non conservée ; erreur d'import visible ; double clic ignoré ; groupes étiquetés. Vérifié par l'orchestrateur : `tsc` et build OK ; base intègre (`integrity_check` ok, 15 conversations, 3 livrables, mode démo, aucune connexion) ; en démo, panneau Livrables sans groupe Drive et éditeur d'un livrable local inchangé (révision globale présente, ni "Diapositive" ni "Réimporter").
