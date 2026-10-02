// Story 5.3 — Import d'une présentation comme livrable (AD-5: pure, no
// import of `db/`, `integrations/`, `actions/` or React).

// A block of a livrable's `content.blocks` (AD-9). A `local` livrable's
// blocks only carry `id` and `text`; a `drive` livrable's (AD-13) also
// carry the text box's slide (`slideId`, and `slideNumber`, its 1-based
// rank in the presentation, slides without text included) and
// `driveText`, the last text known from Drive for that text box.
export type LivrableBlock = {
  id: string;
  text: string;
  slideId?: string;
  slideNumber?: number;
  driveText?: string;
};

// The single definition of a modified block (epic-5-context.md "Bloc
// modifié"): its text differs from the last text known from Drive. A block
// without `driveText` (a `local` livrable's) is never modified. Sole source
// of the re-import warning (and, from Story 5.5, of "Enregistrer dans
// Drive").
export function isBlockModified(block: LivrableBlock): boolean {
  return block.driveText !== undefined && block.text !== block.driveText;
}

export function hasModifiedBlocks(blocks: LivrableBlock[]): boolean {
  return blocks.some(isBlockModified);
}

// The editor's "Diapositive N" groups: consecutive blocks of the same
// slide, in the stored order. `position` is the block's 1-based rank in
// the whole livrable — the same `¶N` as `resolveAnchorPosition`
// (`domain/suggestion.ts`), never restarted per slide. A block without
// `slideNumber` gets a group of its own with `slideNumber: null`.
export type SlideGroup<T extends LivrableBlock> = {
  slideNumber: number | null;
  blocks: { block: T; position: number }[];
};

export function groupBlocksBySlide<T extends LivrableBlock>(blocks: T[]): SlideGroup<T>[] {
  const groups: SlideGroup<T>[] = [];
  blocks.forEach((block, index) => {
    const slideNumber = block.slideNumber ?? null;
    const last = groups[groups.length - 1];
    if (last && slideNumber !== null && last.slideNumber === slideNumber) {
      last.blocks.push({ block, position: index + 1 });
    } else {
      groups.push({ slideNumber, blocks: [{ block, position: index + 1 }] });
    }
  });
  return groups;
}

// Re-import (epic-5-context.md "Réimport"): an unresolved suggestion
// anchored on `anchorRef` survives only if that text box still exists in
// the re-read presentation, its Drive text did not change since the
// previous import, and the block was not modified in the app (its text is
// reverted to the Drive text, so a suggestion written against the local
// text no longer applies). A suggestion without anchor never survives.
export function keepsSuggestionAfterReimport(
  previousBlocks: LivrableBlock[],
  nextBlocks: LivrableBlock[],
  anchorRef: string | null,
): boolean {
  if (anchorRef === null) return false;
  const previous = previousBlocks.find((block) => block.id === anchorRef);
  const next = nextBlocks.find((block) => block.id === anchorRef);
  if (!previous || !next || isBlockModified(previous)) return false;
  return previous.driveText !== undefined && previous.driveText === next.driveText;
}

// AD-13 — the blocks of a drive livrable, from a presentation's slides
// (structurally the port's `PresentationSlide[]`, not imported: AD-5): one
// block per text box, slide after slide, `id` = the text box's
// `objectId`, `slideNumber` = the slide's rank (slides without text keep
// their number), `driveText` = `text` (nothing modified yet).
export function toSlideBlocks(
  slides: { objectId: string; textBoxes: { objectId: string; text: string }[] }[],
): Required<LivrableBlock>[] {
  const blocks: Required<LivrableBlock>[] = [];
  slides.forEach((slide, index) => {
    for (const box of slide.textBoxes) {
      blocks.push({
        id: box.objectId,
        text: box.text,
        slideId: slide.objectId,
        slideNumber: index + 1,
        driveText: box.text,
      });
    }
  });
  return blocks;
}
