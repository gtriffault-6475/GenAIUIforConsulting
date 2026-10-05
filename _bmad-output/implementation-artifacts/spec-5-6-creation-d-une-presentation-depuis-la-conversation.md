---
title: "Story 5.6 — Création d'une présentation depuis la conversation"
type: 'feature'
created: '2026-10-05'
status: 'draft'
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
- [ ] tool selection + `propose_presentation` tool/parser
- [ ] schema + migration + message/proposal persistence
- [ ] port/adapters `createPresentation`
- [ ] `createPresentationFromProposal` + shared import helper
- [ ] card, history, composer prefill
- [ ] docs (template variable)

**Acceptance Criteria:**
- Given a proposal, when nothing is clicked, then no Drive call other than the Story 5.2 listing is made.
- Given a created deck, then it is a Story 5.3 Drive livrable (suggestions, save, reimport work on it).
- Given `rm -f db/local.db* && npm run build`, then it succeeds.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Adapter against stubbed Drive/Slides APIs: copy into the folder, batchUpdate requests (createSlide with layouts, placeholder text, template slide deletion).
- Action on SQLite with a stubbed provider: create, double click, failure keeps pending.
- Browser with a fake Anthropic endpoint returning `propose_presentation`: card, Ajuster, disabled state, demo.
- Real creation needs real Google Cloud credentials and the template file.
