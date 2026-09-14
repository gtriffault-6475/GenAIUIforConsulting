import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';

// `node:sqlite` is Node's native SQLite binding — no native compilation
// step (unlike `better-sqlite3`), which is why the architecture spine
// pins it for round 1. The file lives outside version control (see
// .gitignore) so each machine gets its own local database.
//
// `./db/schema.ts` starts empty (see that file) so it is not wired in
// here yet; the story that adds the first tables (1.2) imports it into
// this client's relations config.
const sqlite = new DatabaseSync('./db/local.db');

export const db = drizzle({ client: sqlite });
