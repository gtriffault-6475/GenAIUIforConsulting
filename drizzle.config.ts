import { defineConfig } from 'drizzle-kit';

// IMPORTANT: never add `better-sqlite3` as a dependency (direct or
// transitive) to this project. `drizzle-kit`'s CLI (generate/push/migrate)
// auto-detects a local SQLite driver by checking installed packages in a
// fixed order — `better-sqlite3` before `node:sqlite` — with no config
// field to force one over the other. If `better-sqlite3` is ever present,
// the CLI silently switches to it, reintroducing the native-compile step
// the architecture spine explicitly rules out (AD: node:sqlite over
// better-sqlite3, "very simple to install"). `db/client.ts` is unaffected
// (it imports `drizzle-orm/node-sqlite` explicitly) — this only concerns
// the drizzle-kit CLI commands run from this config.
export default defineConfig({
  dialect: 'sqlite',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: {
    url: './db/local.db',
  },
});
