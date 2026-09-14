---
title: 'Story 1.1: Project scaffolding and shared foundations'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '466ef81f82bd90382187f267b4aa07707961fe29'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has no application code yet. Every later story (1.2–1.5, and Epics 2–4) needs a working Next.js foundation — the pinned stack, the layered directory structure, and the shared UI/accessibility conventions — or each would reinvent them inconsistently.

**Approach:** Scaffold a Next.js 16 App Router project on the pinned stack (TypeScript, Drizzle + `node:sqlite`), lay out the architecture spine's directory structure, and implement the cross-cutting foundations every subsequent story depends on: design tokens, a single `OverlayProvider`, and the accessibility/microcopy conventions.

## Boundaries & Constraints

**Always:** npm as package manager (ships with Node, nothing extra to install); TypeScript strict mode; directory structure exactly `app/ · actions/ · domain/ · skills/ · integrations/{ports,mock}/ · db/`; Drizzle configured against `node:sqlite` (never `better-sqlite3` — no native compilation); `npm run dev` boots a single process with no separate services; design tokens (colors, typography, spacing) match `DESIGN.md` values exactly; `OverlayProvider` closes the previous overlay automatically when a new one opens, and `Escape` closes the last-opened floating element; desktop-only target, no responsive breakpoints authored.

**Never:** no ESLint/Prettier/test-runner setup (not required by the architecture spine for round 1 — do not add tooling beyond what a later story needs); no real `@anthropic-ai/sdk` call wiring (Epic 2's concern); no database tables beyond what this story itself needs (none — Drizzle is configured but no schema tables are created here; each feature story creates the tables it needs); no page content beyond a placeholder confirming the scaffold boots with tokens applied.

</frozen-after-approval>

## Code Map

- No existing application code in the repository — this story creates the initial structure from scratch.
- `package.json`, `tsconfig.json`, `next.config.ts` -- project manifest and config, created via non-interactive `create-next-app` (App Router, TypeScript, no ESLint, no Tailwind, no `src/` directory).
- `drizzle.config.ts`, `db/schema.ts`, `db/client.ts` -- Drizzle wired to `node:sqlite`; `schema.ts` starts empty (tables added by the stories that need them).
- `app/globals.css` (or equivalent token file) -- design tokens from `DESIGN.md`: colors, typography (Space Grotesk + IBM Plex Sans via `next/font/google`), spacing scale, rounded/elevation values.
- `app/layout.tsx`, `app/page.tsx` -- root layout applying tokens; a minimal placeholder page (product wordmark) confirming the scaffold renders correctly.
- `components/OverlayProvider.tsx` -- shared overlay/modal state: `openOverlay(id)` / `closeOverlay()`, auto-closes the previous overlay, binds `Escape` to close the last-opened overlay.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsconfig.json`, `next.config.ts` -- scaffold via `npx create-next-app@latest` (non-interactive flags: TypeScript, App Router, no ESLint, no Tailwind, no `src/`) -- establishes the pinned stack with a single, standard command
- [x] `app/`, `actions/`, `domain/`, `skills/`, `integrations/ports/`, `integrations/mock/`, `db/` -- create the directory structure -- matches the architecture spine's layered/ports-and-adapters shape so later stories have a home
- [x] `drizzle.config.ts`, `db/client.ts`, `db/schema.ts` -- configure Drizzle against `node:sqlite`, empty schema -- persistence is ready without a native-compile step
- [x] `app/globals.css` -- author the design tokens from `DESIGN.md` (colors, typography, spacing, rounded, elevation) as CSS custom properties -- gives every later UI story a shared, correct palette
- [x] `app/layout.tsx` -- load Space Grotesk and IBM Plex Sans via `next/font/google`, apply tokens at the root -- typography matches the spine everywhere from the start
- [x] `app/page.tsx` -- minimal placeholder rendering the product name in the display token -- smoke-tests that fonts and tokens actually apply
- [x] `components/OverlayProvider.tsx` -- implement shared overlay state and mount it in `app/layout.tsx` -- gives Epic 2 (skill entry point) and Epic 4 (retravail field) a ready mechanism, per AD-8

**Acceptance Criteria:**
- Given a freshly cloned repository, when I run `npm install && npm run dev`, then the app boots on a single process with no errors and no separate services to start
- Given the running app, when I load the placeholder page, then it renders using the `DESIGN.md` tokens (Space Grotesk for the product name, correct background/accent colors) rather than browser defaults
- Given the directory tree, when I inspect it, then `app/ · actions/ · domain/ · skills/ · integrations/{ports,mock}/ · db/` all exist and match the spine
- Given `drizzle.config.ts`, when I inspect its dialect/driver, then it targets `node:sqlite` and the project has no `better-sqlite3` dependency
- Given the `OverlayProvider` mounted at the root, when a component opens an overlay while another is open, then the first closes automatically; when `Escape` is pressed, then the most recently opened overlay closes

## Implementation Notes

- `drizzle-orm`/`drizzle-kit` pinned to `1.0.0-rc.4`, not a GA `0.4x` release: the `drizzle-orm/node-sqlite` driver (the `node:sqlite` adapter the spine requires) only ships on the 1.0 prerelease line. Confirmed via web search and by inspecting the published package. The next story touching `db/` should watch for 1.0 GA and bump then (dependency-only change expected, no code-shape change per Drizzle's own migration notes).
- `next.config.ts` pins `turbopack.root` to silence a Turbopack workspace-root warning caused by an unrelated `package-lock.json` in a parent directory on this machine — not a repo concern, just local-environment hygiene.
- `CONVENTIONS.md` (accessibility + microcopy) was added at repo root even though it wasn't its own line item under Tasks & Acceptance, because the frozen Intent explicitly calls for documenting these conventions in this story for every later story to follow.
- Verified independently (not just from the implementation report): `npx next build` compiles cleanly, `npx tsc --noEmit` is clean under strict mode (after a build/dev run generates `.next/types`, which Next 16's `LayoutProps` helper depends on — expected, not a bug), no `better-sqlite3` package is actually installed (only referenced as one of drizzle-orm's many optional peer-dependency entries, and as an unused subpath export inside `drizzle-orm` itself), and the running dev server serves the placeholder page with the correct fonts/colors (`curl` + page source check).
- Local Node is v23.11.0, not the pinned Node 24 LTS. `node:sqlite` still works (experimental, no flag needed on this version), but this is a local-environment gap the repository itself can't fix.
- Review pass (below) found 8 real `patch`-routed issues; no mechanism was available in this session to re-engage the original implementation subagent by id, so patches were applied directly and re-verified (`next build`, `tsc --noEmit`, and a live browser check of the two `OverlayProvider` behavior additions) rather than round-tripped through it. Changes: removed unused `create-next-app` boilerplate (`public/*.svg`, the now-empty `public/`); added `engines`/`.nvmrc` pinning Node 24; rewrote `README.md` to describe the actual stack/structure instead of the generic template; added `db/migrations/.gitkeep`; added outside-click dismissal and a nested-provider guard to `OverlayProvider.tsx`; added a tripwire comment in `drizzle.config.ts` about `drizzle-kit`'s CLI preferring `better-sqlite3` over `node:sqlite` if both are ever present; synced `sprint-status.yaml` to `review`. Three findings were logged to `deferred-work.md` instead (DESIGN.md token contrast, `.env.local.example`, overlay id collisions) since their root cause or consumer is outside this story.

## Review Triage Log

- **sprint-status.yaml lags spec status** (blind-hunter) — verdict `low`, route `patch`. Verified: `sprint-status.yaml` still reads `in-progress` for this story while the spec is now `in-review`. Trivial one-line sync.
- **`text-muted`/`background` contrast ~2.9:1, `ai-accent-foreground`/`ai-accent` ~4.4:1** (blind-hunter, 2 findings grouped — same root cause) — verdict `medium`, route `defer`. Verified by contrast computation: both fall under the WCAG AA 4.5:1 threshold for normal text. Root cause is the token *values* chosen in `DESIGN.md` (an upstream UX artifact this story must match "exactly," per its own frozen Boundaries) — not an implementation defect. Logged to `deferred-work.md`.
- **`CONVENTIONS.md` omits focus-trap / return-focus for overlays** (blind-hunter) — verdict `low`, rejected. The frozen Intent/AC only commit `OverlayProvider` to auto-close-on-new-open and Escape-close; focus management is a real but separate enhancement whose fix (ref tracking, trap, restore-on-unmount) is more than a direct correction, and round 1's known, sighted, mouse-using test group is unlikely to hit it.
- **Unused `create-next-app` boilerplate assets** (blind-hunter) — verdict `low`, route `patch`. Verified: `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` are never referenced by `app/layout.tsx` or `app/page.tsx`. Trivial deletion.
- **No `engines`/`.nvmrc` pinning Node 24 LTS** (blind-hunter) — verdict `low`, route `patch`. Verified: `package.json` has no `engines` field despite the spec's own Technical Decisions naming Node 24 LTS as pinned, and this session's own dev machine running 23.11.0. Trivial addition.
- **No `.env.local.example` for `ANTHROPIC_API_KEY`** (blind-hunter) — verdict `low`, route `defer`. The frozen Boundaries explicitly exclude `@anthropic-ai/sdk` wiring from this story ("Epic 2's concern") — the env var has no consumer yet. Logged to `deferred-work.md` for Epic 2.
- **`README.md` is unedited `create-next-app` boilerplate** (blind-hunter) — verdict `low`, route `patch`. Verified: still references Geist (unused) and generic Vercel deploy instructions; says nothing about the actual stack, structure, or `CONVENTIONS.md`. Likely to be read by the next contributor (including a future session), so kept despite the non-trivial rewrite.
- **Code Map doesn't mention `AGENTS.md`/`CLAUDE.md`** (blind-hunter) — rejected. Fix would be to edit this spec's own Code Map — out of scope for triage by rule.
- **`db/migrations/` has no `.gitkeep`** (blind-hunter) — verdict `low`, route `patch`. Inconsistent with every other currently-empty layer directory; `drizzle-kit` would create it on first `generate` regardless, but the placeholder is free.
- **`tsc --noEmit` ordering dependency not reflected in Verification section** (blind-hunter) — rejected. Fix would be to edit this spec's own Verification section — out of scope for triage by rule.
- **`OverlayProvider` has no outside-click dismissal** (blind-hunter) — verdict `medium`, route `patch`. Real and foreseeable: the next stories to consume `OverlayProvider` (skill-add entry point, suggestion retravail field) will each want this and would otherwise bolt it on independently, undermining the "single mechanism" point of AD-8. Self-contained, no public API change.
- **`OverlayProvider` id collision across independent callers** (edge-case-hunter) — verdict `maybe-false`, route `defer`. No consumer exists yet in this diff to demonstrate a collision; would be `medium` if it occurred. Logged to `deferred-work.md` — settle once Epic 2/4 add real call sites, by namespacing overlay ids per feature.
- **Nested `OverlayProvider` breaks the single-overlay guarantee** (edge-case-hunter) — verdict `low`, route `patch`. AD-8 mandates exactly one root-level provider and nothing in the plan nests a second, but a one-line guard (throw if a parent `OverlayContext` already exists) is cheap insurance.
- **`drizzle-kit` CLI prefers `better-sqlite3` over `node:sqlite` if both are ever present** (edge-case-hunter, filed as a claim) — verdict `medium`, route `patch`. Verified directly in `node_modules/drizzle-kit/cli.js`: `checkPackage("better-sqlite3")` is tried before `checkPackage("node:sqlite")`, with no config-level override to force the driver. Not triggered today (no `better-sqlite3` installed), but silent and severe if it ever were. Fix: a tripwire comment in `drizzle.config.ts`/`db/client.ts`, not a structural change.
- **`OverlayProvider` AC has no corresponding Verification entry** (verification-gap) — rejected. Fix would be to edit this spec's own Verification section — out of scope for triage by rule. (The behavior was independently exercised manually during implementation via a throwaway test route, per Implementation Notes.)

## Verification

**Commands:**
- `npm install` -- expected: completes without any native build/compile step
- `npm run dev` -- expected: server starts on a single process, no errors in the console
- `npx tsc --noEmit` -- expected: no type errors under strict mode

**Manual checks (if no CLI):**
- Open the placeholder page in a browser: confirm Space Grotesk renders for the product name, IBM Plex Sans for any body text, and the background/accent colors match `DESIGN.md` (navy `#3E4C7C` accent, `#F3F4F8` background) rather than unstyled defaults.
