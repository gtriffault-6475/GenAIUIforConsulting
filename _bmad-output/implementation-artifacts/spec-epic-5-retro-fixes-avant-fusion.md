---
title: 'Epic 5 retrospective — fixes before merging PR #9'
type: 'bugfix'
created: '2026-10-05'
status: 'done'
baseline_commit: '416d58fcf394cf2f0671915c6c3e8892f6de43df'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-retro-2026-10-05.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 5 retrospective found cross-story defects that per-story reviews missed: a demo reset permanently orphans Drive livrables (R1), "Ajuster" never shows the proposal to the agent (R2), the demo reference document reaches the real agent (R3), rework on a Drive livrable resends its own deck (R4), one unknown zone discards a whole batch of anchored suggestions (R6), external deck text sits in the system prompt as instructions without cap and `</document>` can break the fence (R7), plus duplication (V5, V6) and spec drift (V7, V8).

**Approach:** Owner decision (retro, 2026-10-05): fix action items A1, A2, A3, A4, A6, A7, A9 and A11 together in PR #9, before the real Google test.

## Boundaries & Constraints

**Always:**
- **A1** `resetAvantVenteWorkflow`: livrables with `source = 'drive'` keep their conversation (row, messages, proposals), their `conversationId` and their suggestions; everything else is reset exactly as today.
- **A2** Each assistant turn sent to the agent in `sendMessage` carries, after its text, the presentation proposal attached to that reply (title, status, every slide's title and content), marked as shown to the consultant. Nothing is persisted differently.
- **A3** The demo reference document (`doc-demo-references-<projectId>`) is neither sent to the agent nor listed in the Contexte panel outside demo mode; unchanged in demo mode.
- **A4** `reworkSuggestion` passes the livrable's `driveFileId` as `excludeDriveFileId`.
- **A6** `propose_anchored_suggestions`: an unknown zone id no longer rejects the batch; it is reported through `addAnchoredSuggestions`' existing `skippedMissing` note. Duplicate ids, empty text and malformed input are still rejected.
- **A7** The Drive deck injected in `sendMessage` is introduced as reference data, never instructions, and capped at `CONTEXT_DOCUMENT_CHAR_CAP` with a truncation note; `formatContextDocuments` neutralises `</document` inside document text.
- **A9** `reimportDriveLivrable` reads blocks with `parseLivrableBlocks`; the folder missing/duplicate messages have one source shared by the panels and `createPresentationFromProposal`.
- **A11** `epics.md` Story 5.2 and 5.6 acceptance criteria and the `db/schema.ts` DOCUMENT comment match the as-built behaviour (other-origin rows kept; deck created by copying the OCTO template), each with a dated amendment note.

**Never:** No schema change or migration; no change to Story 5.5 save, 5.6 creation or Drive calls; no other retro action item (A5, A8, A10, A12–A14 stay open).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reset with a Drive livrable | avant-vente project, imported deck with suggestions, plus a local livrable | deck keeps conversation, messages, suggestions; local livrable detached as today; first step conversation recreated | N/A |
| Ajuster | pending proposal on the last reply, consultant asks to add a slide | agent request contains the proposal's slides in that assistant turn | N/A |
| Leave demo | demo reference doc seeded, demo off | doc absent from panel and agent context; back in demo it reappears | N/A |
| Partly stale suggestions | batch with one unknown id and one valid id | valid one added; tool result names the skipped zone | invalid shape → tool error as today |
| Fence break | context document containing `</document>` | text cannot close the `<document>` block | N/A |

</frozen-after-approval>

## Code Map

- `actions/demo.ts` `resetAvantVenteWorkflow` (~L150–215) -- filter livrables/suggestions/conversations by `livrable.source`; drive livrables' `conversationId`s excluded from the message/proposal/conversation deletes.
- `actions/message.ts` -- `historyRows` (~L174) needs `message.id`; read `presentationProposal` rows of the conversation and append to assistant turns; Drive deck injection (`__current_livrable_context`, ~L380–410) gets the data framing and cap.
- `actions/document-context.ts` `listAgentContextDocuments` + new non-action helper `isDemoReferenceDocument(id)`; `actions/document.ts` `getContextPanel` manual list and `demoReferenceDocumentId` (reuse its prefix).
- `actions/suggestion.ts:454` -- A4.
- `skills/propose_anchored_suggestions.ts` parser; `actions/anchored-suggestions.ts` (unchanged, already reports `skippedMissing`).
- `skills/buildRequest.ts` `formatContextDocuments` (~L69–93); `domain/document.ts` `CONTEXT_DOCUMENT_CHAR_CAP`, `truncateForContext`.
- `actions/livrable.ts` `reimportDriveLivrable` (~L760) and `runPresentationCreation` folder messages; `components/drive-state-message.ts` -> messages moved to new pure `domain/drive-messages.ts`.
- `_bmad-output/planning-artifacts/epics.md` (Story 5.2, 5.6); `db/schema.ts:76-78`.

## Tasks & Acceptance

**Execution:**
- [x] `actions/demo.ts` -- A1 reset filter.
- [x] `actions/message.ts` -- A2 proposals in history; A7 deck framing + cap.
- [x] `actions/document-context.ts`, `actions/document.ts` -- A3.
- [x] `actions/suggestion.ts` -- A4.
- [x] `skills/propose_anchored_suggestions.ts`, `actions/message.ts` -- A6.
- [x] `skills/buildRequest.ts` -- A7 fence.
- [x] `domain/drive-messages.ts`, `components/drive-state-message.ts`, `actions/livrable.ts` -- A9.
- [x] `epics.md`, `db/schema.ts` -- A11.
- [ ] retro document + `sprint-status.yaml` action items -- mark the fixed items (via `sprint_status.py --set-action-status`, after confirmation).

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.

## Implementation Notes

- A1 `actions/demo.ts`: orphaning, suggestion deletion and `conversationId := null` filtered on `source = 'local'`; conversations referenced by drive livrables excluded from the proposal/message/conversation deletes (conversation delete now by id list).
- A2 `actions/message.ts`: history read with `message.id`; the conversation's proposals appended to their assistant turn. Review patch: only the latest proposal is replayed slide by slide, earlier ones by title ("remplacée par une proposition plus récente").
- A3 `demoReferenceDocumentId` / `isDemoReferenceDocument` moved to `actions/document-context.ts` (not a Server Action); filtered in `listAgentContextDocuments` unless origin `mock`, and in `getContextPanel` unless demo mode.
- A4 `reworkSuggestion` selects `driveFileId` and passes it as `excludeDriveFileId`.
- A6 parser no longer takes block ids; `addAnchoredSuggestions` reports unknown ids in `skippedMissing` (note reworded).
- A7 deck framed as reference data and capped by whole zones at `CONTEXT_DOCUMENT_CHAR_CAP`; review patch: zones left out are refused by the executor (reported as skipped). `formatContextDocuments` neutralises opening and closing `<document` sequences (review patch) and flattens whitespace/angle brackets in names.
- A9 `domain/drive-messages.ts` (pure) shared by `components/drive-state-message.ts` and `actions/livrable.ts`; `reimportDriveLivrable` uses `parseLivrableBlocks` (malformed content now reads as no blocks instead of aborting).
- A11 `epics.md` 5.2 and 5.6 amended with dated notes (OQ-7 prerequisite marked done, spine path given); `db/schema.ts` DOCUMENT comment.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | edge, blind | Deck over the cap: the agent can still target a left-out zone and replace text it never read | medium | patch — executor refuses zones not shown (reported as skipped) |
| 2 | edge, blind | First zone alone over 30 000 characters → no zone shown | low | rejected — a single 30 000-character text box is not realistic in a slide; fix would add branches |
| 3 | edge | Drive livrables orphaned by a reset run before this fix stay orphaned | low | rejected — only possible on test databases (PR #9 not merged); no repair path warranted |
| 4 | edge, blind | Forged opening `<document name=…>` inside a document | medium | patch — opening sequence neutralised too; names lose newlines |
| 5 | edge | Corrupt content now reads as no unsaved change in reimport | low | rejected — content is only written by the app; reimport then repairs it from Drive |
| 6 | blind | Comment says left-out zones are "named" | low | patch — comment fixed with #1 |
| 7 | blind | Every proposal replayed in full on every turn, unbounded | low | patch — only the latest proposal in full |
| 8 | blind | `local` / `drive` filters could drift with a third source | low | rejected — two-value enum; no third source planned |
| 9 | blind | Stale comment about `demoReferenceDocumentId` in `actions/document.ts` | low | patch — comment corrected |
| 10 | blind | A3 rule expressed two ways (`origin === 'mock'` vs demo flag) | low | rejected — both derive from `resolveDriveMode` (demo ⇔ mock), documented |
| 11 | blind | `epics.md` 5.6 OQ-7 prerequisite still open; spine path | low | patch |
| 12 | blind | Tool description may say unknown ids are refused | false | the description only says ids come from the provided content; no refusal wording |
| 13 | gap, blind | No automated test for A1–A7 | — | defer — standing project decision; scratch checks recorded below |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Results (2026-10-05):** tsc clean; fresh-db build OK (before and after review patches). Scratch bundle on SQLite with a fake Anthropic endpoint capturing requests: reset keeps the Drive livrable's conversation, messages and suggestions and resets the local one; the agent request carries the proposal on its assistant turn (latest in full, earlier by title); the demo reference document is absent from the panel and context when connected, present in demo; `sendMessage` on a Drive deck with one valid and one unknown id adds one suggestion and names the unknown one, deck framed as data and not resent as a context document; rework request without the deck; `<document`/`</DOCUMENT>` neutralised and name sanitised; a 40 000-character deck shows one zone, says one is left out, and a suggestion on the hidden zone is refused.

**Manual checks (if no CLI):**
- Scratch on SQLite: reset with a Drive and a local livrable; proposals in the captured agent request; demo doc filtered outside demo; rework request without the deck; mixed-validity anchored batch; `</document>` neutralised.
