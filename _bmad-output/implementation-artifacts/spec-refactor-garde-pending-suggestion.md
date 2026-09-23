---
title: "Extraire la garde 'pending' dupliquée dans actions/suggestion.ts"
type: 'refactor'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
baseline_commit: '850504b80b6b24874a78a1303af55281f119b636'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-09-21.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** `epic-4-retro-item-22` ("étendre `epic-2-retro-item-12` au motif de garde 'pending' dupliqué dans `actions/suggestion.ts`", epic-4-retro-2026-09-21.md, Vues agrégées). `acceptSuggestion`, `rejectSuggestion` et `reworkSuggestion` répètent chacune, à l'intérieur de leur propre `db.transaction`, le même bloc : lire la ligne SUGGESTION par id, vérifier qu'elle existe, vérifier `status === 'pending'` (sinon renvoyer une erreur), avant de continuer avec la ligne lue. Une 4e duplication de ce motif serait ajoutée par toute future fonction touchant une suggestion `pending`.

**Approche :** Refactor pur, aucun changement de comportement observable. Contrairement à `seedIfEmpty` (`actions/seed-if-empty.ts`, table-agnostique par construction pour respecter AD-2 entre fichiers), cette garde est spécifique à la table SUGGESTION et reste donc une fonction privée (non exportée) à l'intérieur d'`actions/suggestion.ts` lui-même -- son unique propriétaire (AD-2) -- plutôt qu'un helper partagé cross-fichier. Elle prend le `tx` déjà ouvert (jamais son propre `db.transaction` : chaque appelante garde le sien, la garde s'exécute dedans, exactement comme aujourd'hui) et l'id de la suggestion, lit la ligne complète (`select()`, comme `acceptSuggestion`/`reworkSuggestion` le font déjà -- `rejectSuggestion` ne sélectionne aujourd'hui que 3 colonnes, mais rien n'exploite cette restriction, donc passer à la ligne complète ne change rien d'observable), et renvoie soit `{ok:true, row}` soit `{ok:false, error}`. Le message d'erreur "déjà traitée" reste paramétrable : `reworkSuggestion` utilise un texte différent ("... en cours de retravail ou a déjà été traitée.") des deux autres ("Cette suggestion a déjà été traitée.") -- ce texte doit rester inchangé par appelante, seul le squelette lecture+vérifications est mutualisé.

## Implementation Notes

Fonction privée `guardPendingSuggestion(tx, suggestionId, alreadyProcessedError?)` ajoutée dans `actions/suggestion.ts` juste après `listSuggestions`, avant `acceptSuggestion`. Type du `tx` dérivé sans import supplémentaire via `Parameters<Parameters<typeof db.transaction>[0]>[0]` (aucun type `Transaction` n'était exporté ailleurs dans ce fichier ou `db/client.ts`) -- `tsc --noEmit` confirme l'inférence correcte.

Les 3 appelantes (`acceptSuggestion`, `rejectSuggestion`, `reworkSuggestion`) délèguent désormais à cette garde plutôt que de réimplémenter select+vérifications. `rejectSuggestion` sélectionnait auparavant seulement 3 colonnes (`status`, `anchorRef`, `livrableId`) ; elle reçoit maintenant la ligne complète comme les deux autres -- aucune différence observable, les colonnes en plus ne sont simplement pas lues. `reworkSuggestion` passe son propre message "déjà traitée" (texte inchangé) en 3e argument.

`npx tsc --noEmit` et `npx next build --turbopack` propres après le refactor.

Blind-hunter (subagent, contexte libre) a trouvé 6 points sur le diff -- voir Review Triage Log. Deux patchés en Tour 1 : la fonction renommée `guardPendingSuggestion` -> `loadPendingSuggestion` (elle charge et valide, pas seulement une vérification booléenne) et son retour changé d'une union ad hoc `{ok:true,row}|{ok:false,error}` vers `ActionResult<typeof suggestion.$inferSelect>` (convention déjà utilisée par tout le reste du fichier) -- les 3 sites d'appel utilisent désormais `guard.data` au lieu de `guard.row`.

Script `tsx` jetable exécuté contre `db/local.db` réelle (sauvegarde bit-à-bit prise avant, comptage de lignes par table identique avant/après confirmé -- `project`/`livrable`/`suggestion`). 14/14 assertions passées : messages d'erreur "introuvable" et "déjà traitée" (les 2 textes distincts, `acceptSuggestion`/`rejectSuggestion` vs `reworkSuggestion`) inchangés lettre pour lettre ; `acceptSuggestion`/`rejectSuggestion` gèlent toujours `resolvedPosition` ; `reworkSuggestion` toujours capable de repasser `revising` -> `pending` proprement après l'échec attendu de l'appel agent (aucun `ANTHROPIC_API_KEY` configuré dans cet environnement, comportement préexistant documenté, non modifié par ce refactor). Toutes les lignes de test nettoyées explicitement.
</frozen-after-approval>

## Review Triage Log

| # | Finding | Verdict | Route | Résolution |
|---|---|---|---|---|
| 1 | La fonction réinvente une union ad hoc `{ok:true,row}\|{ok:false,error}` au lieu de réutiliser `ActionResult<T>` (importé et utilisé par tout le reste du fichier). | Low | Patch | Corrigé : retour `ActionResult<typeof suggestion.$inferSelect>`, champ `data` au lieu de `row` aux 3 sites d'appel. |
| 2 | Le nom `guardPendingSuggestion` évoque une simple vérification booléenne, alors que la fonction charge aussi la ligne -- `guard.row` après `guard.ok` est légèrement déroutant. | Low | Patch | Renommée `loadPendingSuggestion`, aligné avec le fait qu'elle charge+valide. |
| 3 | Le type `SuggestionTransaction` dérivé par réflexion (`Parameters<Parameters<typeof db.transaction>[0]>[0]`) est fragile en théorie si `drizzle-orm/node-sqlite` change un jour la signature surchargée de `transaction`. | Low | Reject | Fonctionne aujourd'hui (`tsc --noEmit` confirme l'inférence, y compris l'usage de `.select().from().where().all()` dans le corps de la fonction). Nécessiterait un changement majeur en amont de Drizzle pour casser silencieusement ; l'alternative proposée (importer `NodeSQLiteTransaction` directement) exige de deviner le bon paramètre générique `TRelations`, tout aussi fragile et strictement plus complexe pour un projet sans `relations` configurées. |
| 4 | `rejectSuggestion` passe d'une sélection de 3 colonnes à la ligne complète -- micro-régression de perf, aucune différence observable. | Low | Reject | Déjà explicitement anticipé et justifié dans l'Intent gelé de ce spec ("rien n'exploite cette restriction, donc passer à la ligne complète ne change rien d'observable") -- décision assumée, pas une régression non voulue. |
| 5 | Le commentaire d'en-tête AD-2 (lignes 13-31, énumère les exceptions de propriété SUGGESTION/LIVRABLE entre fichiers) n'a pas été mis à jour pour mentionner le nouvel helper privé. | Low | Reject | Le helper est privé, même fichier, ne touche à aucune frontière de propriété AD-2 entre fichiers -- rien à documenter dans cet en-tête, qui ne couvre que les exceptions inter-fichiers. Le reviewer lui-même note que ce n'est pas strictement nécessaire. |
| 6 | Le message "déjà traitée" n'est pas centralisé pour une éventuelle réutilisation future ailleurs dans le code. | Low | Reject | Spéculatif, hors périmètre de ce refactor (extraire exactement la duplication signalée par `epic-4-retro-item-22`, rien de plus) -- le reviewer lui-même le qualifie de non-bug. |
