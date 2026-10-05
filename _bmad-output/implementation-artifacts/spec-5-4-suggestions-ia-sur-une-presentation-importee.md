---
title: 'Story 5.4 — Suggestions IA sur une présentation importée'
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

**Problem:** A presentation imported from Drive (Story 5.3) cannot be improved by the AI yet: the agent is refused when it tries to regenerate it, and the global revision field is hidden on it. The consultant needs suggestions zone by zone, then Accept / Reject / Rework as in Epic 4.

**Approach:** One pure `domain/` function chooses the tools offered to the agent per conversation (AD-14); `sendToAgent` takes a tool list and dispatches the single tool call by name. A Drive livrable's conversation only gets a new `propose_anchored_suggestions` tool that adds suggestions on existing block ids; the livrable content is sent to the agent with its block ids; the global revision field comes back on Drive livrables.

## Boundaries & Constraints

**Always:**
- Tool choice (pure function of the conversation's livrable): no livrable → `propose_livrable_content`; local livrable → `propose_livrable_content`; Drive livrable → `propose_anchored_suggestions` only. (The presentation-proposal tool of Story 5.6 will plug in here.)
- `propose_anchored_suggestions` input: `{ suggestions: [{ blockId, text }] }` — `text` is the proposed replacement text of that zone (same meaning as Epic 4 anchored suggestions). Validation rejects the whole call (tool error) on: unknown `blockId`, duplicate `blockId`, empty text. It never adds, deletes, reorders or retitles blocks and never changes `LIVRABLE.content`.
- A zone that already has a pending or revising suggestion is skipped (no replacement); the tool result tells the agent how many were added and which zones were skipped.
- On a Drive livrable, the agent receives the livrable content with block ids and slide numbers (`[id] (Diapositive N) text`, current text = consultant-accepted text), and the presentation's own Drive file is never also sent as a context document. Local livrables keep today's content injection unchanged.
- `sendToAgent` keeps handling a single `tool_use` per response; a call to a tool that was not offered is answered with a tool error and changes nothing.
- The Story 5.3 refusal in `propose_livrable_content` execution for Drive livrables stays as a second guard.
- Global revision is shown again on Drive livrables and goes through the same conversation flow (AD-10); the agent answers with anchored suggestions.
- Accept / Reject / Rework unchanged from Epic 4; accepting keeps slide fields (Story 5.3), making the zone "modified" (`text ≠ driveText`).
- Demo mode: a scripted entry carrying a `propose_livrable_content` call in a Drive livrable's conversation returns the scripted reply without running the tool.

**Never:**
- No write to Drive (Story 5.5), no presentation creation (Story 5.6).
- No change to `propose_livrable_content`'s schema or behavior for local livrables.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suggestions on Drive livrable | message or global revision in its conversation | only `propose_anchored_suggestions` offered; valid call adds pending anchored suggestions; blocks untouched | N/A |
| Unknown / duplicate block id | invalid tool input | tool error, nothing written | agent sees `is_error` and answers in text |
| Zone already has an open suggestion | pending/revising on that block | that item skipped, others added, result lists skipped zones | N/A |
| Local livrable conversation | as today | `propose_livrable_content` only, behavior unchanged | N/A |
| No livrable yet | new conversation | `propose_livrable_content` only | N/A |
| Tool not offered | model calls `propose_livrable_content` in a Drive conversation | tool error, livrable unchanged | N/A |
| Drive file also selected as context | presentation checked in Contexte | not sent as a context document in its own conversation (sent with ids instead) | N/A |

</frozen-after-approval>

## Code Map

- `domain/agent-tools.ts` (new) -- `selectAgentTools({ livrableSource: 'local' | 'drive' | null })` → `('propose_livrable_content' | 'propose_anchored_suggestions')[]`.
- `skills/propose_anchored_suggestions.ts` (new) -- `PROPOSE_ANCHORED_SUGGESTIONS_TOOL` (French description: suggestions only, on the given ids) + `parseProposeAnchoredSuggestionsInput(input, blockIds)`.
- `skills/buildRequest.ts` -- `sendToAgent({ tools?: Anthropic.Tool[], executeTool?: (name, input) => … })`: `tools` sent on both calls; dispatch by `tool_use.name`; unknown name → tool error. Demo path: run `entry.toolCall` only if `propose_livrable_content` is offered, else return the scripted reply.
- `actions/message.ts` -- `sendMessage`: read the conversation's livrable (`id`, `source`, `content`, `driveFileId`) once; tools from `selectAgentTools`; `executeTool(name, input)` dispatches to the existing `propose_livrable_content` branch or to `addAnchoredSuggestions`; Drive-livrable content injection with ids; pass `excludeDriveFileId` to `listAgentContextDocuments`.
- `actions/document-context.ts` -- `listAgentContextDocuments(projectId, { excludeDriveFileId? })`.
- `actions/suggestion.ts` -- new `addAnchoredSuggestions(livrableId, items)` (only writer of SUGGESTION, one transaction, skips zones with open suggestions, returns `{ added, skipped }`); `SuggestionSummary` and `acceptSuggestion`/`rejectSuggestion`/`reworkSuggestion` unchanged.
- `skills/demoScript.ts` -- unchanged (consumer side only).
- `app/livrables/[id]/page.tsx` -- show `GlobalRevisionField` for Drive livrables again (remove Story 5.3's guard).
- `skills/propose_starting_point.ts`, `skills/rework_suggestion.ts` -- no tools; unchanged.

## Tasks & Acceptance

**Execution:**
- [ ] `domain/agent-tools.ts` -- pure tool selection.
- [ ] `skills/propose_anchored_suggestions.ts` -- tool definition + parser.
- [ ] `skills/buildRequest.ts` -- tool list + dispatch by name (real and demo paths).
- [ ] `actions/suggestion.ts` -- `addAnchoredSuggestions`.
- [ ] `actions/document-context.ts`, `actions/message.ts` -- tool selection, dispatch, id-bearing content, context exclusion.
- [ ] `app/livrables/[id]/page.tsx` -- global revision back on Drive livrables.

**Acceptance Criteria:**
- Given a Drive livrable's conversation, when a message is sent (real path), then the Messages API request lists exactly one tool, `propose_anchored_suggestions`, and the system prompt contains each block's id and slide number.
- Given a valid `propose_anchored_suggestions` call, then new pending anchored suggestions appear in the editor and Accept / Reject / Rework work on them; the Drive livrable's blocks (ids, order, count) are unchanged until a suggestion is accepted.
- Given `rm -f db/local.db* && npm run build`, then it succeeds.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Parser and tool selection in a scratch script (valid, unknown id, duplicate, empty text, open-suggestion skip on a real SQLite DB).
- Browser with a seeded Drive livrable and a fake Anthropic endpoint returning `propose_anchored_suggestions` (and, separately, `propose_livrable_content`): captured request tools/system prompt, suggestions shown, Accept keeps slide fields, Reject, local livrable path unchanged.
