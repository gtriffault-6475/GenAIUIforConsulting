'use server';

import { eq } from 'drizzle-orm';

import { getDemoModeActive } from '@/actions/demo';
import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { GOOGLE_CONNECTION_ID, googleConnection } from '@/db/schema';
import { googleOAuth } from '@/integrations';

// Story 5.1 — Connexion du compte Google (AD-12). AD-2: this file and
// `actions/google-credentials.ts` (Story 5.2 — the token for the Drive
// adapter, deliberately outside any `'use server'` module) are the only
// ones allowed to read or write GOOGLE_CONNECTION. The OAuth callback
// route (`app/api/google/oauth/callback/route.ts`, the one AD-2 exception
// to "mutations go through Server Actions") writes only through
// `completeGoogleConnection` below.
//
// The refresh token never leaves this file towards a caller: no function
// here returns it, and nothing here logs it.

export type GoogleAccount = {
  accountEmail: string;
  connectedAt: string;
};

// `null` = no account connected (a legitimate state, not an error).
export async function getGoogleAccount(): Promise<ActionResult<GoogleAccount | null>> {
  try {
    const [row] = await db
      .select({
        accountEmail: googleConnection.accountEmail,
        connectedAt: googleConnection.connectedAt,
      })
      .from(googleConnection)
      .where(eq(googleConnection.id, GOOGLE_CONNECTION_ID));

    return { ok: true, data: row ?? null };
  } catch (error) {
    console.error('getGoogleAccount failed', error);
    return {
      ok: false,
      error: "Impossible de lire l'état de la connexion Google.",
    };
  }
}

// Singleton upsert (same shape as `actions/demo.ts`'s `setDemoModeActive`):
// one Google account per workstation, a reconnection replaces the previous
// row rather than adding a second one. Deliberately NOT exported: this file
// is `'use server'`, so any export is a public Server Action, and no
// action may ever accept a raw token from a client.
function upsertGoogleConnection(refreshToken: string, accountEmail: string): boolean {
  try {
    const connectedAt = new Date().toISOString();

    db.insert(googleConnection)
      .values({ id: GOOGLE_CONNECTION_ID, refreshToken, accountEmail, connectedAt })
      .onConflictDoUpdate({
        target: googleConnection.id,
        set: { refreshToken, accountEmail, connectedAt },
      })
      .run();

    return true;
  } catch (error) {
    // The Drizzle error message can quote the statement's parameters —
    // the refresh token among them — so only its name is logged.
    console.error(
      'upsertGoogleConnection failed',
      error instanceof Error ? error.name : 'unknown error',
    );
    return false;
  }
}

// Stricter than `resolveDriveMode` on purpose: an unreadable demo flag
// degrades the mode to `disconnected` there (spec's matrix), but the OAuth
// flow must never call Google unless the demo is known to be off.
async function canCallGoogle(): Promise<boolean> {
  const demoModeResult = await getDemoModeActive();
  return demoModeResult.ok && !demoModeResult.data && googleOAuth.isConfigured();
}

// The origin of the fixed OAuth redirect URI: the start route bounces any
// other origin (e.g. `127.0.0.1:3000`) there first, so the state cookie is
// set on the host the callback will actually be reached on.
export async function getGoogleOAuthOrigin(): Promise<string> {
  return new URL(googleOAuth.redirectUri).origin;
}

// Called by `app/api/google/oauth/start/route.ts`. `null` = refused (demo
// active or unreadable, or Google unconfigured) — no Google URL is built.
export async function beginGoogleConnection(state: string): Promise<string | null> {
  if (!state || !(await canCallGoogle())) return null;
  return googleOAuth.createAuthUrl(state);
}

// Called by `app/api/google/oauth/callback/route.ts` only after it has
// verified `state` against its cookie. Does the whole server-side
// completion: guards, code exchange at Google, then the singleton upsert.
// The refresh token never leaves this function.
export async function completeGoogleConnection(code: string): Promise<ActionResult<void>> {
  const failed = { ok: false as const, error: 'La connexion à Google a échoué.' };

  if (!code || !(await canCallGoogle())) return failed;

  const exchange = await googleOAuth.exchangeAuthCode(code);
  if (!exchange.ok) return failed;

  return upsertGoogleConnection(exchange.refreshToken, exchange.accountEmail)
    ? { ok: true, data: undefined }
    : failed;
}

// Deletes the local row first, then attempts revocation at Google (best
// effort, spec's Boundaries): a failed revocation is logged by
// `googleOAuth.revokeToken` and never prevents the local disconnection.
// Refused in demo mode (no Google call while the demo is active, and the
// top bar shows no Google control then anyway).
export async function disconnectGoogle(): Promise<ActionResult<void>> {
  const demoModeResult = await getDemoModeActive();
  if (!demoModeResult.ok) {
    return demoModeResult;
  }
  if (demoModeResult.data) {
    return {
      ok: false,
      error: 'La déconnexion de Google Drive est indisponible en mode démo.',
    };
  }

  let refreshToken: string | null = null;

  try {
    refreshToken = db.transaction((tx) => {
      const [row] = tx
        .select({ refreshToken: googleConnection.refreshToken })
        .from(googleConnection)
        .where(eq(googleConnection.id, GOOGLE_CONNECTION_ID))
        .all();

      tx.delete(googleConnection)
        .where(eq(googleConnection.id, GOOGLE_CONNECTION_ID))
        .run();

      return row?.refreshToken ?? null;
    });
  } catch (error) {
    console.error('disconnectGoogle failed', error);
    return {
      ok: false,
      error: 'Impossible de déconnecter le compte Google. Réessayez.',
    };
  }

  if (refreshToken) {
    const revoked = await googleOAuth.revokeToken(refreshToken);
    if (!revoked) {
      console.error(
        'disconnectGoogle: token revocation failed, local connection removed anyway',
      );
    }
  }

  return { ok: true, data: undefined };
}
