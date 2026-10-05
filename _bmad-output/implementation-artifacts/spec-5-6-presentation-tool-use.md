---
title: 'Story 5.6 follow-up — agent uses propose_presentation instead of writing slides as text'
type: 'bugfix'
created: '2026-10-05'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-creation-d-une-presentation-depuis-la-conversation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Owner test (2026-10-05, Google Drive connected, new conversation): asked for slides, the agent wrote the slide outline as plain text in its reply instead of calling `propose_presentation`, so no "Créer dans Drive" / "Ajuster" card appeared.

**Approach:** Owner decision: force the tool's use. Whenever `propose_presentation` is offered (connected, no livrable), the agent is told in the system prompt and in both tool descriptions that a request for a presentation, slides, a deck or a presentation support must go through `propose_presentation`, never as slides written in the reply, and that `propose_livrable_content` is for text documents only. Tool selection rules (Story 5.4/5.6) are unchanged.

**Owner decision (2026-10-05, follow-up):** when the tool is not offered, the agent says what the consultant must do instead of writing slides: connect Google Drive (disconnected), Google Drive not configured (unconfigured), or ask again in a new conversation (conversation that already has a livrable). Nothing in demo mode (no Google wording) nor in an imported deck's conversation.

</frozen-after-approval>

## Implementation Notes

- `skills/propose_presentation.ts`: description says to call the tool for any presentation / slides / deck request, even called « livrable », instead of writing slides in the reply (unless the consultant explicitly asks for a text outline).
- `skills/propose_livrable_content.ts`: description excludes presentations when `propose_presentation` is available.
- `actions/message.ts`: when `propose_presentation` is offered, a `__presentation_tool_rule` system instruction says the same and takes precedence over loaded skills for the deliverable's form.
- Verification: tsc clean; scratch bundle with a fake Anthropic endpoint: connected new conversation → both tools offered and the rule in the system prompt; disconnected → only `propose_livrable_content`, no rule. Whether the real model now calls the tool needs the owner's re-test.

## Review Triage Log

| # | Finding | Verdict | Route / evidence |
|---|---------|---------|------------------|
| 1 | Rule asks to clarify ambiguity, contradicting "force" | low | patch — clause removed |
| 2 | Explicit request for a text outline overridden | low | patch — exception added in rule and description |
| 3 | No guidance when Drive is not connected (agent may still write slides) | medium | defer — owner chose only "force the tool" (the "message without Drive" option was not selected) |
| 4 | Static livrable description mentions runtime availability | low | rejected — the clause is conditional and harmless when the tool is absent |
| 5 | Keyword lists differ ("diapositives" missing) | low | patch |
| 6 | No automated check | — | defer — project decision; scratch check recorded |
| 7 | Spec not finalized; comment does not cite the spec | low | patch |
| 8 | Precedence over loaded skills unspecified | low | patch — rule states it takes precedence for the deliverable's form |
| 9 | (follow-up review) `local` livrable checked before the drive mode: "new conversation" advice where Drive is not connected | medium | patch — the Drive clause comes first, "new conversation" appended |
| 10 | (follow-up) rule duplicates `selectAgentTools`' condition | low | patch — guidance derives from `selectAgentTools` |
| 11 | (follow-up) Connected without `GOOGLE_SLIDES_TEMPLATE_ID`: tool still forced, card then says the template is missing | medium | defer — covered by retro action A8 (offer the tool only with a template) |
| 12 | (follow-up) demo mode left without guidance | false | demo replies come from the script (`sendToAgent` never calls the model in demo), so no rule can apply |
| 13 | (follow-up) context type duplicated | low | patch — shared `AgentToolContext` (kept inside `domain/`, AD-5) |
| 14 | (follow-up) no test for the pure function | — | defer — project decision; table check run in scratch (all 6 cases) |
| 15 | (follow-up) prompt wording / comment | low | patch |

Follow-up implementation: pure `presentationGuidance(context)` in `domain/agent-tools.ts`, injected by `sendMessage` as `__presentation_tool_rule`. Verification: tsc clean, fresh-db build OK; table check of the 6 cases; `sendMessage` with a fake Anthropic endpoint — disconnected → "Connecter Google Drive" rule, connected → tool rule, demo → no API call.

Follow-up 2 (owner test, 2026-10-05): asked "sais-tu créer cette présentation sur le drive du projet ?", the agent answered it had no Drive access. The guidance now also covers capability questions, and when the tool is offered it states that the app can create Google Slides decks in the project Drive and must never deny Drive access. `sendMessage` logs (server console) the drive mode, template flag, livrable source and offered tools for each message — no content. Verified: tsc clean, fresh-db build OK.
