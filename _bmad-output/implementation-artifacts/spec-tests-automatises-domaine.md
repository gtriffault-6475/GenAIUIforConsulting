---
title: 'Tests automatisés — first kept tests, on the pure domain rules, with Node’s built-in runner'
type: 'chore'
created: '2026-10-09'
status: 'done'
baseline_commit: '3392d9fccd75cca08ae7d159313e91ac03234b2f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The project has no automated test. The architecture spine defers them ("Tests automatisés, CI — non abordés ; à réintroduire si le projet dépasse le stade round 1"), so every spec since Epic 1 ends with the same deferral (16 entries in `deferred-work.md`) and its rules are checked by throw-away scratch scripts that are lost after the review. A later change can break an ordering, a save plan or a context budget and still pass `tsc` and `npm run build`.

**Approach:** Owner request (2026-10-09), point 6 of the post-merge review. Add the first kept tests, on the pure rules in `domain/` (AD-5: no I/O, so testable without a database, Google or the browser), run with Node's built-in test runner and native TypeScript type stripping (Node ≥ 24, already required by `package.json` `engines`), through `npm test`. New specs that touch `domain/` add or update tests.

**Owner decisions (2026-10-09):**
- D1 — Runner: `node --test`, no new dependency (no Vitest/Jest). Checked: all six `domain/` files load as-is under Node 24 type stripping (no enum, namespace or import).
- D2 — Scope of this spec: the pure functions of `domain/` only. Server Actions (database, Drive provider), components and the Google adapter stay out; they need a harness (scratch SQLite, stubbed provider, browser) that is a separate decision.
- D3 — No CI (owner's earlier decision stands): `npm test` is run by hand and by the build workflow's verification step.
- D4 — From now on, a spec that changes a `domain/` function adds or updates its tests, and its Verification section lists `npm test`. The spine's Deferred line is amended to say so. Existing `deferred-work.md` entries are left as they are.

## Boundaries & Constraints

**Always:**
- Test files next to their module: `domain/<module>.test.ts`, using only `node:test` and `node:assert/strict`, importing the module with its `.ts` extension (`./livrable.ts`), as Node's type stripping requires.
- `package.json` script `"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \"domain/**/*.test.ts\""`. No `"type": "module"` change (it would change how `next.config.ts` is loaded).
- `tsconfig.json`: `"allowImportingTsExtensions": true` so the test files still type-check under `npx tsc --noEmit` (allowed because `noEmit` is set). `npm run build` must still pass.
- Each test names the behaviour in French or English plain words (`test('cartes dans l’ordre du document, globales en dernier', …)`) and covers the rule's branches, not just one happy path. Tests never touch the file system, the network, the clock or `Math.random`.
- Coverage of this spec (every exported function of `domain/`):
  - `livrable.ts`: `slidesToBlocks`, `isBlockModified`, `hasUnsavedDriveChanges`, `reimportKeepsSuggestion`, `groupBlocksBySlide`, `parseLivrableBlocks`, `planDriveSave`, `googleSlidesUrl`, `googleSlidesSlideUrl`, `slideHasUnsavedChanges`, `driveTextChanged`.
  - `suggestion.ts`: `resolveAnchorPosition`, `applyAcceptedSuggestion`, `suggestionPosition`, `orderSuggestionsByAnchor`, `countPending`, `acceptableSuggestions`.
  - `document.ts`: `isAgentReadable`, `exportMimeTypeFor`, `truncateForContext`, `budgetContextDocuments`, `uploadTargetMimeType`, `uploadSourceMimeType`, `uploadedFileName`.
  - `workflow.ts`: `computeStepStatuses`. `agent-tools.ts`: `selectAgentTools`, `presentationGuidance`. `drive-messages.ts`: both messages.
- A test that reveals a real bug in a `domain/` function is not bent to pass: the bug is reported in the implementation notes and the test is marked `test.todo` with the expected behaviour, for the owner to decide.
- Spine (`ARCHITECTURE-SPINE.md`, Deferred): the tests line becomes "Tests automatisés : règles pures de `domain/` couvertes par `npm test` (`node --test`, 2026-10-09) ; actions, composants et CI différés." `README.md`: one line on `npm test`.

**Never:** No new dependency. No test of Server Actions, components, `integrations/` or `skills/`. No CI workflow. No change to any `domain/` function's behaviour. No snapshot tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Run | `npm test` on `main` | every test passes, exit code 0, summary printed | N/A |
| Regression | a rule broken (e.g. `orderSuggestionsByAnchor` puts globals first) | the matching test fails, exit code ≠ 0 | N/A |
| Type check | `npx tsc --noEmit` | clean, test files included | N/A |
| Build | `rm -f db/local.db* && npm run build` | passes; test files not bundled | N/A |
| Warnings | `npm test` | no `MODULE_TYPELESS_PACKAGE_JSON` warning | N/A |
| Real bug found | a test disagrees with the code | `test.todo` + note, code unchanged | N/A |

</frozen-after-approval>

## Code Map

- `domain/livrable.test.ts`, `domain/suggestion.test.ts`, `domain/document.test.ts`, `domain/workflow.test.ts`, `domain/agent-tools.test.ts`, `domain/drive-messages.test.ts` (new).
- `package.json` -- `test` script only.
- `tsconfig.json` -- `allowImportingTsExtensions: true`.
- `_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md` -- Deferred line (around line 277).
- `README.md` -- one line.
- Reference cases already proven in this repo's specs (reuse as test cases): `spec-ouvrir-dans-google-slides.md` (`driveTextChanged`: unchanged, edited, removed, added, added blank, unsaved local edit, saved blank, emptied), `spec-editeur-deux-panneaux.md` (ordering, frozen positions, no mutation), `spec-moins-de-clics.md` (acceptable set), `spec-report-serie-concurrente-epic-5.md` (budget: cut by total with reason, tiny remainder left out, cut by own cap), `spec-5-5-enregistrement-dans-drive.md` (`planDriveSave`: to write, already saved, conflicts).

## Tasks & Acceptance

**Execution:**
- [x] `tsconfig.json`, `package.json` script.
- [x] Six test files covering every exported function listed above.
- [x] Spine Deferred line, README line.

**Acceptance Criteria:**
- Given `npm test`, then all tests pass with exit code 0 and no type-stripping warning.
- Given one rule deliberately broken in a scratch copy (e.g. `countPending` counting `revising`), when `npm test` runs, then at least one test fails with a message naming the behaviour.
- Given `npx tsc --noEmit` and `rm -f db/local.db* && npm run build`, then both succeed.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | blind, edge | D4's rule for future specs ("add or update tests") is written nowhere; the spine line only states coverage | medium | patch — rule appended to the spine's Deferred line |
| 2 | blind | No check that the two private upload tables stay in sync (`UPLOAD_ACCEPT` / source MIME) | low | patch — one loop test over `UPLOAD_ACCEPT` |
| 3 | blind | Budget 500-character cutoff not tested at its edge | low | patch — 500 kept, 499 left out |
| 4 | blind, edge | `planDriveSave` with a modified block lacking `driveText` not pinned | low | patch — case added |
| 5 | blind | Workflow labels compared to `STEPS` itself | low | rejected — writing labels literally would snapshot UI copy (spec: no snapshot tests) |
| 6 | blind | `groupBlocksBySlide` mixed slide / no-slide blocks; `parseLivrableBlocks` with ill-typed optional fields | low | rejected — inputs not produced by any writer today |
| 7 | blind | `agent-tools` assertions match exact phrases; one combination missing | low | rejected — phrases are the behaviour the agent is told; missing combination follows the same branch |
| 8 | blind | `drive-messages` tests restate the full message | low | rejected — the message is the function's output |
| 9 | blind | `allowImportingTsExtensions` applies app-wide | low | rejected — no app file uses `.ts` imports; a second tsconfig adds more than it saves |
| 10 | edge | `exportMimeTypeFor` fallback, trailing-dot names, surrogate cut by total budget, `driveTextChanged` with blocks lacking `driveText` | low | rejected — branches already exercised through neighbouring cases or unreachable from writers |
| 11 | edge | No guard against syntax Node cannot strip (enum, namespace, extensionless import) | false | `npm test` then fails loudly at load, which is the visible signal; TS 5.7 has no `erasableSyntaxOnly` |
| 12 | edge | `npm test` on Node < 22.18 fails with a syntax error | false | `engines` requires Node ≥ 24 |
| 13 | gap | Nothing in the agent instructions says to run `npm test` when `domain/` changes | — | defer — fix edits agent-context files (AGENTS.md); D4 puts it in each spec's verification |

## Verification

**Commands:**
- `npm test` -- expected: all pass, exit 0.
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success (in a scratch copy if the owner's dev server holds `db/local.db`).

**Manual checks:**
- Mutation spot-check in a scratch copy: break three rules (`countPending`, `driveTextChanged` blank filter, `planDriveSave` conflict branch) one at a time; each makes `npm test` fail.

**Results (2026-10-09):** `npm test` 115 pass, 0 fail, 0 todo, no type-stripping warning; tsc clean (test files included); fresh-db build exit 0 (scratch copy, the owner's dev server holds `db/local.db`); no `domain/` source changed. Mutation spot-check in scratch copies, one rule at a time: `countPending` counting non-accepted → 2 failures; `driveTextChanged` blank filter removed → 1; `planDriveSave` conflict branch removed → 3; `orderSuggestionsByAnchor` globals first → 2. Review patches 1–4 added the D4 rule to the spine and 3 tests (115 in total).
