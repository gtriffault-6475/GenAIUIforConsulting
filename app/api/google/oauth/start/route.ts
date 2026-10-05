import type { NextRequest } from 'next/server';

import { beginGoogleConnection } from '@/actions/google-connection';

// Story 5.1 (AD-12) — the one assumed exception to AD-2: an OAuth redirect
// cannot be a Server Action. Kept thin on purpose: all logic (mode check,
// anti-CSRF `state` cookie, consent URL) lives in
// `actions/google-connection.ts`. In demo mode or without configuration
// nothing calls Google: straight back to the workspace.
export async function GET(request: NextRequest) {
  const redirectUri = new URL('/api/google/oauth/callback', request.nextUrl.origin).toString();
  const result = await beginGoogleConnection(redirectUri);
  return Response.redirect(
    result.ok ? result.data : new URL('/', request.nextUrl.origin),
    307,
  );
}
