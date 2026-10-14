# Installation guide

This guide sets up GenAI4Consulting on one machine, from a fresh clone to a working Google Drive connection. Steps 1 to 5 are enough to run the app in demo mode; steps 6 and 7 add the real Claude API and Google Drive.

The app runs as a single Next.js process with a local SQLite file. There is no database server, no Docker image and no deployment step.

## 1. Prerequisites

- **Node.js 24**. Older versions are refused by `npm install` (`engine-strict` in `.npmrc`): the app's database layer needs `node:sqlite` features that only exist from Node 24. With [nvm](https://github.com/nvm-sh/nvm), `nvm use` picks the version from `.nvmrc`.
- **git**, and read access to this repository.
- **A browser on the same machine**, to open `http://localhost:3000`.
- Optional, for real AI replies: an **Anthropic API key**.
- Optional, for Google Drive: someone with **Google Workspace admin access at OCTO** for the one-time Google Cloud setup (step 7).

## 2. Get the code

```bash
git clone https://github.com/gtriffault-6475/GenAIUIforConsulting.git
cd GenAIUIforConsulting
```

## 3. Install the dependencies

```bash
nvm use
npm install
```

If `npm install` stops with an `EBADENGINE` error, Node is not version 24: run `nvm install 24` then `nvm use`.

## 4. Configure the environment

```bash
cp .env.local.example .env.local
```

`.env.local` is never committed. Every variable can stay empty at first:

| Variable | Needed for | Empty means |
|---|---|---|
| `ANTHROPIC_API_KEY` | real replies from the agent | demo mode still works; outside demo mode every reply fails with a clear error |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Google Drive (step 7) | no Google button, no Drive files outside demo mode |
| `GOOGLE_SLIDES_TEMPLATE_ID` | creating a presentation from a conversation | **Créer dans Drive** stays unavailable, everything else works |

Restart the app after changing `.env.local`.

## 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — use exactly this address if you plan to connect Google (step 7).

On first start the app creates `db/local.db` and applies the database migrations by itself, then seeds demo projects. Nothing else to run.

**Demo mode** — the **Mode démo** button in the top bar switches to a scripted demo: answers come from a script, Drive is simulated, and neither the Anthropic key nor Google is used. It is the quickest way to see every screen.

## 6. Use the real Claude API

Set `ANTHROPIC_API_KEY` in `.env.local`, restart the app, and turn demo mode off. The model is chosen in the composer (Claude Sonnet 5, Claude Opus 5, Claude Haiku 4.5).

## 7. Connect Google Drive

Outside demo mode, the project drive is the consultant's real Google Drive: the Contexte panel lists the project folder, presentations can be imported, edited with the AI and saved back, and new presentations can be created from a conversation.

### 7.1 One-time Google Cloud setup (Workspace admin)

1. Create a Google Cloud project inside the OCTO Google Workspace organization.
2. Enable the **Google Drive API** and the **Google Slides API**.
3. Configure the OAuth consent screen with user type **Internal**. This exempts the app from Google's verification for the restricted `drive` scope; a Workspace admin may need to approve it.
4. Create an OAuth client ID of type **Web application**, with the authorized redirect URI `http://localhost:3000/api/google/oauth/callback`.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 7.2 Drive folders

1. In Google Drive, create a root folder for the app. Its ID is the last part of its URL; put it in `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
2. Inside it, create one sub-folder per project, named **exactly** like the project in the app. The app never creates folders: a missing folder shows « Aucun dossier « … » dans le Drive racine », two folders with the same name show « Plusieurs dossiers portent le nom « … » ».

### 7.3 OCTO template (optional)

To create presentations from a conversation (**Créer dans Drive** on a proposal by the agent), set `GOOGLE_SLIDES_TEMPLATE_ID` to the ID of the OCTO Google Slides template (between `/d/` and `/edit` in its URL). The consultant's account must be able to open it. A PowerPoint file stored in Drive works too: each copy is converted to Google Slides. Each new deck is a copy of the template in the project folder; the first slide uses the template's centered-title layout (cover), the others its first title-and-body layout, and the template's own slides are removed.

### 7.4 Connect

1. Restart the app and open exactly `http://localhost:3000`. The redirect URI is built from the browser's address, so `127.0.0.1` or another port is rejected by Google with `redirect_uri_mismatch`.
2. Turn demo mode off, click **Connecter Google Drive** in the top bar and accept Google's consent screen.

The connection is stored in `db/local.db` and survives restarts. **Se déconnecter** (menu on the account email) removes it and revokes the token at Google.

> The stored refresh token grants access to the consultant's whole Google Drive and is kept unencrypted in `db/local.db`. Never copy, share or commit that file.

## 8. Check the installation

```bash
npm test            # rules in domain/ — must pass
npx tsc --noEmit    # type check — must be clean
npm run build       # production build
```

To run the production build instead of the dev server: `npm run build && npm start`.

## 9. Update to the latest version

```bash
git pull
npm install
```

Then restart the app. New database migrations are applied automatically on start; existing data and the Google connection are kept.

## 10. Local data

Everything the app stores (projects, conversations, livrables, suggestions, Google connection) is in `db/local.db`.

- **Back up**: stop the app, copy `db/local.db` somewhere outside the repository.
- **Start over**: stop the app and delete `db/local.db*`. It is recreated on next start, with the demo projects; the Google connection is lost (connect again).

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TypeError: stmt.setReturnArrays is not a function` | Node older than 24 | `nvm use`, then `npm install` again |
| `EBADENGINE` on `npm install` | Node older than 24 | `nvm install 24 && nvm use` |
| Every agent reply fails | `ANTHROPIC_API_KEY` empty or invalid, demo mode off | set the key and restart, or turn demo mode on |
| No **Connecter Google Drive** button | a Google variable is empty, or demo mode is on | fill the three variables, restart, turn demo mode off |
| `redirect_uri_mismatch` at Google | app opened on another host or port | open exactly `http://localhost:3000`; keep port 3000 free |
| « Aucun dossier « … » dans le Drive racine » | no sub-folder named exactly like the project | create it under the root folder (step 7.2) |
| **Créer dans Drive** unavailable | `GOOGLE_SLIDES_TEMPLATE_ID` empty, or Google not connected | set the template ID, restart, connect |
| « Ce fichier a été modifié dans Google Slides depuis l'import » on save | the deck changed in Slides since the last import or save; nothing was written | **Réimporter** to start from the Drive version (accepted changes not saved yet are replaced) |
