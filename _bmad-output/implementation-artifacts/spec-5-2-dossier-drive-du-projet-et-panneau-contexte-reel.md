---
title: "Story 5.2 : Dossier Drive du projet et panneau Contexte réel"
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f6282960137b932053a069c16cb88407f1412728'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-connexion-du-compte-google.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** depuis la 5.1, l'app sait se connecter à Google, mais le panneau Contexte montre toujours le drive simulé, quel que soit le mode. FR-26/FR-27 demandent les vrais fichiers du dossier Drive du projet, et aucune donnée simulée hors mode démo.

**Approche :** adaptateur `integrations/google/drive.ts` (`@googleapis/drive` 26.x) derrière un port `DriveProvider` qui passe de `listDocuments(projectId)` à `listFiles(projectName)` à résultat typé (`{ ok: true, data } | { ok: false, error: DriveError }`, AD-1) ; la fabrique choisit `google` en mode `connected`, le mock en `demo` ; une resynchronisation unique remplace celle de `listDocuments` ; le panneau Contexte affiche les états d'`EXPERIENCE.md`. Découpée le 2026-10-02 : sélection comme contexte, export texte et envoi à l'agent = Story 5.7.

## Boundaries & Constraints

**Always :** dossier projet = enfant direct de `GOOGLE_DRIVE_ROOT_FOLDER_ID`, type dossier, non supprimé, nom identique (casse et accents compris, guillemets/antislash échappés dans la requête Drive) ; 0 → `folder_missing`, ≥ 2 → `folder_duplicate`, jamais de création. Fichiers = enfants directs non-dossiers non supprimés, toutes les pages (`id`, `name`, `mimeType`, `modifiedTime`) ; `supportsAllDrives`/`includeItemsFromAllDrives` pour un dossier racine en Drive partagé. Le refresh token ne sort de la base que vers la fabrique, jamais par une fonction exportée d'un module `'use server'`. `token_revoked` (`invalid_grant`) → suppression de `GOOGLE_CONNECTION` → mode `disconnected`. Erreurs Google converties en `DriveError` puis message français ; détail brut loggé seulement (même discipline que `integrations/google/oauth.ts`). Migration `DOCUMENT` : `drive_file_id` (nullable), `mime_type` (nullable), `origin` (`mock | google`, nullable), `used_as_context` (NOT NULL DEFAULT 0) ; `UPDATE` des lignes `manual` existantes à 1 ; index unique `(project_id, drive_file_id)` quand non nul ; `addManualDocument` écrit `used_as_context = 1`. Les nouvelles lignes drive ont un `id` UUID et `content = ''`.

**Never :** pas de case "Utiliser comme contexte", pas d'`exportText`, pas de changement de `skills/buildRequest.ts` (Story 5.7). Pas de sous-dossiers parcourus. Mode démo visuellement inchangé (mêmes documents simulés et dossiers). Panneau Livrables non touché (Story 5.3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connecté | dossier unique au nom du projet | fichiers Drive du dossier, puis documents hors-drive | N/A |
| Démo | mode démo | documents simulés comme aujourd'hui + hors-drive | N/A |
| Non connecté | hors démo, pas de compte | aucun fichier drive ; invite "Connectez Google Drive pour afficher les fichiers du projet." + lien "Connecter Google Drive" ; hors-drive affichés | N/A |
| Non configuré | variable Google absente | "Google Drive n'est pas configuré pour cette installation." ; hors-drive affichés | N/A |
| Dossier absent / double | 0 ou ≥ 2 dossiers | "Aucun dossier « {nom} » dans le Drive racine." / "Plusieurs dossiers portent le nom « {nom} »." | N/A |
| Jeton révoqué | Google répond `invalid_grant` | connexion supprimée ; état "non connecté" au prochain rendu | loggé |
| Erreur Google | quota, réseau, autre | "Impossible de récupérer les fichiers du Drive du projet." ; hors-drive affichés | loggé |
| Changement de mode | démo ↔ connecté, déconnexion | lignes drive de l'autre origine purgées à la resynchro ; hors-drive intacts | N/A |
| Fichier disparu | supprimé dans Drive | ligne supprimée à la resynchro | N/A |

</frozen-after-approval>

## Code Map

- `integrations/ports/drive-provider.ts` -- `DriveProvider`, `OctopodDocument`, `DriveMode` (5.1) ; remplacer `listDocuments` par `listFiles` + types `DriveFile`, `DriveError`, `DriveResult<T>`.
- `integrations/mock/drive-provider.ts` -- seed indexé par id de projet ; réindexer par nom de projet ("Réponse RFP — Acme Corp", "Audit interne — Mission Client", voir `integrations/mock/project-provider.ts`), garder `folderPath` simulé.
- `integrations/index.ts` -- `createDriveProvider(mode)` (5.1) : `connected` → adaptateur Google avec identifiants ; `disconnected`/`unconfigured` → provider qui renvoie l'erreur correspondante.
- `integrations/google/oauth.ts` -- configuration et discipline de logs à réutiliser pour un `OAuth2Client` muni du refresh token.
- `actions/drive-mode.ts`, `actions/google-connection.ts` (5.1) -- mode et ligne de connexion.
- `actions/document.ts:57-110` -- `listDocuments` : resynchro actuelle (écrase `content`, id du provider comme clé, ne purge pas) à remplacer ; `DocumentSummary` ; `addManualDocument`.
- `actions/demo.ts` -- `resetAvantVenteWorkflow` supprime le document de référence démo (`source: 'manual'`) : ne pas casser.
- `components/ContextPanel.tsx` -- rendu actuel (groupement par `folderPath`, `documents === null`) ; ajouter l'état drive.
- `app/page.tsx` -- passe `documents` au panneau.
- `db/schema.ts:72` -- table `document` ; migration via `npm run db:generate` + `UPDATE` ajouté au SQL généré.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- `@googleapis/drive` 26.0.1 (exact).
- [x] `db/schema.ts` + migration -- colonnes et index de `document`, `UPDATE` des lignes manuelles.
- [x] `integrations/ports/drive-provider.ts`, `integrations/mock/drive-provider.ts`, `integrations/google/drive.ts`, `integrations/index.ts` -- port `listFiles`, mock par nom, adaptateur Google, fabrique.
- [x] `actions/` -- accès serveur au refresh token pour la fabrique (module non `'use server'`) ; `listDocuments` renvoie `{ documents, driveStatus }` avec la resynchro AD-1 ; gestion de `token_revoked` ; `addManualDocument` avec `used_as_context = 1`.
- [x] `components/ContextPanel.tsx`, `app/page.tsx`, `app/globals.css` -- états du panneau.

**Acceptance Criteria:**
- Given un rendu en mode `connected`, then aucune réponse HTTP ni prop client ne contient le refresh token.
- Given une resynchro, then `content` et `used_as_context` d'une ligne existante ne sont jamais modifiés.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npx next build --turbopack` -- expected: build OK

**Manual checks (if no CLI):**
- Sur une copie sauvegardée de la base : démo → panneau inchangé ; hors démo sans compte → invite ; variables absentes → message non configuré ; démo → hors démo → les lignes mock sont purgées, les hors-drive restent. Le mode connecté réel attend les identifiants Google (adaptateur relu contre la doc Drive v3 `files.list`).

## Implementation Notes

Implémenté par sous-agent. `@googleapis/drive` 26.0.1 (réutilise l'unique `google-auth-library` 11.1.0) ; migration `20261002133648_loose_anita_blake` (4 colonnes, index unique partiel, `UPDATE` des lignes `manual` ajouté à la main). Port `listFiles(projectName)` → `DriveResult<DriveFile[]>` (`DriveFile` = `id`, `name`, `mimeType`, `modifiedTime`, `folderPath` — ce dernier toujours `null` côté Google, conservé pour le mock). `integrations/google/drive.ts` : dossier projet = `files.list` sur `'{root}' in parents and name = … and mimeType = folder and trashed = false` puis comparaison stricte (NFC) en JS ; enfants non-dossiers non supprimés, toutes les pages, `supportsAllDrives` + `includeItemsFromAllDrives`, délai 15 s ; erreurs → `invalid_grant` = `token_revoked`, 429/raisons de quota = `quota`, 404 = `not_found`, sinon `unknown`, log limité au statut/code/raison. Fabrique : `demo` → mock, `connected` → Google (config + jeton, sinon erreur correspondante), `disconnected`/`unconfigured` → provider qui renvoie cette erreur. `actions/google-credentials.ts` (sans `'use server'`) lit le jeton et supprime la connexion révoquée (seulement si la ligne porte encore ce jeton). `listDocuments` lit le nom du projet en base et renvoie `{ documents, driveStatus }` ; resynchro unique `syncDriveRows` (clé `driveFileId`, UUID + `content = ''` à l'insertion, ne touche jamais `content`/`usedAsContext`, purge l'autre origine, supprime les disparus) ; `disconnected`/`unconfigured` purgent toutes les lignes drive ; les autres erreurs ne purgent que l'autre origine et masquent les lignes drive. `seedDemoReferenceDocument` écrit aussi `used_as_context = 1`. Panneau : message d'état (copies d'`EXPERIENCE.md`, `role="status"`, lien "Connecter Google Drive" quand non connecté), fichiers drive (triés par nom, groupés par dossier simulé) puis hors-drive. Choix non dicté par la spec : `modifiedTime` est dans le port mais pas persisté (aucune colonne prévue par la migration).

Vérifié (sous-agent, `next start -p 3100` sur la base locale, sauvegarde préalable dans le scratchpad) : tsc et build OK ; démo → panneau identique, anciennes lignes (ids `doc-*`, `origin` NULL) purgées et recréées en UUID/`mock`/`content = ''` ; nom modifié rétabli à la resynchro sans toucher `content`/`used_as_context` ; document hors-drive affiché après les fichiers drive ; démo off sans variables → message non configuré, lignes mock purgées, hors-drive conservé ; fausses variables sans compte → invite + lien ; fausse ligne de connexion → Google répond `invalid_client` → message d'erreur générique, log sans jeton, jeton absent du HTML/RSC, ligne `google` conservée et ligne `mock` purgée ; suppression de la connexion → lignes `google` purgées. Non vérifié : vrai dossier Drive (pas d'identifiants), chemin `invalid_grant` réel, Drive partagé. Base locale remise en démo, sans connexion ni ligne de test (migration appliquée).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence / resolution |
|---|---|---|---|---|---|
| 1 | blind-hunter, edge-case, verification-gap | Une erreur transitoire de lecture (jeton ou mode) est prise pour "aucun compte" et purge toutes les lignes drive du projet. | medium | patch | Vérifié (`readGoogleRefreshToken` → `null` sur erreur ; `resolveDriveMode` → `disconnected`). Purge complète seulement si l'absence de connexion est confirmée ; sinon `driveStatus = 'error'`, lignes conservées. |
| 2 | blind-hunter, edge-case | `incompleteSearch: true` traité comme une liste complète → la resynchro supprime des fichiers. | medium | patch | Vérifié (`listAll` ne fait que logger) ; renvoie maintenant une erreur. |
| 3 | blind-hunter, edge-case | 401 / 403 `insufficientPermissions` (scope retiré) → erreur générique, connexion morte jamais nettoyée. | low | patch | Mapping direct vers `token_revoked`. |
| 4 | blind-hunter, edge-case | La requête envoie le nom brut alors que la comparaison est en NFC ; le commentaire prétend qu'un accent décomposé est retrouvé. | low | patch | Vérifié (le `name =` de Drive est exact) ; requête en NFC, commentaire corrigé. |
| 5 | verification-gap | Le `UPDATE` ajouté à la main dans la migration disparaîtrait à une régénération. | low | patch | Commentaire SQL ajouté au-dessus. |
| 6 | edge-case | Basculer en mode démo puis revenir purge les lignes `google` (origine différente), donc les futures sélections de la 5.7. | medium | defer | Conséquence directe de la règle AD-1 "purger l'autre origine" ; à reconsidérer dans la Story 5.7 (masquer plutôt que supprimer). Noté dans `deferred-work.md`. |
| 7 | verification-gap (x5), blind-hunter | Aucun test automatisé (resynchro, fabrique, mapping d'erreurs, adaptateur, migration). | medium | defer | Pas de lanceur de tests (décision existante) ; vérifications manuelles à rejouer avec de vrais identifiants. |
| 8 | blind-hunter | Pas de garde `import 'server-only'` sur `actions/google-credentials.ts`. | low | reject | Le paquet `server-only` n'est pas installé ; l'ajouter est une dépendance pour un risque non observé (aucun import client). |
| 9 | blind-hunter | Barre du haut et panneau en désaccord dans le rendu où un jeton révoqué est supprimé. | low | reject | Se résout au rendu suivant. |
| 10 | blind-hunter | Erreurs `not_found`/`quota` affichées avec le message générique. | low | reject | Copie non spécifiée par `EXPERIENCE.md` ; cas d'administration. |
| 11 | blind-hunter, edge-case | Appels Google bloquants à chaque rendu, sans cache ni délai global ni limite de pages. | low | reject | Aucune cible de performance (NFR3), dossiers de projet de petite taille. |
| 12 | blind-hunter | Première resynchro après migration : anciennes lignes drive recréées avec de nouveaux UUID. | low | reject | Rien ne référence `document.id` ; comportement voulu (purge des lignes sans origine). |
| 13 | blind-hunter | Mock indexé par nom de projet, sans contrôle de concordance avec `project-provider.ts`. | low | reject | Deux projets de démo figés. |
| 14 | blind-hunter | Dossier Drive vide + documents hors-drive : rien n'indique que le dossier est vide. | low | reject | État non spécifié par `EXPERIENCE.md`. |
| 15 | blind-hunter | Jeton révoqué affiché comme "jamais connecté". | — | false | Voulu : `EXPERIENCE.md` demande un retour à "non connecté" sans message technique. |
| 16 | blind-hunter, verification-gap | `modifiedTime` lu mais pas stocké. | low | reject | Pas de colonne dans la spec ; la Story 5.7 l'ajoutera si besoin. |

Après correctifs de revue (remplace la description des erreurs plus haut) : `readGoogleRefreshToken` distingue "pas de compte" et "lecture en échec" ; la purge complète n'a lieu que si l'absence de connexion est confirmée (flag démo lisible et inactif, ligne lue et absente) ou après suppression d'un jeton révoqué — toute lecture en échec donne `driveStatus = 'error'` sans écrire de ligne drive ; `incompleteSearch` → erreur ; 401 et 403 `insufficientPermissions`/`ACCESS_TOKEN_SCOPE_INSUFFICIENT` → `token_revoked` (effet de bord : un client OAuth invalide supprime aussi la connexion) ; requête du dossier en NFC ; commentaire de conservation au-dessus du `UPDATE` de la migration. Vérifié par l'orchestrateur : `tsc` et build OK ; en démo, panneau Contexte identique (3 documents simulés de RFP Acme avec leurs dossiers) ; base en démo, aucune connexion.
