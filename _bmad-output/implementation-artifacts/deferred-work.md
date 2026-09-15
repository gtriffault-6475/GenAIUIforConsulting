- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffolding-du-projet-et-fondations-partagees.md`
  summary: Two DESIGN.md color tokens fail WCAG AA contrast (`text-muted` #8a90a3 on `background` #f3f4f8 ≈ 2.9:1; `ai-accent-foreground` #ffffff on `ai-accent` #7c5cfc ≈ 4.4:1, both below the 4.5:1 normal-text threshold).
  evidence: Verified by direct contrast computation during Story 1.1 review. Root cause is the token values chosen upstream in DESIGN.md (an earlier UX-phase artifact), which this story's frozen Boundaries require matching exactly — not something this story's implementation can unilaterally change. Revisit by adjusting the two DESIGN.md tokens (or their usage) and propagating to app/globals.css.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffolding-du-projet-et-fondations-partagees.md`
  summary: No `.env.local.example` documents the `ANTHROPIC_API_KEY` environment variable a future developer will need.
  evidence: This story's frozen Boundaries explicitly exclude `@anthropic-ai/sdk` wiring ("Epic 2's concern") — the env var has no consumer yet, so there's nothing to validate an example against. Add `.env.local.example` (and a README mention) when Epic 2 / Story 2.5 first reads `ANTHROPIC_API_KEY`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffolding-du-projet-et-fondations-partagees.md`
  summary: `components/OverlayProvider.tsx`'s single `openOverlayId` string has no collision guard if two independent call sites ever pass the same id.
  evidence: No consumer exists yet in this story's diff to demonstrate a real collision (maybe-false, would be medium if it occurred). Settle once Epic 2 (skill-add entry point) and Epic 4 (suggestion retravail field) add real overlay ids — either confirm ids are naturally unique per feature, or namespace them (e.g. `skill-add`, `suggestion-retravail-{suggestionId}`).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-selection-d-un-projet-octopod.md`
  summary: There is no UI affordance to switch to a different active project once one is selected — the only way back to the selector is deleting `db/local.db`.
  evidence: A real gap a consultant would hit in daily use, but excluded by this story's frozen Intent (only describes a selector when none is active and a top bar once one is) and by the epic's "un seul projet actif à la fois" framing — no switcher UX is specified anywhere in round 1's planning artifacts. Revisit once a story defines the intended UX for changing projects (e.g. a click target on the top bar reopening the selector, with a decision on what happens to any active conversation/livrable state).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md`
  summary: `actions/document.ts`'s sync upsert (`onConflictDoUpdate` keyed on `document.id`) never refreshes `projectId`, and `document.id` is a global (not per-project) primary key.
  evidence: Not triggered today — the mock's seed ids are namespaced per project (`doc-acme-*`, `doc-audit-*`), so no collision occurs across the two seed projects (independently confirmed by two review passes). Would only manifest if a future real `DriveProvider` or Story 1.4's manual-add path ever produced an `id` colliding across two different projects: the row's content would silently overwrite while `projectId` stayed pointed at the original owner. Revisit if/when a real (non-mock) `DriveProvider` is wired in, or when Story 1.4 defines how manual-document ids are generated.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md`
  summary: The drive sync in `actions/document.ts` only inserts/updates `source: 'drive'` rows — it never deletes a row whose id disappeared from the provider's latest listing.
  evidence: Not exercisable today since the mock's seed list is static (always returns the same ids). Once a real `DriveProvider` exists, a file actually removed from Octopod's drive would remain listed in the Contexte panel forever. Revisit when a real (non-mock) `DriveProvider` replaces `integrations/mock/drive-provider.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md`
  summary: `ContextPanel`'s folder grouping treats `folderPath: null` (root) and `folderPath: ''` (empty string) as two distinct, equally headerless groups.
  evidence: Not triggered today — the mock adapter only ever emits `null` for root-level documents, never `''`. A future real `DriveProvider` that uses `''` as its "no folder" convention would silently split root documents into two indistinguishable headerless clusters. Revisit alongside the real `DriveProvider` work; likely fix is normalizing `''` to `null` at the port boundary.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md`
  summary: `app/page.tsx` has no `Suspense`/`loading.tsx` boundary — the whole page (including the top bar) blocks on `listDocuments` resolving, not just the Contexte panel.
  evidence: Pre-existing pattern from Story 1.2 (already true for `getActiveProject`), not a regression introduced here. Harmless today since the mock adapter's simulated latency is short, but would show as a blank page rather than a progressively-rendering one if a real, slower `DriveProvider`/`ProjectProvider` were wired in. Revisit if real integrations introduce noticeable latency.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md`
  summary: The `SELECT` in `actions/document.ts` that reads back `document` rows has no `ORDER BY`, so within-folder document order relies on incidental SQLite row order rather than a guaranteed contract.
  evidence: Low risk (order is stable in practice today), but a future SQLite/driver change could reorder documents within a folder with no code change on our side. Revisit by adding an explicit `.orderBy(document.name)` (or similar) if this is ever observed to matter.
