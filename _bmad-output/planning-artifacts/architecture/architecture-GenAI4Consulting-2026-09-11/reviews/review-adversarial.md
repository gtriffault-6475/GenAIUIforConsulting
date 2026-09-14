---
name: 'GenAI4Consulting — Adversarial Review of ARCHITECTURE-SPINE'
type: review
target: _bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
method: adversarial (concrete incompatible-but-compliant unit pairs)
---

# Adversarial Review — ARCHITECTURE-SPINE (GenAI4Consulting)

Method: for each hole below, two (or more) units one level down are constructed that each satisfy every AD-1..AD-8 and every Consistency Convention to the letter, yet produce incompatible systems. Each hole ends with a proposed fix (new AD, tightened AD, or new convention row).

---

## H1 — `activeStepKey = null` is overloaded between "nothing selected" and "a mission conversation is open"

**Where:** ERD comment on `PROJECT.activeStepKey` ("nullable, quelle conversation est affichée — voir AD-6") + AD-6.

AD-6's rule text: `activeStepKey` "ne fait que suivre quelle étape est actuellement affichée." It never says what `activeStepKey` should be set to when the *displayed* conversation is a mission conversation (`stepKey = null`, per FR-15 / AD-6's own last sentence). Literally, "the step currently displayed" for a mission conversation is... nothing — so `null` is the only value available. But `null` is also the natural default before any step has ever been clicked (fresh project).

**Pair that collides:**
- **Component A** — workspace shell on project load: `if (project.activeStepKey === null) render <PickAStepEmptyState />`. Compliant: it literally follows "activeStepKey suit quelle étape est affichée," and null looks like "no step displayed yet."
- **Server Action B** — `openMissionConversation(conversationId)`: sets `project.activeStepKey = conversation.stepKey` (i.e. `null`) after opening it, because AD-6 says activeStepKey tracks the displayed conversation's step, and a mission conversation's step is null. Compliant with the same sentence.

Result: opening a mission conversation and reloading the workspace re-triggers Component A's empty state instead of re-opening the mission conversation — two units, each individually a correct reading of AD-6, produce a dead end for FR-15 that neither author will notice in isolation.

**Fix:** Add a third state that is *not* `null`, e.g. a sentinel `activeStepKey = '__mission__'` (or split into two fields: `activeConversationId` + a derived "which step is highlighted"). AD-6 should say explicitly what value `activeStepKey` takes when a non-stepper conversation is displayed, distinct from "no conversation ever opened."

---

## H2 — No uniqueness constraint on `(projectId, stepKey)` for CONVERSATION, so "the" step conversation can multiply

AD-6: "Cliquer une étape trouve-ou-crée la conversation portant ce `stepKey` pour le projet actif." This presumes exactly one conversation per `(projectId, stepKey)` pair, but the Structural Seed declares no unique index for it (only the `SUGGESTION (livrableId, anchorRef)` partial index is listed in Consistency Conventions).

**Pair:**
- **Server Action A** (`actions/conversation.ts::openStep`) implements find-or-create as `SELECT ... WHERE projectId=? AND stepKey=? LIMIT 1; if none, INSERT`, trusting a DB constraint to make this safe, and never checks for a second matching row.
- **Server Action B**, written independently for a "reset step" admin/debug action (or a retry path after a failed generation), does `INSERT INTO conversation (projectId, stepKey, ...)` directly without checking for an existing row first, because nothing in the schema forbids it and the spine never states "at most one conversation per (project, non-null stepKey)" as an invariant.

Both are literal compliant readings of AD-6 (neither one contradicts the text), but together they can produce two conversations with the same `stepKey`, at which point "trouve-ou-crée" in A becomes non-deterministic (`LIMIT 1` picks whichever row a future query happens to return first).

**Fix:** State the invariant explicitly and back it with a real constraint: unique index on `CONVERSATION (projectId, stepKey) WHERE stepKey IS NOT NULL`, added to the Consistency Conventions table alongside the suggestion-uniqueness row.

---

## H3 — `anchorRef` has no defined representation, and it is load-bearing for the uniqueness index

The ERD comment says `anchorRef` is "paragraph id," but there is no `PARAGRAPH` entity anywhere in the schema — `LIVRABLE.content` is a single opaque string. Nothing says how a "paragraph id" is computed, so nothing says whether it is stable across edits.

**Pair:**
- **`skills/propose_livrable_content.ts`** (the tool that creates suggestions per AD-3) implements `anchorRef` as a **0-based positional index** into `content.split('\n\n')` at generation time — cheap, obvious, matches "paragraph id" read as "which paragraph, by position."
- **`actions/suggestion.ts`** (or the editor component resolving an existing suggestion back onto the rendered document) implements anchor resolution assuming `anchorRef` is a **content-derived stable id** (e.g. a hash of the paragraph's original text), because that's the only interpretation that survives point (4) below and matches "id" rather than "index" in the comment.

Both readings are individually consistent with the one-line ERD comment. They produce genuinely different systems:
- If a user edits the livrable and a paragraph is inserted above an existing pending suggestion's anchor, the **index-based** producer's anchors silently point at the wrong paragraph after the shift — but the **partial unique index** `(livrableId, anchorRef) WHERE status='pending'` then also lets two *different* logical paragraphs collide on the same numeric `anchorRef` post-shift, either wrongly blocking a new legitimate suggestion or wrongly treating two distinct paragraphs as "the same anchor."
- If a suggestion's own acceptance rewrites the paragraph text it targets, a **hash-based** anchor is invalidated by the very edit the suggestion caused, breaking any other pending suggestion anchored to that same paragraph.

Neither AD-3, AD-5, nor the Consistency Conventions table says which of these `anchorRef` is, nor what happens to existing pending anchors when paragraph count/order changes.

**Fix:** Add an AD (or tighten AD-3) that defines `anchorRef` concretely — e.g. "a stable paragraph id is assigned once, embedded in `LIVRABLE.content`'s structure (not derived from position), and never recomputed"; and state what happens to a pending suggestion whose anchor paragraph is deleted/merged by a later edit (auto-reject? orphan left visible?).

---

## H4 — AD-4 fixes skill *storage* shape but not the tool-calling *contract*, and `PROJECT_SKILL` allows multiple skills' tools to collide in one Messages API call

`PROJECT ||--o{ PROJECT_SKILL : loads` means several skills can be active on one project simultaneously, and per the Design Paradigm diagram, `skills/` is where `@anthropic-ai/sdk` calls happen — implying all active skills' tool definitions are merged into one `tools` array for a single conversation turn.

**Pair:**
- **`skills/catalog.ts` entry "qualification"** defines a tool named `search` with `input_schema: { query: string }`.
- **`skills/catalog.ts` entry "references"** (a second, independently authored skill) also defines a tool named `search`, but with `input_schema: { keyword: string, sourceType: 'expert'|'reference' }`.

AD-4's rule ("chaque skill est une constante TypeScript... outil `@anthropic-ai/sdk` associé le cas échéant") is satisfied by both — nothing in AD-4 requires tool names to be namespaced or unique across the catalog. When both skills are loaded on the same project (a plausible, even likely, round-1 scenario — nothing prevents a project from loading two skills that both want to offer "search"), the merged `tools` array sent to the API has two entries with the same `name` and incompatible schemas — undefined/last-write-wins behavior in the SDK, and the model cannot reliably tell them apart.

Separately: `PROJECT_SKILL` has no declared primary key or unique constraint on `(projectId, skillKey)` in the Structural Seed (every other entity has `string id PK`; this one doesn't), so nothing stops the same skill being attached twice, doubling its tool definition in the same call.

**Fix:** Add to AD-4 (or a new AD) a namespacing rule — e.g. tool names are always prefixed by `skillKey` (`${skillKey}__search`) — and add a unique constraint `(projectId, skillKey)` on `PROJECT_SKILL` to the Consistency Conventions table.

---

## H5 — AD-4 doesn't say whether the "outil associé" includes its *handler* (which would violate AD-2)

AD-2: only `actions/` may import `db/`. AD-3: the anchored suggestion must be "persistée avant que la réponse ne soit renvoyée à l'UI," in "le même appel outil qui crée ou modifie le contenu." AD-4 only fixes where the tool's *schema* lives (`skills/catalog.ts`); it says nothing about where the tool's *execution* (the code that runs when Claude emits a `tool_use` block and that decides what to persist) lives.

**Pair:**
- **Contributor A** implements `skills/propose_livrable_content.ts` as containing both the tool schema *and* a handler function that, on `tool_use`, directly calls `db.insert(suggestion)...` — natural, since AD-3 says persistence happens "in the same tool call," and the tool's own file is the obvious place to put "what this tool does." This satisfies AD-4's storage-shape rule but violates AD-2's file-import rule (`skills/` now imports `db/`).
- **Contributor B** implements the same feature keeping `skills/propose_livrable_content.ts` pure (schema + a function that only *returns* parsed suggestion data), with `actions/conversation.ts` doing the actual `db.insert(...)` after receiving the tool's parsed output. This satisfies both AD-2 and AD-4.

Both contributors can point to AD-4's text as license for their placement, because AD-4 never states "the tool's *handler* must live in/be called from `actions/`, only its schema and instructions live in `skills/catalog.ts`." A codebase built by both ends up with two different patterns for "what a skill's tool does when invoked," one of which silently breaks AD-2.

**Fix:** Tighten AD-4 (or AD-2) with one sentence: "A skill's tool schema and prompt text live in `skills/`; a skill's tool *handler* returns data only and never imports `db/` — the calling Server Action in `actions/` performs all persistence."

---

## H6 — "Suggestion proactive" (AD-7) and `SUGGESTION` (ERD, AD-3/AD-8) are two different things wearing the same name, with no schema for the first

AD-7 binds FR-17/FR-18 (workflow/stepper) and describes client-side state for a "suggestion proactive" keyed by `conversationId`. The `SUGGESTION` entity in the ERD belongs to `LIVRABLE` (`LIVRABLE ||--o{ SUGGESTION`), is bound to FR-19/20/24 (editor) via AD-3, and has no `conversationId` field at all — and a `LIVRABLE.conversationId` is itself **nullable** (global-revision case), so for some livrables there is no `conversationId` to key AD-7's client state by even if the two concepts were the same entity.

**Pair:**
- **`StepperPanel.tsx`**, built by Contributor A against AD-7's text alone, invents its own transient shape: `Map<conversationId, { dismissed: boolean }>` for a stepper-level "next step" nudge that has zero DB representation — a proactive suggestion that is pure UI copy, never touching `SUGGESTION` at all.
- **`EditorSuggestionList.tsx`**, built by Contributor B against AD-3/AD-8/the ERD, reads `SUGGESTION` rows filtered by `status='pending'` joined through `livrableId → LIVRABLE.conversationId`, and treats AD-7's "masquée/acceptée en mémoire" language as describing *this* list's hide/reject interaction — building a client cache keyed by `conversationId` that tries to shadow `SUGGESTION.status` transitions for livrables whose `conversationId` is `null` (global-revision livrables), which has no key to live under.

Both readings are defensible from the text alone (AD-7 never says "this is unrelated to the `SUGGESTION` table" nor "this is the same thing as `SUGGESTION`"), and they lead to genuinely different, non-interoperable client-state designs — one with no persistence-layer counterpart, one that tries to map an entity keyed by `livrableId` onto a cache keyed by `conversationId` that doesn't always exist.

**Fix:** Rename one of the two concepts, and state explicitly in AD-7 (or AD-3) whether "suggestion proactive" is the `SUGGESTION` table's UI-side visibility cache or an unrelated, unpersisted stepper nudge. If it's unrelated, give it its own one-line data-shape convention (even just "a `Map<conversationId, Set<dismissedSuggestionId>>` in a single context provider," mirroring AD-8's single-owner pattern) so two components don't each invent their own.

---

## H7 — AD-8's "surface flottante" doesn't say whether an inline expand counts, so two floating-surface features can still stack

AD-8's rule bans "un composant [qui] détient son propre booléen `isOpen` pour **une surface plein-écran ou superposée**." It binds FR-11 (add-skill) and FR-21 (retravailler). It does not define the boundary of "surface flottante" — specifically whether an inline expand/collapse (not full-screen, not necessarily "superposée" in the z-index sense) counts.

**Pair:**
- **`SuggestionCard.tsx`** implements "retravailler" (FR-21) as an inline `<textarea>` that expands within the card's own layout flow (pushes content down, no overlay/backdrop, no fixed positioning) — and keeps a local `const [isRevising, setIsRevising] = useState(false)`. This is a defensible reading of AD-8: it's not "plein-écran," and arguably not "superposée" since nothing is layered on top of other content.
- **`AddSkillButton.tsx`** implements "ajouter une skill" (FR-11) as a floating popover (`position: fixed`, backdrop) and correctly routes it through the shared `OverlayProvider.openOverlay('add-skill')`, per AD-8's letter.

Both components are individually AD-8-compliant under a literal parse. But now a user can have `SuggestionCard`'s inline retravailler box open **and** click "ajouter une skill," and `openOverlay('add-skill')` has no way to know about or close the inline box, since it was never registered with `OverlayProvider`. Two things end up open at once — exactly the outcome AD-8 exists to prevent, produced by two components that each individually satisfy AD-8's text.

**Fix:** Replace "plein-écran ou superposée" with an exhaustive/closed list of what counts as a "surface flottante" (e.g., "anything that is not always-visible in the component's default layout — including inline expand/collapse — must register with `OverlayProvider`"), or explicitly carve out inline expansions as exempt and say so.

---

## H8 — Error-shape convention and the string-localization convention contradict each other

Consistency Conventions: Server Action errors return `{ ok: false, error }` (no type given for `error`). Naming convention: "toute chaîne visible par l'utilisateur en français, jamais codée en dur hors de `components/`."

**Pair:**
- **`actions/livrable.ts`** returns `{ ok: false, error: "Le livrable n'a pas pu être trouvé." }` — a hardcoded French string, generated inside `actions/`, not `components/`. This satisfies the error-shape convention exactly as written (`error` is present, action returns no uncaught exception) but violates the string-localization convention literally.
- **`actions/suggestion.ts`**, written by a contributor who takes the naming convention seriously, returns `{ ok: false, error: 'NOT_FOUND' }` (a code, not a display string), leaving the French text to be looked up inside `components/`. This satisfies the naming convention but now the generic error-rendering component (built against the first action's shape) displays the raw code `NOT_FOUND` to the user instead of a sentence, or a generic "[object Object]" if a third action returns `{ code, message }`.

Every action individually complies with one convention or the other; no single Server Action violates anything in isolation, but the two actions are not interoperable through one shared error-display component, which the "jamais d'exception non attrapée remontant à l'UI" framing implies should exist.

**Fix:** Pin the `error` field's exact type in the Consistency Conventions table (e.g. `error: { code: string }` with display-string mapping living in `components/`, or explicitly bless plain French strings from `actions/` as the one exception to the naming convention).

---

## H9 — SQLite treats `NULL` as distinct in unique indexes, so the "unicité suggestion active" convention silently does not hold for `type='global'`

Consistency Conventions: "Index unique partiel SQLite `(livrableId, anchorRef) WHERE status = 'pending'` — une seule suggestion en attente par paragraphe." For `type='global'`, `anchorRef` is `NULL` ("vide si type=global," per the ERD). In SQLite (and standard SQL), `NULL <> NULL` for uniqueness purposes — a unique index does not treat two `NULL`s as duplicates, so this index places **no limit at all** on how many pending `type='global'` suggestions a single livrable can have.

**Pair:**
- **Contributor A**, implementing "revoir tout le document" (global revision, FR-21/OQ-4 area), assumes the stated DB index enforces "one active suggestion at a time" uniformly (the table's prose doesn't call out the global case as an exception), and does not add an application-level check before creating a new global suggestion.
- **Contributor B**, implementing the chat flow that can also trigger a global revision suggestion from a different entry point, makes the same assumption independently.

Both ship. Nothing breaks the schema, and both trust the documented index. In production, a livrable can accumulate multiple simultaneous pending global suggestions, which likely contradicts `EXPERIENCE.md`'s single-active-suggestion UX assumption (only one revision surface should be live) — a gap the Consistency Conventions table's own row creates by implying blanket coverage it doesn't provide.

**Fix:** Either (a) note explicitly in the Consistency Conventions row that the DB index does not cover `type='global'` and require an application-level (domain/) check for at-most-one-pending-global-per-livrable, or (b) use a sentinel non-null `anchorRef` for global suggestions (e.g. `'__global__'`) so the existing index covers both cases uniformly.

---

## H10 — AD-1's port boundary can be over-read to force *manual* Document creation through the DriveProvider mock

AD-1: "`actions/` et `domain/` n'accèdent à Octopod/drive/Mattermost qu'au travers des interfaces... Aucun accès direct à un adaptateur concret ailleurs que dans le point de câblage." `DOCUMENT.source` can be `'drive'` or `'manual'`. The Capability → Architecture Map does not list `DOCUMENT` under any feature row at all (no `actions/document.ts`, no owning AD), so a contributor has to infer where manual-document creation lives from AD-1 alone.

**Pair:**
- **Contributor A** reads AD-1 strictly: "the only sanctioned way project data that looks like drive content gets into the system is `DriveProvider`," and — since `Document` is the entity that models drive content — routes the manual "paste/upload a document" flow through `integrations/mock/drive.ts` too (tagging the result `source: 'manual'` after the fact), reasoning that this keeps a single ingestion path and stays inside AD-1's letter (it never calls a *different* concrete adapter directly; it just reuses the sanctioned one).
- **Contributor B** reads AD-1 as scoped to genuinely external systems only, and implements manual document creation as a plain `db.insert` in a new `actions/document.ts` with no port involved at all, since there is nothing external to abstract for user-typed content.

Both are compliant with AD-1's literal text (neither adds a second concrete-adapter access point outside the wiring file). But A's documents silently depend on `DriveProvider`'s mock shape (e.g. inherit a fake `folderPath` the mock always assigns) while B's never do — so `folderPath` ends up populated for *some* manual documents and always `null` for others depending on which contributor's code path is hit, and any later code that branches on `source === 'manual' ⇒ folderPath is null` (a very natural assumption, since the ERD calls `folderPath` "mocked, no real tree" specifically in the drive-import context) breaks on Contributor A's documents.

**Fix:** Add `DOCUMENT` to the Capability → Architecture Map with an explicit owner (`actions/document.ts`) and state in AD-1 (or a new short rule) that `source: 'manual'` creation is a direct `db` write with no port involved, while only `source: 'drive'` content is ever produced by `DriveProvider`.

---

## Summary Table

| # | Hole | Type |
| --- | --- | --- |
| H1 | `activeStepKey = null` ambiguous between "unset" and "mission conversation open" | Ambiguous Rule / missing state |
| H2 | No unique constraint backing "the" conversation per (project, stepKey) | Missing enforcement mechanism |
| H3 | `anchorRef` representation (index vs stable id) undefined; interacts badly with edits + unique index | Ambiguous Rule / clashing data shape |
| H4 | Tool name collisions across skills loaded on the same project; `PROJECT_SKILL` has no unique key | Missing enforcement mechanism |
| H5 | AD-4 doesn't say whether a skill's tool *handler* may live in `skills/`, letting it violate AD-2 | Conflicting AD interpretation |
| H6 | "Suggestion proactive" (AD-7) vs `SUGGESTION` entity (ERD/AD-3) — same word, undefined relationship | Naming collision / missing data shape |
| H7 | "Surface flottante" (AD-8) doesn't define inline-expand as in/out of scope | Ambiguous Rule |
| H8 | Error-shape convention vs string-localization convention contradict on where error text lives | Real trade-off the conventions table doesn't settle |
| H9 | SQLite NULL semantics silently defeat the stated uniqueness guarantee for `type='global'` | Missing enforcement mechanism |
| H10 | AD-1 boundary can be over-read to force manual Document creation through DriveProvider mock | Ambiguous Rule / clashing data shape (`folderPath`) |
