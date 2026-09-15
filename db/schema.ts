// Drizzle schema for GenAI4Consulting.
//
// Story 1.2 (Sélection d'un projet Octopod) adds the first two tables:
// PROJECT and APP_STATE. See ARCHITECTURE-SPINE.md "Structural Seed" for
// the full eventual model (CONVERSATION, DOCUMENT, …) — later stories add
// those as they need them; do not pre-create tables speculatively here.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// A project connected from Octopod. `activeConversationId` is part of the
// fixed shape from the architecture spine (AD-6: "seule source de vérité"
// for which conversation is displayed) but stays unused until Epic 2 wires
// up conversations.
export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  octopodProjectRef: text('octopod_project_ref').notNull(),
  name: text('name').notNull(),
  mattermostChannelRef: text('mattermost_channel_ref').notNull(),
  activeConversationId: text('active_conversation_id'),
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
