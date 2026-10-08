---
title: 'Ouvrir dans Google Slides — open a Drive livrable in Google, detect edits made there'
type: 'feature'
created: '2026-10-08'
status: 'ready-for-dev'
baseline_commit: 'b1f156370271c6ac57d2907a43ed402594620c51'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Editing a livrable is slow. The editor is read-only (Story 4.1) and only shows text, and a Drive-backed livrable gives no way to open its Google Slides file: to fix a layout, move an image or just see the real slides, the consultant has to find the file in Drive by hand. When they come back after editing in Slides, the app knows nothing about it until "Enregistrer dans Drive" fails with a conflict.

**Approach:** Owner request (2026-10-08), option A of the livrable editing review: the app proposes, Google finishes. (1) An "Ouvrir dans Google Slides" link wherever a Drive livrable appears: editor header, Livrables panel, presentation proposal card once created. (2) Back in the editor after opening Slides, the app re-reads the deck. If its text changed since the last import, a banner offers to reimport through the existing "Réimporter" flow (Story 5.3, with its confirmation when changes are not saved yet).

**Owner decisions (2026-10-08):**
- D1 — The link is shown in every mode except `demo`, including `disconnected` and `unconfigured`: opening the file only needs the consultant's Google session in the browser, not the app's connection.
- D2 — Changes are detected on text only (the zones the app tracks). A change to images, layout or slide order alone is not reported.
- D3 — Detection runs only when the consultant comes back to the tab after clicking the link in this tab, never on every page load (one Slides API read per return, never at page open, per Story 4.1's "opening the editor triggers nothing").
- D4 — Local livrables (text documents with no Google file) get nothing in this spec. A later "Exporter vers Google Docs" is out of scope.

## Boundaries & Constraints

**Always:**
- Link target: `https://docs.google.com/presentation/d/{driveFileId}/edit`, built by one pure helper (`domain/livrable.ts`), opened in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Label "Ouvrir dans Google Slides", with an external-link icon and a screen-reader-only "(nouvel onglet)" suffix. Secondary style (`.button-later` look, as a link), never `.button-primary` nor the AI purple.
- Shown only for a livrable with `source = 'drive'` and a `driveFileId`, never in `demo` mode.
- Editor header: next to "Réimporter" / "Enregistrer dans Drive". Livrables panel: a small icon link beside each Drive livrable card, a sibling of the card link, never nested inside it (no `<a>` inside `<a>`). Proposal card: "Présentation créée — ouvrir le livrable · ouvrir dans Google Slides".
- Detection on return: when the tab becomes visible again (`visibilitychange`) after the link was clicked in this tab, and only while `connected`, the editor calls a Server Action that re-reads the deck and compares it with the blocks' `driveText`. The deck has changed when a text box was added (with non-blank text), removed, or its text differs from `driveText`. One check per return; a second return re-checks.
- Banner (inline, under the header, `role="status"`): "Cette présentation a été modifiée dans Google Slides." + button "Réimporter" (calls the same flow as the header button, so the confirmation for unsaved changes still applies) + "Ignorer" (hides the banner until the next return).
- A failed check (Drive error, token revoked, file gone) shows nothing and is only logged. The header's "Réimporter" button stays the fallback.

**Never:** No new column, no migration (the `revisionId` stays never stored, per Story 5.5). No automatic reimport. No Slides API call at page open. No iframe or thumbnail in this spec (option B). No change to the save or reimport logic itself.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open from editor | Drive livrable, connected | Slides opens in a new tab on the file | N/A |
| Open while disconnected | Drive livrable, `disconnected` | Link shown and works; no check on return | N/A |
| Demo mode | any livrable | No link anywhere | N/A |
| Local livrable | `source = 'local'` | No link | N/A |
| Return, text changed | a zone's text edited in Slides | Banner with "Réimporter" | N/A |
| Return, nothing changed | only an image moved, or nothing | No banner | N/A |
| Return, unsaved accepted changes | banner → "Réimporter" | existing confirmation "Des changements acceptés…" | N/A |
| Return, Drive error | token revoked, file deleted | No banner, error logged | header "Réimporter" still available |
| Panel | Drive livrable in "En cours" | icon link beside the card; card click still opens the editor | N/A |
| Proposal card | presentation created | "ouvrir dans Google Slides" next to "ouvrir le livrable" | N/A |

</frozen-after-approval>

## Code Map

- `domain/livrable.ts` -- `googleSlidesUrl(driveFileId)`; `driveTextChanged(blocks, presentation)`: compares `slidesToBlocks(presentation)` with the blocks by id and `driveText` (added, removed, different text).
- `actions/livrable.ts` -- `LivrableDetail` gains `driveFileId: string | null`; new Server Action `checkDriveChanges(livrableId)` → `ActionResult<{ changed: boolean }>`: `connected` only, `readPresentation`, `driveTextChanged`. Read-only, no write.
- `components/OpenInGoogleLink.tsx` (new) -- the link (icon, label, sr-only suffix, `onClick` callback so the editor knows it was used). Optional `compact` variant (icon only, with `aria-label`) for the panel.
- `components/DriveLivrableActions.tsx` -- renders the link; after a click, listens to `visibilitychange`, calls `checkDriveChanges` on return, shows the banner whose "Réimporter" reuses `requestReimport`. Rendered for `driveMode !== 'demo'` already; the link itself does not depend on `connected`, the check does.
- `app/livrables/[id]/page.tsx` -- passes `driveFileId` to `DriveLivrableActions`.
- `components/LivrablesPanel.tsx` -- for `source === 'drive' && driveFileId` and `drive !== null` (not demo), compact link beside the card (`<li>` becomes a row: card link + icon link).
- `components/PresentationProposalCard.tsx` -- `created` branch: second link, if the proposal summary carries the `driveFileId` (add it to `PresentationProposalSummary` in `actions/conversation.ts`; the table already holds it).
- `app/globals.css` -- row layout for the panel item, banner style (reuse `.drive-actions-conflict` look).

## Tasks & Acceptance

**Execution:**
- [ ] `googleSlidesUrl`, `driveTextChanged` (domain).
- [ ] `driveFileId` in `LivrableDetail` and `PresentationProposalSummary`; `checkDriveChanges` action.
- [ ] `OpenInGoogleLink`; editor header, panel, proposal card.
- [ ] Return detection and banner in `DriveLivrableActions`.

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.
- Given a Drive livrable in connected mode, when the consultant clicks "Ouvrir dans Google Slides", then the file opens in a new tab and the editor stays open.
- Given a zone's text was changed in Slides, when the consultant comes back to the editor tab, then the banner appears; "Réimporter" brings the new text in (with the confirmation if accepted changes are unsaved).
- Given demo mode or a local livrable, then no link is rendered anywhere.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks:**
- Scratch: `driveTextChanged` on added / removed / edited / blank-only / unchanged boxes.
- Action on SQLite with a stubbed provider: `changed` true/false, Drive error → `ok:false`, not connected → no read.
- Browser (production build): link in header, panel and proposal card; absent in demo and on local livrables; no `<a>` nested in `<a>`; banner after a simulated return with a stubbed change.
- Real Google (owner): open a created deck, edit a text box in Slides, come back, reimport.
