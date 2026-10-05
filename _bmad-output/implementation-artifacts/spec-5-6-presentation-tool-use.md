---
title: 'Story 5.6 follow-up — agent uses propose_presentation instead of writing slides as text'
type: 'bugfix'
created: '2026-10-05'
status: 'in-progress'
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
