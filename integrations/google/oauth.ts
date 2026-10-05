import { drive } from '@googleapis/drive';
import { OAuth2Client } from 'google-auth-library';

// Story 5.1 — Connexion du compte Google (AD-12). The only module that
// talks to Google's OAuth endpoints. Like every `integrations/` module it
// never reads or writes the database (AD-1/AD-2): callers pass the
// credentials in and persist what comes back through
// `actions/google-connection.ts`. Google's raw errors stay here (logged
// by the caller) — results are typed, never thrown.

// `drive` (restricted scope) is the only one that lets the app find the
// project folder by name and list its files (ARCHITECTURE-SPINE.md AD-12);
// the account email comes from Drive `about.get`, so no extra scope.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type GoogleOAuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'no_refresh_token' | 'unknown'; detail?: unknown };

function createClient(
  credentials: GoogleOAuthCredentials,
  redirectUri?: string,
): OAuth2Client {
  return new OAuth2Client({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    redirectUri,
  });
}

// `access_type=offline` + `prompt=consent`: Google only returns a refresh
// token on the first consent unless consent is forced again — without
// this, reconnecting after a disconnect would yield no refresh token.
export function buildAuthUrl(
  credentials: GoogleOAuthCredentials,
  redirectUri: string,
  state: string,
): string {
  return createClient(credentials, redirectUri).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
    state,
  });
}

export async function exchangeCode(
  credentials: GoogleOAuthCredentials,
  redirectUri: string,
  code: string,
): Promise<GoogleOAuthResult<{ refreshToken: string; accountEmail: string }>> {
  try {
    const client = createClient(credentials, redirectUri);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      return { ok: false, error: 'no_refresh_token' };
    }
    client.setCredentials(tokens);

    const about = await drive({ version: 'v3', auth: client }).about.get({
      fields: 'user(emailAddress)',
    });
    const accountEmail = about.data.user?.emailAddress;
    if (!accountEmail) {
      return { ok: false, error: 'unknown', detail: 'about.get returned no emailAddress' };
    }

    return { ok: true, data: { refreshToken: tokens.refresh_token, accountEmail } };
  } catch (detail) {
    return { ok: false, error: 'unknown', detail };
  }
}

// Best-effort: the local row is deleted whatever happens here.
export async function revokeToken(
  credentials: GoogleOAuthCredentials,
  token: string,
): Promise<GoogleOAuthResult<void>> {
  try {
    await createClient(credentials).revokeToken(token);
    return { ok: true, data: undefined };
  } catch (detail) {
    return { ok: false, error: 'unknown', detail };
  }
}
