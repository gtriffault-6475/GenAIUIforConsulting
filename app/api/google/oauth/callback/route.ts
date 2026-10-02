import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { resolveDriveMode } from '@/actions/drive-mode';
import { completeGoogleConnection } from '@/actions/google-connection';

import {
  GOOGLE_CONNECTION_FAILED_QUERY,
  GOOGLE_OAUTH_COOKIE_PATH,
  GOOGLE_OAUTH_STATE_COOKIE,
} from '../state-cookie';

function stateMatches(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Story 5.1 — Connexion du compte Google (AD-12). Google redirects here
// after consent. One of the two AD-2 exceptions to "mutations go through
// Server Actions": it writes only through `actions/google-connection.ts`'s
// `completeGoogleConnection`, called only once `state` has been verified.
// Every outcome is a redirect to `/`; the refresh token never appears in
// a response, and the state cookie is always cleared. Failure causes
// (missing/mismatched `state`, `error=access_denied`,
// failed exchange, no refresh token) are logged without any secret and all
// surface as the same short message on `/`.
export async function GET(request: NextRequest) {
  const home = new URL('/', request.url);
  const failure = new URL(`/?${GOOGLE_CONNECTION_FAILED_QUERY}`, request.url);

  const redirectTo = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', {
      path: GOOGLE_OAUTH_COOKIE_PATH,
      maxAge: 0,
    });
    return response;
  };

  // No Google call at all in demo mode or when unconfigured.
  const mode = await resolveDriveMode();
  if (mode === 'demo' || mode === 'unconfigured') {
    return redirectTo(home);
  }

  const params = request.nextUrl.searchParams;
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!stateMatches(expectedState, params.get('state'))) {
    console.error('Google OAuth callback: missing or mismatched state');
    return redirectTo(failure);
  }

  const googleError = params.get('error');
  if (googleError) {
    // Google's own short error code (e.g. `access_denied`), never a secret.
    // Logged only if it has that shape: the parameter is attacker-controlled
    // (log injection).
    const loggedError = /^[a-z_]{1,64}$/.test(googleError) ? googleError : '<invalid>';
    console.error(`Google OAuth callback: Google returned error "${loggedError}"`);
    return redirectTo(failure);
  }

  const code = params.get('code');
  if (!code) {
    console.error('Google OAuth callback: no authorization code');
    return redirectTo(failure);
  }

  const completed = await completeGoogleConnection(code);
  if (!completed.ok) {
    return redirectTo(failure);
  }

  return redirectTo(home);
}
