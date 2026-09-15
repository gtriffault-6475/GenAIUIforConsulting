---
title: 'Story 1.3: Panneau Contexte'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0a68c3ab9613707d9de9f1d728c5a2861d504040'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-selection-d-un-projet-octopod.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Once a project is connected (Story 1.2), the consultant still sees nothing from its drive — the promise that connecting a project "inherits its context automatically" is only half-built.

**Approach:** Add the `DOCUMENT` table (used by both this story's drive-sourced documents and Story 1.4's manually-added ones, so it isn't re-shaped twice), a `DriveProvider` port with a mock adapter seeding a handful of believable documents per project, and a read-only Contexte panel rendered once a project is active.

## Boundaries & Constraints

**Always:** `DOCUMENT` is the only new table this story adds (`id`, `projectId`, `name`, `source` — `'drive' | 'manual'` — , `folderPath` nullable, `content`); this story only ever inserts/reads rows with `source: 'drive'` — `'manual'` rows are Story 1.4's concern, not built here; `actions/document.ts` is the only code that reads/writes `DOCUMENT`, per AD-2; `DriveProvider` is defined in `integrations/ports/` and implemented in `integrations/mock/`, wired through the existing `integrations/index.ts`, exactly like `ProjectProvider`; the Contexte panel is read-only — no click target performs any action; a project with no documents shows an explicit "no documents" state, not an empty silent gap.

**Never:** no edit, delete, upload, or drag-and-drop affordance in the Contexte panel; no visible indication that documents are simulated (no "mock" badge, no placeholder-looking filenames); no Livrables or Mattermost panel yet (Story 1.5, and Epic 2 for Livrables) — this story only adds Contexte; do not build the full three-column workspace grid yet — a single panel below the top bar is enough until Epic 2 has a center conversation to put beside it.

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- has `project` and `appState` (Story 1.2) -- add `document` table here; extend, don't touch the existing two.
- `db/client.ts` -- bespoke migration runner (Story 1.2, reads `db/migrations/<name>/migration.sql`) -- do not modify; after changing `db/schema.ts`, run `npm run db:generate` and commit the new `db/migrations/<name>/` folder, exactly as Story 1.2 established.
- `integrations/ports/project-provider.ts`, `integrations/mock/project-provider.ts` -- existing pattern (Story 1.2) to mirror exactly for the new `DriveProvider` port/adapter.
- `integrations/index.ts` -- existing single wiring point -- add `driveProvider` export alongside `projectProvider`, same pattern.
- `app/globals.css` -- has `card`, `text-label`, `text-caption`, `nav-row` (Story 1.1/1.2) -- reuse for the panel and its rows; no new component classes needed.
- `app/page.tsx` -- currently renders the top bar only once a project is active (Story 1.2) -- add the Contexte panel below it in that branch.

## Tasks & Acceptance

**Execution:**
- [x] `db/schema.ts` -- add `document` table (`id`, `projectId` FK, `name`, `source`, `folderPath` nullable, `content`) -- gives this and Story 1.4 a shared home, shaped once
- [x] `npm run db:generate` -- generate and commit the resulting `db/migrations/<name>/` folder -- keeps the bespoke migration runner (Story 1.2) working for a fresh clone
- [x] `integrations/ports/drive-provider.ts` -- define `DriveProvider` interface (`listDocuments(projectId): Promise<OctopodDocument[]>`) -- the port AD-1 requires before any adapter exists
- [x] `integrations/mock/drive-provider.ts` -- implement `DriveProvider` seeding a few documents per seed project (e.g. for "Réponse RFP — Acme Corp": "RFP — Acme Corp.pdf", "CR call achats.docx", "Note de synthèse client.pdf" — reusing the brief's own examples; a comparable small set for "Audit interne — Mission Client") -- credible round-1 content, not placeholder-looking
- [x] `integrations/index.ts` -- export `driveProvider` from the mock adapter, same pattern as `projectProvider`
- [x] `actions/document.ts` -- Server Action `listDocuments(projectId)` reading via `DriveProvider` -- the only code allowed to read `DOCUMENT`, per AD-2
- [x] `components/ContextPanel.tsx` -- read-only list of documents (name only, grouped by `folderPath` when present); shows an explicit "no documents" message when the list is empty -- realizes FR-3
- [x] `app/page.tsx` -- once a project is active, call `listDocuments` and render `ContextPanel` below the top bar -- realizes FR-3

**Acceptance Criteria:**
- Given an active project with mock documents, when the workspace renders, then the Contexte panel lists them, read-only — no edit/delete/add affordance anywhere in the panel
- Given the same panel, when inspected, then nothing indicates the data is simulated (no badge, no "mock" text, no obviously-fake placeholder names)
- Given a project with no documents (if `DriveProvider` returns an empty list for it), when the panel renders, then it shows an explicit "no documents" message rather than an empty gap
- Given no active project (selector still showing, per Story 1.2), when the page renders, then no Contexte panel appears at all

## Implementation Notes

Implemented by a scoped subagent per Code Map/Tasks. Orchestrator then ran an independent Reviewer Gate (three parallel review lenses — blind-spot, edge-case, verification-gap — against the staged diff) rather than trusting the implementer's self-reported verification, per the process established after the Story 1.2 incident.

**Review Triage Log:**

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | Document rows reused the `nav-row` CSS class (overriding only `cursor`), so hovering a row showed the same selected-tint highlight used elsewhere for genuinely clickable rows — visually contradicting the frozen "no click target performs any action" boundary. Flagged independently by all three review lenses. | Medium | Patch | Fixed in `components/ContextPanel.tsx`: row no longer uses `nav-row`; replicates only its padding inline, with no hover/focus rule attached. Verified live — no highlight on hover. |
| 2 | `<li role="presentation">` copied from `ProjectSelector`'s listbox pattern without a matching `role="listbox"`/`role="option"` parent structure — could cause the `<ul>` to lose implicit list semantics for assistive tech. | Low | Patch | Removed the redundant `role="presentation"`; plain `<li>` needs no role here (not a listbox of choices). |
| 3 | Acceptance criterion "empty project shows an explicit no-documents message" was only verified by code inspection, never observed live (both seed projects have documents). | Medium | Verify | Orchestrator seeded a temporary zero-document project directly in `db/local.db`, confirmed the "Aucun document pour ce projet." message renders, then removed the test project. |
| 4 | The second seed project ("Audit interne — Mission Client") was never rendered live — only its seed data was read. | Medium | Verify | Orchestrator selected it live; root + 2 folder groups render correctly, sorted and grouped as expected. |
| 5 | The incremental-migration path (new migration landing on a DB that already has Story 1.2's migration applied) was never exercised — only a fresh empty DB was tested. | Medium | Verify | Orchestrator simulated it directly (applied Story 1.2's migration alone, then re-ran with Story 1.3's migration restored) — applies cleanly, `__schema_migrations` tracks both correctly. |
| 6 | While verifying live, discovered `.claude/launch.json`'s dev server config resolved `npm`/`node` from the plain shell `PATH` (Node 23.11, Homebrew default) rather than the project's pinned Node 24 (`.nvmrc`), reproducing the exact `stmt.setReturnArrays` crash from the Story 1.2 incident — this time in the preview tooling rather than the user's own interactive shell (which has the `nvm` auto-switch hook). | High (environment) | Patch | Updated `.claude/launch.json` to prepend the nvm-managed Node 24 `bin` directory to `PATH` before running `npm run dev`, so the dev server always launches under the pinned Node version regardless of shell type. |
| 7 | `onConflictDoUpdate` in `actions/document.ts` never refreshes `projectId`; `document.id` is a global (not per-project) primary key. | Medium (latent, not currently triggered) | Defer | Logged in `deferred-work.md` — no collision possible with today's namespaced mock ids; revisit with a real `DriveProvider` or Story 1.4's manual-id scheme. |
| 8 | Drive sync only inserts/updates `source: 'drive'` rows, never deletes ones no longer returned by the provider. | Low (latent) | Defer | Logged in `deferred-work.md` — not exercisable against the mock's static seed list; revisit with a real `DriveProvider`. |
| 9 | `folderPath: null` and `folderPath: ''` would render as two indistinguishable headerless groups. | Medium (latent) | Defer | Logged in `deferred-work.md` — mock only ever emits `null`; revisit with a real `DriveProvider`. |
| 10 | No `Suspense`/`loading.tsx` boundary — whole page blocks on `listDocuments`. | Low | Defer | Logged in `deferred-work.md` — pre-existing pattern from Story 1.2, not a regression; revisit if real integrations add noticeable latency. |
| 11 | No `ORDER BY` on the document read query. | Low | Defer | Logged in `deferred-work.md` — order is stable in practice today; revisit only if observed to matter. |
| — | Un-awaited `db.transaction(...)` call in the sync path, flagged for a second look by the verification-gap pass. | — (false alarm) | No action | Traced through `drizzle-orm`'s `node-sqlite` driver source: this session runs in synchronous mode, so `transaction()`'s callback and `.run()` calls are synchronous by design — not a race. Confirmed correct as written. |

## Verification

**Commands:**
- `npm run dev` -- ran under Node 24 (nvm), server starts, no errors
- `npx next build --turbopack` -- compiles cleanly (verified after the Review Triage Log fixes, not just by the implementer)
- `npx tsc --noEmit` -- no type errors under strict mode (verified after the Review Triage Log fixes)

**Manual checks — all performed live by the orchestrator in-browser (not just code-inspected):**
- No active project: only the selector renders, no Contexte panel.
- "Réponse RFP — Acme Corp" selected: Contexte panel lists its documents, grouped by folder, read-only, no mock indicator, no hover highlight on rows (post-fix).
- "Audit interne — Mission Client" selected: Contexte panel lists its own (different) documents, correctly grouped — previously unverified live, now confirmed.
- A temporary zero-document test project: Contexte panel shows "Aucun document pour ce projet." — previously unverified live, now confirmed.
- Incremental migration: applied Story 1.2's migration alone against a fresh DB, then re-ran with Story 1.3's migration present — applies cleanly on top, `__schema_migrations` tracks both — previously untested, now confirmed.
- Discovered and fixed a real dev-server environment bug in the process (see Review Triage Log #6): `.claude/launch.json` now pins Node 24 for the preview tooling, independent of shell `PATH`.
