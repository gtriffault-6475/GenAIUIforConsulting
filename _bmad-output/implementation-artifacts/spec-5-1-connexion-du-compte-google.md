---
title: 'Story 5.1 — Connexion du compte Google'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: 'ed1dd7ef461455c062e8ee1397cfe9ec2333662b'
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
- [x] `package.json` -- add `google-auth-library` 11.x and `@googleapis/drive` 26.x (pinned exact, like the other deps) -- OAuth client + `about.get`.
- [x] `db/schema.ts` + new migration -- `googleConnection` table -- AD-12 storage.
- [x] `integrations/google/oauth.ts` -- build `OAuth2Client`, `buildAuthUrl(redirectUri, state)`, `exchangeCode(redirectUri, code)` → `{ refreshToken, accountEmail }` typed result, `revokeToken(token)` -- keep Google SDK calls inside `integrations/`.
- [x] `actions/google-connection.ts` -- `resolveDriveMode()`, `getGoogleConnectionStatus()` → `{ mode, accountEmail | null }`, `completeGoogleConnection(...)` (non-exported helper or server-only module used by callback), `disconnectGoogle()` -- single writer of `GOOGLE_CONNECTION`.
- [x] `integrations/index.ts` + `actions/document.ts` -- factory `getDriveProvider(mode)`; document sync calls it with `resolveDriveMode()`; provider `null` → no sync, drive rows filtered out of the result -- AD-1 wiring point, owner decision above.
- [x] `app/api/google/oauth/start/route.ts`, `app/api/google/oauth/callback/route.ts` -- OAuth redirects, state cookie, outcome passed to `/` via a short-lived cookie read once by the page -- AD-12.
- [x] `components/GoogleConnection.tsx` + `app/page.tsx` + `app/globals.css` -- "Connecter Google Drive" link / account email with "Se déconnecter" menu / one-shot outcome message; hidden in `demo` and `unconfigured`.
- [x] `.env.local.example`, `README.md` -- env vars and Google Cloud setup steps.

**Acceptance Criteria:**
- Given demo mode is off, the 3 env vars set and no connection, when I click "Connecter Google Drive", then I am sent to Google's consent screen with the drive scope and a `state` parameter.
- Given a connection row exists, when any page or Server Action payload is inspected in the browser, then the refresh token never appears.
- Given demo mode is toggled on while connected, then the top bar shows no Google control, and toggling demo off shows the account email again (connection kept).
- Given demo mode is off, when the workspace loads, then the Contexte panel lists only manually added documents; turning demo mode on shows the simulated drive files again.
- Given `npm run build`, then it succeeds with no type errors.

## Implementation Notes

- Implemented directly from this spec (no subagent dispatch).
- Environment: the project requires Node ≥ 24 (`engines`, `.npmrc engine-strict`); the cloud container only had Node 22, so a local Node 24.21 was used for install, build and runtime checks.
- `actions/google-connection.ts` holds all OAuth logic as Server Functions: `beginGoogleConnection` (mode check, `state` cookie scoped to `/api/google/oauth`, consent URL) and `completeGoogleConnection` (reads/clears the state cookie itself, so calling it directly without the cookie fails exactly like the route). The two route handlers only build the redirect URI and redirect. `readGoogleConfig`/`readConnectionRow` are deliberately not exported (every export of a 'use server' file is a callable Server Action).
- `DriveMode` lives in `integrations/ports/drive-provider.ts` (re-exported by the action file) so `integrations/index.ts` never imports `actions/`.
- Account email comes from Drive `about.get` (`user(emailAddress)`), drive scope only.
- Outcome message: `google_oauth_result` httpOnly cookie (`cancelled` | `failed`), read by `app/page.tsx`, cleared by `dismissGoogleOAuthOutcome` on the component's mount; the message stays visible locally until closed.
- Surprise — `db/client.ts`: the new route handlers made `next build` evaluate `db/client.ts` in 3 worker processes at once; on a fresh `db/local.db` the per-migration transactions raced ("database is locked", then "table already exists" — reproduced 2/2 and 3/4 fresh builds). Fixed by a 30 s SQLite busy timeout and running the whole migration pass under one `BEGIN IMMEDIATE` lock taken before reading `__schema_migrations` (the previous "already exists" recovery branch became unreachable and was removed). 5/5 fresh builds pass afterwards.
- Files: `package.json`/`package-lock.json` (`google-auth-library` 11.1.0, `@googleapis/drive` 26.0.2, exact pins), `db/schema.ts`, `db/migrations/20261005085301_wide_masked_marvel/`, `db/client.ts`, `integrations/google/oauth.ts`, `integrations/ports/drive-provider.ts`, `integrations/index.ts`, `actions/google-connection.ts`, `actions/document.ts`, `app/api/google/oauth/{start,callback}/route.ts`, `components/GoogleConnection.tsx`, `app/page.tsx`, `app/globals.css`, `.env.local.example`, `README.md`.
- Review fixes (pass 1): `beginGoogleConnection` only from `disconnected`; `disconnectGoogle` refused in demo mode; guarded `ROLLBACK`; account control is a plain disclosure; README/`.env.local.example` wording (exact `http://localhost:3000`, Internal vs Web application, token-file warning). E2E re-run green incl. start refused when connected; fresh-db build green.
- Verification (production server, fake Google credentials, Playwright script, not committed — the project has no test suite by standing decision): start → 307 to Google with drive scope, `access_type=offline`, `prompt=consent`, `state` + httpOnly cookie; bad state → `/` + failure message, no row, message gone after reload; `access_denied` with valid state → cancelled message; valid state + bogus code → Google `invalid_client`, failure message, no row; row present → email in top bar, refresh token absent from page HTML/RSC payload; demo on → no Google control or visible mention, start redirects to `/`, mock drive files back in Contexte; demo off → email back; disconnect → row deleted (revocation `invalid_token` logged and ignored), connect button back; row survives a server restart; outside demo the Contexte panel lists only manual documents. Real consent end-to-end not testable here (needs real Google Cloud credentials).

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter BH, edge-case-hunter EC, verification-gap VG) — no intent_gap / bad_spec; patches applied directly, e2e re-run green, fresh-db build green.

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 1 | EC: outcome cookie dismissed while the control is hidden (demo/unconfigured), message lost | low | Only reachable when the callback lands in demo/unconfigured, where the intent forbids any Google mention. Rejected. |
| 2 | EC: callback replayed after a success shows the failure message | low | State cookie consumed; needs a manual back/reload onto the callback URL; fix adds a branch. Rejected. |
| 3 | EC: `resolveDriveMode` throwing in the callback gives a 500 | low | Only on a DB read failure (`getDemoModeActive` already catches); fix adds guards. Rejected. |
| 4 | EC: same for `beginGoogleConnection` | low | Same as #3. Rejected. |
| 5 | EC+BH: origin-based redirect URI fails on 127.0.0.1 / another port | medium | Origin-based URI is frozen intent. Patch: README and `.env.local.example` say to open exactly `http://localhost:3000`. |
| 6 | EC+BH: reconnect while connected overwrites the refresh token without revoking it | medium | `start` accepted `connected`. Patch: `beginGoogleConnection` proceeds only from `disconnected` (verified: start gives 307 to `/` when connected). |
| 7 | EC+BH: `disconnectGoogle` calls Google's revoke endpoint in demo mode (stale tab / direct call) | medium | Violates "nothing calls Google in demo mode". Patch: refused in demo mode. |
| 8 | EC: transient demo-mode read failure hides mock files | low | Same fail-safe direction as `app/layout.tsx`; DB failure only. Rejected. |
| 9 | EC+BH: `ROLLBACK` may throw after an SQLite auto-rollback, hiding the migration error | low | Patch: `if (sqlite.isTransaction)` guard (available in node:sqlite). |
| 10 | EC+BH: OAuth begin/complete and `resolveDriveMode` are client-callable Server Actions | low | No harm shown: `completeGoogleConnection` needs the state cookie scoped to `/api/google/oauth`, never sent with a Server Action POST to `/`, so it always fails; `beginGoogleConnection` only returns a consent URL (Google rejects unregistered redirect URIs). Restructuring adds files for no demonstrated harm. Rejected. |
| 11 | BH: `.env.local.example` calls the OAuth client "Internal" | low | Wording error vs README. Patch. |
| 12 | BH: all failures collapse into one message | false | Matches the frozen I/O matrix (two messages); raw reasons logged server-side. |
| 13 | BH+VG: no automated tests for mode gating, state check, token-not-in-payload, migration lock | medium (no test evidence) | No test suite by standing decision (CONVENTIONS.md); verified manually (Implementation Notes). Deferred. |
| 14 | BH+VG: `BEGIN IMMEDIATE` on every import even with nothing pending (30 s wait) | low | Transactions in this single-user app last milliseconds; no failure observed; fix adds a branch. Rejected. |
| 15 | BH: one transaction for all migrations; `PRAGMA foreign_keys=OFF` no-op | false | A failure rolls back and everything re-applies on next start; the PRAGMA was already inside a per-migration transaction before. |
| 16 | BH: ARIA menu roles without keyboard support | low | Patch: plain disclosure (button + `aria-expanded`). Overflow claim false: the control sits on the left of the top bar (screenshot). |
| 17 | BH: refresh token stored unencrypted, user not told | low | Storage is AD-12 by design; README now warns never to copy/share `db/local.db`. Patch. |

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
