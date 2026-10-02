import { randomBytes } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { resolveDriveMode } from '@/actions/drive-mode';
import { beginGoogleConnection, getGoogleOAuthOrigin } from '@/actions/google-connection';

import { GOOGLE_OAUTH_STATE_COOKIE, stateCookieOptions } from '../state-cookie';

// Story 5.1 — Connexion du compte Google (AD-12). Entry point of the
// server-side "authorization code" flow, reached by the top bar's
// "Connecter Google Drive" link (`components/GoogleConnection.tsx`).
// Refused (plain redirect to `/`, no Google involved) in demo mode and when
// Google is not configured, per the spec's I/O matrix — and also whenever
// `beginGoogleConnection` refuses (e.g. an unreadable demo flag). `connected`
// is allowed: reconnecting replaces the stored account.
export async function GET(request: NextRequest) {
  const home = new URL('/', request.url);
  const mode = await resolveDriveMode();

  if (mode === 'demo' || mode === 'unconfigured') {
    return NextResponse.redirect(home);
  }

  // The redirect URI is fixed (`http://localhost:3000/...`). Opened from
  // any other origin (e.g. `127.0.0.1:3000`), the state cookie would land
  // on a host the callback never reaches and every connection would fail
  // silently — restart the flow on the redirect URI's origin first.
  const oauthOrigin = await getGoogleOAuthOrigin();
  if (request.nextUrl.origin !== oauthOrigin) {
    return NextResponse.redirect(new URL('/api/google/oauth/start', oauthOrigin));
  }

  const state = randomBytes(32).toString('base64url');
  const authUrl = await beginGoogleConnection(state);
  if (!authUrl) {
    return NextResponse.redirect(home);
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, stateCookieOptions(request));
  return response;
}
