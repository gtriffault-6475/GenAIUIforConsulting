---
title: 'Story 5.1 — Connexion du compte Google'
type: 'feature'
created: '2026-10-05'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app cannot reach the consultant's real Google Drive: there is no way to connect a Google account, and the drive adapter is a hard-wired mock constant. Every other Epic 5 story needs an authenticated Google connection and a single place deciding which drive adapter to use.

**Approach:** Add a server-side OAuth authorization-code flow (two route handlers) that stores the refresh token and account email in a new singleton `GOOGLE_CONNECTION` table, a top-bar control to connect/disconnect, and a single `resolveDriveMode` action (`demo` > `unconfigured` > `disconnected` > `connected`) whose result feeds a new factory in `integrations/index.ts`.

## Boundaries & Constraints

**Always:**
- Scope `https://www.googleapis.com/auth/drive`, `access_type=offline`, `prompt=consent` (so a refresh token is always returned). Account email read with Drive `about.get` (`user.emailAddress`) — no extra scope.
- `state` = random value stored in an httpOnly, `SameSite=Lax`, short-lived cookie by `start`; `callback` rejects a missing/mismatched state and clears the cookie in every case.
- The callback writes only through `actions/google-connection.ts`; it is the single writer of `GOOGLE_CONNECTION`. Disconnect deletes the row (best-effort token revocation at Google, failure ignored).
- The refresh token never leaves the server: no Server Action or prop returns it; the client only ever sees `{ accountEmail }` or the mode.
- `resolveDriveMode` is the only function computing the mode. `unconfigured` = any of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` missing.
- **Decision (owner, 2026-10-05):** the target Contexte behavior applies now. `getDriveProvider(mode)` returns the mock adapter only for `demo` and `null` for every other mode (no Google adapter before Story 5.2). Outside demo mode, `listDocuments` skips the drive sync and returns only `source = 'manual'` rows — existing mock drive rows are filtered out on read, never deleted. No "connect"/"not configured" message in the Contexte panel yet (Story 5.2).
- Redirect URI built from the request origin + `/api/google/oauth/callback` (matches `http://localhost:3000/...` registered in Google Cloud).
- After the callback (success, refusal or error) redirect to `/`; on failure show a short French message, never Google's raw error (raw detail logged server-side only).
- User-visible French strings only in `components/`.

**Never:**
- No Google button, menu, email or message in demo mode, and no Google call while demo mode is active (route `start` refuses in demo mode).
- No change to the Contexte panel, Livrables panel, `DriveProvider` port methods or the Google adapter (Story 5.2+).
- No `googleapis` umbrella package.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connect | disconnected, user accepts consent | row saved, back on `/`, top bar shows account email | N/A |
| Consent refused | Google returns `error=access_denied` | back on `/`, still disconnected, "La connexion à Google Drive a été annulée." | no row written |
| Bad state | callback state ≠ cookie, or no cookie | back on `/`, disconnected, "La connexion à Google Drive a échoué. Réessayez." | logged, no token exchange |
| No refresh token | Google returns tokens without `refresh_token` | same failure message | logged, no row |
| Disconnect | connected, "Se déconnecter" | row deleted, top bar shows "Connecter Google Drive" | revocation failure ignored (logged) |
| Restart | connected, server restarted | still connected (row in SQLite) | N/A |
| Unconfigured | an env var missing, demo off | no Google control in top bar; `start` redirects to `/` | N/A |
| Demo mode | demo on, any connection state | no Google control; mode = `demo`; `start` redirects to `/` | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- add `googleConnection` table (`id` PK singleton, `refreshToken`, `accountEmail`, `connectedAt`), mirror `APP_STATE_ID` pattern.
- `db/migrations/` -- generate with `npm run db:generate`; applied automatically by `db/client.ts` on load.
- `actions/demo.ts` -- `getDemoModeActive()` (reuse for the `demo` mode); do not modify.
- `actions/types.ts` -- `ActionResult<T>`; reuse.
- `integrations/index.ts` -- currently exports constants; add `getDriveProvider(mode)` factory, keep `projectProvider`/`mattermostProvider` constants. `actions/document.ts:60` is the only `driveProvider` consumer — switch it to the factory with `resolveDriveMode()`.
- `app/page.tsx` -- top bar `<header className="top-bar">` holds `ProjectSelector` + `DemoModeToggle`; add the Google control between them; read connection status in the existing `Promise.all`.
- `components/ProjectSelector.tsx` -- reference for a top-bar dropdown using `useOverlay` (AD-8) and `useTransition` + inline error; copy the pattern for the account menu.
- `components/OverlayProvider.tsx` -- single floating-surface mechanism; the account menu must use it.
- `app/globals.css` -- top-bar / `.project-selector-*` / `.button-toggle` styles to reuse.
- `.env.local.example`, `README.md` -- document the 3 Google env vars and Google Cloud setup.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, `.../04-functions/cookies.md` -- Next 16 route handler + cookies API.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json` -- add `google-auth-library` 11.x and `@googleapis/drive` 26.x (pinned exact, like the other deps) -- OAuth client + `about.get`.
- [ ] `db/schema.ts` + new migration -- `googleConnection` table -- AD-12 storage.
- [ ] `integrations/google/oauth.ts` -- build `OAuth2Client`, `buildAuthUrl(redirectUri, state)`, `exchangeCode(redirectUri, code)` → `{ refreshToken, accountEmail }` typed result, `revokeToken(token)` -- keep Google SDK calls inside `integrations/`.
- [ ] `actions/google-connection.ts` -- `resolveDriveMode()`, `getGoogleConnectionStatus()` → `{ mode, accountEmail | null }`, `completeGoogleConnection(...)` (non-exported helper or server-only module used by callback), `disconnectGoogle()` -- single writer of `GOOGLE_CONNECTION`.
- [ ] `integrations/index.ts` + `actions/document.ts` -- factory `getDriveProvider(mode)`; document sync calls it with `resolveDriveMode()`; provider `null` → no sync, drive rows filtered out of the result -- AD-1 wiring point, owner decision above.
- [ ] `app/api/google/oauth/start/route.ts`, `app/api/google/oauth/callback/route.ts` -- OAuth redirects, state cookie, outcome passed to `/` via a short-lived cookie read once by the page -- AD-12.
- [ ] `components/GoogleConnection.tsx` + `app/page.tsx` + `app/globals.css` -- "Connecter Google Drive" link / account email with "Se déconnecter" menu / one-shot outcome message; hidden in `demo` and `unconfigured`.
- [ ] `.env.local.example`, `README.md` -- env vars and Google Cloud setup steps.

**Acceptance Criteria:**
- Given demo mode is off, the 3 env vars set and no connection, when I click "Connecter Google Drive", then I am sent to Google's consent screen with the drive scope and a `state` parameter.
- Given a connection row exists, when any page or Server Action payload is inspected in the browser, then the refresh token never appears.
- Given demo mode is toggled on while connected, then the top bar shows no Google control, and toggling demo off shows the account email again (connection kept).
- Given demo mode is off, when the workspace loads, then the Contexte panel lists only manually added documents; turning demo mode on shows the simulated drive files again.
- Given `npm run build`, then it succeeds with no type errors.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Outcome message transport: the callback sets a short-lived `google_oauth_result` cookie (`cancelled` | `failed`) before redirecting; the page reads and the component displays it, and a Server Action clears it on dismiss or next load. This keeps the URL clean and avoids a query-param message that would survive reloads.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `npm run build` -- expected: success.

**Manual checks (if no CLI):**
- With fake env vars, `GET /api/google/oauth/start` → 307 to `accounts.google.com` with `scope`, `access_type=offline`, `state`, and a `Set-Cookie` for the state.
- `GET /api/google/oauth/callback?code=x&state=wrong` → redirect to `/`, failure message shown, no `google_connection` row.
- Insert a `google_connection` row manually → top bar shows its email; "Se déconnecter" deletes it; demo mode hides everything.
- Real consent end-to-end requires real Google Cloud credentials (owner prerequisite).
