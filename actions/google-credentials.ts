import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { GOOGLE_CONNECTION_ID, googleConnection } from '@/db/schema';

// Story 5.2 — server-side access to the stored refresh token, for
// `integrations/index.ts`'s `createDriveProvider('connected', …)` only.
//
// Deliberately NOT a `'use server'` module: every export of such a module
// is a public Server Action reachable by a direct POST, and the refresh
// token must never be returned to any client. These are plain server
// functions, imported by Server Actions (`actions/document.ts`) and never
// by a client component. Together with `actions/google-connection.ts`,
// this file is the only one allowed to touch GOOGLE_CONNECTION (AD-2).
// Nothing here logs the token: Drizzle errors can quote statement
// parameters, so only the error's name is logged.

// `refreshToken: null` = no account connected (confirmed by a successful
// read). `ok: false` = the row could not be read (logged): never to be
// mistaken for "no account" (the panel shows the generic error instead
// of the connection prompt).
export type GoogleTokenRead =
  | { ok: true; refreshToken: string | null }
  | { ok: false };

export function readGoogleRefreshToken(): GoogleTokenRead {
  try {
    const [row] = db
      .select({ refreshToken: googleConnection.refreshToken })
      .from(googleConnection)
      .where(eq(googleConnection.id, GOOGLE_CONNECTION_ID))
      .all();
    return { ok: true, refreshToken: row?.refreshToken ?? null };
  } catch (error) {
    console.error(
      'readGoogleRefreshToken failed',
      error instanceof Error ? error.name : 'unknown error',
    );
    return { ok: false };
  }
}

// `token_revoked` (AD-1): Google answered `invalid_grant`, so the stored
// connection is dead — delete it, which brings the drive mode back to
// `disconnected`. Only deletes the row if it still holds the token that
// failed, so a reconnection that landed in between is never undone. No
// revocation call: Google already considers the token invalid.
export function deleteRevokedGoogleConnection(refreshToken: string): void {
  try {
    db.delete(googleConnection)
      .where(
        and(
          eq(googleConnection.id, GOOGLE_CONNECTION_ID),
          eq(googleConnection.refreshToken, refreshToken),
        ),
      )
      .run();
  } catch (error) {
    console.error(
      'deleteRevokedGoogleConnection failed',
      error instanceof Error ? error.name : 'unknown error',
    );
  }
}
