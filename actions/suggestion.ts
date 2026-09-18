'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { suggestion } from '@/db/schema';
import type { SuggestionStatus } from '@/domain/suggestion';

// AD-2 — this is the only file allowed to read or write SUGGESTION, with
// one exception: `actions/livrable.ts`'s `createLivrableWithSuggestions`
// inserts SUGGESTION rows too, but only inside the same atomic transaction
// as the LIVRABLE row they belong to (the spec's Always) — every other
// read/write of this table stays exclusively here. Story 4.3's
// Accepter/Rejeter/Retravailler mutations land in this file too, once that
// story adds them.

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
