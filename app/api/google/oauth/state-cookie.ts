import type { NextRequest } from 'next/server';

// Story 5.1 — shared by `start/route.ts` and `callback/route.ts` (not a
// route segment itself: only `route.ts`/`page.tsx` files are routable).
// Anti-CSRF `state`: random, stored in an httpOnly `SameSite=Lax` cookie
// for ~10 minutes, scoped to the OAuth routes, checked then cleared by the
// callback.
export const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state';
export const GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 600;
export const GOOGLE_OAUTH_COOKIE_PATH = '/api/google/oauth';

// The query flag `app/page.tsx` reads to show "La connexion à Google a
// échoué. Réessayez." — a fixed marker, never any detail of the cause.
export const GOOGLE_CONNECTION_FAILED_QUERY = 'google=connection-failed';

export function stateCookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // `localhost` over plain http in development: only require HTTPS when
    // the app is actually served over it.
    secure: request.nextUrl.protocol === 'https:',
    path: GOOGLE_OAUTH_COOKIE_PATH,
    maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
  };
}
