---
title: 'Éditeur sur deux panneaux — document and AI panel side by side, linked both ways'
type: 'feature'
created: '2026-10-08'
status: 'ready-for-dev'
baseline_commit: 'c350ff29475c2860712779837055b20802b91a7a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Working through the AI's suggestions on a livrable is slow. The editor stacks everything in one 660px column: the document on top, the suggestion cards below it, the global revision at the very bottom. A card says "¶12", but the paragraphs show no number, so the consultant counts paragraphs, scrolls up to read the target, then scrolls down to accept. The card shows only the proposed text, never what it replaces. EXPERIENCE.md and the editor mockup (`imports/Editor.dc.html`) already describe suggestions "en marge" in a side panel; Story 4.2 deferred that and it was never done.

**Approach:** Owner request (2026-10-08), option B of the livrable editing review. The editor becomes two panes, as in the mockup: the document on the left, scrolling on its own; the AI panel on the right (suggestions, then the global revision pinned at its bottom), always visible. Each paragraph shows its `¶N` marker. Clicking a card's marker brings its paragraph into view and highlights it; clicking a targeted paragraph's marker brings its card into view. A pending card shows the current text (struck through) above the proposed text.

**Owner decisions (2026-10-08):**
- D1 — This spec keeps the document as text (slide-grouped for Drive livrables). A visual preview of the real slides (embedded Slides or thumbnails) is a separate spec, after a technical check: an embedded Google Slides frame may be blocked by the browser's third-party cookie rules, thumbnails cost Slides API reads.
- D2 — Cards are listed in document order (by `¶N`), suggestions whose paragraph cannot be resolved last. Resolved cards stay in place, faded, as today.
- D3 — The before/after view is on `pending` and `revising` cards only; `accepted`/`rejected` cards keep their current compact display (the paragraph already holds the accepted text).
- D4 — Below 1100px wide, the two panes stack back into one column (document, then AI panel), with the same markers and links.

## Boundaries & Constraints

**Always:**
- Layout (≥ 1100px): full-width header (breadcrumb, title, Drive actions and banner from "Ouvrir dans Google Slides") above two panes filling the viewport height. Left pane: the document card, own scroll, readable width (max 720px). Right pane: fixed width (about 380px), header "Suggestions de l'IA" with "N en attente", own scroll for the cards, `GlobalRevisionField` pinned at the bottom.
- Every paragraph shows its `¶N` in the left margin (`resolveAnchorPosition` numbering, `text-caption` muted). Drive livrables keep their "Diapositive N" groups; numbering runs across slides as today.
- Card → paragraph: the card's `¶N` is a button ("Voir le paragraphe ¶N"). It scrolls the paragraph to the centre of the left pane (smooth, instant under `prefers-reduced-motion`) and gives it a short highlight (outline, about 2s), never a colour-only cue for screen readers (focus moves to the paragraph, `tabIndex={-1}`).
- Paragraph → card: on a paragraph targeted by a `pending`/`revising` suggestion, the `¶N` marker is a button ("Voir la suggestion pour ¶N") that scrolls the card into view in the right pane, highlights it the same way and moves focus to it. Other markers are plain text.
- Before/after (pending, revising): current paragraph text in `text-muted` struck through (`<del>`), then the proposed text (`<ins>`, no underline); labels "Actuel" / "Proposé" readable by screen readers. A global suggestion (no anchor) or an unresolved anchor shows the proposed text only.
- Empty AI panel: "Aucune suggestion pour le moment. Demandez une révision ci-dessous." (today the panel renders nothing).
- Pure helpers in `domain/` (ordering, pending count); scrolling and highlight in a small client component, located by DOM ids (`block-{id}`, `suggestion-{id}`) — no shared React state across the server page.
- EXPERIENCE.md updated: the "Suggestion ancrée", "Diapositives dans l'éditeur" and "Révision globale" rows describe the markers, the two-way navigation and the before/after.

**Never:** No direct editing of the text (Story 4.1 rule unchanged). No new server read or write, no agent call at page open, no DB change. No change to accept / reject / rework / save / reimport behaviour. No visual slide preview (D1). Nothing changed on the workspace page `/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open a livrable | 20 paragraphs, 3 pending suggestions | Two panes; ¶1–¶20 in the margin; panel "3 en attente", cards in ¶ order | N/A |
| Card → paragraph | click "¶12" on a card | ¶12 centred in the left pane, highlighted, focused; right pane does not move | N/A |
| Paragraph → card | click the ¶12 marker of a tinted paragraph | its card scrolled into view and focused | N/A |
| Before/after | pending suggestion on ¶3 | "Actuel" struck text of ¶3, then "Proposé" | N/A |
| Accept | accept the ¶3 card | paragraph updates, card fades (compact), count drops by one | N/A |
| Global suggestion | `anchorRef` null | card shows "¶" and the proposed text only, no navigation button, listed last | N/A |
| Unresolved anchor | anchor not in blocks | same as global | N/A |
| No suggestions | none | empty-panel message above the global revision field | N/A |
| Drive livrable | slide-grouped | groups kept, markers numbered across slides, header actions above both panes | N/A |
| Narrow window | 1000px wide | single column: document, then AI panel; links still scroll | N/A |
| Demo mode | demo livrable | identical behaviour, no Google dependency | N/A |

</frozen-after-approval>

## Code Map

- `app/livrables/[id]/page.tsx` -- restructure into header + `.editor-panes` (left `.editor-document`, right `.editor-ai-panel`); `BlockParagraph` gains the `¶N` margin marker and `id="block-{id}"`, `tabIndex={-1}`; the marker of a targeted paragraph renders the client jump button. Keep `activeAnchorRefs`, `force-dynamic`, the error / empty branches as they are.
- `components/SuggestionsPanel.tsx` -- panel header ("Suggestions de l'IA", "N en attente"), document-order list, empty message; stays a server wrapper.
- `components/SuggestionCard.tsx` -- `id="suggestion-{id}"`, `tabIndex={-1}`; marker as jump button when the anchor resolves; before/after block for `pending`/`revising` (current text from `blocks`). Actions, overlay and busy guard unchanged.
- `components/EditorJump.tsx` (new, client) -- `JumpButton({ targetId, label, children })`: `scrollIntoView({ block: 'center', behavior })`, focus, adds then removes `.editor-jump-highlight`.
- `domain/suggestion.ts` -- `orderSuggestionsByAnchor(blocks, suggestions)` (stable; unresolved last) and `countPending(suggestions)`.
- `components/GlobalRevisionField.tsx` -- unchanged; placed at the bottom of the right pane.
- `app/globals.css` -- `.editor-panes` grid (`minmax(0,1fr) 380px`, height `calc(100vh - header)`), pane scrolls, margin marker, `.editor-jump-highlight`, `del`/`ins` styles, `@media (max-width: 1099px)` single column.
- `_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md` -- the three rows above.

## Tasks & Acceptance

**Execution:**
- [ ] `orderSuggestionsByAnchor`, `countPending` (domain).
- [ ] `EditorJump` client component.
- [ ] Page layout, margin markers, block ids.
- [ ] Panel header, ordering, empty state; card ids, jump button, before/after.
- [ ] CSS (panes, markers, highlight, narrow layout).
- [ ] EXPERIENCE.md rows.

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.
- Given a livrable with pending suggestions at ≥ 1100px, when it opens, then document and AI panel sit side by side, each paragraph shows `¶N`, and cards are in `¶` order with the pending count.
- Given a pending card, when the consultant clicks its `¶N`, then the paragraph is centred in the left pane, highlighted and focused; and when they click that paragraph's marker, the card is brought into view and focused.
- Given a pending anchored suggestion, then its card shows the current text struck through above the proposed text.
- Given a window narrower than 1100px, then the panes stack and both links still work.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success (in a scratch copy if the owner's dev server holds `db/local.db`).

**Manual checks:**
- Scratch: `orderSuggestionsByAnchor` (document order, ties stable, unresolved and global last), `countPending`.
- Browser (production build, demo mode and a Drive livrable): two panes, independent scroll, markers, both jumps with focus, before/after, accept updates count and paragraph, empty state, narrow layout at 1000px, `prefers-reduced-motion`.
