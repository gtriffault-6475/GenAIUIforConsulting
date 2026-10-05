// Story 5.3 — pure livrable rules (AD-5, AD-9, AD-13). No import of
// `integrations/`: the presentation shape below is structural, matching
// the drive port's `DrivePresentation`.

// A livrable block (AD-9). For a livrable imported from Google Slides,
// `id` is the text box's Slides objectId and the slide fields are set;
// `driveText` is the last text known from Drive for that box.
export type LivrableBlock = {
  id: string;
  text: string;
  slideId?: string;
  slideNumber?: number;
  driveText?: string;
};

// One block per text box, in slide order, `driveText = text` at import.
export function slidesToBlocks(presentation: {
  slides: { slideId: string; slideNumber: number; textBoxes: { objectId: string; text: string }[] }[];
}): LivrableBlock[] {
  return presentation.slides.flatMap((slide) =>
    slide.textBoxes.map((box) => ({
      id: box.objectId,
      text: box.text,
      slideId: slide.slideId,
      slideNumber: slide.slideNumber,
      driveText: box.text,
    })),
  );
}

// A block is modified when its text differs from the last Drive version
// (AD-13) — the single source for "unsaved changes" (reimport warning
// now, the "Enregistrer dans Drive" button in Story 5.5).
export function isBlockModified(block: LivrableBlock): boolean {
  return block.driveText !== undefined && block.text !== block.driveText;
}

export function hasUnsavedDriveChanges(blocks: LivrableBlock[]): boolean {
  return blocks.some(isBlockModified);
}

// Reimport (AD-13): a pending suggestion survives only if its zone still
// exists and Drive's text for that zone did not change — and the zone had
// no local accepted change either, since reimport puts the Drive text
// back under it (the suggestion was written for the local text).
export function reimportKeepsSuggestion(
  oldBlocks: LivrableBlock[],
  newBlocks: LivrableBlock[],
  anchorRef: string | null,
): boolean {
  if (anchorRef === null) return false;
  const before = oldBlocks.find((block) => block.id === anchorRef);
  const after = newBlocks.find((block) => block.id === anchorRef);
  return (
    before !== undefined &&
    after !== undefined &&
    before.driveText === after.driveText &&
    !isBlockModified(before)
  );
}

// Groups consecutive blocks by `slideNumber` for the editor's
// "Diapositive N" headings; blocks are already in slide order.
export function groupBlocksBySlide<T extends LivrableBlock>(
  blocks: T[],
): { slideNumber: number; blocks: T[] }[] {
  const groups: { slideNumber: number; blocks: T[] }[] = [];
  for (const block of blocks) {
    const slideNumber = block.slideNumber ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.slideNumber === slideNumber) last.blocks.push(block);
    else groups.push({ slideNumber, blocks: [block] });
  }
  return groups;
}
