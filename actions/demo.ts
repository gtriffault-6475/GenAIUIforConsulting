'use server';

import { eq, inArray } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { selectStep } from '@/actions/conversation';
import { db } from '@/db/client';
import { APP_STATE_ID, appState, conversation, livrable, message, project, suggestion } from '@/db/schema';
import { STEPS } from '@/domain/workflow';

// spec-simulation-demarrage-avant-vente.md, extended by the Epic 4
// retrospective's follow-up (2026-09-23). AD-2 exception, same rationale
// already established by `createLivrableWithSuggestions`
// (`actions/livrable.ts`) and `acceptSuggestion` (`actions/suggestion.ts`)
// — a demo-only tool, not a consultant-facing feature. This file (and
// `actions/conversation.ts` itself, via `selectStep` below) is the only
// place outside `actions/conversation.ts`/`actions/message.ts`/
// `actions/suggestion.ts` allowed to write CONVERSATION/MESSAGE/SUGGESTION
// (MESSAGE is `actions/message.ts`'s exclusive concern since
// epic-2-retro-item-13's split). LIVRABLE itself is still never
// deleted (see the spec's Spec Change Log): wiping it only fought a
// preexisting fixture-reseed mechanism in `actions/livrable.ts` that
// immediately undid the deletion on the very `router.refresh()` this
// action's own caller triggers, with no real benefit. The one LIVRABLE
// field this file writes — `conversationId`, cleared below, never
// `title`/`content` — exists only to unblock the CONVERSATION delete, not
// to modify the livrable itself. SUGGESTION rows belonging to a livrable
// this reset orphans are deleted outright (retrospective finding #1,
// below) — the one exception to "LIVRABLE's own data stays untouched",
// justified by what leaving them live would mean for a supposedly-reset
// document.
//
// spec-toggle-mode-demo-ui.md extends this file's AD-2 exception to cover
// a second, unrelated write on APP_STATE: `getDemoModeActive`/
// `setDemoModeActive` below read/write its new `demoModeActive` column —
// the same singleton row `resetAvantVenteWorkflow` above already reads
// (`appStateRow`) for its stale-tab guard, but never wrote before this
// spec. Both live in this file rather than `actions/project.ts` (which
// owns PROJECT/APP_STATE's `activeProjectId`) because, like the rest of
// this file, they exist only for the demo tooling this product currently
// needs, not because APP_STATE itself is scoped to one file only.
//
// No table here has an `ON DELETE CASCADE` (`db/schema.ts`), so every FK
// into CONVERSATION.id must be cleared before that row is deleted, or the
// delete itself fails with `FOREIGN KEY constraint failed`
// (`PRAGMA foreign_keys = ON`, `db/client.ts`) — found the hard way, twice,
// for two different FKs: `PROJECT.activeConversationId` in this spec's
// first iteration (see its Implementation Notes), then `LIVRABLE.
// conversationId` in review of the second (`null` for the seed fixture,
// but a real conversation id whenever `createLivrableWithSuggestions`,
// `actions/livrable.ts`, drafted one through the normal chat flow — a case
// neither iteration's manual verification exercised until then). Both are
// cleared before the CONVERSATION delete; MESSAGE (which only ever
// references CONVERSATION, nothing references it) is deleted first,
// before either. One
// synchronous `db.transaction` (`node:sqlite` is a synchronous driver,
// same shape as every other multi-statement write in this codebase — e.g.
// `actions/project.ts`'s `selectProject`) — the `project.type` guard reads
// inside this same transaction rather than before it opens (Boundaries:
// Review Triage Log finding #3, a TOCTOU gap on a destructive action), so
// nothing can flip the project's type between the check and the delete.
//
// Once CONVERSATION/MESSAGE are gone and `activeConversationId` is `null`,
// this function calls `selectStep` (`actions/conversation.ts`) — never a
// reimplementation of its find-or-create-then-activate logic — to
// immediately recreate a conversation for the first step and make it
// active, landing the consultant straight on the proactive suggestion with
// no extra click on the Stepper. That call happens after this function's
// own transaction has committed: `selectStep` opens and commits its own
// transaction, and `node:sqlite`/better-sqlite-style synchronous drivers
// don't support nesting one transaction inside another.
export async function resetAvantVenteWorkflow(
  projectId: string,
): Promise<ActionResult<void>> {
  let guardError: string | null = null;

  try {
    db.transaction((tx) => {
      const [projectRow] = tx
        .select({ type: project.type })
        .from(project)
        .where(eq(project.id, projectId))
        .all();

      if (!projectRow) {
        guardError = 'Ce projet est introuvable.';
        return;
      }

      // Always (spec's Boundaries): this demo tool only ever applies to an
      // avant-vente project — refuse outright for any other project type
      // rather than silently no-op. Checked inside this same transaction,
      // not via a separate read beforehand, so nothing can change the
      // project's type between the check and the delete below.
      if (projectRow.type !== 'avant-vente') {
        guardError = "Cette action n'est disponible que pour une avant-vente.";
        return;
      }

      // Epic 4 retrospective (follow-up, 2026-09-23), finding #2: before the
      // project switcher existed, no code path could ever make a rendered
      // project "not the active one" — only one project could ever be
      // selected, so this check was unreachable and never needed. A stale
      // tab left open on this avant-vente project while another tab (or the
      // same one, via `ProjectSelector`) switches the active project away
      // from it must not be able to wipe a project's history it can no
      // longer even see refreshed.
      const [appStateRow] = tx
        .select({ activeProjectId: appState.activeProjectId })
        .from(appState)
        .where(eq(appState.id, APP_STATE_ID))
        .all();

      if (appStateRow?.activeProjectId !== projectId) {
        guardError = "Ce projet n'est pas (ou plus) le projet actif.";
        return;
      }

      // Epic 4 retrospective (follow-up, 2026-09-23), finding #1 (Option A,
      // validated): a livrable this reset is about to orphan (its
      // `conversationId` nulled below) keeps its own `SUGGESTION` rows
      // otherwise untouched — any still `pending`/`revising` one stayed
      // fully actionable (accept/reject/rework) on a document the consultant
      // believed had just been wiped. Deleting them here closes that gap
      // without touching `LIVRABLE` itself (still never deleted, still never
      // re-triggers `actions/livrable.ts`'s fixture-reseed condition — that
      // only fires when the `livrable` table itself is empty for the
      // project, which it never becomes here). `accepted`/`rejected`
      // suggestions are deleted too, same as `pending`/`revising`: they
      // belong to a livrable this reset is severing from the conversation
      // that produced them, and only this demo tool needs an opinion on
      // what happens next — a real product feature would need a different
      // answer, but nothing here is that.
      const orphanedLivrableRows = tx
        .select({ id: livrable.id })
        .from(livrable)
        .where(eq(livrable.projectId, projectId))
        .all();
      const orphanedLivrableIds = orphanedLivrableRows.map((row) => row.id);

      if (orphanedLivrableIds.length > 0) {
        tx.delete(suggestion)
          .where(inArray(suggestion.livrableId, orphanedLivrableIds))
          .run();
      }

      const conversationRows = tx
        .select({ id: conversation.id })
        .from(conversation)
        .where(eq(conversation.projectId, projectId))
        .all();
      const conversationIds = conversationRows.map((row) => row.id);

      // `inArray` with an empty array is skipped rather than issued: an
      // empty-array `IN ()` matches nothing anyway, but only after a real
      // (if trivial) query — this project may already have zero
      // conversations (e.g. a second reset in a row), and there is no
      // reason to pay for a no-op statement in that case.
      if (conversationIds.length > 0) {
        tx.delete(message)
          .where(inArray(message.conversationId, conversationIds))
          .run();
      }

      // Must run before the CONVERSATION delete below, not after: this
      // project's `activeConversationId` may still point at one of the
      // rows about to disappear, and FK enforcement rejects deleting a
      // row another row still references.
      tx.update(project)
        .set({ activeConversationId: null })
        .where(eq(project.id, projectId))
        .run();

      // Same reasoning, for the other non-cascading FK into CONVERSATION:
      // `LIVRABLE.conversationId` (`db/schema.ts`) is `null` for the seed
      // fixture but a real conversation id whenever
      // `createLivrableWithSuggestions` (`actions/livrable.ts`) drafted one
      // through the normal chat flow — deleting that conversation below
      // without clearing this first would fail the same way
      // `activeConversationId` did. Only `conversationId` is cleared, never
      // `title`/`content`, and the livrable row itself is never deleted
      // (Never: LIVRABLE/SUGGESTION stay untouched otherwise).
      tx.update(livrable)
        .set({ conversationId: null })
        .where(eq(livrable.projectId, projectId))
        .run();

      tx.delete(conversation).where(eq(conversation.projectId, projectId)).run();
    });

    if (guardError !== null) {
      return { ok: false, error: guardError };
    }

    // Recreate the first step's conversation and activate it immediately
    // — the spec's whole point (land on the proactive suggestion with no
    // extra click), and the same mechanism Epic 3's Stepper itself uses
    // (`selectStep`), never a parallel reimplementation.
    return await selectStep(projectId, STEPS[0].key);
  } catch (error) {
    console.error('resetAvantVenteWorkflow failed', error);
    return {
      ok: false,
      error: 'Impossible de réinitialiser cette avant-vente.',
    };
  }
}

// spec-toggle-mode-demo-ui.md — replaces `DEMO_MODE` (an environment
// variable, read once via `skills/demoScript.ts`'s now-removed
// `isDemoModeActive`) with this singleton column on APP_STATE, so toggling
// the demo mode from the UI takes effect immediately, with no
// `.env.local` edit or server restart. `?? false` covers both a
// pre-existing row whose column backfilled to `NULL` (no migration
// backfill, per `db/schema.ts`'s comment on this column) and the case
// where APP_STATE itself has no row yet (a fresh install that has never
// called `selectProject`/`setDemoModeActive`) — both mean "inactive",
// never a distinct error state, unlike `getActiveProject`'s handling of a
// dangling `activeProjectId` FK (there is no FK here to dangle).
export async function getDemoModeActive(): Promise<ActionResult<boolean>> {
  try {
    const [state] = await db
      .select({ demoModeActive: appState.demoModeActive })
      .from(appState)
      .where(eq(appState.id, APP_STATE_ID));

    return { ok: true, data: state?.demoModeActive ?? false };
  } catch (error) {
    console.error('getDemoModeActive failed', error);
    return {
      ok: false,
      error: "Impossible de lire l'état du mode démo.",
    };
  }
}

// Same upsert shape as `actions/project.ts`'s `selectProject` (APP_STATE
// is a true singleton row, fixed id: upsert, never a second insert) —
// `onConflictDoUpdate`'s `set` only touches `demoModeActive`, so a
// pre-existing `activeProjectId` on this row is never disturbed by
// toggling the demo mode, and vice versa (`selectProject`'s own `set`
// likewise never touches this column).
export async function setDemoModeActive(
  active: boolean,
): Promise<ActionResult<void>> {
  try {
    db.insert(appState)
      .values({ id: APP_STATE_ID, demoModeActive: active })
      .onConflictDoUpdate({
        target: appState.id,
        set: { demoModeActive: active },
      })
      .run();

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('setDemoModeActive failed', error);
    return {
      ok: false,
      error: "Impossible de modifier l'état du mode démo.",
    };
  }
}
