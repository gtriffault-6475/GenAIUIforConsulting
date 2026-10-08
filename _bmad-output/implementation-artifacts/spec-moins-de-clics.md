---
title: 'Moins de clics — accept all pending suggestions, formatting reminder once per session'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: 'ad69713701805b26ddf160bceb487946a3c5b3fb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-editeur-deux-panneaux.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Going from the AI's suggestions to a saved deck still takes many clicks. Each suggestion is accepted one by one ("Accepter" on every card), and every "Enregistrer dans Drive" asks for the same formatting reminder ("Seul le texte des zones modifiées est réécrit ; leur mise en forme peut être simplifiée.") before writing, even for a consultant who has read it many times.

**Approach:** Owner request (2026-10-08), option C of the livrable editing review. (1) A "Tout accepter" action in the AI panel header applies every pending anchored suggestion in one go, after a short inline confirmation. (2) The formatting reminder before "Enregistrer dans Drive" is asked once per browser session; later saves in that session write directly.

**Owner decisions (2026-10-08):**
- D1 — "Tout accepter" asks an inline confirmation first ("Accepter les N suggestions en attente ? Leur texte remplace celui des paragraphes."), because there is no undo.
- D2 — Only `pending` anchored suggestions whose paragraph still exists are accepted. `revising` ones, global ones and those whose paragraph is gone stay as they are; the outcome says so ("N acceptées. M restent à traiter.").
- D3 — The formatting reminder is skipped after the consultant confirmed it once in the current browser session (closed tab or new session → asked again), for every Drive livrable. It is never skipped forever.
- D4 — Out of scope: automatic save to Drive after an accept, "Tout rejeter", undo.

## Boundaries & Constraints

**Always:**
- "Tout accepter" sits in the AI panel header next to "N en attente", shown only when at least two suggestions can be accepted under D2 (one is "Accepter" on its card). Style `.button-ai-primary` (it applies AI content, DESIGN.md), compact size.
- Confirmation inline under the header (not a modal, AD-8: one floating surface at most): text of D1 with the count, buttons "Tout accepter" (`.button-ai-primary`, autofocus) and "Annuler" (`.button-later`). `Échap` cancels.
- One Server Action `acceptAllSuggestions(livrableId)` → `ActionResult<{ accepted: number; remaining: number }>`, one `db.transaction`: reads the livrable and its `pending` anchored suggestions, applies each with `applyAcceptedSuggestion` in document order, freezes each `resolvedPosition` (as `acceptSuggestion` does), writes the content once and marks them `accepted`. A suggestion that stopped being `pending` meanwhile is skipped, never an error. `remaining` = suggestions still `pending` or `revising` after the run.
- Outcome under the header, `role="status"`: "N acceptées." or "N acceptées. M restent à traiter." Then `router.refresh()` (cards fade, tints go, count updates; on a Drive livrable "Enregistrer dans Drive" becomes enabled).
- Busy guard as in `SuggestionCard.tsx` (ref + `useTransition`); the card buttons are not disabled during the run (the server skips what is no longer pending).
- Formatting reminder (D3): `sessionStorage` key read and written in try/catch; storage unavailable → the reminder is asked every time, as today. Set only when the consultant confirms "Enregistrer" in the reminder. When set, "Enregistrer dans Drive" saves directly; the outcome messages (saved / conflict / error / nothing) are unchanged.
- EXPERIENCE.md: the "Suggestion ancrée" row mentions "Tout accepter"; the "Enregistrer dans Drive" row says the reminder is asked once per session.

**Never:** No change to single-card Accepter / Rejeter / Retravailler, to save conflict detection, or to reimport. No automatic save. No "Tout rejeter", no undo. No DB change. Global suggestions are never applied.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accept all | 5 pending anchored | confirm → 5 paragraphs updated, "5 acceptées." | N/A |
| Mixed | 4 pending, 1 revising, 1 global | button counts 4; "4 acceptées. 2 restent à traiter." | N/A |
| One pending | 1 pending | no "Tout accepter" (card's Accepter) | N/A |
| Race | a card accepted between confirm and run | skipped, counted neither accepted nor remaining | N/A |
| Cancel | "Annuler" or Échap | nothing changes | N/A |
| Server error | transaction fails | nothing applied (one transaction) | "Impossible d'accepter les suggestions. Réessayez." |
| Drive livrable | after accept all | "Enregistrer dans Drive" enabled, slides marked unsaved | N/A |
| First save of the session | reminder not confirmed yet | reminder shown, confirm → save, remembered | N/A |
| Next save | same session, any Drive livrable | saves directly, same outcome messages | N/A |
| Storage blocked | sessionStorage throws | reminder every time | N/A |
| Demo mode | demo livrable | "Tout accepter" works the same; no Drive actions | N/A |

</frozen-after-approval>

## Code Map

- `domain/suggestion.ts` -- `acceptableSuggestions(blocks, suggestions)`: `pending`, anchored, anchor in `blocks`, in document order (reuse `orderSuggestionsByAnchor`). Used by the panel (count, visibility) and the action (same rule both sides).
- `actions/suggestion.ts` -- `acceptAllSuggestions(livrableId)`: one transaction, reuse `applyAcceptedSuggestion` and `resolveAnchorPosition` per suggestion against the blocks before each apply (positions do not change: accept never adds or removes blocks). Do not change `acceptSuggestion`.
- `components/AcceptAllSuggestions.tsx` (new, client) -- button, inline confirmation, Échap, busy guard, outcome, `router.refresh()`.
- `components/SuggestionsPanel.tsx` -- render it in the header with the acceptable count and `livrableId` (new prop, passed by the page).
- `app/livrables/[id]/page.tsx` -- pass `livrableId` to `SuggestionsPanel`.
- `components/DriveLivrableActions.tsx` -- on "Enregistrer dans Drive": if the session key is set, `save()` directly; else show the reminder as today, and its "Enregistrer" sets the key then saves.
- `app/globals.css` -- header button and confirmation layout.
- `_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md` -- the two rows.

## Tasks & Acceptance

**Execution:**
- [x] `acceptableSuggestions` (domain); `acceptAllSuggestions` action.
- [x] `AcceptAllSuggestions` component; panel and page wiring.
- [x] Reminder once per session in `DriveLivrableActions`.
- [x] CSS; EXPERIENCE.md rows.

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.
- Given 4 pending anchored suggestions, 1 revising and 1 global, when the consultant confirms "Tout accepter", then the 4 paragraphs take their proposed text in one write, the 4 cards are accepted with their `¶N` frozen, and "4 acceptées. 2 restent à traiter." is shown.
- Given the formatting reminder was confirmed once in this browser session, when the consultant clicks "Enregistrer dans Drive" again (same or another Drive livrable), then the save starts without the reminder.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | blind, edge | Reminder skipped: a fast double click on "Enregistrer dans Drive" starts two saves (second may report a conflict) | medium | patch — synchronous ref guard in `save()` |
| 2 | blind | "1 restent à traiter" (plural verb in the singular) | low | patch |
| 3 | blind, edge | Nothing accepted after a race → "0 acceptée." | low | patch — "Aucune suggestion à accepter." |
| 4 | blind, edge | Confirmation hidden but `confirming` left true when the count drops below 2; reappears by itself later | low | patch — reset when `canAcceptAll` turns false |
| 5 | blind, edge | `sessionStorage` is per tab, EXPERIENCE.md says per browser session | low | patch — wording "par onglet" (behaviour matches the spec's "closed tab → asked again") |
| 6 | blind | Outcome line stays until the next "Tout accepter" | low | rejected — fix needs a reset rule; the line is accurate at the time it appears |
| 7 | blind | Focus not returned to the trigger after cancel / confirm | low | rejected — the trigger usually disappears after a run; cancel leaves focus in the panel |
| 8 | blind | `role="alertdialog"` on an inline confirmation; two live regions update together | low | rejected — same pattern as the existing Drive confirmations |
| 9 | blind, gap | `{...content, blocks}` vs `{ blocks }` in `acceptSuggestion` | low | rejected — `content` only holds `blocks` (AD-9); no observable difference |
| 10 | blind | `remaining` counted in JS rather than SQL | low | rejected — a handful of rows per livrable |
| 11 | blind | `status = 'pending'` guard on the update is dead inside the synchronous transaction | low | rejected — harmless belt-and-braces |
| 12 | blind | Confirmation count (acceptable) differs from "N en attente" (all pending) | low | rejected — D2: outcome reports what remains |
| 13 | edge, gap | Two pending suggestions on one anchor → first text overwritten, count inflated | false | unique index `suggestion_livrable_id_anchor_ref_pending_anchored_unique` forbids it |
| 14 | edge | Client count ignores `type`, server filters `anchored` | false | global suggestions have `anchorRef` null, already excluded on both sides |
| 15 | gap | Reminder flag set before the save result | low | rejected — the flag records that the reminder was read, not that the save succeeded |
| 16 | gap | No automated tests for `acceptableSuggestions`, `acceptAllSuggestions`, the session reminder | — | defer — no test runner (project decision) |
| 17 | gap | Pre-existing `package.json` / lock changes in the tree | — | rejected — not part of this change, left out of the commit |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success (in a scratch copy if the owner's dev server holds `db/local.db`).

**Manual checks:**
- Scratch: `acceptableSuggestions` (pending only, anchored, anchor present, document order).
- Action on a scratch SQLite: mixed set → accepted / remaining counts, content written once, `resolvedPosition` frozen, a suggestion made non-pending before the run skipped, a failure mid-run leaves nothing applied.
- Browser (production build, demo mode and a Drive livrable with stubbed Google): button visibility (≥ 2), confirm / cancel / Échap, outcome, cards and count after refresh; reminder first save only, again after a new session, every time with storage blocked.

**Results (2026-10-08):** tsc clean; fresh-db build OK (scratch copy, the owner's dev server holds `db/local.db`). Scratch: `acceptableSuggestions` (pending, anchored, anchor present, document order). Action on a scratch SQLite: 4 pending + 1 revising + 1 global → 4 accepted, 2 remaining, paragraphs updated, `resolvedPosition` frozen, revising and global untouched; a card accepted just before the run skipped; a failure forced mid-run leaves nothing applied; second run 0 accepted; missing livrable → error. Browser (production build, scratch copy, stubbed Google): button with 4 acceptable, Échap and Annuler cancel, outcome, cards accepted after refresh, button gone, "Enregistrer dans Drive" enabled with the slide marked unsaved; reminder on the first save, skipped on another Drive livrable in the same tab, every time with storage blocked; local livrable works the same. Review patches 1–5 applied after; tsc and build re-run. Demo mode and a real Google save not exercised.
