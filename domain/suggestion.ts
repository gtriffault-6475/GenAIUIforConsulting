// Story 4.2 — Génération des suggestions ancrées à l'écriture. Second file
// in `domain/` (after `workflow.ts`) — AD-5: no import of `db/`,
// `integrations/`, `actions/`, or React here, ever.

// The single, shared definition of a suggestion's status
// (epic-4-context.md's Technical Decisions: "Enum d'état de suggestion
// unique et partagé UI/DB... défini une seule fois dans
// `domain/suggestion.ts`"). `db/schema.ts`'s `suggestion.status` column
// repeats these same four literals (SQLite's `.enum(...)` can't reference
// an external TS type), but this is the one place the type itself is
// declared — every other file imports it from here rather than
// redeclaring the literals.
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'revising';

// Mirrors `db/schema.ts`'s `suggestion.type` column for the same reason.
export type SuggestionType = 'anchored' | 'global';

// Pure (AD-5): given a livrable's blocks in their stored array order and an
// anchored suggestion's `anchorRef` (a block *id*, never a position —
// epic-4-context.md's Technical Decisions: "l'ordre des autres blocs
// n'affecte jamais la résolution de l'ancre"), returns the 1-based
// position of the targeted block for display (`¶N`). Returns `null` when
// no block matches — not reachable from this story's own write path
// (`actions/livrable.ts`'s `createLivrableWithSuggestions` only ever
// anchors a suggestion to a block it just created in the same
// transaction), but a future regeneration (Story 4.4) could leave a
// suggestion pointing at a block that no longer exists, and this function
// must degrade to "unresolved" rather than throw.
export function resolveAnchorPosition(
  blocks: { id: string }[],
  anchorRef: string,
): number | null {
  const index = blocks.findIndex((block) => block.id === anchorRef);
  return index === -1 ? null : index + 1;
}
