---
title: 'Report de trois points de la série #5–#8 dans la PR #9 (Epic 5)'
type: 'refactor'
created: '2026-10-05'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The parallel Epic 5 series (PRs #5–#8) handles three points better than this branch: a total size cap on the context documents sent to the agent, keeping the consultant's Drive selections across a round-trip through demo mode, and `skills/buildRequest.ts` no longer reading the database.

**Approach:** (1) On top of the 30 000-character per-document cap, cap the documents sent to the agent at 60 000 characters in total; documents beyond the budget are cut or left out with a visible note. (2) The Drive folder resync no longer deletes `DOCUMENT` drive rows of the other origin (`mock` vs `google`): they are kept with their `content` and `usedAsContext` but neither shown nor sent, so selections survive a demo round-trip; this deviation from AD-1's "purge" rule is recorded in the architecture spine. Rows of the current origin gone from the folder are still deleted. (3) `sendToAgent` takes the demo-mode flag from its caller instead of reading `APP_STATE`; `skills/buildRequest.ts` no longer imports `db/`.

</frozen-after-approval>

## Implementation Notes

- (1) `budgetContextDocuments` (pure, `domain/document.ts`): 30 000 characters per document, 60 000 in total; documents filled in order — manual first, then drive, each by name (`listAgentContextDocuments`); the one crossing the budget is cut (or left out if less than 500 characters would remain); the prompt says which documents were cut and why (own cap vs total) and lists the ones left out.
- (2) `syncDriveFolder` deletes only rows of the current origin whose file left the folder; other-origin rows are kept untouched and stay filtered out of the panel and of the agent context (both already filter by origin). Recorded as an amendment of AD-1 in `ARCHITECTURE-SPINE.md` (rule rewritten, dated note) and in `epic-5-context.md`; AD-11, the context-cap values and the migration list in the spine updated too.
- (3) `sendToAgent({ demoModeActive })`: read by the caller through `readDemoModeActive()` (`actions/document-context.ts`, not a Server Action), passed by `sendMessage`, `getStartingSuggestion` (via `proposeStartingPoint`) and `reworkSuggestion` (via `reworkSuggestionContent`); `skills/buildRequest.ts` no longer imports `db/`. A failed read still degrades to the real path (`getDemoModeActive` catches its own errors).
- Verification: `tsc` clean; fresh-db `npm run build` green. Budget (scratch): cut by total with reason, tiny remainder left out, cut by own cap, exact budget then left-out note. Resync (real SQLite, scripted provider): demo selection → connected selection → back to demo shows the mock file still selected and only it is sent; back to connected, the Google selection is intact; a Google file gone from the folder deletes only that row. Browser (fake Anthropic endpoint): demo mode answers from the script with no API call and creates the scripted livrable; demo off → real API calls.

## Review Triage Log

Single blind-hunter pass (oneshot route).

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 1 | Which documents get cut depends on DB row order | low | Patch: manual documents first, then drive, each by name. |
| 2 | A few-character fragment can be sent | low | Patch: under 500 characters left, the document is listed as not provided instead. |
| 3 | Spine rule contradicts itself (purge + amendment) | low | Patch: rule rewritten to the current behaviour with a dated note. |
| 4 | Spine AD-11 / cap values / migration list and epic context not updated | low | Patch: all updated. |
| 5 | Kept other-origin row could block a new file on the `(projectId, driveFileId)` unique index | low | Mock ids are `mock-…` and never come from Google; the index is unchanged and a collision would need a Google id starting with `mock-`. Rejected. |
| 6 | Other-origin rows (with exported text) kept indefinitely, e.g. after disconnecting | medium | Real: previously they were dropped only at the next resync of the other mode anyway; now never. Deferred (cleanup on disconnect / account change is a product choice). |
| 7 | Demo flag read several times per agent call | low | A toggle flipped during a single call; rare, fix needs plumbing the flag through every lookup. Rejected. |
| 8 | `readDemoModeActive` placed in the document-context module | low | Patch: module header explains it (same "not a Server Action" reason). |
| 9 | Duplicate comment above `formatContextDocuments` | low | Patch. |
| 10 | Truncation note doesn't say why | low | Patch: "limite par document" vs "limite totale des documents atteinte". |
| 11 | Spec unfinished | false | Completed at finalization (this section and the notes above). |
| 12 | No tests | medium (no test evidence) | No test suite by standing decision; scratch checks above. Covered by the existing deferred entries. |
