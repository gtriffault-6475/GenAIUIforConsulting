---
title: 'Story 5.6 follow-up (retro A8) — no duplicate deck on retry, tool only with a template'
type: 'bugfix'
created: '2026-10-05'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-creation-d-une-presentation-depuis-la-conversation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-presentation-tool-use.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** (1) When the OCTO template copy succeeds but the import fails, the proposal stays `pending` and a retry copies the template again, leaving duplicate decks in the client's folder (retro R8). (2) With Drive connected but no `GOOGLE_SLIDES_TEMPLATE_ID`, the agent is still told to call `propose_presentation`, and the card then shows a creation that can never work.

**Approach:** Owner decision (retro action A8, 2026-10-05): remember the created deck's file id on the proposal and reuse it on retry; offer `propose_presentation` only when Drive is connected and the template is configured, otherwise the agent says presentation creation is not configured (existing guidance).

## Boundaries & Constraints

**Always:**
- New nullable column `PRESENTATION_PROPOSAL.driveFileId`, set right after `createPresentation` succeeds, before the import. A retry on a proposal that has it imports that file instead of copying the template again.
- If that stored file can no longer be read (`not_found`), it is forgotten (`driveFileId := null`) so the next click creates a fresh copy; any other read failure keeps it (the next click retries the import).
- `selectAgentTools` and `presentationGuidance` take the template flag: no template → no `propose_presentation`, guidance "pas configurée". Existing proposals still show the card with the existing "modèle non configuré" message.
- Error messages unchanged ("La création de la présentation a échoué. Réessayez." etc.).

**Never:** No change to the adapter's copy/fill, to Story 5.3 import rules, or to demo mode; no deletion of Drive files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Retry after failed import | copy ok, import fails, click again | no second copy; the stored deck is imported; proposal `created` | still failing → message, id kept |
| Stored deck trashed | `driveFileId` set, read → `not_found` | id cleared; next click copies the template again | message shown |
| No template | connected, `GOOGLE_SLIDES_TEMPLATE_ID` empty, new conversation | only `propose_livrable_content`; agent says creation is not configured | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts` `presentationProposal` + `npm run db:generate` (additive migration).
- `actions/livrable.ts` `runPresentationCreation` (~L640–720): read/write `driveFileId`; `importDriveFile` (~L569) returns the read error kind so `not_found` can be told apart (callers `importDrivePresentation` unchanged in behaviour).
- `domain/agent-tools.ts` `AgentToolContext` gains `slidesTemplateConfigured`; `selectAgentTools`, `presentationGuidance`.
- `actions/message.ts` builds the context with `getGoogleConnectionStatus()` (`slidesTemplateConfigured`) — no new export of the env read.

## Tasks & Acceptance

**Execution:**
- [ ] `db/schema.ts`, migration -- column.
- [ ] `actions/livrable.ts` -- store / reuse / forget the id.
- [ ] `domain/agent-tools.ts`, `actions/message.ts` -- template gate.
- [ ] retro / sprint-status -- A8 to done after confirmation.

**Acceptance Criteria:**
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Scratch on SQLite with a stubbed provider: the three matrix rows; tool list and guidance with and without template.
