---
title: "Story 5.6 — Création d'une présentation depuis la conversation"
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '132fe9d3a6d61eb3537ea3aa11d8df56e55dda89'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The consultant can improve presentations that already exist in the project's Drive, but cannot start a new one from a conversation: the agent can only draft app-side livrables.

**Approach:** In `connected` mode, a conversation without livrable also offers the agent a `propose_presentation` tool. Its proposal (title + ordered slides, each a title and a content text) is stored and shown under the agent's reply as a card with "Créer dans Drive" / "Ajuster"; nothing is created without the click. "Créer dans Drive" creates the deck in the project folder from the OCTO slides template (owner decision on OQ-7), fills it, then imports it exactly as Story 5.3 (Drive livrable + dedicated conversation) and opens the editor.

## Boundaries & Constraints

**Always:**
- Tool choice (`domain/agent-tools.ts`): no livrable + `connected` → `propose_livrable_content` and `propose_presentation`; every other case unchanged (Story 5.4).
- `propose_presentation` input: `{ title, slides: [{ title, content }] }` — non-empty title, 1 to 30 slides, each slide a title and/or a content (one of them non-empty). It never creates anything; the tool result tells the agent the proposal is waiting for the consultant.
- Persistence: new table `PRESENTATION_PROPOSAL` {id, conversationId, messageId, title, slides (JSON), status `pending | created`, livrableId, createdAt}, written in the same transaction as the agent's reply message (no reply → no proposal). Several proposals may exist in a conversation; each card acts on its own proposal.
- Card (under the reply that carries it): title, slide list (number, title, first lines of content), "Créer dans Drive" (neutral primary) and "Ajuster" (puts "Ajuste la proposition de présentation : " in the composer and focuses it). Once created: "Présentation créée" with a link to the livrable, no button. Outside `connected`: buttons disabled with "Connectez Google Drive pour créer la présentation." Never shown in demo mode (the tool is never offered there).
- Creation (`createPresentation(projectName, title, slides)` on the drive port, AD-13): project folder resolved like Story 5.2 (never created); copy of the OCTO template into it, named with the proposal title; one `batchUpdate` that adds one slide per proposed slide from the template's layouts and fills title and body placeholders; the template's own example slides are removed; then the Story 5.3 import of the new file, and `status := created`, `livrableId` set. A proposal already `created` returns its livrable (no second deck). Any failure: "La création de la présentation a échoué. Réessayez.", proposal stays `pending` (a deck copied but not imported is reported in the log with its id).
- **Decisions (owner, 2026-10-05):** (1) The OCTO template is a Google Slides file whose ID is set in a new variable `GOOGLE_SLIDES_TEMPLATE_ID` (shared with the consultants); without it, "Créer dans Drive" is unavailable with "Le modèle de présentation OCTO n'est pas configuré pour cette installation." — never a blank fallback. (2) Layouts chosen automatically: first proposed slide → the template layout holding a centered-title placeholder (cover), the others → the first layout holding a title and a body placeholder; if the template has no such layout, the Google predefined `TITLE` / `TITLE_AND_BODY` layouts are used.
- Errors converted to `DriveError`, raw detail logged; `token_revoked` handled by the existing provider wrapper.

**Never:**
- No creation in demo mode, no write to any other Drive file, no folder creation, no change to the Story 5.3–5.5 flows once the deck is imported.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Proposal | connected, no livrable, "fais-moi une présentation…" | reply + card with the slides; nothing in Drive | invalid input → tool error, no card |
| Create | click "Créer dans Drive" | deck in the project folder from the OCTO template, imported, editor opens; card shows "Présentation créée" | failure → message, card still pending |
| Double click / second click | proposal already created | opens the existing livrable, no second deck | N/A |
| Ajuster | click | composer prefilled and focused; next reply may carry a new card | N/A |
| Not connected | proposal from earlier, now disconnected | card visible, buttons disabled + message | N/A |
| Demo | demo mode | tool never offered, no card | N/A |
| Conversation with a livrable | local or Drive livrable | tool not offered (Story 5.4 rules) | N/A |

</frozen-after-approval>

## Code Map

- `domain/agent-tools.ts` -- `selectAgentTools({ livrableSource, driveMode })`; `actions/message.ts` passes the mode.
- `skills/propose_presentation.ts` (new) -- tool + parser.
- `db/schema.ts` + migration -- `presentation_proposal`.
- `actions/message.ts` -- executor stashes the validated proposal; after the reply, inserts message + proposal in one transaction.
- `actions/conversation.ts` `getActiveConversation` -- returns proposals per message (no new read path for other surfaces, FR-10).
- `actions/livrable.ts` -- `createPresentationFromProposal(proposalId)`; reuse `importDrivePresentation`'s core (refactor into a helper taking `driveFileId` + name).
- `integrations/ports/drive-provider.ts`, `integrations/google/drive-provider.ts`, mock, wrapper -- `createPresentation(projectName, title, slides)` → `{ fileId }`: folder resolution (reuse), Drive `files.copy`, Slides `presentations.get` (layouts, existing slides) + `batchUpdate` (`createSlide` with `layoutId` + `placeholderIdMappings`, `insertText`, `deleteObject` for template slides).
- `components/PresentationProposalCard.tsx` (new), `components/ConversationHistory.tsx`, `components/Composer.tsx` (prefill/focus through a small shared event or prop) -- UI.
- `.env.local.example`, `README.md` -- template setup.

## Tasks & Acceptance

**Execution:**
- [x] tool selection + `propose_presentation` tool/parser
- [x] schema + migration + message/proposal persistence
- [x] port/adapters `createPresentation`
- [x] `createPresentationFromProposal` + shared import helper
- [x] card, history, composer prefill
- [x] docs (template variable)

**Acceptance Criteria:**
- Given a proposal, when nothing is clicked, then no Drive call other than the Story 5.2 listing is made.
- Given a created deck, then it is a Story 5.3 Drive livrable (suggestions, save, reimport work on it).
- Given `rm -f db/local.db* && npm run build`, then it succeeds.

## Implementation Notes

- `selectAgentTools({ livrableSource, driveMode })`; `sendMessage` resolves the mode. The executor only stashes the validated proposal; the assistant MESSAGE and the PRESENTATION_PROPOSAL row are inserted in one `db.transaction` (one tool call per response, so at most one proposal per reply; unique index on `message_id`).
- Port `createPresentation(projectName, title, slides)`: Google adapter resolves the folder (shared `resolveProjectFolder`, also used by `listFiles`), `files.copy` of `GOOGLE_SLIDES_TEMPLATE_ID` into it, `presentations.get` (slides + layouts placeholders), one `batchUpdate` built by the pure `buildPresentationRequests` (createSlide with `placeholderIdMappings`, insertText for non-empty texts only, deleteObject of the template slides). Layout choice in `chooseSlideLayouts`; cover body goes into SUBTITLE (else BODY). 30 s timeout for copy/fill. No template → `unconfigured`. Mock answers `unknown`; the token-revocation wrapper covers the new method.
- `actions/livrable.ts`: Story 5.3 import core extracted into `importDriveFile` (unchanged behavior, including returning an already-imported livrable while disconnected). `createPresentationFromProposal` dedupes concurrent calls in-process (single local server) and returns the existing livrable once created. Messages: template missing, folder missing/duplicate, generic failure.
- `getActiveConversation` attaches `presentationProposal` per message; the demo reset deletes proposals before messages (FK). `GoogleConnectionStatus.slidesTemplateConfigured` drives the card's template message.
- UI: `PresentationProposalCard` (client) under the reply, `Ajuster` through a `composer:prefill` window event the `Composer` listens to.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | blind, edge | Tool offered when connected but no template set; card then permanently disabled | low | rejected — the frozen tool-choice rule offers it in `connected`; the card states the template is not configured (owner decision 1) |
| 2 | blind, edge | Retry after a successful copy but failed import creates a second deck | medium | defer — the frozen intent accepts this ("a deck copied but not imported is reported in the log with its id"); storing the file id would change the intent |
| 3 | blind, edge | In-process dedupe only; no DB `creating` state | low | rejected — single local server per workstation (epic constraint); a second process is not a supported setup |
| 4 | blind | Copy that completes after the client timeout is not logged | low | rejected — the id is unknowable at that point; rare |
| 5 | blind, edge | folder_missing / folder_duplicate shown as generic "Réessayez" | medium | patch — same folder messages as the panels |
| 6 | blind | Action does not check demo mode / active project | false | demo mode resolves to `mode: 'demo'`, refused by the `connected` check; ids are random UUIDs on a single-user local app |
| 7 | blind, edge | "Ajuster" with a non-empty draft drops the prefix silently | low | patch — prefix now prepended to the draft |
| 8 | blind | Prefix does not name the proposal | low | rejected — the prefix text is fixed by the frozen intent |
| 9 | blind | "Ajuster" disabled outside connected | false | the frozen intent disables the card's buttons outside `connected` |
| 10 | blind | Both tools / two proposals in one reply | false | `disable_parallel_tool_use` and a single tool cycle per `sendToAgent` call: at most one tool call per reply |
| 11 | blind | Created deck gets a new conversation | false | intended: the deck is imported "exactly as Story 5.3" |
| 12 | blind | No index on `presentation_proposal.conversation_id` | low | rejected — a handful of rows per conversation |
| 13 | blind | FKs without ON DELETE; only demo reset handles them | low | rejected — no other delete path of MESSAGE/LIVRABLE exists |
| 14 | blind | Preview cut without marker; malformed row shows an enabled button | low | patch (ellipsis); malformed row rejected (only the app writes validated JSON) |
| 15 | blind | No length caps; `maxItems: 30` duplicated | low | patch for the constant; caps rejected (Drive accepts long names) |
| 16 | edge | Template and master without the needed layouts → every creation fails after copying | maybe-false | defer — needs the real OCTO template to settle |
| 17 | edge | `driveMode` null shows "Connectez Google Drive" | low | rejected — only when the status read itself fails |
| 18 | edge | Caret set before React commits the prefill | maybe-false | rejected — the event is dispatched inside a React click handler, committed before the next frame; browser check showed the field focused with the prefix |
| 19 | gap | No automated tests for tool selection, parser, request builder, creation action, import refactor, persistence | — | defer — standing project decision (no automated tests); all of them were exercised by scratch checks (see Verification) |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Results (2026-10-05):** tsc clean; fresh-db build OK (also after the review patches). Scratch esbuild bundle on SQLite with stubbed Drive/Slides: tool-selection table, parser (empty title, 0/31 slides, empty slide, trimming), layout choice (template and predefined fallback), request list (creates, non-empty inserts, template deletions last), adapter copy into the project folder, `folder_missing`, `unconfigured`, fill failure logging the copied id; action: disconnected, template missing, provider failure, import failure keeping `pending`, two concurrent clicks → one creation, second click → same livrable, `getActiveConversation` returning the proposal. Browser (production build, fake Anthropic): both tools offered, card rendered, Ajuster prefills and focuses, failed creation message with proposal still pending, disconnected state disabled with message, created state with link and no button, no card in demo mode. Real Google creation not tested (no credentials).

**Manual checks (if no CLI):**
- Adapter against stubbed Drive/Slides APIs: copy into the folder, batchUpdate requests (createSlide with layouts, placeholder text, template slide deletion).
- Action on SQLite with a stubbed provider: create, double click, failure keeps pending.
- Browser with a fake Anthropic endpoint returning `propose_presentation`: card, Ajuster, disabled state, demo.
- Real creation needs real Google Cloud credentials and the template file.
