GenAI4Consulting round 1 — an internal agentic workspace prototype for OCTO consultants. See `_bmad-output/planning-artifacts/` for the product brief, PRD, UX spines, and architecture spine this app implements.

## Getting started

**Requires Node.js 24** (`nvm use` picks it up from `.nvmrc`) — `npm install` refuses anything older (`engine-strict` in `.npmrc`). Node <24's `node:sqlite` is missing `stmt.setReturnArrays`, which every Drizzle query needs; running on the wrong version throws `TypeError: stmt.setReturnArrays is not a function` on the first database read.

```bash
nvm use
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No separate services to start — the app runs as a single Next.js process, with SQLite (`node:sqlite`, no native compile step) as its only dependency.

## Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript** (strict)
- **Drizzle ORM** + `node:sqlite` — local file database, no separate DB service
- **@anthropic-ai/sdk** (Messages API + tool use) — wired in from Epic 2 onward

## Structure

```
app/                      # routes and UI
components/                # shared UI (OverlayProvider, etc.)
actions/                  # Server Actions — the only code that mutates the database
domain/                   # pure business rules, no I/O
skills/                   # skill catalog + Anthropic API request assembly
integrations/
  ports/                  # interfaces for Octopod/drive/Mattermost
  mock/                   # round-1 mock adapters (see ARCHITECTURE-SPINE.md, AD-1)
db/                       # Drizzle schema + client
```

See `CONVENTIONS.md` for accessibility and microcopy conventions, and `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` for the full set of architectural decisions (AD-1 through AD-11).
