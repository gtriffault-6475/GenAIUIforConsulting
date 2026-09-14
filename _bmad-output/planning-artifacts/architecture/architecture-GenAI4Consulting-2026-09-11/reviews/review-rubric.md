---
title: Rubric Review — ARCHITECTURE-SPINE.md (GenAI4Consulting)
reviewed: 2026-09-14
target: _bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
cross-checked-against: _bmad-output/planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md
---

# Verdict

The spine is well-constructed and internally disciplined — its 8 ADs are each traceable to a concrete divergence risk, the ERD is coherent, and the Deferred section is mostly honest about what round 1 excludes — but it has one clear precision slip against its own stated standard (an unpinned dependency version) and, more importantly, leaves the core mechanic of its flagship differentiating feature (anchored suggestions in the Éditeur assisté) without an AD, plus defers the architecture of an in-scope FR (révision globale, FR-23) to an open question instead of deciding it. These are exactly the kind of gaps this rubric is designed to catch: a solo builder hitting either one will have to invent a contract mid-build, with no spine text to check against.

# Checklist Walkthrough

## 1. Fixes the real divergence points for the level below

Mostly yes. AD-1 through AD-8 correctly target real, concrete divergence points a solo builder would otherwise hit (integration boundary, mutation path, suggestion-generation timing, skill storage shape, domain purity, conversation/stepper linkage, proactive-suggestion persistence, overlay stacking). These are not generic architecture platitudes — each has a specific "Prevents" scenario that reads as something that could actually happen.

However, several real divergence points for this exact codebase are **not** covered by any AD or convention:

- **Paragraph anchoring for suggestions is unspecified.** `SUGGESTION.anchorRef` is documented as "paragraph id" and `LIVRABLE.content` is a bare string column. Nothing defines how a paragraph acquires a stable id inside that string, nor how accepting a suggestion mutates `content` at that anchor. This is the literal mechanism of FR-19–FR-22 (the "climax" of both UJ-1 and UJ-2, and the product's core differentiator per the PRD's own framing). The write side (`skills/propose_livrable_content.ts`, which must emit an `anchorRef`) and the read/render side (the Éditeur assisté UI, which must resolve that `anchorRef` back to a location in rendered content) can easily settle on incompatible schemes (e.g., sequential index vs. embedded marker vs. heading-derived id) with nothing in the spine to catch the mismatch. This is precisely the class of problem AD-3 through AD-8 exist to prevent, just one mechanism further down — and it's the one that would be most expensive to discover late, since it's the crux of the differentiator.
- **No rule governs how a Messages API call is assembled at runtime.** The directory listing says `skills/` holds "catalogue de skills + appels @anthropic-ai/sdk," and AD-4 fixes *where skills are stored*, but nothing says how conversation history (`MESSAGE` rows) is serialized into the API call, how multiple loaded skills' instructions combine into one system prompt (concatenated? one active skill at a time? all tools always available?), or how the model selector (FR-12) composes with skill/tool availability. This underlies the entire "multi-agent workspace" feature (4.2, FR-7–FR-12) and is left to be invented ad hoc.
- **"Active project" has no representation.** FR-1 requires selecting among projects, with switching replacing the entire workspace. `PROJECT.activeStepKey` tracks the active *step within* a project (per AD-6), but nothing tracks which *project* is currently active for the single round-1 user — not a DB field, not a documented client/session mechanism. Given the spine was careful enough to invent `activeStepKey` for the analogous step-level problem, the absence of its project-level counterpart looks like an oversight rather than a deliberate choice.
- **FR-17's proactive-suggestion generation mechanism is unaddressed.** AD-3 explicitly rules out a synchronous AI call when the Éditeur assisté opens (to protect perceived immediacy per FR-24's NFR). FR-17's proactive suggestion, shown when a project or workflow step opens, is structurally the same kind of event and carries the same immediacy risk (per EXPERIENCE.md's climax framing for UJ-1) — but there's no equivalent rule saying whether its text is generated synchronously, precomputed, or templated per step key.

## 2. Every AD's Rule is enforceable and prevents its divergence

All 8 rules pass: each names concrete files/modules/fields and a checkable behavior (e.g., "only `actions/` imports `db/`," "`domain/` never imports `db`/`integrations`/`actions`/React," "a partial unique index enforces one pending suggestion per paragraph"). None rely on subjective judgment calls. None are automated (no lint/dependency-cruiser rule is specified for the import-boundary ADs — AD-1, AD-2, AD-5), but for a solo-builder spine at this altitude, a rule that is mechanically checkable by grep/review is a reasonable bar, and all of them clear it. No finding here.

## 3. Nothing under Deferred could let two units diverge

One clear violation: **"Comportement du retour de la révision globale (OQ-4)"** is listed under Deferred, but the PRD's §6.2 Out-of-Scope list for MVP does *not* include révision globale — FR-23 is explicitly in scope for round 1 (feature 4.4). The spine fixes the *data shape* (`SUGGESTION.type = 'global'`, never auto-creates an anchored suggestion) but explicitly punts the *behavior* — what actually happens after a consultant submits a global revision request — to an open question. Since FR-23 must ship in round 1, this is a deferred item that is actually load-bearing now, not a genuinely-later concern. Two build sessions (or a solo builder revisiting this months apart) could implement "post a message to the origin conversation" vs. "silently create a new anchored suggestion" vs. "surface a toast with no persisted trace" — all equally consistent with the spine as written.

The rest of the Deferred section holds up: real integrations (AD-1 makes this a swap, not a rewrite), skill-add mechanism (AD-4 fixes the storage shape), qualification method/reference data source (genuinely just missing content, not a structural fork), mission workflow (PRD itself defers this, `stepKey` staying `null` is a real no-op), and auth/multi-user/deployment (explicitly out of scope with a stated corollary about FR-9/FR-10 having no enforcement mechanism yet — an honest admission rather than a silent gap).

## 4. Named tech is verified-current / stated with precision

Mostly fine, one violation matching the exact anti-pattern the review brief calls out: the Stack table gives `Next.js 16.x`, `React 19.x`, `@anthropic-ai/sdk 0.124.x` — all pinned to a meaningful precision — but lists **`Drizzle ORM + better-sqlite3 | current`**. "current" is functionally identical to "latest," which is the literal example of what not to do. Drizzle has had breaking changes across versions; a build today and a rebuild in three months could land on incompatible schema/query APIs with nothing in the spine to say which one is "correct." `TypeScript ≥ 5.0` is a floor rather than a pin, which is a much smaller risk (TS is largely additive across minors) but is also less precise than its neighbors.

## 5. Greenfield

Skipped per instructions (no existing codebase to ratify).

## 6. PRD capability coverage

All 4 PRD features (§4.1–4.4) have a row in the Capability → Architecture Map, each pointing at real files and at least one governing AD. Spot-checking FR-level coverage:

- 4.1 (Connexion à un projet Octopod, FR-1–FR-6): covered by `actions/project.ts` + `integrations/mock/*` + AD-1. Adequate — FR-3/FR-4 (Contexte panel, document add) don't get their own file/cluster mention but are small enough to reasonably live inside the project action cluster.
- 4.2 (Espace de travail multi-agents, FR-7–FR-13): covered by `actions/conversation.ts` + `skills/` + AD-2/AD-4. As noted in §1 above, the runtime composition of skills+history+model into an actual API call is unaddressed, and FR-12's "closed list of models" has no stated home (no analogue to `skills/catalog.ts` for the model list) — a minor sibling gap to the skills-catalog pattern.
- 4.3 (Orchestrateur de workflow, FR-14–FR-18): covered by `domain/workflow.ts` + `actions/conversation.ts` + AD-5, with AD-6/AD-7 filling in the stepper-conversation link and proactive-suggestion persistence. Adequate, modulo the FR-17 generation-timing gap noted in §1.
- 4.4 (Éditeur assisté, FR-19–FR-24): covered by `actions/livrable.ts`, `actions/suggestion.ts`, `domain/suggestion.ts`, `skills/propose_livrable_content.ts` + AD-3/AD-5/AD-8. This is where the paragraph-anchoring gap (§1) lives — the feature has the most architectural attention (three ADs) yet still misses the one mechanism that makes "anchored" suggestions anchored.

No feature is entirely unhomed. The gaps are inside otherwise-covered features, not missing rows.

## 7. No parent spine inherited

Skipped per instructions.

## 8. Every dimension this altitude owns is decided/deferred/open — especially operational envelope

Deployment/hosting/environment **is** explicitly stated, not silent: "round 1 est mono-poste, mono-utilisateur, sans serveur à déployer (décision explicite avec l'utilisateur)," with a named corollary that FR-9/FR-10 (privacy, team-sharing of livrables) have no enforcement mechanism yet as a direct consequence. This is a legitimate, minimal-but-real decision for a round-1 local prototype and it passes the bar of "stated, not absent." It is terse — it doesn't say how the SQLite file is located/backed up, or confirm whether "mono-poste" means each tester runs a fully separate local checkout with separate data (implied but never said outright) — but the core call (no server, no multi-tenant deploy) is made and its consequences are traced through to the FRs it affects. Not a top finding, but worth tightening if the round-1 test-group logistics (multiple testers, presumably each on their own machine) are ever questioned.

Other dimensions this altitude should own: naming/identifiers/error-shape/config conventions are all present in the Consistency Conventions table. Testing/CI is explicitly deferred with a reasonable rationale (round 1 is a solo-built prototype, not multiple independently-built units where test-strategy divergence would bite). No dimension is left silent.

# Findings (ranked)

1. **[Missing AD] Anchored-suggestion addressing mechanism is undefined.** `SUGGESTION.anchorRef` ("paragraph id") has no rule for how paragraph ids are assigned inside `LIVRABLE.content`, nor how an accepted suggestion is applied back into that content. This is the core mechanism of the product's differentiating feature (FR-19–22) and sits exactly at the seam between the AI-writing side (`skills/propose_livrable_content.ts`) and the UI-rendering side — the two could diverge on the addressing scheme with nothing in the spine to catch it.

2. **[Deferred item is load-bearing] Révision globale (FR-23) behavior punted to OQ-4, but FR-23 is in scope for round 1** per PRD §6.2 (not in the Out-of-Scope list). The spine fixes the data shape but defers the actual behavior after submission, which must nonetheless be built now.

3. **[Precision] Stack table lists "Drizzle ORM + better-sqlite3 | current"** instead of a pinned version — the exact "latest"-style imprecision the rest of the table (and this review's own brief) calls out as insufficient, inconsistent with the pinned `Next.js 16.x` / `React 19.x` / `@anthropic-ai/sdk 0.124.x` rows next to it.

4. **[Gap] No rule for assembling the Messages API call at runtime** — how `MESSAGE` history is serialized, how multiple loaded skills' instructions combine into one system prompt, and how model selection (FR-12) interacts with skill/tool availability. AD-4 fixes skill storage but not skill composition at call time, even though this underlies the entire multi-agent workspace feature.

5. **[Gap] No representation for "active project" (FR-1).** `PROJECT.activeStepKey` (AD-6) tracks the active step within a project but nothing tracks which project is currently active — no DB field, no stated client/session mechanism — despite the spine having already solved the structurally identical problem one level down.

Minor, not ranked separately: FR-17's proactive-suggestion generation timing has no rule analogous to AD-3 (risk of the same "breaks perceived immediacy" problem AD-3 was written to prevent, for a sibling feature); FR-12's "closed list of models" has no stated home comparable to `skills/catalog.ts`.
