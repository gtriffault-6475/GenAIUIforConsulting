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

// Story 4.3 — Traitement d'une suggestion ancrée (AD-5, AD-9). Pure: returns
// a new blocks array where the block whose `id === anchorRef` has its
// `text` replaced by `newText` — every other block, and that block's own
// `id`, are carried over unchanged (Always: "seul le text du bloc change,
// jamais son id"). Never reorders or drops a block. If no block matches
// `anchorRef` (not reachable from `acceptSuggestion`'s own call site,
// which always reads the anchor from the same livrable it is about to
// update, but defensive per `resolveAnchorPosition`'s own precedent
// above), returns `blocks` unchanged rather than throwing.
//
// Story 5.3: every other field of the block (`slideId`, `slideNumber`,
// `driveText` on a livrable imported from Slides, AD-9) is kept as is.
export function applyAcceptedSuggestion<T extends { id: string; text: string }>(
  blocks: T[],
  anchorRef: string,
  newText: string,
): T[] {
  return blocks.map((block) =>
    block.id === anchorRef ? { ...block, text: newText } : block,
  );
}

// spec-editeur-deux-panneaux.md — the `¶N` a suggestion card shows. Once a
// suggestion is `accepted`/`rejected`, the `resolvedPosition` frozen at that
// transition wins (spec-position-figee-suggestions-resolues: it survives a
// global revision regenerating every block id); otherwise the anchor is
// resolved live against the current blocks. `null` for a global suggestion
// (no `anchorRef`) or an anchor no longer in `blocks`.
export function suggestionPosition(
  blocks: { id: string }[],
  suggestion: {
    anchorRef: string | null;
    status: SuggestionStatus;
    resolvedPosition: number | null;
  },
): number | null {
  const isResolved =
    suggestion.status === 'accepted' || suggestion.status === 'rejected';
  if (isResolved && suggestion.resolvedPosition !== null) {
    return suggestion.resolvedPosition;
  }
  return suggestion.anchorRef
    ? resolveAnchorPosition(blocks, suggestion.anchorRef)
    : null;
}

// spec-editeur-deux-panneaux.md (D2) — suggestions in document order (by
// the `¶N` their card shows), suggestions whose paragraph cannot be
// resolved (global, or anchor gone) last. Stable: equal positions keep
// their input order. Returns a new array, never sorts `suggestions` in
// place.
export function orderSuggestionsByAnchor<
  T extends {
    anchorRef: string | null;
    status: SuggestionStatus;
    resolvedPosition: number | null;
  },
>(blocks: { id: string }[], suggestions: T[]): T[] {
  return suggestions
    .map((suggestion, index) => ({
      suggestion,
      index,
      position: suggestionPosition(blocks, suggestion),
    }))
    .sort((a, b) => {
      if (a.position === null && b.position === null) return a.index - b.index;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position || a.index - b.index;
    })
    .map((entry) => entry.suggestion);
}

// spec-editeur-deux-panneaux.md — "N en attente" in the AI panel header:
// suggestions still awaiting a decision (`pending`). A `revising` one is
// "en retravail" (EXPERIENCE.md's state names), not counted.
export function countPending(suggestions: { status: SuggestionStatus }[]): number {
  return suggestions.filter((suggestion) => suggestion.status === 'pending').length;
}

// spec-moins-de-clics.md (D2) — the suggestions "Tout accepter" applies:
// `pending`, anchored, and whose paragraph is still in `blocks`, in
// document order. `revising` ones, global ones and those whose paragraph is
// gone are left out. One rule for both sides: the panel counts these to
// show the button, `acceptAllSuggestions` applies these. Returns a new array.
export function acceptableSuggestions<
  T extends {
    anchorRef: string | null;
    status: SuggestionStatus;
    resolvedPosition: number | null;
  },
>(blocks: { id: string }[], suggestions: T[]): T[] {
  const blockIds = new Set(blocks.map((block) => block.id));
  return orderSuggestionsByAnchor(
    blocks,
    suggestions.filter(
      (suggestion) =>
        suggestion.status === 'pending' &&
        suggestion.anchorRef !== null &&
        blockIds.has(suggestion.anchorRef),
    ),
  );
}
