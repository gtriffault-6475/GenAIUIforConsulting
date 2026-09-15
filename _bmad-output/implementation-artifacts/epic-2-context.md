# Epic 2 Context: Espace multi-agents

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Once connected to a project, the consultant needs a working surface to actually talk to the agent: one or more private, per-project conversations, a visible catalog of the specialized skills loaded on that project, control over which AI model answers, and a view of the deliverables already being drafted. This epic builds that surface — the "espace de travail" — so the consultant can organize exchanges by topic or step, trust that a conversation stays private, and pick up a document already started. It is the direct enabler of both key journeys (RFP response, mission note) and of the round-1 success bar: connect, find the right skills, use them without friction.

## Stories

- Story 2.1: Conversations multiples et sélection active
- Story 2.2: Création d'une nouvelle conversation
- Story 2.3: Confidentialité de la conversation
- Story 2.4: Panneau Skills
- Story 2.5: Sélection du modèle et envoi d'un message
- Story 2.6: Panneau Livrables

## Requirements & Constraints

- A project can have multiple distinct conversations, each separately listed; exactly one is active at a time, visually distinguished from the rest; clicking one activates it and renders its history centrally. No delete/rename of conversations in round 1.
- "New conversation" creates an empty thread and makes it active immediately.
- Conversation privacy is a hard constraint, not a preference: no surface (present or future) may expose another consultant's conversation content. Only the deliverables/assets a conversation produces are visible to the rest of the project team — never the conversation itself.
- The Skills panel lists skills loaded on the project; the "Ajouter une skill" entry point stays visible even on an empty list — never an error state. The actual mechanism for attaching a skill to a project is out of scope for this epic (open question, resolved in architecture only as a storage shape).
- The composer's model selector offers a closed list of AI models only — it must never surface an agent or skill choice; that selection happens exclusively through the Skills panel. `Entrée` sends the message.
- Sending a message assembles the system prompt from the project's loaded skills, the active conversation's history, and the chosen model.
- The Livrables panel lists in-progress documents; when none exist yet, it shows a short prompt to create one — never a silent empty area.
- No more than one floating surface open at a time anywhere in the product (applies to the skill-add entry point here).
- Round-1 success bar (brief/PRD): a tester must be able to connect, find the skills/agents they need, and use them without a blocker — this epic carries most of that bar.

## Technical Decisions

- Mutation only ever happens through Server Actions (`actions/conversation.ts`); components never import `db/` or `integrations/` directly, only call an action or a `domain/` read.
- Skills are a TypeScript catalog (`skills/catalog.ts`), never free-form DB content. Any tool a skill exposes is named `${skillKey}.${toolName}` so two skills can never collide. `project_skill` stores only `(projectId, skillKey)` with a unique constraint on that pair — no duplicate loading.
- `PROJECT.activeConversationId` (nullable FK) is the sole source of truth for which conversation is displayed — never derived from a step field. `CONVERSATION.stepKey` (nullable) links a conversation to a fixed pre-sales workflow step (Epic 3 concern); it stays `null` for free-form/mission conversations, which is a valid, non-ambiguous state.
- A single `OverlayProvider` (client, app root) governs every floating surface via `openOverlay(id)`/`closeOverlay()`; opening one automatically closes the previous. No component keeps its own local `isOpen` for a full-screen or overlaid surface. Inline expansions (a panel growing in normal flow) are not affected.
- One assembly point, `skills/buildRequest.ts`, builds every `@anthropic-ai/sdk` Messages API call: system prompt concatenates loaded skills' instructions (load order), history is the active conversation's ordered messages, model is the one chosen in the composer for that message — never a hidden default.
- Server Actions return `{ ok: true, data } | { ok: false, error }`, never an uncaught exception reaching the UI. IDs are `crypto.randomUUID()` text primary keys.
- Relevant entities: `CONVERSATION {id, projectId, title, stepKey?}`, `MESSAGE {id, conversationId, role, content, model}`, `PROJECT_SKILL {projectId, skillKey}`, `LIVRABLE {id, projectId, conversationId?, title, content}` (this epic only lists livrables; editing content belongs to Epic 4).
- No auth/multi-user model exists yet in round 1 — conversation privacy (FR-10) has no real enforcement mechanism beyond the UI not surfacing other conversations; a future `ownerId` field is the anticipated fix, out of scope here.

## UX & Interaction Patterns

- Three-column layout: left sidebar 240px fixed (Conversations list, then Skills panel), center flexible (active conversation + composer), right sidebar 300px fixed (Contexte / Livrables / Mattermost panels, Contexte and Mattermost owned by Epic 1).
- Conversation list: active row uses `nav-row-active` styling (selected-tint background, bold text); "Nouvelle conversation" entry creates and activates a thread.
- Skills panel: card per skill; violet (`ai-accent`) reserved for the skill icon and any AI-originated element — never decoration. Empty state keeps "Ajouter une skill" as the first element, not an error message.
- Composer: input + closed model dropdown (e.g. Sonnet 5 / Opus 5 / Haiku 4.5, using `{elevation.dropdown}` since it floats) + send button; `Entrée` sends, `Échap` closes the model menu.
- Livrables panel (right sidebar): card list of in-progress documents; empty state is a short inviting prompt, not a blank box. Clicking a livrable is meant to open the Éditeur assisté, but that destination view is out of scope here (see Cross-Story Dependencies).
- Voice: professional, vouvoiement, sober microcopy, no emoji/exclamation — e.g. "Écrivez à l'IA…" not "Posez-moi votre question !".
- Accessibility floor: tab order follows reading order; `Échap` closes the topmost floating element (model menu, skill-add entry point).

## Cross-Story Dependencies

- Story 2.6's click-through from a listed livrable to the Éditeur assisté is delivered by Story 4.1 (Epic 4), which builds that destination view — this epic only ships the list and its empty state.
- Story 2.5 (model selection + send) depends on an active conversation existing (Story 2.1) and on the project's loaded skills (Story 2.4), since the assembled system prompt combines both with the chosen model.
- Story 2.2 (new conversation) and Story 2.1 (selection) share the same `activeConversationId` mechanism — creating a conversation is really a special case of "becomes active."
- The technical mechanism for attaching a skill to a project (Story 2.4's "Ajouter une skill" entry point) is explicitly deferred beyond this epic (PRD OQ-6); only the catalog display and entry point are in scope here.
