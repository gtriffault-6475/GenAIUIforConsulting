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
// Blank text boxes are left out (nothing to work on).
export function slidesToBlocks(presentation: {
  slides: { slideId: string; slideNumber: number; textBoxes: { objectId: string; text: string }[] }[];
}): LivrableBlock[] {
  return presentation.slides.flatMap((slide) =>
    slide.textBoxes.filter((box) => box.text.trim() !== '').map((box) => ({
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

// Story 5.4 — reads `LIVRABLE.content` without ever throwing: malformed
// JSON, a missing `blocks` array or entries without a string id/text all
// yield the valid blocks only (possibly none).
export function parseLivrableBlocks(content: string): LivrableBlock[] {
  try {
    const parsed = JSON.parse(content) as { blocks?: unknown };
    if (!Array.isArray(parsed?.blocks)) return [];
    return (parsed.blocks as unknown[]).filter(
      (block): block is LivrableBlock =>
        typeof block === 'object' &&
        block !== null &&
        typeof (block as LivrableBlock).id === 'string' &&
        typeof (block as LivrableBlock).text === 'string',
    );
  } catch {
    return [];
  }
}

// Story 5.5 (AD-13) — sorts the modified zones against the deck just read:
// - `alreadySaved`: Slides already holds the block's text (a previous save
//   applied by Google but not recorded locally — a timeout, two tabs):
//   nothing to write, only `driveText` to catch up;
// - `conflicts`: the zone is gone, or its Slides text is neither the
//   `driveText` it was edited from nor the block's text. Any conflict
//   blocks the whole save;
// - `toWrite`: the rest.
export function planDriveSave(
  modifiedBlocks: LivrableBlock[],
  remoteTexts: ReadonlyMap<string, string>,
): { toWrite: LivrableBlock[]; alreadySaved: LivrableBlock[]; conflicts: string[] } {
  const plan = { toWrite: [] as LivrableBlock[], alreadySaved: [] as LivrableBlock[], conflicts: [] as string[] };
  for (const block of modifiedBlocks) {
    const remote = remoteTexts.get(block.id);
    if (remote === block.text) plan.alreadySaved.push(block);
    else if (remote === undefined || remote !== block.driveText) plan.conflicts.push(block.id);
    else plan.toWrite.push(block);
  }
  return plan;
}

// Ouvrir dans Google Slides — the deck's edit URL in Google Slides, the
// single place this URL is built.
export function googleSlidesUrl(driveFileId: string): string {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(driveFileId)}/edit`;
}

// spec-apercu-diapositives — the deck opened in Google Slides on one slide.
export function googleSlidesSlideUrl(driveFileId: string, slideId: string): string {
  return `${googleSlidesUrl(driveFileId)}#slide=id.${encodeURIComponent(slideId)}`;
}

// spec-apercu-diapositives (D2) — does this slide hold a change not saved
// to Drive yet? Its preview then shows the Drive version, not that change.
export function slideHasUnsavedChanges(blocks: LivrableBlock[], slideId: string): boolean {
  return blocks.some((block) => block.slideId === slideId && isBlockModified(block));
}

// Ouvrir dans Google Slides (D2) — has the deck's text changed in Slides
// since the last import or save? Compares the zones the app tracks
// (`slidesToBlocks`, so blank boxes are ignored) with the blocks' `driveText`,
// by Slides objectId: a box added with non-blank text, a tracked box removed
// (or emptied), or a box whose text differs from `driveText`. Images,
// layout and slide order alone are not reported.
export function driveTextChanged(
  blocks: LivrableBlock[],
  presentation: Parameters<typeof slidesToBlocks>[0],
): boolean {
  const remote = new Map(slidesToBlocks(presentation).map((block) => [block.id, block.text]));
  // A zone saved as blank is absent from both sides: not a change.
  const known = new Map(
    blocks
      .filter((block) => block.driveText !== undefined && block.driveText.trim() !== '')
      .map((block) => [block.id, block.driveText]),
  );
  for (const [id, driveText] of known) {
    if (remote.get(id) !== driveText) return true;
  }
  for (const id of remote.keys()) {
    if (!known.has(id)) return true;
  }
  return false;
}
