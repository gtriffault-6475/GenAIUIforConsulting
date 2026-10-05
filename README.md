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

Outside demo mode the project drive is the consultant's real Google Drive. Until it is set up, the workspace shows no drive files (manually added documents still work) and the top bar offers no Google button. One-time setup, by someone with Google Workspace admin access at OCTO:

1. Create a Google Cloud project inside the OCTO Google Workspace organization.
2. Enable the **Google Drive API** and the **Google Slides API**.
3. Configure the OAuth consent screen with user type **Internal** (this exempts the app from Google's verification for the restricted `drive` scope; a Workspace admin may need to approve it).
4. Create an OAuth client ID of type **Web application** with the authorized redirect URI `http://localhost:3000/api/google/oauth/callback`.
5. In Google Drive, create a root folder for the app and, inside it, one sub-folder per project named exactly like the project. The app never creates folders. The root folder ID is the last part of its URL.
6. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_DRIVE_ROOT_FOLDER_ID` in `.env.local`, then restart the app.
7. Optional, to create presentations from a conversation (**Créer dans Drive** on a proposal by the agent): set `GOOGLE_SLIDES_TEMPLATE_ID` to the ID of the OCTO Google Slides template (last part of its URL, between `/d/` and `/edit`). The consultant's account must be able to open it. A PowerPoint file stored in Drive works too: each copy is converted to Google Slides. Each new deck is a copy of it in the project folder; the first slide uses the template layout with a centered title (cover), the others the first layout with a title and a body, and the template's own slides are removed. Without this variable, everything else works and **Créer dans Drive** stays unavailable.

Then open the app at exactly `http://localhost:3000` (the redirect URI is built from the address in the browser, so `127.0.0.1` or another port is rejected by Google with `redirect_uri_mismatch`), click **Connecter Google Drive** in the top bar and accept Google's consent screen. The connection is stored in the local database (`db/local.db`) and survives restarts; **Se déconnecter** (menu on the account email) removes it and revokes the token at Google. The demo mode never uses Google.

The stored refresh token grants access to the consultant's whole Google Drive and is kept unencrypted in `db/local.db`: never copy or share that file.

## Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript** (strict)
- **Drizzle ORM** + `node:sqlite` — local file database, no separate DB service
- **@anthropic-ai/sdk** (Messages API + tool use) — wired in from Epic 2 onward
- **google-auth-library** + **@googleapis/drive** — Google OAuth and Drive access (Epic 5)

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
