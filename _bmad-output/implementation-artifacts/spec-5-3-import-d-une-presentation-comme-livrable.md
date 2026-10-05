---
title: "Story 5.3 — Import d'une présentation comme livrable"
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '96e505d8efb3d77b45ec0ed7318b0d7a9d4210a0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The consultant's real presentations live in the project's Drive folder, but the app can only edit livrables it generated itself. They need to open a Google Slides presentation in the Éditeur assisté to work on it with the AI.

**Approach:** Add `readPresentation` to the drive port (Google Slides API); the Livrables panel gets a second group "Dans le Drive du projet" listing the folder's not-yet-imported presentations (from the Story 5.2 resync); clicking one imports it as a `source = 'drive'` livrable whose blocks are the presentation's text boxes, with a dedicated conversation, and opens the editor grouped by slide; a "Réimporter" action reloads the Drive version.

## Boundaries & Constraints

**Always:**
- Block = one text box (shape with text, including inside groups, recursively), `id` = its Slides `objectId`, plus `slideId`, `slideNumber` (1-based rank of the slide in the deck, slides without text included) and `driveText = text`. Text = concatenated text runs with the final paragraph newline removed; empty text boxes produce no block. Tables, images, videos, lines and speaker notes are ignored.
- Import is read-only on Drive. Uniqueness `(projectId, driveFileId)` on LIVRABLE: an already-imported presentation opens its livrable, never a second import. Import creates, in one transaction, the livrable and a new conversation titled after the presentation, linked by `LIVRABLE.conversationId`; the active conversation does not change.
- `LIVRABLE.conversationId` becomes unique when not null (AD-14). Migration: before the index, any older duplicates keep their link only on the first livrable (by rowid); later duplicates get `conversationId = NULL` (they come from a pre-Epic-5 demo bug).
- The "Dans le Drive du projet" group lists Slides files of the current Google resync (`origin = 'google'`, mime type presentation) with no livrable; it is absent in demo mode; when the drive state is not `ok` the group shows the same message as the Contexte panel. Drive-backed items (both groups) show a Slides icon.
- Editor: for a drive livrable, paragraphs are grouped under "Diapositive N" headings (by `slideNumber`); "Réimporter" sits in the editor header, enabled only in `connected` mode, otherwise disabled with "Connectez Google Drive pour enregistrer."
- Réimporter: replaces all blocks by the Drive version; a pending/revising suggestion is kept only if its `anchorRef` still exists and that block's new `driveText` equals its previous `driveText`, otherwise deleted; resolved (accepted/rejected) suggestions are kept as history. If any block has `text ≠ driveText` (one pure `domain/` function), an in-page confirmation warns that accepted changes not yet saved to Drive will be lost.
- Safety until Story 5.4: `propose_livrable_content` must never regenerate a drive livrable — its execution refuses with a tool error when the conversation's livrable has `source = 'drive'` (protects the objectIds).
- `applyAcceptedSuggestion` keeps every other block field (`slideId`, `slideNumber`, `driveText`) when replacing a block's text.
- Google errors: short French message, raw detail logged; `token_revoked` handled by the existing provider wrapper.

**Never:**
- No write to Drive, no "Enregistrer dans Drive" (Story 5.5), no AI tool change for drive livrables beyond the refusal above (Story 5.4), no presentation creation (Story 5.6).
- No Slides import in demo mode (the mock adapter returns an error).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Import | connected, click a listed presentation | livrable + dedicated conversation created, editor opens grouped by slide; item moves to "En cours" | Google error → inline "Impossible d'importer cette présentation. Réessayez." |
| Already imported | click again / two clicks racing | opens the existing livrable, no duplicate | unique index; second import returns the first |
| Groups & tables | text box inside a group; a table | group's text boxes become blocks; table ignored | N/A |
| Reimport, no local change | click "Réimporter" | blocks replaced, unchanged-zone suggestions kept | N/A |
| Reimport with accepted unsaved change | some `text ≠ driveText` | confirmation first; cancel keeps everything | N/A |
| Disconnected | drive livrable opened, not connected | content and suggestions visible; "Réimporter" disabled with the message | N/A |
| Demo mode | demo on | no "Dans le Drive du projet" group; existing drive livrables still listed in "En cours" | N/A |
| Agent on drive livrable | `propose_livrable_content` called in its conversation | tool refused, livrable unchanged | error surfaced like any tool error |

</frozen-after-approval>

## Code Map

- `integrations/ports/drive-provider.ts` -- add `readPresentation(fileId)` → `DriveResult<DrivePresentation>` (`{ title, slides: [{ slideId, slideNumber, textBoxes: [{ objectId, text }] }] }`).
- `integrations/google/drive-provider.ts` -- implement with `@googleapis/slides` 10.x `presentations.get` (fields limited to slides' objectId and pageElements shape/elementGroup text), same `OAuth2Client`, `toDriveError`, timeout; recursion into `elementGroup.children`.
- `integrations/mock/drive-provider.ts` -- `readPresentation` → `{ ok: false, error: 'unknown' }` (never reached: demo has no Drive livrables).
- `actions/google-connection.ts` -- `forgetConnectionOnRevokedToken` must wrap the new method too.
- `db/schema.ts` + migration -- LIVRABLE: `source` (`local|drive`, default `local`), `driveFileId`; partial unique `(projectId, driveFileId)`, partial unique `conversationId`; hand-written duplicate-conversation backfill before the index.
- `domain/livrable.ts` (new) -- `slidesToBlocks(presentation)`, `hasUnsavedDriveChanges(blocks)`, `reimportKeepsSuggestion(oldBlocks, newBlocks, anchorRef)`.
- `domain/suggestion.ts:46` `applyAcceptedSuggestion` -- spread the block (generic over `{id,text}`).
- `actions/livrable.ts` -- `LivrableSummary` + `source`/`driveFileId`; `LivrableDetail` + `source`, blocks with slide fields, `canReimport`; new `importDrivePresentation(projectId, documentId)` and `reimportDriveLivrable(livrableId)`; writes CONVERSATION for the dedicated conversation (documented AD-2 exception, like `actions/demo.ts`).
- `actions/document.ts` -- `DocumentSummary` gains `driveFileId`; reuse `getContextPanel` data (no second resync).
- `actions/message.ts:183` `executeTool` -- refuse on a drive livrable.
- `app/page.tsx` -- pass drive state + not-imported presentations (computed from `getContextPanel` and `listLivrables`) to `LivrablesPanel`.
- `components/LivrablesPanel.tsx` -- two groups, Slides icon, import button (client component, `useTransition`, then `router.push('/livrables/<id>')`).
- `app/livrables/[id]/page.tsx` + `components/ReimportButton.tsx` (new) -- slide grouping, header action with confirmation.
- `app/globals.css` -- styles.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add `@googleapis/slides` 10.1.0 (exact).
- [ ] port, Google adapter, mock, provider wrapper -- `readPresentation`.
- [x] `db/schema.ts` + migration -- LIVRABLE columns, indexes, backfill.
- [x] `domain/livrable.ts`, `domain/suggestion.ts` -- pure rules.
- [x] `actions/livrable.ts`, `actions/document.ts`, `actions/message.ts` -- import, reimport, summaries, tool refusal.
- [x] `components/LivrablesPanel.tsx`, `app/page.tsx`, `app/livrables/[id]/page.tsx`, `components/ReimportButton.tsx`, `app/globals.css` -- UI.

**Acceptance Criteria:**
- Given an imported presentation, when the Drive file is inspected, then it was never written (only `presentations.get` / `files.list` / `files.export` calls).
- Given an existing database with livrables, when the app starts, then the migration applies and existing livrables are `source = 'local'`.
- Given `rm -f db/local.db* && npm run build`, then it succeeds.

## Implementation Notes

- Implemented directly from this spec (no subagent dispatch). `@googleapis/slides` 10.1.0 added (exact pin).
- `readPresentation`: `presentations.get` with a field mask limited to slide objectIds and page elements' shape text / groups; parsing in `toDrivePresentation` (exported for scratch verification); same OAuth client, `toDriveError` and 10 s timeout as Drive. Mock returns `unknown` (demo has no Drive livrables). The token-revoked wrapper covers the new method.
- `domain/livrable.ts` takes a structural presentation type instead of importing the port (AD-5). `applyAcceptedSuggestion` is now generic and spreads the block.
- Import reads DOCUMENT through `findDrivePresentation` in the non-'use server' `actions/document-context.ts` (only Slides rows of origin `google` and of this project, by document id — never a client-supplied Drive id). Existing livrable checked before reading Drive and inside the transaction; a lost unique-index race reads the winner back.
- The "Dans le Drive du projet" group reuses `getContextPanel`'s resync (no second Drive listing per render); drive-state messages moved to `components/drive-state-message.ts`, shared by both panels.
- Editor refactored: `BlockParagraph` / `LivrableBlocks` components; multi-line text boxes keep their line breaks (`white-space: pre-line` in slide groups).
- Migration `20261005101426_smooth_lenny_balinger`: generated columns/indexes + hand-written duplicate-conversation backfill placed before the unique index.
- Review fixes (pass 1): Réimporter hidden in demo, connect hint only when disconnected; server-side unsaved re-check with `confirmed` flag; global revision hidden on Drive livrables; stricter suggestion survival (no local change); file-name title fallback; Drive group hidden when the livrables list failed; drive-mode failure isolated in `getLivrable`; soft line breaks displayed.
- Verification: `tsc` clean; fresh-db `npm run build` green. Scratch (esbuild) against stubbed Slides: nested groups recursed, table/image/empty box/notes ignored, slide numbering keeps empty slides, final newline stripped, field mask + timeout passed, 404 → `not_found`; domain rules (accept keeps slide fields, unsaved detection, reimport keep/drop, grouping). Integration scratch on a real SQLite DB with a stubbed provider: PDF / other-project imports refused; two concurrent imports → one livrable; dedicated conversation titled after the deck; active conversation untouched; third import returns the existing livrable without reading Drive; reimport keeps the unchanged-zone pending suggestion and accepted history, drops changed-zone / gone-zone / global pending ones; Drive error leaves the livrable as is. Migration on an in-memory DB with two livrables sharing a conversation: first keeps the link, second nulled, later duplicate insert rejected. Browser (production server, fake Google credentials, fake Anthropic returning a `propose_livrable_content` tool call): Livrables groups and states (disconnected / Drive error), Slides icon, editor grouped by "Diapositive N" with line breaks, Réimporter disabled when disconnected with the message, confirmation on unsaved accepted change (cancel works), Drive error message on reimport, tool call refused with `is_error` and the livrable unchanged, demo mode hides the Drive group and still lists the drive livrable. Real import needs real Google Cloud credentials.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter BH, edge-case-hunter EC, verification-gap VG) — no intent_gap / bad_spec; patches applied directly; tsc, fresh-db build, integration scratch and browser scenario re-run green.

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 1 | BH+EC: "Connectez Google Drive pour enregistrer." shown in demo/unconfigured modes | medium | Real: demo mode must show no Google wording. Patch: Réimporter not rendered in demo mode; the hint only when `disconnected`. Wording itself is the frozen spec text. |
| 2 | BH+EC: unsaved-changes check only at render; reimport could overwrite a change accepted afterwards (other tab) | medium | Real. Patch: `reimportDriveLivrable(id, confirmed)` re-checks inside its transaction and returns `needsConfirmation`, which opens the same confirmation. |
| 3 | BH+EC+VG: global revision field shown on Drive livrables where the agent is always refused | medium | Real. Patch: field hidden for Drive livrables until Story 5.4. |
| 4 | BH+EC: pending suggestion kept on a zone whose local accepted text is reverted by reimport | medium | Real. Patch: `reimportKeepsSuggestion` also requires the zone had no local change (stricter "only if", within the frozen rule). |
| 5 | BH: untitled deck never falls back to the file name | low | Patch: adapter returns '' and the action falls back to the Drive file name. |
| 6 | BH+EC: failed livrables list makes imported decks look new | low | Patch: Drive group hidden when the list failed. |
| 7 | BH+EC: `getLivrable` fails the editor if the drive mode cannot be resolved | low | Patch: caught; unknown mode = cannot reimport. |
| 8 | EC: Slides soft line breaks (vertical tab) render run together | low | Patch: displayed as line breaks (stored text untouched for future saves). |
| 9 | BH: confirmation does not mention dropped suggestions | low | Spec defines the warning; dropping changed-zone suggestions is the documented reimport rule. Rejected. |
| 10 | BH: reimport leaves livrable/conversation titles stale | low | App-side labels; renames are rare. Rejected. |
| 11 | BH: empty presentation imports without explanation | low | Editor already says the livrable has no content. Rejected. |
| 12 | BH: migration backfill irreversible/unreported; race in `executeTool` now throws on the unique index | false | Backfill documented in the migration and Implementation Notes (pre-Epic-5 demo duplicates only); a racing duplicate now fails instead of silently creating a second livrable — the intended AD-14 guarantee. |
| 13 | BH: `reimportDriveLivrable` has no project check | low | Single-user local app, same convention as `getLivrable`. Rejected. |
| 14 | BH: `getActiveDriveProvider` cost on every Drive editor render | false | Two local SQLite reads, no network. |
| 15 | BH+VG: no committed tests (Slides parsing, reimport rule, unsaved detection, accept keeps fields, migration backfill) | medium (no test evidence) | No test suite by standing decision; all verified by scratch scripts (Implementation Notes). Deferred. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Google adapter `readPresentation` against a stubbed Slides API (nested group, table, empty box, notes ignored, slide numbering) in a scratch script.
- Browser with a seeded drive livrable + fake connection: editor grouping, Réimporter disabled when disconnected / confirmation when changed; demo hides the Drive group; tool refusal through the real path with the fake Anthropic endpoint.
- Real import needs real Google Cloud credentials (owner prerequisite).
