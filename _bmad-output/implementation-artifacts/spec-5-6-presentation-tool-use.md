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
