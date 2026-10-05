import type { NextRequest } from 'next/server';

import { completeGoogleConnection } from '@/actions/google-drive';

// Story 5.1 (AD-12) — Google redirects here after the consent screen.
// Writes nothing itself: `completeGoogleConnection` verifies `state`,
// exchanges the code and stores the connection. Whatever the outcome
// (success, refusal, error), the consultant lands back on the workspace;
// a failure is shown there from a one-shot cookie, never from Google's
// raw error.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  await completeGoogleConnection({
    redirectUri: new URL('/api/google/oauth/callback', origin).toString(),
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    googleError: searchParams.get('error'),
  });
  return Response.redirect(new URL('/', origin), 303);
}
