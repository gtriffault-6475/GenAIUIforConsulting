import { OAuth2Client, type Credentials } from 'google-auth-library';

// Story 5.1 — Connexion du compte Google (AD-12). Every OAuth call to
// Google lives here, behind `integrations/index.ts` (AD-1's single wiring
// point): `app/api/google/oauth/*` and `actions/google-connection.ts`
// import it from there, never from this file directly. No Drive call here
// — the Drive adapter (`integrations/google/drive.ts`, Story 5.2) reuses
// `readGoogleConfig` and `createOAuthClient`.
//
// Secrets discipline: nothing in this file ever logs a token, an
// authorization code or the client secret. Google/gaxios errors carry the
// full request (body with `code` + `client_secret`, or a revoke URL with
// the token in it) in their `config`, so they are never logged raw —
// `describeGoogleError` keeps only the HTTP status and Google's short
// error code.

export const GOOGLE_OAUTH_REDIRECT_URI =
  'http://localhost:3000/api/google/oauth/callback';

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'openid',
  'email',
];

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  rootFolderId: string;
};

// `unconfigured` (spec's Boundaries) = at least one of the three variables
// missing. An empty string (`GOOGLE_CLIENT_ID=` copied as-is from
// `.env.local.example`) counts as missing. Exported for the Drive adapter
// (Story 5.2) through `integrations/index.ts` only.
export function readGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();

  if (!clientId || !clientSecret || !rootFolderId) return null;
  return { clientId, clientSecret, rootFolderId };
}

export function isGoogleConfigured(): boolean {
  return readGoogleConfig() !== null;
}

export function createOAuthClient(config: GoogleConfig): OAuth2Client {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
  });
}

function describeGoogleError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      name?: unknown;
      response?: { status?: unknown; data?: { error?: unknown } };
    };
    const name = typeof candidate.name === 'string' ? candidate.name : 'Error';
    const status = candidate.response?.status;
    const code = candidate.response?.data?.error;
    return `${name} (status: ${typeof status === 'number' ? status : 'n/a'}, error: ${
      typeof code === 'string' ? code : 'n/a'
    })`;
  }
  return 'unknown error';
}

// `null` when unconfigured — the caller (`start` route) has already
// checked the drive mode, this is only a second line of defense.
export function createGoogleAuthUrl(state: string): string | null {
  const config = readGoogleConfig();
  if (!config) return null;

  return createOAuthClient(config).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  });
}

export type GoogleOAuthExchangeResult =
  | { ok: true; refreshToken: string; accountEmail: string }
  | { ok: false };

// Exchanges the callback's authorization code for tokens and resolves the
// account's email from the signed ID token (verified against this
// client's id). The access token is discarded: Story 5.2's adapter will
// mint its own from the stored refresh token. Every failure cause is
// logged here, without any secret, and collapsed into `{ ok: false }` —
// the callback shows the same short French message for all of them.
export async function exchangeGoogleAuthCode(
  code: string,
): Promise<GoogleOAuthExchangeResult> {
  const config = readGoogleConfig();
  if (!config) {
    console.error('exchangeGoogleAuthCode: Google OAuth is not configured');
    return { ok: false };
  }

  const client = createOAuthClient(config);

  let tokens: Credentials;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (error) {
    console.error(
      'exchangeGoogleAuthCode: token exchange failed',
      describeGoogleError(error),
    );
    return { ok: false };
  }

  if (!tokens.refresh_token) {
    console.error(
      'exchangeGoogleAuthCode: Google returned no refresh token (access_type=offline/prompt=consent not honored?)',
    );
    return { ok: false };
  }

  if (!tokens.id_token) {
    console.error('exchangeGoogleAuthCode: Google returned no ID token');
    return { ok: false };
  }

  let accountEmail: string | undefined;
  try {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    accountEmail = ticket.getPayload()?.email;
  } catch (error) {
    console.error(
      'exchangeGoogleAuthCode: ID token verification failed',
      describeGoogleError(error),
    );
    return { ok: false };
  }

  if (!accountEmail) {
    console.error('exchangeGoogleAuthCode: ID token carries no email claim');
    return { ok: false };
  }

  return { ok: true, refreshToken: tokens.refresh_token, accountEmail };
}

// Best effort (spec's Boundaries): the caller deletes the local row
// regardless of this result. Plain `fetch` POST with the token in the form
// body rather than `OAuth2Client.revokeToken`, which puts the token in the
// URL query string — and therefore in any logged error's `config.url`.
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(
        `revokeGoogleToken: Google refused the revocation (status: ${response.status})`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      'revokeGoogleToken: revocation request failed',
      error instanceof Error ? error.name : 'unknown error',
    );
    return false;
  }
}
