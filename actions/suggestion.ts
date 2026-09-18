'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { listLoadedSkillInstructions } from '@/actions/skill';
import { db } from '@/db/client';
import { livrable, suggestion } from '@/db/schema';
import { applyAcceptedSuggestion } from '@/domain/suggestion';
import type { SuggestionStatus } from '@/domain/suggestion';
import { reworkSuggestionContent } from '@/skills/rework_suggestion';

// AD-2 — this is the only file allowed to read or write SUGGESTION, with
// one exception: `actions/livrable.ts`'s `createLivrableWithSuggestions`
// inserts SUGGESTION rows too, but only inside the same atomic transaction
// as the LIVRABLE row they belong to (the spec's Always) — every other
// read/write of this table stays exclusively here.
//
// Story 4.3 adds the reverse exception for LIVRABLE: `acceptSuggestion`
// below writes `LIVRABLE.content` too, but only inside the same atomic
// transaction as the SUGGESTION row it accepts (the spec's Always: "même
// exception documentée qu'actions/livrable.ts, en sens inverse") — every
// other read/write of LIVRABLE stays `actions/livrable.ts`'s exclusive
// concern.

// The shape `SuggestionsPanel` (Story 4.2) reads: an anchored suggestion
// reduced to what a read-only `ai-suggestion-card` renders.
// `resolveAnchorPosition` (`domain/suggestion.ts`) turns `anchorRef` (a
// block id) into the `¶N` position shown to the consultant — that
// resolution happens at render time against the livrable's current
// blocks, not here, so this type keeps the raw id rather than a
// precomputed position.
export type SuggestionSummary = {
  id: string;
  anchorRef: string | null;
  text: string;
  status: SuggestionStatus;
};

// Reads every SUGGESTION row for one livrable — the "instant" read Story
// 4.2's Acceptance Criteria requires (`app/livrables/[id]/page.tsx` calls
// this in parallel with `getLivrable`, never triggering an agent call at
// load time). No `status` filter here: Story 4.3's accepted/rejected
// suggestions must keep appearing (visually muted, per epic-4-context.md),
// so `SuggestionsPanel` itself decides how to render each status rather
// than this action pre-filtering the list down to `pending` only.
export async function listSuggestions(
  livrableId: string,
): Promise<ActionResult<SuggestionSummary[]>> {
  try {
    const rows = await db
      .select({
        id: suggestion.id,
        anchorRef: suggestion.anchorRef,
        text: suggestion.text,
        status: suggestion.status,
      })
      .from(suggestion)
      .where(eq(suggestion.livrableId, livrableId));

    return { ok: true, data: rows };
  } catch (error) {
    console.error('listSuggestions failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les suggestions de ce livrable.',
    };
  }
}

// Story 4.3 — Traitement d'une suggestion ancrée (FR-21, AD-2, AD-9). Reads
// the SUGGESTION row and its owning LIVRABLE, applies
// `applyAcceptedSuggestion` (`domain/suggestion.ts`, pure) to the
// livrable's current blocks, then writes both `LIVRABLE.content` and
// `SUGGESTION.status='accepted'` in one synchronous `db.transaction` — same
// shape as `createLivrableWithSuggestions`, per this file's header comment.
// Everything (the pending check included) happens inside that one
// transaction callback rather than in a preceding `await`ed read: two
// callers racing a double click on "Accepter" (Boundaries: "vérifient
// d'abord que la suggestion est encore pending -- pas de double
// traitement") cannot both observe `pending` and both apply the change —
// the second transaction to run sees the first's `accepted` write and
// bails out instead.
export async function acceptSuggestion(
  suggestionId: string,
): Promise<ActionResult<void>> {
  try {
    let result: ActionResult<void> | null = null;

    db.transaction((tx) => {
      const [suggestionRow] = tx
        .select()
        .from(suggestion)
        .where(eq(suggestion.id, suggestionId))
        .all();

      if (!suggestionRow) {
        result = { ok: false, error: 'Cette suggestion est introuvable.' };
        return;
      }

      if (suggestionRow.status !== 'pending') {
        result = {
          ok: false,
          error: 'Cette suggestion a déjà été traitée.',
        };
        return;
      }

      if (suggestionRow.anchorRef === null) {
        // Not reachable via this story's own write path (every suggestion
        // `createLivrableWithSuggestions` inserts is `anchored`, Story
        // 4.4's `global` revisions have no block to apply to) — defensive
        // only, mirroring `createLivrableWithSuggestions`'s own
        // defense-in-depth comment.
        result = {
          ok: false,
          error: "Cette suggestion ne cible aucun paragraphe.",
        };
        return;
      }

      const [livrableRow] = tx
        .select()
        .from(livrable)
        .where(eq(livrable.id, suggestionRow.livrableId))
        .all();

      if (!livrableRow) {
        result = { ok: false, error: 'Le livrable ciblé est introuvable.' };
        return;
      }

      const content = JSON.parse(livrableRow.content) as { blocks?: unknown };
      if (!Array.isArray(content?.blocks)) {
        console.error(
          'acceptSuggestion: malformed content.blocks',
          livrableRow.id,
        );
        result = { ok: false, error: 'Impossible de traiter cette suggestion.' };
        return;
      }

      const blocks = content.blocks as { id: string; text: string }[];
      const nextBlocks = applyAcceptedSuggestion(
        blocks,
        suggestionRow.anchorRef,
        suggestionRow.text,
      );

      tx.update(livrable)
        .set({ content: JSON.stringify({ blocks: nextBlocks }) })
        .where(eq(livrable.id, livrableRow.id))
        .run();

      tx.update(suggestion)
        .set({ status: 'accepted' })
        .where(eq(suggestion.id, suggestionId))
        .run();

      result = { ok: true, data: undefined };
    });

    return result ?? { ok: false, error: 'Impossible de traiter cette suggestion.' };
  } catch (error) {
    console.error('acceptSuggestion failed', error);
    return { ok: false, error: 'Impossible de traiter cette suggestion.' };
  }
}

// Story 4.3 — Traitement d'une suggestion ancrée (FR-21). Never touches
// LIVRABLE (Always: "document inchangé") — the transaction below exists
// only to make the pending-check-then-write atomic (same reasoning as
// `acceptSuggestion`), not to couple two tables.
export async function rejectSuggestion(
  suggestionId: string,
): Promise<ActionResult<void>> {
  try {
    let result: ActionResult<void> | null = null;

    db.transaction((tx) => {
      const [suggestionRow] = tx
        .select({ status: suggestion.status })
        .from(suggestion)
        .where(eq(suggestion.id, suggestionId))
        .all();

      if (!suggestionRow) {
        result = { ok: false, error: 'Cette suggestion est introuvable.' };
        return;
      }

      if (suggestionRow.status !== 'pending') {
        result = {
          ok: false,
          error: 'Cette suggestion a déjà été traitée.',
        };
        return;
      }

      tx.update(suggestion)
        .set({ status: 'rejected' })
        .where(eq(suggestion.id, suggestionId))
        .run();

      result = { ok: true, data: undefined };
    });

    return result ?? { ok: false, error: 'Impossible de traiter cette suggestion.' };
  } catch (error) {
    console.error('rejectSuggestion failed', error);
    return { ok: false, error: 'Impossible de traiter cette suggestion.' };
  }
}

// Story 4.3 — Traitement d'une suggestion ancrée (FR-21, AD-11). Two
// phases, per the spec's Always ("statut revising avant l'appel,
// pending+nouveau texte au succès, pending+ancien texte à l'échec --
// jamais bloqué sur revising"):
//
// 1. A first, short transaction moves the suggestion from `pending` to
//    `revising` — same pending-check shape as `acceptSuggestion`/
//    `rejectSuggestion`, so a double submit can never start two concurrent
//    reworks on the same suggestion. The suggestion's own `text` and
//    `anchorRef` are captured here, before any `await`, since nothing else
//    may change them while this function holds `revising`.
// 2. Everything from here on (reading the livrable, loading the owning
//    project's skills, calling the agent) is wrapped so that *any* failure
//    — not just the agent call itself — restores `pending` with the
//    original text rather than leaving the row stuck on `revising`.
export async function reworkSuggestion(
  suggestionId: string,
  instructions: string,
): Promise<ActionResult<void>> {
  const trimmedInstructions = instructions.trim();
  if (!trimmedInstructions) {
    return { ok: false, error: 'Les précisions ne peuvent pas être vides.' };
  }

  let captured: {
    livrableId: string;
    anchorRef: string | null;
    text: string;
  } | null = null;

  // A plain `string | null` rather than an `ActionResult<void> | null` —
  // TypeScript's control-flow analysis does not see assignments made
  // inside `db.transaction`'s callback, so it keeps treating this variable
  // as statically `null` past the call; narrowing that `null` away via
  // `guardError !== null` still type-checks correctly (the branch's
  // apparent `never` type is a safe subtype of `string`), whereas the same
  // trick on a discriminated union would fail as soon as `.ok` is
  // accessed on it. `captured` (below) is what actually decides
  // success/failure control flow; this only carries the message for the
  // failure case.
  let guardError: string | null = null;

  try {
    db.transaction((tx) => {
      const [suggestionRow] = tx
        .select()
        .from(suggestion)
        .where(eq(suggestion.id, suggestionId))
        .all();

      if (!suggestionRow) {
        guardError = 'Cette suggestion est introuvable.';
        return;
      }

      if (suggestionRow.status !== 'pending') {
        guardError =
          'Cette suggestion est déjà en cours de retravail ou a déjà été traitée.';
        return;
      }

      captured = {
        livrableId: suggestionRow.livrableId,
        anchorRef: suggestionRow.anchorRef,
        text: suggestionRow.text,
      };

      tx.update(suggestion)
        .set({ status: 'revising' })
        .where(eq(suggestion.id, suggestionId))
        .run();
    });

    if (guardError !== null) {
      return { ok: false, error: guardError };
    }
  } catch (error) {
    console.error(
      'reworkSuggestion failed to move the suggestion to revising',
      error,
    );
    return { ok: false, error: 'Impossible de retravailler cette suggestion.' };
  }

  if (!captured) {
    console.error('reworkSuggestion: transaction reported ok without capturing the row');
    return { ok: false, error: 'Impossible de retravailler cette suggestion.' };
  }
  const { livrableId, anchorRef, text: previousText } = captured;

  // From here the suggestion is durably `revising` — every remaining
  // failure path below must restore `pending`+`previousText` before
  // returning, never leave it stuck (Always).
  try {
    const [livrableRow] = await db
      .select({ projectId: livrable.projectId, content: livrable.content })
      .from(livrable)
      .where(eq(livrable.id, livrableId));

    if (!livrableRow) {
      throw new Error('Le livrable ciblé est introuvable.');
    }

    const content = JSON.parse(livrableRow.content) as { blocks?: unknown };
    const blocks = Array.isArray(content?.blocks)
      ? (content.blocks as { id: string; text: string }[])
      : [];
    const blockText = anchorRef
      ? (blocks.find((block) => block.id === anchorRef)?.text ?? '')
      : '';

    const loadedSkillsResult = await listLoadedSkillInstructions(
      livrableRow.projectId,
    );
    if (!loadedSkillsResult.ok) {
      throw new Error(loadedSkillsResult.error);
    }

    const reworkResult = await reworkSuggestionContent({
      blockText,
      suggestionText: previousText,
      instructions: trimmedInstructions,
      loadedSkills: loadedSkillsResult.data,
    });

    if (!reworkResult.ok) {
      try {
        db.update(suggestion)
          .set({ status: 'pending' })
          .where(eq(suggestion.id, suggestionId))
          .run();
      } catch (revertError) {
        // Never let a failure to *revert* mask or replace the agent
        // failure already being reported below, and never let it escape
        // uncaught either (Always: "jamais bloqué sur revising") — logged
        // only, same as the outer catch's own revert below.
        console.error(
          'reworkSuggestion: failed to revert status to pending after agent failure',
          revertError,
        );
      }
      return { ok: false, error: reworkResult.error };
    }

    db.update(suggestion)
      .set({ status: 'pending', text: reworkResult.content })
      .where(eq(suggestion.id, suggestionId))
      .run();

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('reworkSuggestion failed', error);
    // Same rule as the agent-failure branch above: restore `pending` with
    // the untouched original text rather than leaving `revising` behind,
    // regardless of which step in this second phase actually threw. Wrapped
    // in its own try/catch too: this revert must never itself throw out of
    // `reworkSuggestion` (Always: "jamais bloqué sur revising") — if it
    // fails, the row stays on `revising` until a future story addresses
    // that separately, but the caller still gets a well-formed
    // `ActionResult` instead of a rejected promise.
    try {
      db.update(suggestion)
        .set({ status: 'pending' })
        .where(eq(suggestion.id, suggestionId))
        .run();
    } catch (revertError) {
      console.error(
        'reworkSuggestion: failed to revert status to pending after an unexpected error',
        revertError,
      );
    }
    return {
      ok: false,
      error: 'Le retravail de cette suggestion a échoué.',
    };
  }
}
