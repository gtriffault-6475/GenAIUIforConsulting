// Shared Server Action return shape (per `epic-1-context.md`'s Technical
// Decisions: "retour typé { ok: true, data } | { ok: false, error }",
// never an uncaught exception reaching the UI). Previously copy-pasted
// verbatim into every `actions/*.ts` file — consolidated here so a future
// change to the contract only has one definition to update.
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
