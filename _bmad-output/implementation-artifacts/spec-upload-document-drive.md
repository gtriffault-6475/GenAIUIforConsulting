---
title: 'Ajouter un document — upload to the project Drive folder, used as context'
type: 'feature'
created: '2026-10-06'
status: 'draft'
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
- [ ] port, mock, Google adapter, wrapper, conversion helper.
- [ ] `uploadDocumentToDrive` action.
- [ ] form switch and file form; body size limit.
- [ ] README.

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Adapter against a stubbed Drive: create request (parents, Google mime type, media), folder errors.
- Action on SQLite with a stubbed provider: row ticked with exported text; unsupported / too big refused; export failure leaves it unticked.
- Browser (fake credentials): file form when connected, text form when disconnected and in demo.
- Real Google: owner uploads a .docx and a PDF.
