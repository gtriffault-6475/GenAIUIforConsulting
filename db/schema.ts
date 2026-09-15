// Drizzle schema for GenAI4Consulting.
//
// Story 1.2 (Sélection d'un projet Octopod) added the first two tables:
// PROJECT and APP_STATE. Story 1.3 (Panneau Contexte) adds DOCUMENT,
// shaped once to serve both this story's drive-sourced rows
// (`source: 'drive'`) and Story 1.4's manually-added ones
// (`source: 'manual'`) so it isn't re-shaped twice. Story 2.1
// (Conversations multiples et sélection active) adds CONVERSATION and
// MESSAGE. Story 2.4 (Panneau Skills) adds PROJECT_SKILL. See
// ARCHITECTURE-SPINE.md "Structural Seed" for the full eventual model
// (LIVRABLE, …) — later stories add those as they need them; do not
// pre-create tables speculatively here.
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// A project connected from Octopod. `activeConversationId` is part of the
// fixed shape from the architecture spine (AD-6: "seule source de vérité"
// for which conversation is displayed). The `.references()` callback below
// is lazy (only evaluated after the module finishes loading), so it can
// forward-reference `conversation`, declared further down this file.
export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  octopodProjectRef: text('octopod_project_ref').notNull(),
  name: text('name').notNull(),
  mattermostChannelRef: text('mattermost_channel_ref').notNull(),
  activeConversationId: text('active_conversation_id').references(
    (): AnySQLiteColumn => conversation.id,
  ),
});

// Singleton row tracking round-1's only notion of "session" (AD-6): the
// currently active project. `id` is always the fixed value in
// APP_STATE_ID — `actions/project.ts` upserts this one row, never inserts
// a second.
export const APP_STATE_ID = 'singleton';

export const appState = sqliteTable('app_state', {
  id: text('id').primaryKey(),
  activeProjectId: text('active_project_id').references(() => project.id),
});

// A document attached to a project's context, either mirrored from the
// (mocked) drive — `source: 'drive'`, this story's only concern — or
// added manually outside the drive (`source: 'manual'`, Story 1.4).
// `folderPath` is nullable and denormalized (per the architecture spine's
// structural seed): the mock has no real folder tree, just a flat
// string used to group documents in the Contexte panel.
export const document = sqliteTable('document', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id),
  name: text('name').notNull(),
  source: text('source', { enum: ['drive', 'manual'] }).notNull(),
  folderPath: text('folder_path'),
  content: text('content').notNull(),
});

// A conversation thread on a project (Story 2.1 — Conversations multiples
// et sélection active). No OCTO-side provider produces these (AD-1
// exempts app-internal data), so rows are written directly by
// `actions/conversation.ts`, never synced from an `integrations/*`
// adapter. `PROJECT.activeConversationId` — not any field here — is the
// sole source of truth for which conversation is active (AD-6).
export const conversation = sqliteTable('conversation', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id),
  title: text('title').notNull(),
});

// A single message within a CONVERSATION. `model` names the AI model that
// produced an `assistant` message (e.g. "Claude Sonnet 5"); it is null
// for `user` messages, which have no model of their own.
//
// FR-10 boundary (Story 2.3 — Confidentialité de la conversation): this
// table's content never travels outside `actions/conversation.ts`, and
// within that file, only `getActiveConversation` reads it — the sole
// action consumed by `ConversationHistory`, the conversation's own view.
// Every other surface that lists conversations (`ConversationList.tsx`
// today, a future Livrables panel from Story 2.6) reads `ConversationSummary`
// instead, which carries no content. A future Server Action reading this
// table must stay called exclusively from a conversation's own render
// path — never from a list/summary surface — to keep that boundary intact.
export const message = sqliteTable('message', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversation.id),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  model: text('model'),
});

// A skill loaded on a project (Story 2.4 — Panneau Skills). AD-4: this
// table stores only the join itself — no name/description/instructions
// column — because a skill's actual content lives exclusively as a fixed
// TypeScript constant in `skills/catalog.ts`; `actions/skill.ts` resolves
// `skillKey` against that catalog at read time. No standalone `id`/PK per
// the architecture spine's Structural Seed: the unique constraint on the
// pair itself is what prevents loading the same skill twice on a project
// (AD-4) — the mechanism that would insert new rows here (an actual
// "add a skill" feature) is explicitly deferred beyond this epic (PRD
// OQ-6).
export const projectSkill = sqliteTable(
  'project_skill',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    skillKey: text('skill_key').notNull(),
  },
  (table) => [unique().on(table.projectId, table.skillKey)],
);
