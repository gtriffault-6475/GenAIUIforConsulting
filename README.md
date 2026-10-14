# GenAI4Consulting

An internal agentic workspace prototype for OCTO consultants (round 1). A consultant picks an Octopod project, works with AI agents in conversations that know the project's context, and turns the result into deliverables (livrables) — text documents or Google Slides presentations — refined paragraph by paragraph with the AI.

See `_bmad-output/planning-artifacts/` for the product brief, PRD, UX spines and architecture spine this app implements.

## What it does

- **Project workspace** — project selection (Octopod, simulated in round 1), Contexte panel (the project's Google Drive folder and added documents, ticked to be sent to the agent), Mattermost panel (simulated).
- **Conversations with agents** — several conversations per project, skills loaded from a catalogue, model choice in the composer, and a pre-sales workflow stepper with a proactive starting suggestion.
- **Livrables and the assisted editor** — the agent writes a livrable with suggestions anchored to paragraphs. The editor shows the document and the AI panel side by side, with `¶N` markers linking each suggestion to its paragraph, a before/after view, Accepter / Rejeter / Retravailler, **Tout accepter**, and a global revision field.
- **Google Drive** — connect a Google account; import a Google Slides presentation from the project folder, edit it with the AI and save the accepted changes back (with conflict detection); create a presentation from a conversation with the OCTO template; open a livrable in Google Slides and detect edits made there; see the real slides in the editor.
- **Demo mode** — a scripted mode (toggle in the top bar) that needs neither an Anthropic key nor Google.

## Quick start

Requires **Node.js 24**.

```bash
git clone https://github.com/gtriffault-6475/GenAIUIforConsulting.git
cd GenAIUIforConsulting
nvm use
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and turn on **Mode démo** to explore without any key. For real AI replies set `ANTHROPIC_API_KEY` in `.env.local`; for Google Drive follow the one-time setup.

**Full installation guide, Google Drive setup and troubleshooting: [INSTALL.md](INSTALL.md).**

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server on port 3000 (creates and migrates `db/local.db` on first start) |
| `npm test` | tests of the pure rules in `domain/` (Node's built-in runner, no extra dependency) |
| `npx tsc --noEmit` | type check |
| `npm run build` / `npm start` | production build / server |
| `npm run db:generate` | new migration after a change to `db/schema.ts` |

## Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript** (strict)
- **Drizzle ORM** + `node:sqlite` — local file database (`db/local.db`), no separate service
- **@anthropic-ai/sdk** — Messages API with tool use
- **google-auth-library**, **@googleapis/drive**, **@googleapis/slides** — Google OAuth, Drive and Slides

## Structure

```
app/                      # routes and pages (workspace, livrable editor, Google OAuth)
components/               # UI components
actions/                  # Server Actions — the only code that mutates the database
domain/                   # pure business rules, no I/O, with their tests (*.test.ts)
skills/                   # skill catalogue + Anthropic API request assembly
integrations/
  ports/                  # interfaces for Octopod, drive, Mattermost
  mock/                   # simulated adapters (demo mode, round 1)
  google/                 # Google Drive / Slides adapter
db/                       # Drizzle schema, client and migrations
_bmad-output/             # planning artifacts, specs and retrospectives
```

## Further reading

- [INSTALL.md](INSTALL.md) — installation, Google setup, updates, troubleshooting.
- `CONVENTIONS.md` — accessibility and microcopy conventions.
- `AGENTS.md` — rules for AI coding agents working on this repository.
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — architectural decisions (AD-1 to AD-14).
- `_bmad-output/implementation-artifacts/` — one spec per story or change, with its review log.

> `db/local.db` holds the Google refresh token unencrypted: never copy, share or commit it.
