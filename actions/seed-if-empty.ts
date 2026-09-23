// epic-2-retro-item-12 ("extraire seedFixturesIfEmpty en helper partagé
// avant une 4e copie"). Shared control-flow wrapper behind the 3
// near-identical `seedFixturesIfEmpty` functions (`actions/conversation.ts`,
// `actions/skill.ts`, `actions/livrable.ts`): "if there are no rows yet,
// run the insert". Deliberately imports nothing from `db/schema` or
// `db/client` — it never sees a table or a query — so each caller keeps
// exclusive ownership of its own table's existence check and insertion
// (AD-2), exactly the boundary its two callbacks are shaped to preserve.
// The same kind of table-agnostic, purely shared code `actions/types.ts`'s
// `ActionResult<T>` already is (epic-1-retro-item-3).
export function seedIfEmpty(
  hasExistingRows: () => boolean,
  insertFixtures: () => void,
): void {
  if (hasExistingRows()) return;
  insertFixtures();
}
