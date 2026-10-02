---
title: "Story 5.2 : Dossier Drive du projet et panneau Contexte réel"
type: 'feature'
created: '2026-10-02'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `package.json` -- `@googleapis/drive` 26.0.1 (exact).
- [ ] `db/schema.ts` + migration -- colonnes et index de `document`, `UPDATE` des lignes manuelles.
- [ ] `integrations/ports/drive-provider.ts`, `integrations/mock/drive-provider.ts`, `integrations/google/drive.ts`, `integrations/index.ts` -- port `listFiles`, mock par nom, adaptateur Google, fabrique.
- [ ] `actions/` -- accès serveur au refresh token pour la fabrique (module non `'use server'`) ; `listDocuments` renvoie `{ documents, driveStatus }` avec la resynchro AD-1 ; gestion de `token_revoked` ; `addManualDocument` avec `used_as_context = 1`.
- [ ] `components/ContextPanel.tsx`, `app/page.tsx`, `app/globals.css` -- états du panneau.

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

## Spec Change Log

## Review Triage Log
