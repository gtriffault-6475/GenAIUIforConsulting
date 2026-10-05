---
title: 'Story 5.2 — Dossier Drive du projet et panneau Contexte réel'
type: 'feature'
created: '2026-10-05'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Outside demo mode the Contexte panel shows no drive files (Story 5.1), and no document — drive or manual — has ever been sent to the agent (FR-4 never implemented). Consultants need the real files of the project's Drive folder and control over which ones the agent reads.

**Approach:** Add a Google `DriveProvider` adapter (`listFiles`, `exportText`) and migrate the mock to the same port; one resync function in `actions/document.ts` mirrors the project folder into `DOCUMENT` (keyed by `driveFileId`, tagged with `origin`); the Contexte panel lists drive files with a "Utiliser comme contexte" checkbox for Docs/Slides/Sheets, then manual documents, and shows the EXPERIENCE.md messages for each non-connected state; the calling actions pass the selected drive documents and all manual documents to `sendToAgent`, which adds them to the system prompt under a per-document cap.

## Boundaries & Constraints

**Always:**
- Project folder = the single folder directly under `GOOGLE_DRIVE_ROOT_FOLDER_ID` whose name equals the project name exactly, not trashed; resolved in the Google adapter. Only files directly in it (no sub-folders, folders themselves not listed). Never create a folder.
- Readable = Google Docs, Slides, Sheets mime types, decided by one pure `domain/` function. Export: Docs/Slides → `text/plain`, Sheets → `text/csv` (first sheet only).
- Resync (one function, called on every Contexte read): mode `demo` → mock, `connected` → Google, otherwise no provider and no drive rows shown. With a provider: update name/type/modified date, insert new files (`usedAsContext = false`, `content = ''`), delete rows of this origin gone from the folder, delete drive rows of the other origin, re-export the text of selected files whose Drive modified date changed. Never changes `usedAsContext`.
- Checking a file exports its text first; if the export fails the box stays unchecked with a short French error. Unchecking clears `usedAsContext` and `content`.
- Agent context on every real agent call (conversation message, starting suggestion, suggestion rework): all manual documents + selected drive documents whose `origin` matches the current mode, each truncated to 30 000 characters with a visible truncation note, after the skills' instructions.
- `token_revoked` deletes the Google connection (back to `disconnected`, reconnect offered). Google errors become `DriveError`, raw detail only logged.
- Demo mode never calls Google; Octopod/Mattermost untouched.
- **Decision (owner, 2026-10-05):** the simulated drive is aligned on the real Drive — flat list, no sub-folders; per seed project some files become Google Docs / Google Sheets (no file extension, readable, with checkbox) and the PDFs stay "non lisible par l'agent".

**Never:**
- No Livrables panel change, no Slides import (Story 5.3+), no `readPresentation`/`writePresentationText`/`createPresentation` yet.
- No document content in any client payload (only id, name, type, flags).
- No change to the scripted demo replies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connected, folder found | 1 folder named like the project | drive files listed first (checkbox or "non lisible par l'agent"), then manual docs | N/A |
| Not connected | demo off, no connection | "Connectez Google Drive pour afficher les fichiers du projet." + connect button; manual docs listed | N/A |
| Unconfigured | env var missing, demo off | "Google Drive n'est pas configuré pour cette installation."; manual docs listed | N/A |
| Folder missing / duplicate | 0 or ≥2 matching folders | "Aucun dossier « {nom} » dans le Drive racine." / "Plusieurs dossiers portent le nom « {nom} »." | no folder created |
| Token revoked | Google `invalid_grant` | connection deleted, "not connected" state | no technical message |
| Other Google error | quota / network / unknown | "Impossible de lire le Drive du projet. Réessayez plus tard."; manual docs listed | logged |
| Check a Docs file | readable, unchecked | text exported, box checked, sent with next messages | export fails → unchecked + "Impossible de lire ce fichier." |
| File removed in Drive | selected file gone | row deleted at next resync, no longer sent | N/A |
| Demo toggled | drive rows of origin mock vs google | only rows of the current mode's origin shown/sent; other origin purged at next resync with a provider | N/A |
| Large document | text > 30 000 chars | truncated + note in the prompt | N/A |

</frozen-after-approval>

## Code Map

- `integrations/ports/drive-provider.ts` -- replace `listDocuments(projectId)`/`OctopodDocument` by `listFiles(projectName)` → `DriveResult<DriveFile[]>` and `exportText(fileId, mimeType)` → `DriveResult<string>`; `DriveFile {fileId, name, mimeType, modifiedTime}`; `DriveError` union per AD-1; keep `DriveMode`.
- `integrations/mock/drive-provider.ts` -- flat seed (owner decision above), keyed by project name (`integrations/mock/project-provider.ts`: "Réponse RFP — Acme Corp", "Audit interne — Mission Client"); `exportText` returns the seed content; `withLatency`.
- `integrations/google/drive-provider.ts` (new) -- `createGoogleDriveProvider({clientId, clientSecret, refreshToken, rootFolderId})`; `@googleapis/drive` v3 `files.list` (escape `'` and `\` in names, `trashed=false`, paginate, `supportsAllDrives`/`includeItemsFromAllDrives`), `files.export`; map `invalid_grant` → `token_revoked`, 403 rate/quota → `quota`, 404 → `not_found`.
- `integrations/google/oauth.ts` -- reuse `OAuth2Client` creation pattern.
- `integrations/index.ts` -- `getDriveProvider(mode, googleCredentials?)` returns Google adapter for `connected`.
- `actions/google-connection.ts` -- `resolveDriveMode`, `readGoogleConfig`, `readConnectionRow` (private), `disconnectGoogle`; add one exported server-side helper returning the connected provider credentials-free (e.g. `getActiveDriveProvider()` → `{mode, provider}`), so credentials never leave this file.
- `db/schema.ts` + migration -- `document`: add `driveFileId`, `mimeType`, `origin` (`mock|google`), `modifiedTime`, `usedAsContext` (boolean, not null, default false); partial unique `(projectId, driveFileId)` where not null. Migration deletes existing `source='drive'` rows (mock data, re-synced) and sets `usedAsContext = 1` on manual rows.
- `actions/document.ts` -- `addManualDocument` sets `usedAsContext: true`; replace `listDocuments` by `getContextPanel(projectId)` → `{drive: {state, files}, manual}`; add `setDocumentUsedAsContext(documentId, used)` and `listAgentContextDocuments(projectId)` (server-only use by actions). Keep `seedDemoReferenceDocument` / `resolveDemoReferenceDocumentId` (manual source) unchanged.
- `actions/demo.ts:145` -- deletes the demo reference document by id; unaffected.
- `domain/document.ts` (new) -- `isAgentReadable(mimeType)`, `truncateForContext(text, cap)`.
- `skills/buildRequest.ts` -- `sendToAgent` gains `contextDocuments?: {name, content}[]`, appended to the system prompt after skills (real path only; demo path ignores it).
- `actions/message.ts:320`, `actions/conversation.ts:498` (`getStartingSuggestion` → `skills/propose_starting_point.ts`), `actions/suggestion.ts:440` (→ `skills/rework_suggestion.ts`) -- pass `listAgentContextDocuments(projectId)`.
- `components/ContextPanel.tsx` + `app/page.tsx` + `app/globals.css` -- new data shape, state messages, checkbox (real labelled `<input type="checkbox">`), "non lisible par l'agent" caption, connect link reusing `/api/google/oauth/start`; manual docs keep folder grouping.

## Tasks & Acceptance

**Execution:**
- [ ] `integrations/ports/drive-provider.ts`, `integrations/mock/drive-provider.ts`, `integrations/google/drive-provider.ts`, `integrations/index.ts` -- new port, both adapters, factory.
- [ ] `db/schema.ts` + `npm run db:generate` (hand-edit the SQL for the delete/update backfill) -- DOCUMENT columns.
- [ ] `domain/document.ts` -- readability + truncation.
- [ ] `actions/google-connection.ts` -- provider accessor; revoked-token cleanup.
- [ ] `actions/document.ts` -- resync, panel read, selection, agent context list.
- [ ] `skills/buildRequest.ts`, `skills/propose_starting_point.ts`, `skills/rework_suggestion.ts`, `actions/message.ts`, `actions/conversation.ts`, `actions/suggestion.ts` -- context documents passed to every real agent call.
- [ ] `components/ContextPanel.tsx`, `app/page.tsx`, `app/globals.css` -- panel UI.

**Acceptance Criteria:**
- Given a selected drive document and a manual document, when a message is sent (real path), then the system prompt contains both texts after the skills' instructions, and an unselected drive document's text is absent.
- Given demo mode, when the Contexte panel renders, then no Google wording appears and no Google API is called.
- Given `npm run build` on a fresh `db/local.db`, then it succeeds.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Production server, demo on: mock files listed, checkbox on readable ones, checking persists, no Google request.
- Demo off, fake credentials: unconfigured / disconnected messages; with a fake connection row, Google error path shows the generic message (or `token_revoked` → back to disconnected).
- Google adapter checked against a stubbed `drive.files` (folder 0/1/2 matches, export mime types, error mapping) in a scratch script.
- Real Drive end-to-end requires real Google Cloud credentials (owner prerequisite).
