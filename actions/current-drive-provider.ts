import { readGoogleRefreshToken } from '@/actions/google-credentials';
import { createDriveProvider, type DriveMode, type DriveProvider } from '@/integrations';

// The provider of the current drive mode, with the stored refresh token
// when connected (read server-side straight into the factory, never
// returned to a client). `null` when the token could not be read.
//
// Story 5.3 — moved out of `actions/document.ts` so `actions/livrable.ts`
// (presentation import) shares it. Deliberately NOT a `'use server'`
// module, same reason as `actions/google-credentials.ts`: every export of
// such a module is a public Server Action, and the refresh token returned
// here must never reach a client.
export function currentDriveProvider(
  mode: DriveMode,
): { provider: DriveProvider; refreshToken: string | null } | null {
  if (mode !== 'connected') {
    return { provider: createDriveProvider(mode), refreshToken: null };
  }
  const tokenRead = readGoogleRefreshToken();
  if (!tokenRead.ok) return null;
  return {
    provider: createDriveProvider(mode, tokenRead.refreshToken),
    refreshToken: tokenRead.refreshToken,
  };
}
