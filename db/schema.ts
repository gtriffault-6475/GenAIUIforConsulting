// Drizzle schema for GenAI4Consulting.
//
// Round 1 (Story 1.1) intentionally ships with no tables: this file is
// wired up so `db/client.ts` and `drizzle.config.ts` are ready, but each
// feature story adds only the tables it needs (see ARCHITECTURE-SPINE.md
// "Structural Seed" for the full model — APP_STATE, PROJECT, DOCUMENT, …).
//
// Do not pre-create tables here speculatively; the next story to touch
// this file (1.2 — Sélection d'un projet Octopod) adds APP_STATE and
// PROJECT first.
export {};
