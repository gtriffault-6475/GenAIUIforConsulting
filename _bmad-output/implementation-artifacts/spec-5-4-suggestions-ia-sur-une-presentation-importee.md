---
title: 'Story 5.4 — Suggestions IA sur une présentation importée'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: 'c9078644af62a174e264c9e82708ac6216e7b4f1'
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
- [x] `domain/agent-tools.ts` -- pure tool selection.
- [x] `skills/propose_anchored_suggestions.ts` -- tool definition + parser.
- [x] `skills/buildRequest.ts` -- tool list + dispatch by name (real and demo paths).
- [x] `actions/suggestion.ts` -- `addAnchoredSuggestions`.
- [x] `actions/document-context.ts`, `actions/message.ts` -- tool selection, dispatch, id-bearing content, context exclusion.
- [x] `app/livrables/[id]/page.tsx` -- global revision back on Drive livrables.

**Acceptance Criteria:**
- Given a Drive livrable's conversation, when a message is sent (real path), then the Messages API request lists exactly one tool, `propose_anchored_suggestions`, and the system prompt contains each block's id and slide number.
- Given a valid `propose_anchored_suggestions` call, then new pending anchored suggestions appear in the editor and Accept / Reject / Rework work on them; the Drive livrable's blocks (ids, order, count) are unchanged until a suggestion is accepted.
- Given `rm -f db/local.db* && npm run build`, then it succeeds.

## Implementation Notes

- Implemented directly from this spec (no subagent dispatch).
- Persistence of the new tool lives in `actions/anchored-suggestions.ts`, deliberately not a 'use server' file (only the agent's validated tool call may add suggestions, never a browser-callable action) — instead of the Code Map's `actions/suggestion.ts`. Same transaction pattern as `createLivrableWithSuggestions`; also skips a zone that vanished since validation.
- `sendToAgent` now takes `tools` (list) and `executeTool(name, input)`; a `tool_use` naming a tool not offered gets a tool error without dispatch. Demo path runs the scripted `propose_livrable_content` call only when that tool is offered.
- `sendMessage` reads the conversation's livrable once (source, content, driveFileId) for: tool selection (`domain/agent-tools.ts`), dispatch, id-bearing content injection for Drive livrables (`[id] (Diapositive N) text` + instruction to use anchored suggestions), and `excludeDriveFileId` for context documents. The Story 5.3 refusal inside `propose_livrable_content` execution stays as a second guard.
- Global revision field shown again on Drive livrables.
- Review fixes (pass 1): separate skip reasons (open / missing / unchanged); JSON-quoted zone text; no-op suggestions skipped; parallel tool use disabled; tolerant `parseLivrableBlocks` shared; zero-zone prompt; zone-by-zone note on the global revision field; `TOOLS` typing.
- Verification: `tsc` clean; fresh-db `npm run build` green. Scratch on a real SQLite DB: tool selection (none/local → propose_livrable_content, drive → propose_anchored_suggestions); parser accepts valid input and rejects unknown id, duplicate id, blank text, empty list, non-object; `addAnchoredSuggestions` skips a zone with a revising suggestion and a vanished zone, never touches content, second call on a now-pending zone skipped. Browser (production server, fake Anthropic endpoint calling the offered tool): Drive conversation request offers exactly `propose_anchored_suggestions`, prompt has `[a] (Diapositive 1) Titre`…, the same presentation selected in Contexte is not resent; suggestions created, blocks untouched; editor shows them; Accept keeps `slideId`/`slideNumber`/`driveText` and changes text; Reject works; global revision on the Drive livrable offers the same single tool and adds suggestions; a forced `propose_livrable_content` call in that conversation gets "n'est pas disponible…" with `is_error`, livrable unchanged; a new conversation still gets `propose_livrable_content` and creates a local livrable. Demo mode, scripted creation phrase in the Drive conversation: scripted reply, no livrable created or changed.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter BH, edge-case-hunter EC, verification-gap VG) — no intent_gap / bad_spec; patches applied directly; tsc, fresh-db build, scratch and browser scenario re-run green.

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 1 | BH+EC+VG: one "already pending" reason given for every skipped zone (also vanished ones; `revising` isn't "en attente") | low | Patch: `addAnchoredSuggestions` returns `skippedOpen` / `skippedMissing` / `skippedUnchanged`, each worded separately in the tool result. |
| 2 | BH+EC: multi-line text boxes make the zone list ambiguous for the agent | medium | Patch: one line per zone, text JSON-quoted; prompt says so. |
| 3 | BH+EC: suggestion identical to the current text accepted, blocking the zone | low | Patch: skipped as `skippedUnchanged` (verified in the browser run: a second proposal equal to the accepted text is not added). |
| 4 | EC: parallel `tool_use` blocks would leave one without `tool_result` and fail the second call | medium | Real for any single tool too. Patch: `tool_choice: { type: 'auto', disable_parallel_tool_use: true }` when tools are offered (seen in the captured request). |
| 5 | BH+EC: unguarded `JSON.parse` / null entries make the tool executor throw (generic failure) | low | Patch: tolerant `parseLivrableBlocks` in `domain/livrable.ts`, used by the executor, the context injection and `addAnchoredSuggestions` (also removes the duplicated parsing BH flagged); a missing livrable yields all-skipped, never a throw. |
| 6 | EC: Drive livrable with zero zones | low | Patch: the prompt says there is no zone to suggest on. |
| 7 | BH: global revision wording promises a document-wide rewrite on Drive livrables | low | Patch: note "Sur une présentation importée, l'IA répond par des suggestions zone par zone." under the label. |
| 8 | BH: `TOOLS` map typed after one tool | low | Patch: `Record<AgentToolName, Anthropic.Tool>`. |
| 9 | BH+EC: conversation-livrable read moved outside the try/catch | false | Deliberate: falling back to "no livrable" would offer `propose_livrable_content` on a Drive livrable; a failed read fails the turn (`assistantFailed`). Comment added to say so. |
| 10 | BH+VG+EC: demo mode, Drive conversation — scripted reply claims a livrable was created/updated though the tool did not run | medium | Real, but the frozen intent explicitly says the scripted reply is returned without the tool; changing it means changing the approved spec. Rejected here, surfaced to the owner as a follow-up (only reachable with a Drive livrable imported before switching to demo). |
| 11 | EC: claim "dispatch by name (real and demo paths)" — demo never dispatches the anchored tool | false | The demo script has no anchored-suggestion entry; the intent only asks the demo path to gate the scripted call. |
| 12 | BH+EC: Code Map places `addAnchoredSuggestions` in `actions/suggestion.ts` | low | Deviation recorded in Implementation Notes (moved to a non-'use server' module on purpose); editing the spec is out of the review's reach. Rejected. |
| 13 | BH+VG: no committed tests (tool selection, parser, persistence rules, context exclusion, demo gating, unoffered-tool guard) | medium (no test evidence) | No test suite by standing decision; verified by scratch scripts and browser runs (Implementation Notes). Deferred. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Parser and tool selection in a scratch script (valid, unknown id, duplicate, empty text, open-suggestion skip on a real SQLite DB).
- Browser with a seeded Drive livrable and a fake Anthropic endpoint returning `propose_anchored_suggestions` (and, separately, `propose_livrable_content`): captured request tools/system prompt, suggestions shown, Accept keeps slide fields, Reject, local livrable path unchanged.
