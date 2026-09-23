// Drizzle schema for GenAI4Consulting.
//
// Story 1.2 (Sélection d'un projet Octopod) added the first two tables:
// PROJECT and APP_STATE. Story 1.3 (Panneau Contexte) adds DOCUMENT,
// shaped once to serve both this story's drive-sourced rows
// (`source: 'drive'`) and Story 1.4's manually-added ones
// (`source: 'manual'`) so it isn't re-shaped twice. Story 2.1
// (Conversations multiples et sélection active) adds CONVERSATION and
// MESSAGE. Story 2.4 (Panneau Skills) adds PROJECT_SKILL. Story 2.6
// (Panneau Livrables) adds LIVRABLE. Story 3.1 (Stepper de workflow) adds
// CONVERSATION.stepKey. See ARCHITECTURE-SPINE.md "Structural Seed" for
// the full eventual model (SUGGESTION, …) — later stories add those as
// they need them; do not pre-create tables speculatively here.
import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  // Story 3.2 — Workflow du cas "livrable de mission". Comes from Octopod
  // like `octopodProjectRef`/`mattermostChannelRef` above, never a
  // locally-invented concept (AD-1). `.default('avant-vente')` is a
  // migration-time backfill value only — `selectProject` always supplies
  // the real value from the provider on every insert/update, exactly like
  // `message.createdAt`'s default (Story 2.5) avoids the same NOT-NULL-
  // without-default trap on a non-empty table.
  type: text('type', { enum: ['avant-vente', 'mission'] })
    .notNull()
    .default('avant-vente'),
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
//
// `stepKey` (Story 3.1 — Stepper de workflow) rattache une conversation à
// une des 4 étapes fixes du stepper avant-vente (`domain/workflow.ts`'s
// `STEPS`). Nullable: `null` means a free-form conversation not attached
// to any step — Story 2.1's two fixture conversations and every
// conversation created via "Nouvelle conversation" (Story 2.2) keep it
// null, and so will Story 3.2's mission-case conversations — a valid,
// unambiguous state, not "not yet configured" (AD-6,
// ARCHITECTURE-SPINE.md). The partial unique index below enforces "one
// conversation per step per project" only among non-null rows; any number
// of rows may each hold `stepKey = null`.
export const conversation = sqliteTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    title: text('title').notNull(),
    stepKey: text('step_key'),
  },
  (table) => [
    uniqueIndex('conversation_project_id_step_key_unique')
      .on(table.projectId, table.stepKey)
      .where(sql`${table.stepKey} is not null`),
  ],
);

// A single message within a CONVERSATION. `model` names the AI model that
// produced an `assistant` message (e.g. "Claude Sonnet 5"); it is null
// for `user` messages, which have no model of their own. `createdAt`
// (Story 2.5 — Sélection du modèle et envoi d'un message) is an ISO-8601
// string ordering column: neither `actions/conversation.ts` (fixture
// seeding) nor `actions/message.ts` (`sendMessage`, real messages) relies
// on SQLite's implicit scan order (see `deferred-work.md`'s Story 2.1
// entry) now that real messages are appended one at a time via
// `sendMessage` instead of only ever being seeded together as fixtures.
//
// FR-10 boundary (Story 2.3 — Confidentialité de la conversation): this
// table's content never reaches a list/summary surface. Exactly two
// Server Actions read it, both internal to a conversation's own flow,
// never a list/summary one: `getActiveConversation`
// (`actions/conversation.ts`), the sole action consumed by
// `ConversationHistory` (the conversation's own view), and `sendMessage`
// (`actions/message.ts`, epic-2-retro-item-13), which reads this
// conversation's own history to build the agent's request and appends to
// it — never to serve any other surface. Every other surface that lists
// conversations (`ConversationList.tsx` today, a future Livrables panel
// from Story 2.6) reads `ConversationSummary` instead, which carries no
// content. A future Server Action reading this table must stay called
// exclusively from a conversation's own render/send path — never from a
// list/summary surface — to keep that boundary intact.
export const message = sqliteTable('message', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversation.id),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  model: text('model'),
  // `.default(...)` here is a migration-time backfill value only, never
  // relied on by the app: every real insert always gets a real `createdAt`
  // (epic-2-retro-item-15) via `actions/insert-message.ts`'s shared
  // `insertMessage` — real messages (`actions/message.ts`'s `sendMessage`)
  // let it default to `new Date().toISOString()`, `actions/conversation.ts`'s
  // fixture seeding always overrides it with its own deliberately backdated
  // sequence — never this DB-level default. Without a default, SQLite
  // rejects `ALTER TABLE message ADD created_at text NOT NULL` outright on
  // any table that already has rows — which every pre-existing local dev
  // DB does, since Story 2.1's fixtures seed on first read. The epoch
  // value sorts before every real ISO-8601 timestamp, so backfilled rows
  // from before this column existed correctly appear first.
  createdAt: text('created_at').notNull().default('1970-01-01T00:00:00.000Z'),
});

// A skill loaded on a project (Story 2.4 — Panneau Skills). AD-4: this
// table stores only the join itself — no name/description/instructions
// column — because a skill's actual content lives exclusively as a fixed
// TypeScript constant in `skills/catalog.ts`; `actions/skill.ts` resolves
// `skillKey` against that catalog at read time. No standalone `id`/PK per
// the architecture spine's Structural Seed: the unique constraint on the
// pair itself is what prevents loading the same skill twice on a project
// (AD-4). The real "add a skill" feature is explicitly deferred beyond
// this epic (PRD OQ-6) — the only mechanism inserting rows here today is
// `actions/skill.ts`'s own `seedFixturesIfEmpty`.
//
// `position` (epic-2-retro-item-14, AD-11: "garantir l'ordre de
// chargement des skills"): without it, `listProjectSkills`/
// `listLoadedSkillInstructions` relied on SQLite's own unspecified row
// order, which turned out to already diverge from insertion order in
// practice — the unique index on `(project_id, skill_key)` above makes
// SQLite satisfy a `WHERE project_id = ?` scan via that index (a real,
// verified query plan: `SEARCH ... USING COVERING INDEX`), returning rows
// sorted by `skill_key` rather than by insertion, which flips the two
// fixture skills' order for `proj-audit-mission` today: `references` is
// inserted first (`FIXTURE_PROJECT_SKILLS`, `actions/skill.ts`), but
// `mission-scoping` sorts alphabetically before it, so it comes back
// first instead. Nullable, like `suggestion.resolvedPosition` below,
// rather than `message.createdAt`'s `.notNull().default(...)`: a single literal
// default cannot express the real, distinct per-row backfill value this
// column needs (0, 1, 0, 1... per project), so the migration backfills it
// with a real per-project sequence instead (see its `migration.sql`) and
// every future insert sets it explicitly (`actions/skill.ts`'s
// `seedFixturesIfEmpty`, the sole writer, AD-2) — never actually `null`
// on any row this app itself ever produces.
export const projectSkill = sqliteTable(
  'project_skill',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    skillKey: text('skill_key').notNull(),
    position: integer('position'),
  },
  (table) => [unique().on(table.projectId, table.skillKey)],
);

// A deliverable document being drafted on a project (Story 2.6 — Panneau
// Livrables), per the Structural Seed. `conversationId` is nullable — the
// conversation the livrable originated from, used by a future global
// revision (AD-10); this round's seed rows don't set it. `content` is a
// JSON string shaped `{blocks:[{id,text}]}` (AD-9: each block carries a
// stable id a future anchored suggestion can target) from the moment a
// row is created, even though nothing in this story reads or writes it
// beyond the `title` a card displays — fixing the shape now avoids a
// migration when Epic 4's Éditeur assisté starts reading/writing it. Both
// FKs and `content` are brand-new columns on a brand-new table (a plain
// `CREATE TABLE`, not an `ALTER TABLE` on a table with existing rows), so
// none of them need a `.default(...)` the way `message.createdAt` did —
// see that column's comment for why a default would matter there.
export const livrable = sqliteTable('livrable', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id),
  conversationId: text('conversation_id').references(() => conversation.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
});

// An AI-authored suggestion on a LIVRABLE (Story 4.2 — Génération des
// suggestions ancrées à l'écriture), per the Structural Seed. `type`
// distinguishes an `anchored` suggestion (targets one paragraph, via
// `anchorRef`) from a `global` one (Story 4.4's whole-document revision,
// `anchorRef` null) — both share this one table rather than two, since
// every other column (`text`, `status`) means the same thing for both.
// `anchorRef` holds a block *id* from the owning LIVRABLE's
// `content.blocks` (never a position — epic-4-context.md's Technical
// Decisions: "l'ordre des autres blocs n'affecte jamais la résolution de
// l'ancre"), resolved to a display position only at render time by
// `domain/suggestion.ts`'s `resolveAnchorPosition`. `status` reuses the
// same four literals as `domain/suggestion.ts`'s `SuggestionStatus` — that
// file is the only place this enum is *defined* (Consistency Conventions),
// this column just repeats its values as SQLite doesn't let a `.enum(...)`
// reference an external TS type.
//
// The partial unique index enforces epic-4-context.md's "une seule
// suggestion ancrée en attente par paragraphe à la fois": at most one
// `pending`+`anchored` row per `(livrableId, anchorRef)` pair. `global`
// suggestions (`anchorRef` null) are excluded by the `type = 'anchored'`
// clause — any number of pending global revisions may coexist, per the
// same Technical Decisions.
//
// `resolvedPosition` (spec-position-figee-suggestions-resolues, epic-4-retro
// finding #3): the 1-based `¶N` position computed once, via
// `domain/suggestion.ts`'s `resolveAnchorPosition`, at the exact moment an
// `accepted`/`rejected` transition is written (`actions/suggestion.ts`) —
// never recomputed afterwards, even if a later global revision regenerates
// every block id in this livrable. Nullable, no default: rows already
// `accepted`/`rejected` before this migration keep `resolvedPosition: null`
// forever (no backfill, per the spec's Always) and fall back to today's
// live resolution, unchanged. Still `null` while a suggestion is
// `pending`/`revising` — those statuses never set this column, they keep
// resolving live via `resolveAnchorPosition` against the current blocks.
export const suggestion = sqliteTable(
  'suggestion',
  {
    id: text('id').primaryKey(),
    livrableId: text('livrable_id')
      .notNull()
      .references(() => livrable.id),
    type: text('type', { enum: ['anchored', 'global'] }).notNull(),
    anchorRef: text('anchor_ref'),
    text: text('text').notNull(),
    status: text('status', {
      enum: ['pending', 'accepted', 'rejected', 'revising'],
    }).notNull(),
    resolvedPosition: integer('resolved_position'),
  },
  (table) => [
    uniqueIndex('suggestion_livrable_id_anchor_ref_pending_anchored_unique')
      .on(table.livrableId, table.anchorRef)
      .where(sql`${table.status} = 'pending' and ${table.type} = 'anchored'`),
  ],
);
