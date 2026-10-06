---
title: 'Ajouter un document — upload to the project Drive folder, used as context'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '9b7c7aa83b0e01c32a7dbd71aa2299ae813f8d15'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** With Google Drive connected, "Ajouter un document" in the Contexte panel only lets the consultant paste text into a local document; it cannot add a real file to the project, and nothing ends up in the project's Drive folder.

**Approach:** Owner request (2026-10-06): when Drive is `connected`, the button lets the consultant pick a file, uploads it into the project's Drive folder, and the new file is immediately selected as context ("Utiliser comme contexte" ticked, text exported). Owner decisions: (1) files are converted to Google format on upload so the agent can read them; (2) outside `connected` (demo, disconnected, unconfigured) the current text form stays as it is.

## Boundaries & Constraints

**Always:**
- Conversion on upload: Word (.doc/.docx), OpenDocument text, .txt, .md, .rtf, .html, PDF → Google Docs; Excel (.xls/.xlsx), .ods, .csv → Google Sheets; PowerPoint (.ppt/.pptx), .odp → Google Slides. Any other type is refused before upload with "Ce format n'est pas pris en charge." The Drive file keeps the original name without its extension.
- Project folder resolved exactly like Story 5.2 (never created); folder missing/duplicate → the same messages as the panel.
- After upload: the file appears in the Contexte panel's Drive list, ticked, with its exported text stored, exactly as if the consultant had ticked it (Story 5.2 rules, 30 000 / 60 000 caps unchanged).
- Size limit 10 MB, checked in the browser and on the server ("Le fichier dépasse 10 Mo."); Next Server Actions body limit raised accordingly.
- Failures: "L'envoi du fichier dans Drive a échoué. Réessayez." (Google detail only logged); a file uploaded but whose export fails stays in Drive and in the list, unticked, with the export error message of Story 5.2.
- Upload goes through the drive port (`uploadFile`), the token-revocation wrapper, and a Server Action in `actions/document.ts`.

**Never:** No change to the text form outside `connected`; no upload in demo mode; no overwrite of an existing Drive file (a same-name file is a new file, as Drive allows); no folder creation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload Word | connected, `CR.docx` 200 KB | Google Doc "CR" in the project folder, listed and ticked, agent receives its text | N/A |
| Upload PDF | connected, scanned or text PDF | Google Doc with Google's extracted text, ticked | empty text → ticked with empty content, agent gets nothing from it |
| Unsupported | `.zip` / image | refused before upload | "Ce format n'est pas pris en charge." |
| Too big | 15 MB file | refused before upload | "Le fichier dépasse 10 Mo." |
| Not connected | disconnected / demo | current text form, unchanged | N/A |
| Drive error | quota / folder missing | nothing ticked | message as above |

</frozen-after-approval>

## Code Map

- `integrations/ports/drive-provider.ts` -- `uploadFile(projectName, { name, mimeType, data })` → `DriveResult<DriveFile>`.
- `integrations/google/drive-provider.ts` -- reuse `resolveProjectFolder`; `api.files.create({ requestBody: { name, parents, mimeType: <Google type> }, media: { mimeType, body: Readable }, fields: 'id,name,mimeType,modifiedTime', supportsAllDrives })`; 30 s timeout; conversion table as a pure helper (`domain/document.ts`).
- `integrations/mock/drive-provider.ts` -- `uploadFile` → `unknown` (never reached).
- `actions/google-drive.ts` -- wrapper covers `uploadFile`.
- `actions/document.ts` -- new Server Action `uploadDocumentToDrive(projectId, formData)`: checks mode `connected`, size, type; uploads; inserts the DOCUMENT row (origin `google`, ticked) and exports its text with the existing Story 5.2 export path (`setDocumentUsedAsContext` logic).
- `components/AddDocumentForm.tsx` / `components/ContextPanel.tsx` -- connected: file input form; otherwise the current text form. `ContextPanel` already knows the drive state.
- `next.config.ts` -- `experimental.serverActions.bodySizeLimit: '11mb'` (Next docs `01-next-config-js/serverActions.md`).
- `README.md` -- one line on uploads.

## Tasks & Acceptance

**Execution:**
- [x] port, mock, Google adapter, wrapper, conversion helper.
- [x] `uploadDocumentToDrive` action.
- [x] form switch and file form; body size limit.
- [x] README.

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.

## Implementation Notes

- `domain/document.ts`: `uploadTargetMimeType` (extension → Google type), `uploadSourceMimeType` (browser type, else from the extension), `uploadedFileName`, `UPLOAD_ACCEPT`, `MAX_UPLOAD_BYTES` / `MAX_UPLOAD_LABEL`.
- Port `uploadFile`; Google adapter `files.create` with `requestBody.mimeType` = Google type (Drive converts), media from the uploaded bytes, 120 s timeout; mock `unknown`; revoked-token wrapper covers it.
- `actions/document.ts` `uploadDocumentToDrive(projectId, formData)`: validation, upload, DOCUMENT row (origin from the mode), then the Story 5.2 tick (`setDocumentUsedAsContext`) — tick failure returned as `contextError`. Once the file is in Drive, a later failure says so instead of "Réessayez". `getContextPanel` returns `uploadToDrive` (mode `connected`).
- `components/UploadDocumentForm.tsx` (file form) chosen by `ContextPanel` when `uploadToDrive`; text form unchanged otherwise.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit: '11mb'` (a first edit had emptied the file by mistake; restored from git before the build that counts).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | blind, edge | Source MIME type empty/generic for .md/.csv/.odt may break conversion | medium | patch — source type from the extension when the browser gives none |
| 2 | blind, edge | Failure after a successful upload says "Réessayez" → duplicate in Drive | medium | patch — dedicated message naming the file, "rechargez" |
| 3 | blind | Notice state leaves the file selected → second click re-uploads | low | patch — input cleared |
| 4 | blind, edge | Empty file told "Choisissez un fichier." | low | patch — "Le fichier est vide." (client and server) |
| 5 | blind, edge | 30 s timeout short for 10 MB + conversion | medium | patch — 120 s for uploads |
| 6 | blind, edge | `token_revoked` / `quota` shown as "Réessayez" | low | patch — specific messages |
| 7 | blind | Origin hard-coded | low | patch — `originFor(mode)` |
| 8 | blind | Format list in label/README incomplete; "10 Mo" repeated | low | patch — label/README completed, messages from `MAX_UPLOAD_LABEL`, config comment |
| 9 | blind, edge | Buffer copied; `modifiedTime` '' fallback | low | patch |
| 10 | edge, gap | A resync whose listing misses the new file deletes the ticked row | maybe-false (medium) | defer — needs a real Drive check of listing consistency right after `files.create` |
| 11 | blind, edge | Upload form offered when the folder is missing / panel data null | low | rejected — the server answers with the folder message; data-null case is a load failure |
| 12 | gap | No automated tests | — | defer — project decision; scratch checks below |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Results (2026-10-06):** tsc clean; fresh-db build OK. Scratch: extension tables; adapter `files.create` request (parent folder, Google target type, source type, body) and folder errors; action on SQLite with a stubbed provider — upload ticks the row with its exported text, export failure → `contextError` and unticked, unsupported / empty / too big refused before upload, not connected refused, token-revoked and folder messages. Browser (production build, fake credentials): text form when disconnected and in demo, file form when connected, `.zip` refused, a 2 MB `.docx` reaches Drive (fails on the fake credentials, no body-size error). Real Google upload not yet tested.

**Manual checks (if no CLI):**
- Adapter against a stubbed Drive: create request (parents, Google mime type, media), folder errors.
- Action on SQLite with a stubbed provider: row ticked with exported text; unsupported / too big refused; export failure leaves it unticked.
- Browser (fake credentials): file form when connected, text form when disconnected and in demo.
- Real Google: owner uploads a .docx and a PDF.
