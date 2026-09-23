import { db } from '@/db/client';
import { message } from '@/db/schema';

// epic-2-retro-item-15 ("wrapper insertMessage(...) qui timbre toujours
// createdAt, pour ne pas dépendre d'une discipline d'appelant"). Before
// this, `createdAt` was independently supplied by each of MESSAGE's 3
// insert sites (`actions/message.ts` x2, `actions/conversation.ts`'s
// fixture seeding x1) — `db/schema.ts`'s own comment on `message.createdAt`
// already flagged this: its `.default(...)` "is never relied on by the
// app" only as long as every insert keeps remembering to pass a real
// value. Nothing stopped a future insert from forgetting it and silently
// falling back to that 1970 epoch default.
//
// No `'use server'` here, unlike `actions/message.ts`/`actions/conversation.ts`:
// this is a plain shared write primitive, not a Server Action a client
// component could call directly — a synchronous exported function from a
// `'use server'` file is rejected outright ("Server Actions must be async
// functions"), same reason `actions/seed-if-empty.ts` isn't one either.
// This file is not itself a table owner under AD-2: it exists purely so
// `actions/message.ts` (MESSAGE's primary owner) and `actions/conversation.ts`
// (the one documented exception, its fixture-seeding insert) can share this
// one write path — every other file importing it would break that AD-2
// boundary by convention, the same way importing `db/schema` directly would.
//
// `createdAt` is optional and defaults to `new Date().toISOString()` when
// omitted, so a real message never needs to pass it at all — but
// `actions/conversation.ts`'s fixture seeding still always passes its own
// explicit, deliberately backdated `nextFixtureCreatedAt()` sequence (that
// file's own comment explains why: a real message sent moments after
// seeding must never sort into the middle of a fixture conversation) —
// this wrapper never overrides an explicitly supplied value. `executor`
// accepts either `db` itself or an already-open `tx` (never opens its own —
// `node:sqlite` transactions don't nest), so `seedFixturesIfEmpty`'s call
// stays inside its own existing `db.transaction`, same atomicity as before.
type MessageInsertExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function insertMessage(
  executor: MessageInsertExecutor,
  values: Omit<typeof message.$inferInsert, 'createdAt'> & {
    createdAt?: string;
  },
): void {
  executor
    .insert(message)
    .values({ ...values, createdAt: values.createdAt ?? new Date().toISOString() })
    .run();
}
