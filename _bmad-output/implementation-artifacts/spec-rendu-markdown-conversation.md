---
title: "Afficher le markdown des réponses de l'agent dans la conversation"
type: 'bugfix'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2def1d8818f04d4f6c3eb049326904052aeb76b2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** avec la vraie API Claude, les réponses de l'agent contiennent du markdown (`**gras**`, listes à tirets, titres), mais `components/ConversationHistory.tsx` rend `msg.content` comme texte brut dans un `<p>` : les astérisques s'affichent, et les sauts de ligne disparaissent (deux paragraphes fusionnent en un bloc). Le mode démo ne le montrait pas, ses réponses scriptées n'ont pas de markdown.

**Approche :** rendre en markdown le contenu des messages **assistant** uniquement (gras, italique, listes à puces et numérotées, titres, code inline et blocs, liens, paragraphes). Les messages **utilisateur** restent du texte brut, mais leurs sauts de ligne sont conservés (`white-space: pre-wrap`). Styles sobres alignés sur les tokens existants (`--space-*`, typographie `text-body`), sans violet (DESIGN.md).

**Décision (Checkpoint 1) :** moteur = `react-markdown` + `remark-gfm` (nouvelles dépendances), sans `rehype-raw` -- le HTML brut n'est donc jamais interprété.

## Boundaries & Constraints

**Always :** le HTML brut éventuellement présent dans une réponse n'est jamais interprété (échappé ou ignoré) -- le contenu vient d'un modèle et ne doit pas pouvoir injecter de balises. Les liens s'ouvrent dans un nouvel onglet avec `rel="noopener noreferrer"`. `ConversationHistory` reste un Server Component.

**Never :** aucun changement du format stocké dans `MESSAGE.content`, ni du prompt système pour demander du texte brut. Pas de rendu markdown dans le livrable ou les suggestions (hors périmètre). Pas de coloration syntaxique.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gras + listes | réponse assistant avec `**x**` et `- a\n- b` | "x" en gras, liste à puces, aucun astérisque visible | N/A |
| Paragraphes | réponse avec `\n\n` entre deux phrases | deux paragraphes distincts | N/A |
| HTML brut | réponse contenant `<script>alert(1)</script>` ou `<b>x</b>` | affiché comme texte ou ignoré, jamais exécuté/interprété | N/A |
| Message utilisateur | texte avec `**x**` et un saut de ligne | astérisques affichés tels quels, saut de ligne conservé | N/A |
| Réponse démo | réponse scriptée sans markdown | rendu identique à aujourd'hui | N/A |

</frozen-after-approval>

## Code Map

- `components/ConversationHistory.tsx:62-64` -- `<p className="text-body">{msg.content}</p>` : point unique de rendu d'un message ; brancher selon `msg.role`.
- `app/globals.css` -- `.text-body` et tokens `--space-*` ; ajouter une classe pour le contenu markdown (marges des `p`/`ul`/`ol`/`h*`/`pre`).
- `components/SuggestionCard.tsx:186` -- texte de suggestion, hors périmètre, ne pas modifier.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- ajouter `react-markdown` et `remark-gfm` (versions exactes, comme les autres dépendances).
- [x] `components/MessageContent.tsx` (nouveau) -- rendu markdown d'un contenu assistant via `react-markdown` + `remark-gfm`, HTML brut jamais interprété, liens en nouvel onglet.
- [x] `components/ConversationHistory.tsx` -- messages assistant via `MessageContent`, messages utilisateur en texte brut avec `white-space: pre-wrap`.
- [x] `app/globals.css` -- classe `.message-markdown` : marges verticales compactes, listes indentées, `code`/`pre` en fond neutre.

**Acceptance Criteria:**
- Given une conversation contenant les réponses réelles du test du 2026-09-30 (gras, listes), when elle s'affiche, then aucun `**` n'est visible et les listes sont rendues.
- Given une réponse contenant du HTML brut, when elle s'affiche, then aucune balise n'est interprétée.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npx next build --turbopack` -- expected: build OK

**Manual checks (if no CLI):**
- Insérer (sur une copie sauvegardée/restaurée de la base) un message assistant contenant gras, listes, titre, code, lien et `<b>x</b>`, puis vérifier le rendu dans le navigateur ; vérifier qu'une réponse démo s'affiche comme avant.

## Implementation Notes

Added `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 (exact versions). New Server Component `components/MessageContent.tsx`: assistant messages only; no `rehype-raw` (raw HTML shown as escaped text); links open in a new tab with `rel="noopener noreferrer"`; after review, `img` is never rendered (alt text or URL shown as plain text). `ConversationHistory.tsx`: user messages stay plain text with `pre-wrap` + `overflow-wrap: anywhere`. `app/globals.css`: `.message-markdown` rules from existing tokens plus a new `--font-mono` token; after review, `white-space: pre-line` on `p` (single line breaks kept), scrollable tables, `overflow-wrap: anywhere`, no double spacing in loose lists.

Verified: `npx tsc --noEmit` and `npx next build --turbopack` clean. In the browser, on a backed-up and restored DB, with two inserted assistant messages: heading, bold, italic, nested and numbered lists, inline and block code, table and link rendered; `<b>`/`<script>` shown as escaped text (0 elements created); user message `pre-wrap`; `"Bonjour,\nEn deux phrases"` kept on two lines; two markdown images rendered as text, 0 `<img>` elements and 0 network requests to their hosts; a 200-character URL and an 8-column table did not overflow the center column.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence / resolution |
|---|---|---|---|---|---|
| 1 | blind-hunter, edge-case | Markdown images in model output render an `<img>` that fetches a remote URL on display (prompt-injection exfiltration). | high | patch | Verified: no `img` override or `disallowedElements`; default `urlTransform` allows `https:`. Images are not in the Intent's rendered-element list; `img` now rendered as plain text. |
| 2 | blind-hunter | A single `\n` in an assistant paragraph collapses to a space. | medium | patch | Seen in the real-key test on 2026-09-30 ("Bonjour,\nEn deux phrases" shown merged); `white-space: pre-line` on `.message-markdown p`. |
| 3 | blind-hunter, edge-case | Wide GFM tables and long unbroken strings overflow the center column. | low | patch | Verified: only `pre` had `overflow-x`; direct CSS correction. |
| 4 | blind-hunter | Loose lists get double spacing (`li > p` margins). | low | patch | Verified from react-markdown's loose-list output; direct CSS correction. |
| 5 | blind-hunter | Code font stack hardcoded instead of a token. | low | patch | Verified; `--font-mono` token added next to `--font-display`/`--font-body`. |
| 6 | verification-gap | Header comment says raw HTML is dropped; react-markdown 10 renders it as escaped text. | low | patch | Verified in the browser (DOM shows `&lt;b&gt;x&lt;/b&gt;`); comment corrected. |
| 7 | blind-hunter, verification-gap (x2) | No automated test pins the raw-HTML/unsafe-link invariant or the user/assistant split. | medium | defer | Pre-existing: no test runner in the repo. Checked manually in the browser on a backed-up DB (headings, lists incl. nested, code, table, link `target=_blank rel=noopener noreferrer`, `<b>`/`<script>` escaped, user `pre-wrap`). |
| 8 | blind-hunter, edge-case | No styles for `hr`/`del`/GFM task-list checkboxes. | low | reject | Rare in chat replies; styling them adds rules for no observed case. |
| 9 | blind-hunter | Links have no colour or focus style of their own and no new-tab hint. | low | reject | Consistent with the global `a` style and focus handling used across the app. |
| 10 | edge-case | In-page anchors (GFM footnotes) open in a new tab; footnote ids can collide across messages. | low | reject | Footnotes are rare in Claude chat output; the fix adds branches and threading `msg.id`. |
| 11 | edge-case | A `javascript:` link stripped to an empty `href` opens the app in a new tab. | low | reject | Needs a hostile link in model output; harmless outcome (same-app page); fix adds a guard branch. |
| 12 | blind-hunter | Spec not updated; ESM compatibility with Next 16 unconfirmed. | -- | false | Notes are filled at finalization; `next build` passes and the component renders server-side in the running app. |
