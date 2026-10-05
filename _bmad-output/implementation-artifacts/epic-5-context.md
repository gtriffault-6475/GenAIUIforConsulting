# Epic 5 Context: Livrables et contexte Google Drive

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Replace the simulated project drive with the consultant's real Google Drive. The consultant connects one Google account once; the app then lists the real files of the project's Drive folder in the Contexte panel (only files the consultant ticks are sent to the agent), imports Google Slides presentations as livrables, lets the AI suggest changes zone by zone, rewrites only the changed text back into the Drive file on explicit action, and can create a new presentation from a conversation. Demo mode must stay fully intact and never call Google. Octopod and Mattermost stay simulated.

## Stories

- Story 5.1: Connexion du compte Google
- Story 5.2: Dossier Drive du projet et panneau Contexte réel
- Story 5.3: Import d'une présentation comme livrable
- Story 5.4: Suggestions IA sur une présentation importée
- Story 5.5: Enregistrement dans Drive
- Story 5.6: Création d'une présentation depuis la conversation

## Requirements & Constraints

- Single workstation, single user, local Next.js server on `localhost:3000`; one Google account connected at a time.
- Google tokens never reach the browser. Google errors are never shown raw: converted to a typed `DriveError`, then to a short French message; raw details only logged server-side.
- Outside demo mode, never show simulated drive content. Not connected → only a short invite to connect, plus manual documents and already-open livrables.
- In demo mode: no Google button, prompt or mention anywhere; nothing calls Google; Drive livrables do not exist; the mock drive only feeds the Contexte panel.
- Only Google Slides is supported for livrables. Other formats and sub-folders of the project folder are out of scope.
- The app never creates the project folder: it must exist under the root folder with exactly the project's name.
- No file is sent to the AI unless the consultant ticked it (Contexte) or imported it (livrable).
- Writing to Drive is always explicit, rewrites only the text of changed zones (formatting may be simplified — the consultant is warned), and never overwrites a concurrent edit made in Slides.
- Required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` (in `.env.local`, documented in `.env.local.example` and README). Google Cloud project inside the OCTO Workspace org, OAuth client type "Internal", Drive + Slides APIs enabled, redirect URI `http://localhost:3000/api/google/oauth/callback`.
- No automated tests or CI (standing project decision).

## Technical Decisions

- **Dependencies:** `@googleapis/drive` 26.x, `@googleapis/slides` 10.x, `google-auth-library` 11.x (not the full `googleapis` package).
- **OAuth:** server-side authorization-code flow, scope `https://www.googleapis.com/auth/drive`. Two route handlers `app/api/google/oauth/start` and `.../callback` are the only allowed exception to "mutations only via Server Actions"; they verify an anti-CSRF `state` parameter, and the callback writes only through a function of `actions/google-connection.ts`. Refresh token stored in singleton table `GOOGLE_CONNECTION {id, refreshToken, accountEmail, connectedAt}`; disconnect deletes the row. A `token_revoked` error makes `actions/` delete the row (back to disconnected).
- **Drive mode:** one function `resolveDriveMode` in `actions/` computes the mode with strict priority `demo` > `unconfigured` (no root folder) > `disconnected` (no `GOOGLE_CONNECTION`) > `connected`. The mode is passed to a factory in `integrations/index.ts` (the only wiring point), which returns the mock adapter (demo) or the Google adapter (connected, with credentials). Outside `connected`, Reimport / Save / Create are unavailable.
- **Port:** `DriveProvider` exposes `listFiles(projectName)`, `exportText(fileId)`, `readPresentation(fileId)`, `writePresentationText(fileId, edits, requiredRevisionId)`, `createPresentation(projectName, title, slides)`, all returning `{ ok: true, data } | { ok: false, error: DriveError }` with `DriveError` ∈ `unconfigured | disconnected | folder_missing | folder_duplicate | token_revoked | not_found | revision_conflict | quota | unknown`. Folder resolution by exact name lives in the adapter. Adapters: `integrations/google/*`, `integrations/mock/*`. `integrations/` never reads the DB.
- **Folder sync:** one `actions/` function resyncs folder files for both Contexte and Livrables panels (sync-then-read): updates name/type/date, deletes files gone from Drive, keeps `DOCUMENT` rows of the other `origin` (not shown nor sent; amended 2026-10-05 so selections survive a demo round-trip), never touches `content` or `usedAsContext`. `exportText` only for `usedAsContext` documents (Sheets: CSV of first sheet).
- **Data changes:** `DOCUMENT` gets UUID id, `driveFileId`, `mimeType`, `origin` (`mock | google`), unique `(projectId, driveFileId)`. `LIVRABLE` gets `source` (`local | drive`, default `local`), `driveFileId` (unique per project when non-null), and `conversationId` becomes unique when non-null. New `GOOGLE_CONNECTION` table.
- **Slides blocks:** a text box (including inside a group) is one block: `id` = Slides objectId, plus `slideId`, `slideNumber`, `driveText`. Tables, images, speaker notes ignored.
- **Save:** block changed ⇔ `text ≠ driveText` (pure `domain/` function). Save = re-read, conflict if remote text ≠ `driveText` or zone gone, else `batchUpdate` with fresh `requiredRevisionId`; one retry on revision refusal; then `driveText := text`.
- **Agent tools:** chosen by one pure `domain/` function per conversation; a Drive livrable only gets an anchored-suggestions tool, never `propose_livrable_content`. `sendToAgent` takes a tool list. `buildRequest` receives context documents from the calling action, each truncated at 30 000 characters, 60 000 in total (`domain/document.ts`), cuts signalled; the demo-mode flag is passed by the caller.
- **Declared migrations:** port `listDocuments(projectId)` → `listFiles(projectName)`; `integrations/index.ts` constants → factory; `skills/buildRequest.ts` stops reading `demoModeActive` from DB (done 2026-10-05); check for duplicate livrables per conversation before adding the unique constraint.

## UX & Interaction Patterns

- Top bar, right of the project selector: neutral button "Connecter Google Drive" opening Google's consent screen; after consent the user returns automatically to the workspace. Connected: the account email, with "Se déconnecter" in a menu (floating surface, one open at a time via `OverlayProvider`). Hidden in demo mode.
- Expired/revoked connection: back to "not connected" with a reconnect offer, no technical error.
- Panels messages: not connected → "Connectez Google Drive pour afficher les fichiers du projet."; unconfigured → "Google Drive n'est pas configuré pour cette installation."; folder missing/duplicate → "Aucun dossier « {nom} » dans le Drive racine." / "Plusieurs dossiers portent le nom « {nom} »."
- Livrables panel: groups "En cours" and "Dans le Drive du projet" (absent in demo); Slides icon on Drive-backed items. Editor groups paragraphs under "Diapositive N"; "Enregistrer dans Drive" (neutral primary, never purple) and "Réimporter" in the editor header.
- "Utiliser comme contexte" is a real labelled checkbox; save state announced in text, not color only.

## Cross-Story Dependencies

- 5.1 (connection, `resolveDriveMode`, factory) is a prerequisite for every other story.
- 5.2 introduces the real `DriveProvider` adapter, folder resolution and the shared folder sync, reused by 5.3 (Livrables panel group).
- 5.3 import (blocks, dedicated conversation) is reused by 5.4, 5.5 and 5.6 (creation chains into import).
- 5.6 is blocked until the open question on presentation layout (OCTO template vs Google default) is decided.
- Demo mode (existing `APP_STATE.demoModeActive`, Epic "mode démo" work) must keep working unchanged throughout.
