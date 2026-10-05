'use server';

import { randomBytes, timingSafeEqual } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { getDemoModeActive } from '@/actions/demo';
import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { GOOGLE_CONNECTION_ID, googleConnection } from '@/db/schema';
import { getDriveProvider } from '@/integrations';
import type { DriveMode, DriveProvider } from '@/integrations/ports/drive-provider';
import {
  buildAuthUrl,
  exchangeCode,
  revokeToken,
  type GoogleOAuthCredentials,
} from '@/integrations/google/oauth';

// Story 5.1 — Connexion du compte Google (AD-1, AD-12).
//
// This file is the only writer of GOOGLE_CONNECTION. The two OAuth route
// handlers (`app/api/google/oauth/{start,callback}`, the one assumed
// exception to AD-2) stay thin: they call `beginGoogleConnection` /
// `completeGoogleConnection` below and only translate the result into a
// redirect. Nothing exported here ever returns the refresh token — the
// client only ever sees the mode and the account email.

export type { DriveMode } from '@/integrations/ports/drive-provider';

export type GoogleConnectionStatus = {
  mode: DriveMode;
  // Only set in `connected` mode — never shown in demo mode (Story 5.1:
  // "aucune mention de Google" while the demo mode is active).
  accountEmail: string | null;
  // Story 5.6 — `GOOGLE_SLIDES_TEMPLATE_ID` is set (never its value).
  slidesTemplateConfigured: boolean;
};

// One-shot outcome of the last OAuth round-trip, carried from the callback
// to the page by a short-lived cookie (see the spec's Design Notes).
export type GoogleOAuthOutcome = 'cancelled' | 'failed';

const STATE_COOKIE = 'google_oauth_state';
const OUTCOME_COOKIE = 'google_oauth_result';
const COOKIE_MAX_AGE_SECONDS = 600;

// `null` when any of the three variables is missing — that is what
// `unconfigured` means (spec: "any of GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_ROOT_FOLDER_ID missing"). Not exported:
// every export of a 'use server' file becomes a callable Server Action.
function readGoogleConfig():
  | (GoogleOAuthCredentials & { rootFolderId: string })
  | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!clientId || !clientSecret || !rootFolderId) return null;
  return { clientId, clientSecret, rootFolderId };
}

// Story 5.6 — the OCTO slides template copied by "Créer dans Drive".
// Optional: without it the rest of the Drive integration works, only the
// creation of a presentation is unavailable (no blank fallback).
function readSlidesTemplateId(): string | null {
  return process.env.GOOGLE_SLIDES_TEMPLATE_ID?.trim() || null;
}

function readConnectionRow() {
  return db
    .select()
    .from(googleConnection)
    .where(eq(googleConnection.id, GOOGLE_CONNECTION_ID))
    .get();
}

// AD-1: the single place computing the drive mode, strict priority
// demo > unconfigured > disconnected > connected. A failed demo-mode read
// degrades to "not demo", same fail-safe direction as `app/layout.tsx`.
export async function resolveDriveMode(): Promise<DriveMode> {
  const demoModeResult = await getDemoModeActive();
  if (demoModeResult.ok && demoModeResult.data) return 'demo';
  if (!readGoogleConfig()) return 'unconfigured';
  return readConnectionRow() ? 'connected' : 'disconnected';
}

// Story 5.2 — the drive adapter for the current mode, with the Google
// credentials wired in server-side so they never leave this file (AD-12).
// Only meant for server-side callers (`actions/document.ts`): returning a
// provider object to a browser fails serialization, so nothing leaks even
// if a client invoked it.
export async function getActiveDriveProvider(): Promise<{
  mode: DriveMode;
  provider: DriveProvider | null;
}> {
  const mode = await resolveDriveMode();
  if (mode !== 'connected') return { mode, provider: getDriveProvider(mode) };

  const config = readGoogleConfig();
  const row = readConnectionRow();
  if (!config || !row) return { mode: 'disconnected', provider: null };
  const provider = getDriveProvider(mode, {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    rootFolderId: config.rootFolderId,
    refreshToken: row.refreshToken,
    slidesTemplateId: readSlidesTemplateId(),
  });
  return { mode, provider: provider && forgetConnectionOnRevokedToken(provider) };
}

// Story 5.2 (AD-1) — when Google refuses the stored refresh token
// (`token_revoked`), forget the connection so the app falls back to
// `disconnected` and offers to reconnect (no revoke call: the token is
// already invalid). Done here, by wrapping the provider, so this file stays
// the only writer of GOOGLE_CONNECTION and no client-callable action can
// delete the connection on its own.
function forgetConnectionOnRevokedToken(provider: DriveProvider): DriveProvider {
  const forgetIfRevoked = <T extends { ok: boolean; error?: string }>(result: T): T => {
    if (!result.ok && result.error === 'token_revoked') {
      try {
        db.delete(googleConnection).where(eq(googleConnection.id, GOOGLE_CONNECTION_ID)).run();
      } catch (error) {
        console.error('forgetConnectionOnRevokedToken failed', error);
      }
    }
    return result;
  };
  return {
    listFiles: async (projectName) => forgetIfRevoked(await provider.listFiles(projectName)),
    exportText: async (fileId, mimeType) =>
      forgetIfRevoked(await provider.exportText(fileId, mimeType)),
    readPresentation: async (fileId) => forgetIfRevoked(await provider.readPresentation(fileId)),
    writePresentationText: async (fileId, edits, requiredRevisionId) =>
      forgetIfRevoked(await provider.writePresentationText(fileId, edits, requiredRevisionId)),
    createPresentation: async (projectName, title, slides) =>
      forgetIfRevoked(await provider.createPresentation(projectName, title, slides)),
  };
}

export async function getGoogleConnectionStatus(): Promise<
  ActionResult<GoogleConnectionStatus>
> {
  try {
    const mode = await resolveDriveMode();
    const accountEmail =
      mode === 'connected' ? (readConnectionRow()?.accountEmail ?? null) : null;
    return {
      ok: true,
      data: { mode, accountEmail, slidesTemplateConfigured: readSlidesTemplateId() !== null },
    };
  } catch (error) {
    console.error('getGoogleConnectionStatus failed', error);
    return { ok: false, error: "Impossible de lire l'état de la connexion Google." };
  }
}

// Called by `app/api/google/oauth/start`. Only proceeds from
// `disconnected`: refuses in `demo` and `unconfigured` (nothing may call
// Google in demo mode), and in `connected` (a second consent would
// overwrite the stored refresh token without revoking it — disconnect
// first, which revokes it). Stores a random
// anti-CSRF `state` in an httpOnly cookie and returns Google's consent URL.
export async function beginGoogleConnection(
  redirectUri: string,
): Promise<ActionResult<string>> {
  const mode = await resolveDriveMode();
  const config = readGoogleConfig();
  if (mode !== 'disconnected' || !config) {
    return { ok: false, error: 'Google Drive indisponible.' };
  }

  const state = randomBytes(32).toString('hex');
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/google/oauth',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return { ok: true, data: buildAuthUrl(config, redirectUri, state) };
}

function statesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called by `app/api/google/oauth/callback`. Verifies `state` against the
// cookie set by `beginGoogleConnection` (cleared in every case), exchanges
// the code, then upserts the singleton row. Google's raw errors are only
// logged here; the caller gets a coarse outcome.
export async function completeGoogleConnection(params: {
  redirectUri: string;
  code: string | null;
  state: string | null;
  googleError: string | null;
}): Promise<ActionResult<void> & { outcome?: GoogleOAuthOutcome }> {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete({ name: STATE_COOKIE, path: '/api/google/oauth' });

  const failed = (error: string, outcome: GoogleOAuthOutcome = 'failed') => {
    cookieStore.set(OUTCOME_COOKIE, outcome, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return { ok: false as const, error, outcome };
  };

  if (!statesMatch(expectedState, params.state)) {
    console.error('completeGoogleConnection: missing or mismatched OAuth state');
    return failed('state');
  }

  if (params.googleError) {
    // `access_denied` is the consultant declining consent — not a failure.
    if (params.googleError === 'access_denied') return failed('cancelled', 'cancelled');
    console.error('completeGoogleConnection: Google returned an error', params.googleError);
    return failed('google');
  }

  const mode = await resolveDriveMode();
  const config = readGoogleConfig();
  if (mode === 'demo' || !config || !params.code) {
    console.error('completeGoogleConnection: callback reached without a usable code or configuration', { mode });
    return failed('unavailable');
  }

  const exchanged = await exchangeCode(config, params.redirectUri, params.code);
  if (!exchanged.ok) {
    console.error('completeGoogleConnection: token exchange failed', exchanged.error, exchanged.detail);
    return failed(exchanged.error);
  }

  try {
    const values = {
      refreshToken: exchanged.data.refreshToken,
      accountEmail: exchanged.data.accountEmail,
      connectedAt: new Date().toISOString(),
    };
    db.insert(googleConnection)
      .values({ id: GOOGLE_CONNECTION_ID, ...values })
      .onConflictDoUpdate({ target: googleConnection.id, set: values })
      .run();
  } catch (error) {
    console.error('completeGoogleConnection: could not store the connection', error);
    return failed('storage');
  }

  cookieStore.delete(OUTCOME_COOKIE);
  return { ok: true, data: undefined };
}

// Deletes the row (back to `disconnected`). Token revocation at Google is
// best-effort: a failure is logged and never blocks the local disconnect.
// Refused in demo mode — the control is hidden there, but a stale tab or a
// direct call must not reach Google's revoke endpoint either.
export async function disconnectGoogle(): Promise<ActionResult<void>> {
  if ((await resolveDriveMode()) === 'demo') {
    return { ok: false, error: 'Indisponible en mode démo.' };
  }
  try {
    const row = readConnectionRow();
    if (!row) return { ok: true, data: undefined };

    db.delete(googleConnection).where(eq(googleConnection.id, GOOGLE_CONNECTION_ID)).run();

    const config = readGoogleConfig();
    if (config) {
      const revoked = await revokeToken(config, row.refreshToken);
      if (!revoked.ok) {
        console.error('disconnectGoogle: token revocation failed (ignored)', revoked.detail);
      }
    }
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('disconnectGoogle failed', error);
    return { ok: false, error: 'La déconnexion de Google Drive a échoué. Réessayez.' };
  }
}

// Read by `app/page.tsx` to show the one-shot message after a failed or
// cancelled OAuth round-trip; `dismissGoogleOAuthOutcome` clears it so a
// reload never shows it again.
export async function getGoogleOAuthOutcome(): Promise<GoogleOAuthOutcome | null> {
  const value = (await cookies()).get(OUTCOME_COOKIE)?.value;
  return value === 'cancelled' || value === 'failed' ? value : null;
}

export async function dismissGoogleOAuthOutcome(): Promise<void> {
  (await cookies()).delete(OUTCOME_COOKIE);
}
