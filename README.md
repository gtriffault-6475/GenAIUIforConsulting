GenAI4Consulting round 1 — an internal agentic workspace prototype for OCTO consultants. See `_bmad-output/planning-artifacts/` for the product brief, PRD, UX spines, and architecture spine this app implements.

## Getting started

**Requires Node.js 24** (`nvm use` picks it up from `.nvmrc`) — `npm install` refuses anything older (`engine-strict` in `.npmrc`). Node <24's `node:sqlite` is missing `stmt.setReturnArrays`, which every Drizzle query needs; running on the wrong version throws `TypeError: stmt.setReturnArrays is not a function` on the first database read.

```bash
nvm use
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No separate services to start — the app runs as a single Next.js process, with SQLite (`node:sqlite`, no native compile step) as its only dependency.

Copy `.env.local.example` to `.env.local` and set `ANTHROPIC_API_KEY` before sending a message from the workspace composer (Story 2.5) — without it, the composer still works but every reply fails with a clear error.

## Google Drive (Epic 5)

Outside the demo mode, the project drive is a real Google Drive. Connecting it needs three variables in `.env.local` (see `.env.local.example`); if any is missing, the top bar shows "Connecter Google Drive" disabled with "Google Drive n'est pas configuré pour cette installation." and the app never calls Google. The demo mode never uses Google.

Google Cloud setup (once per installation):

1. In a Google Cloud project of the OCTO Workspace organization, enable the **Google Drive API** and the **Google Slides API**.
2. Configure the OAuth consent screen as **Internal** (a Workspace administrator may have to approve it), with the scopes `https://www.googleapis.com/auth/drive`, `openid` and `email`.
3. Create an OAuth client ID of type **Web application** with the authorized redirect URI `http://localhost:3000/api/google/oauth/callback` (exactly; the app must run on port 3000).
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from that client, and `GOOGLE_DRIVE_ROOT_FOLDER_ID` to the id of the Drive folder holding one sub-folder per project (named exactly like the project).
5. Restart `npm run dev`, open the app at exactly http://localhost:3000 (the OAuth redirect URI is fixed to that origin; the connect link sends any other origin, e.g. `127.0.0.1`, there first), then click "Connecter Google Drive" in the top bar and accept the consent screen.

The refresh token is stored in the local SQLite database (`google_connection` table) and never reaches the browser. It is stored **unencrypted** in `db/local.db` and grants full access to the account's Drive: never share or commit that file (it is excluded from git by the `*.db` rule in `.gitignore`). "Se déconnecter" (account menu in the top bar) deletes it and revokes it at Google (best effort).

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
