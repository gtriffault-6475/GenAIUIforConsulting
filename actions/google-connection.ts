'use server';

import type { ActionResult } from '@/actions/types';
import {
  clearGoogleOAuthOutcome,
  disconnectGoogleConnection,
  readGoogleConnectionStatus,
  readGoogleOAuthOutcome,
  type GoogleConnectionStatus,
  type GoogleOAuthOutcome,
} from '@/actions/google-drive';

// Story 5.1 — Connexion du compte Google (AD-12). Epic 5 retro A10: only
// the Server Actions the browser legitimately calls live here (every
// export of a 'use server' file is callable from the client). Everything
// else — drive mode, provider with credentials, OAuth round-trip,
// GOOGLE_CONNECTION writes — is in `actions/google-drive.ts`, which is
// not a Server Action module.

export type { DriveMode } from '@/integrations/ports/drive-provider';
export type { GoogleConnectionStatus, GoogleOAuthOutcome } from '@/actions/google-drive';

export async function getGoogleConnectionStatus(): Promise<ActionResult<GoogleConnectionStatus>> {
  return readGoogleConnectionStatus();
}

export async function disconnectGoogle(): Promise<ActionResult<void>> {
  return disconnectGoogleConnection();
}

// Read by `app/page.tsx` to show the one-shot message after a failed or
// cancelled OAuth round-trip; `dismissGoogleOAuthOutcome` clears it so a
// reload never shows it again.
export async function getGoogleOAuthOutcome(): Promise<GoogleOAuthOutcome | null> {
  return readGoogleOAuthOutcome();
}

export async function dismissGoogleOAuthOutcome(): Promise<void> {
  await clearGoogleOAuthOutcome();
}
