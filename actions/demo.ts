'use server';

import { eq, inArray } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { selectStep } from '@/actions/conversation';
import { db } from '@/db/client';
import { conversation, livrable, message, project } from '@/db/schema';
import { STEPS } from '@/domain/workflow';

// spec-simulation-demarrage-avant-vente.md. AD-2 exception, same rationale
// already established by `createLivrableWithSuggestions`
// (`actions/livrable.ts`) and `acceptSuggestion` (`actions/suggestion.ts`)
// — a demo-only tool, not a consultant-facing feature. This file (and
// `actions/conversation.ts` itself, via `selectStep` below) is the only
// place outside `actions/conversation.ts` allowed to write CONVERSATION/
// MESSAGE. Unlike this spec's first iteration, LIVRABLE is never deleted
// and SUGGESTION is never touched at all (see the spec's Spec Change Log):
// wiping LIVRABLE only fought a preexisting fixture-reseed mechanism in
// `actions/livrable.ts` that immediately undid the deletion on the very
// `router.refresh()` this action's own caller triggers, with no real
// benefit. The one LIVRABLE field this file does write —
// `conversationId`, cleared below, never `title`/`content` — exists only
// to unblock the CONVERSATION delete, not to modify the livrable itself.
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
