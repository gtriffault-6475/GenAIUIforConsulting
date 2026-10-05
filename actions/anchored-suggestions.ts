import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { livrable, suggestion } from '@/db/schema';
import { parseLivrableBlocks } from '@/domain/livrable';
import type { ProposedAnchoredSuggestions } from '@/skills/propose_anchored_suggestions';

// Story 5.4 — persistence of the `propose_anchored_suggestions` tool
// (`actions/message.ts`'s `executeTool`). Deliberately NOT a 'use server'
// file: only the agent's validated tool call may add suggestions, never a
// browser calling a Server Action. Like `createLivrableWithSuggestions`,
// this is a documented exception to "`actions/suggestion.ts` writes
// SUGGESTION": it adds rows only, in one transaction, and never touches
// LIVRABLE.content (AD-13: suggestions on existing zones only).
//
// Items are skipped, never replacing anything, for three reasons the
// caller reports to the agent separately: the zone already has an open
// (pending or revising) suggestion — the consultant decides on that one
// first; the zone no longer exists (reimported in another tab since the
// call was validated); the proposed text is identical to the zone's.
export type AnchoredSuggestionsOutcome = {
  added: number;
  skippedOpen: string[];
  skippedMissing: string[];
  skippedUnchanged: string[];
};

export function addAnchoredSuggestions(
  livrableId: string,
  items: ProposedAnchoredSuggestions,
): AnchoredSuggestionsOutcome {
  return db.transaction((tx) => {
    const row = tx.select({ content: livrable.content }).from(livrable).where(eq(livrable.id, livrableId)).get();
    const currentText = new Map(
      parseLivrableBlocks(row?.content ?? '').map((block) => [block.id, block.text]),
    );

    const open = new Set(
      tx
        .select({ anchorRef: suggestion.anchorRef })
        .from(suggestion)
        .where(
          and(
            eq(suggestion.livrableId, livrableId),
            eq(suggestion.type, 'anchored'),
            inArray(suggestion.status, ['pending', 'revising']),
          ),
        )
        .all()
        .map((item) => item.anchorRef),
    );

    const outcome: AnchoredSuggestionsOutcome = {
      added: 0,
      skippedOpen: [],
      skippedMissing: [],
      skippedUnchanged: [],
    };
    for (const item of items) {
      if (!currentText.has(item.blockId)) {
        outcome.skippedMissing.push(item.blockId);
        continue;
      }
      if (open.has(item.blockId)) {
        outcome.skippedOpen.push(item.blockId);
        continue;
      }
      if (currentText.get(item.blockId) === item.text) {
        outcome.skippedUnchanged.push(item.blockId);
        continue;
      }
      tx.insert(suggestion)
        .values({
          id: crypto.randomUUID(),
          livrableId,
          type: 'anchored',
          anchorRef: item.blockId,
          text: item.text,
          status: 'pending',
        })
        .run();
      open.add(item.blockId);
      outcome.added += 1;
    }
    return outcome;
  });
}
