---
title: 'Story 5.5 — Enregistrement dans Drive'
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

**Problem:** Changes accepted on an imported presentation stay in the app: the team's Google Slides file is never updated, so the consultant has to copy them by hand.

**Approach:** Add `writePresentationText` to the drive port (Slides `batchUpdate` with `writeControl.requiredRevisionId`) and `revisionId` to `readPresentation`; an "Enregistrer dans Drive" action in the editor header re-reads the deck, refuses on any conflict, rewrites only the text of modified zones, then marks them saved (`driveText := text`).

## Boundaries & Constraints

**Always:**
- A block is modified when `text ≠ driveText` (Story 5.3's pure `domain/` function) — the only source of the button state, the reimport warning and what gets written.
- Save cycle: read the presentation (fresh `revisionId`); for every modified block, if the remote text of its zone differs from its `driveText`, or the zone no longer exists → conflict, nothing is written. Otherwise one `batchUpdate` with `requiredRevisionId` = the revision just read, per modified zone `deleteText` (whole text) then `insertText` (new text, skipped when empty). Then, in one transaction, `driveText := ` the text that was written, for those blocks only.
- A revision refusal between read and write (`revision_conflict`) restarts the whole read → compare → write cycle once; a second refusal is a conflict. Any other Google error: "L'enregistrement dans Drive a échoué. Réessayez." (raw detail logged). `token_revoked` handled by the existing provider wrapper.
- Never writes anything but the text of modified zones: no other zone, no formatting request, no slide change. Non-text changes made in Slides never block the save.
- UI (EXPERIENCE.md): "Enregistrer dans Drive" is the neutral primary button of the Drive livrable's editor header (never purple), next to "Réimporter"; disabled when nothing is modified. Before writing, an inline reminder: "Seul le texte des zones modifiées est réécrit ; leur mise en forme peut être simplifiée." with Enregistrer / Annuler. States announced in text: "Enregistrement…", then "Enregistré dans Drive." (button disabled again), or conflict: "Ce fichier a été modifié dans Google Slides depuis l'import. Réimportez-le pour repartir de la dernière version." with a "Réimporter" action, or the error message.
- Outside `connected`: "Enregistrer dans Drive" and "Réimporter" disabled with "Connectez Google Drive pour enregistrer." (only when disconnected); nothing rendered in demo mode.

**Never:**
- No automatic save, no partial write on conflict, no write in demo mode, no Drive formatting/structure change, no presentation creation (Story 5.6).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nothing modified | all `text = driveText` | button disabled | N/A |
| Save, no conflict | 2 zones modified, unchanged in Slides | 1 batchUpdate (2× delete+insert, `requiredRevisionId`), then `driveText := text`; button disabled; "Enregistré dans Drive." | N/A |
| Remote text changed | a modified zone edited in Slides since import | nothing written; conflict message + Réimporter | N/A |
| Zone deleted in Slides | modified zone's objectId gone | conflict, nothing written | N/A |
| Unmodified zone changed in Slides | only non-modified zones differ | save proceeds, those zones untouched | N/A |
| Revision race | `batchUpdate` refused for revision once | cycle restarted once; succeeds if no conflict | second refusal → conflict |
| Google error | quota / network / unknown | "L'enregistrement dans Drive a échoué. Réessayez."; nothing marked saved | logged |
| Disconnected | not connected | both actions disabled + "Connectez Google Drive pour enregistrer." | N/A |
| Text changed during save | suggestion accepted while the save runs | `driveText` set to the text actually written; the newer change stays modified | N/A |

</frozen-after-approval>

## Code Map

- `integrations/ports/drive-provider.ts` -- `DrivePresentation.revisionId: string`; `writePresentationText(fileId, edits: { objectId, text }[], requiredRevisionId)` → `DriveResult<void>`.
- `integrations/google/drive-provider.ts` -- add `revisionId` to the `presentations.get` field mask and `toDrivePresentation`; `writePresentationText` = `presentations.batchUpdate({ presentationId, requestBody: { requests, writeControl: { requiredRevisionId } } })`, `deleteText { objectId, textRange: { type: 'ALL' } }` + `insertText { objectId, insertionIndex: 0, text }`; map a 400 whose message mentions the revision to `revision_conflict`; timeout.
- `integrations/mock/drive-provider.ts` -- `writePresentationText` → `unknown` (never reached).
- `actions/google-connection.ts` -- wrapper covers the new method.
- `domain/livrable.ts` -- reuse `isBlockModified` / `hasUnsavedDriveChanges`; add pure `findSaveConflicts(modifiedBlocks, remoteTexts: Map<objectId, text>)` → conflicting ids.
- `actions/livrable.ts` -- `saveLivrableToDrive(livrableId)` → `{ status: 'saved' | 'conflict' | 'nothing' }` or the error; uses `parseLivrableBlocks`.
- `components/ReimportButton.tsx` → replaced by `components/DriveLivrableActions.tsx` (Save + Réimporter + reminder/confirmation + state messages); `app/livrables/[id]/page.tsx` renders it.
- `app/globals.css` -- reuse `.reimport*` styles, rename if needed.

## Tasks & Acceptance

**Execution:**
- [ ] port, Google adapter, mock, wrapper -- `revisionId`, `writePresentationText`.
- [ ] `domain/livrable.ts` -- `findSaveConflicts`.
- [ ] `actions/livrable.ts` -- `saveLivrableToDrive`.
- [ ] `components/DriveLivrableActions.tsx`, `app/livrables/[id]/page.tsx`, `app/globals.css` -- UI.

**Acceptance Criteria:**
- Given a successful save, when the presentation is reimported, then no block is reported modified and kept suggestions follow Story 5.3's rule.
- Given a conflict, then the Slides file receives no `batchUpdate` call.
- Given `rm -f db/local.db* && npm run build`, then it succeeds.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Adapter against a stubbed Slides API: request body (requests order, `requiredRevisionId`, empty-text case), revision-error mapping.
- `saveLivrableToDrive` on a real SQLite DB with a stubbed provider: every matrix row (including the retry and the text-changed-during-save case).
- Browser: button disabled/enabled, reminder, conflict/error messages with fake credentials, disconnected and demo states.
- Real write needs real Google Cloud credentials (owner prerequisite).
