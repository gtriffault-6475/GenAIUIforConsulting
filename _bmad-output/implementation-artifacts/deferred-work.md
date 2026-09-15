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
