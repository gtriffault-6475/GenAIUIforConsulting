'use server';

import { and, eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { listLoadedSkillInstructions } from '@/actions/skill';
import { db } from '@/db/client';
import { livrable, suggestion } from '@/db/schema';
import { applyAcceptedSuggestion, resolveAnchorPosition } from '@/domain/suggestion';
import type { SuggestionStatus } from '@/domain/suggestion';
import { reworkSuggestionContent } from '@/skills/rework_suggestion';

// AD-2 — this is the only file allowed to read or write SUGGESTION, with
// two exceptions: `actions/livrable.ts`'s `createLivrableWithSuggestions`/
// `updateLivrableWithSuggestions` insert and reject SUGGESTION rows too,
// but only inside the same atomic transaction as the LIVRABLE row they
// belong to (the spec's Always); and `actions/demo.ts`'s
// `resetAvantVenteWorkflow` (Epic 4 retrospective follow-up, 2026-09-23)
// deletes every SUGGESTION row belonging to a livrable it is about to
// orphan — a demo-only tool, not a normal product write path. Every other
// read/write of this table stays exclusively here.
//
// Story 4.3 adds the reverse exception for LIVRABLE: `acceptSuggestion`
// below writes `LIVRABLE.content` too, but only inside the same atomic
// transaction as the SUGGESTION row it accepts (the spec's Always: "même
// exception documentée qu'actions/livrable.ts, en sens inverse") — every
// other read/write of LIVRABLE stays `actions/livrable.ts`'s exclusive
// concern. spec-position-figee-suggestions-resolues extends this:
// `rejectSuggestion` now also *reads* LIVRABLE (to freeze `resolvedPosition`
// against the current blocks) — it still never writes LIVRABLE's content,
// same boundary as before, just no longer blind to the table.

// The shape `SuggestionsPanel` (Story 4.2) reads: an anchored suggestion
// reduced to what a read-only `ai-suggestion-card` renders.
// `resolveAnchorPosition` (`domain/suggestion.ts`) turns `anchorRef` (a
// block id) into the `¶N` position shown to the consultant — that
// resolution happens at render time against the livrable's current
// blocks, not here, so this type keeps the raw id rather than a
// precomputed position.
// `resolvedPosition` (spec-position-figee-suggestions-resolues): the `¶N`
// position frozen at the moment this suggestion became `accepted`/
// `rejected` — `null` while still `pending`/`revising`, and also `null` for
// a suggestion resolved before this column existed (no backfill). Consumers
// (`SuggestionCard.tsx`) prefer this value over live resolution once it is
// non-null.
export type SuggestionSummary = {
  id: string;
  anchorRef: string | null;
  text: string;
  status: SuggestionStatus;
  resolvedPosition: number | null;
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
        resolvedPosition: suggestion.resolvedPosition,
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

// epic-4-retro-item-22 ("étendre epic-2-retro-item-12 au motif de garde
// 'pending' dupliqué dans actions/suggestion.ts"). Contrairement à
// `seedIfEmpty` (`actions/seed-if-empty.ts`), qui reste volontairement
// table-agnostique pour respecter AD-2 entre fichiers, cette garde est
// spécifique à SUGGESTION et reste donc privée à ce fichier -- son seul
// propriétaire. Prend le `tx` déjà ouvert par l'appelante (jamais son
// propre `db.transaction`), lit la ligne complète (comme `acceptSuggestion`/
// `reworkSuggestion` le faisaient déjà -- la sélection partielle que
// `rejectSuggestion` faisait avant ce refactor n'exploitait aucune
// restriction, donc rien d'observable ne change), et centralise les deux
// vérifications répétées 3x : introuvable, puis `status !== 'pending'`. Le
// message "déjà traitée" reste paramétrable : `reworkSuggestion` en gardait
// un texte différent des deux autres, préservé via `alreadyProcessedError`.
// Renvoie `ActionResult<typeof suggestion.$inferSelect>` (même convention
// que le reste du fichier) plutôt qu'une union ad hoc -- la ligne chargée
// est dans `.data`, pas `.row`, comme n'importe quel autre `ActionResult`
// de ce fichier.
type SuggestionTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

function loadPendingSuggestion(
  tx: SuggestionTransaction,
  suggestionId: string,
  alreadyProcessedError: string = 'Cette suggestion a déjà été traitée.',
): ActionResult<typeof suggestion.$inferSelect> {
  const [row] = tx
    .select()
    .from(suggestion)
    .where(eq(suggestion.id, suggestionId))
    .all();

  if (!row) {
    return { ok: false, error: 'Cette suggestion est introuvable.' };
  }

  if (row.status !== 'pending') {
    return { ok: false, error: alreadyProcessedError };
  }

  return { ok: true, data: row };
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
      const guard = loadPendingSuggestion(tx, suggestionId);
      if (!guard.ok) {
        result = { ok: false, error: guard.error };
        return;
      }
      const suggestionRow = guard.data;

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

      // spec-position-figee-suggestions-resolues: frozen once, here, in the
      // same transaction as the `accepted` write — computed against the
      // blocks as they stood *before* this suggestion's own edit is applied
      // (the position it occupied when the consultant made the decision),
      // never recomputed after a later global revision regenerates block
      // ids. `resolveAnchorPosition` already degrades to `null` if the
      // anchor is somehow unresolvable — not reachable today (this
      // suggestion's `anchorRef` was just read from a block in these same
      // `blocks`), but no less defensive than `resolveAnchorPosition`'s own
      // existing contract.
      const resolvedPosition = resolveAnchorPosition(
        blocks,
        suggestionRow.anchorRef,
      );

      tx.update(livrable)
        .set({ content: JSON.stringify({ blocks: nextBlocks }) })
        .where(eq(livrable.id, livrableRow.id))
        .run();

      tx.update(suggestion)
        .set({ status: 'accepted', resolvedPosition })
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

// Story 4.3 — Traitement d'une suggestion ancrée (FR-21). Never writes
// `LIVRABLE.content` (Always: "document inchangé") — the transaction below
// still reads LIVRABLE (spec-position-figee-suggestions-resolues: needed to
// freeze `resolvedPosition` at the same moment as the `rejected` write) and
// exists to make the pending-check-then-write atomic (same reasoning as
// `acceptSuggestion`), not to couple the two tables' writes.
export async function rejectSuggestion(
  suggestionId: string,
): Promise<ActionResult<void>> {
  try {
    let result: ActionResult<void> | null = null;

    db.transaction((tx) => {
      const guard = loadPendingSuggestion(tx, suggestionId);
      if (!guard.ok) {
        result = { ok: false, error: guard.error };
        return;
      }
      const suggestionRow = guard.data;

      // spec-position-figee-suggestions-resolues: same freeze as
      // `acceptSuggestion`, computed here so a later global revision can
      // regenerate every block id without degrading this suggestion's
      // already-decided `¶N`. `anchorRef` is only ever null for a `global`
      // suggestion (not reachable via this UI today, `SuggestionCard`'s only
      // caller — defensive, mirroring `acceptSuggestion`'s own guard) — in
      // that case there is no paragraph to resolve a position for, so
      // `resolvedPosition` simply stays `null`, same as an unresolvable
      // anchor.
      let resolvedPosition: number | null = null;
      if (suggestionRow.anchorRef !== null) {
        const [livrableRow] = tx
          .select({ content: livrable.content })
          .from(livrable)
          .where(eq(livrable.id, suggestionRow.livrableId))
          .all();

        if (livrableRow) {
          // Review finding (spec-position-figee-suggestions-resolues,
          // review_loop_iteration 1): this `JSON.parse` must never abort the
          // rejection itself — before this spec, `rejectSuggestion` never
          // touched LIVRABLE at all and could not fail this way. A malformed
          // `content` (not reachable today, every write goes through
          // `JSON.stringify`, same defensive posture as `acceptSuggestion`)
          // now only degrades `resolvedPosition` to `null`, exactly like an
          // unresolvable anchor — the `status: 'rejected'` write below still
          // goes through.
          try {
            const content = JSON.parse(livrableRow.content) as { blocks?: unknown };
            if (Array.isArray(content?.blocks)) {
              const blocks = content.blocks as { id: string; text: string }[];
              resolvedPosition = resolveAnchorPosition(
                blocks,
                suggestionRow.anchorRef,
              );
            } else {
              console.error(
                'rejectSuggestion: malformed content.blocks',
                suggestionRow.livrableId,
              );
            }
          } catch (error) {
            console.error(
              'rejectSuggestion: failed to parse livrable content',
              suggestionRow.livrableId,
              error,
            );
          }
        } else {
          console.error(
            'rejectSuggestion: owning livrable not found',
            suggestionRow.livrableId,
          );
        }
      }

      tx.update(suggestion)
        .set({ status: 'rejected', resolvedPosition })
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
//
// Fiabilité de la révision globale et de la concurrence des suggestions
// (spec-fiabilite-revision-suggestions, CAP-2): all 3 writes back to
// `pending` below (success, agent failure, unexpected error) are guarded by
// `AND status = 'revising'`, the same guard-then-write shape already used
// by `acceptSuggestion`/`rejectSuggestion`. A concurrent global revision
// (`updateLivrableWithSuggestions`) can flip this row to `rejected` while
// the agent call above is still in flight — once that happens, none of
// these 3 writes may resurrect it as `pending` with a now-stale
// `anchorRef`. Guarded, so a write with a stale condition simply matches
// zero rows — a silent no-op, never a thrown error, never a block (Always:
// "jamais bloqué sur revising").
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
      const guard = loadPendingSuggestion(
        tx,
        suggestionId,
        'Cette suggestion est déjà en cours de retravail ou a déjà été traitée.',
      );
      if (!guard.ok) {
        guardError = guard.error;
        return;
      }
      const suggestionRow = guard.data;

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
        const revert = db
          .update(suggestion)
          .set({ status: 'pending' })
          .where(
            and(
              eq(suggestion.id, suggestionId),
              eq(suggestion.status, 'revising'),
            ),
          )
          .run();
        if (revert.changes === 0) {
          // The row already moved on (e.g. a concurrent global revision
          // rejected it) — the revert is a no-op, not a failure of this
          // branch. Logged only: the error already being returned below is
          // what actually went wrong, unaffected by whether the revert
          // itself found a row to touch.
          console.error(
            'reworkSuggestion: revert to pending no-op’d, suggestion already moved on',
            suggestionId,
          );
        }
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

    const applied = db
      .update(suggestion)
      .set({ status: 'pending', text: reworkResult.content })
      .where(
        and(
          eq(suggestion.id, suggestionId),
          eq(suggestion.status, 'revising'),
        ),
      )
      .run();

    if (applied.changes === 0) {
      // The guard missed — a concurrent global revision already moved this
      // row on (e.g. to `rejected`) while the agent call above was in
      // flight. Returning `{ok:true}` here would silently discard the
      // consultant's newly reworked text with no explanation; report it
      // instead of pretending the rework landed.
      return {
        ok: false,
        error: 'Cette suggestion a été traitée entre-temps.',
      };
    }

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
      const revert = db
        .update(suggestion)
        .set({ status: 'pending' })
        .where(
          and(
            eq(suggestion.id, suggestionId),
            eq(suggestion.status, 'revising'),
          ),
        )
        .run();
      if (revert.changes === 0) {
        // Same reasoning as the agent-failure branch above: the row already
        // moved on, so this revert is a no-op, not a new failure — logged
        // only, the error returned below is unaffected.
        console.error(
          'reworkSuggestion: revert to pending no-op’d, suggestion already moved on',
          suggestionId,
        );
      }
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
