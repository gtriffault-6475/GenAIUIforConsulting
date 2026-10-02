import { drive as createDriveClient, type drive_v3 } from '@googleapis/drive';

import type {
  DriveError,
  DriveFile,
  DriveProvider,
  DriveResult,
} from '../ports/drive-provider';
import { createOAuthClient, type GoogleConfig } from './oauth';

// Story 5.2 — Dossier Drive du projet. Google adapter behind the
// `DriveProvider` port, built only by `integrations/index.ts`'s
// `createDriveProvider('connected', …)` with the stored refresh token.
//
// Secrets discipline (same as `oauth.ts`): Google/gaxios errors carry the
// whole request in their `config` (the `Authorization: Bearer` header,
// and the refresh token in the token-refresh request body), so they are
// never logged raw — `describeDriveError` keeps only the HTTP status and
// Google's short error code/reason. No method ever throws: every failure
// becomes a `DriveError`, turned into French copy by the panel.

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 1000;

// Drive v3 query strings are single-quoted: a literal `\` or `'` inside a
// value must be backslash-escaped (backslash first).
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

type GaxiosLikeError = {
  name?: unknown;
  status?: unknown;
  response?: {
    status?: unknown;
    data?: {
      error?:
        | string
        | { code?: unknown; status?: unknown; errors?: { reason?: unknown }[] };
    };
  };
};

function readErrorFields(error: unknown): {
  name: string;
  status: number | null;
  code: string | null;
  reason: string | null;
} {
  if (!error || typeof error !== 'object') {
    return { name: 'unknown error', status: null, code: null, reason: null };
  }
  const candidate = error as GaxiosLikeError;
  const name = typeof candidate.name === 'string' ? candidate.name : 'Error';
  const rawStatus = candidate.response?.status ?? candidate.status;
  const status = typeof rawStatus === 'number' ? rawStatus : null;
  const body = candidate.response?.data?.error;

  // Token refresh failures (oauth2.googleapis.com) answer
  // `{ error: 'invalid_grant', error_description }`; Drive API failures
  // answer `{ error: { code, status, errors: [{ reason }] } }`.
  if (typeof body === 'string') {
    return { name, status, code: body, reason: null };
  }
  const code = typeof body?.status === 'string' ? body.status : null;
  const firstReason = body?.errors?.[0]?.reason;
  const reason = typeof firstReason === 'string' ? firstReason : null;
  return { name, status, code, reason };
}

function describeDriveError(error: unknown): string {
  const { name, status, code, reason } = readErrorFields(error);
  return `${name} (status: ${status ?? 'n/a'}, error: ${code ?? 'n/a'}, reason: ${
    reason ?? 'n/a'
  })`;
}

class IncompleteSearchError extends Error {
  name = 'IncompleteSearchError';
}

// Scope unchecked at consent, or access withdrawn: the connection cannot
// work any more, same outcome as a revoked token (reconnect prompt).
const ACCESS_LOST_REASONS = new Set([
  'insufficientPermissions',
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
]);

const QUOTA_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'quotaExceeded',
  'sharingRateLimitExceeded',
]);

function toDriveError(error: unknown): DriveError {
  const { status, code, reason } = readErrorFields(error);
  // The refresh token was revoked, expired or its scope withdrawn: the
  // caller deletes GOOGLE_CONNECTION, back to `disconnected`.
  if (code === 'invalid_grant') return 'token_revoked';
  if (status === 401) return 'token_revoked';
  if (
    status === 403 &&
    ((reason !== null && ACCESS_LOST_REASONS.has(reason)) ||
      (code !== null && ACCESS_LOST_REASONS.has(code)))
  ) {
    return 'token_revoked';
  }
  if (status === 429 || (reason !== null && QUOTA_REASONS.has(reason))) return 'quota';
  if (status === 404) return 'not_found';
  return 'unknown';
}

export function createGoogleDriveProvider(
  config: GoogleConfig,
  refreshToken: string,
): DriveProvider {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });
  const client = createDriveClient({ version: 'v3', auth, timeout: REQUEST_TIMEOUT_MS });

  // Every page of a `files.list` query. `supportsAllDrives` +
  // `includeItemsFromAllDrives` so a root folder living in a shared drive
  // is listed too.
  async function listAll(q: string): Promise<drive_v3.Schema$File[]> {
    const files: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;
    do {
      const response = await client.files.list({
        q,
        fields: 'nextPageToken, incompleteSearch, files(id, name, mimeType, modifiedTime)',
        pageSize: PAGE_SIZE,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      // A partial listing must never reach the resync, which would delete
      // the rows of the files Google left out.
      if (response.data.incompleteSearch) {
        throw new IncompleteSearchError();
      }
      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
    return files;
  }

  return {
    async listFiles(projectName): Promise<DriveResult<DriveFile[]>> {
      try {
        // The project folder: a direct, non-trashed child folder of the
        // root folder whose name is exactly the project's (case and
        // accents included). The query sends the NFC form of the name and
        // Drive's `name =` is exact, so only a folder named in NFC (the
        // usual form) is found; the result is re-checked here with a
        // strict comparison rather than trusted as-is.
        const wantedName = projectName.normalize('NFC');
        const candidates = await listAll(
          `'${escapeQueryValue(config.rootFolderId)}' in parents` +
            ` and name = '${escapeQueryValue(wantedName)}'` +
            ` and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
        );
        const folders = candidates.filter(
          (file) => file.id && file.name?.normalize('NFC') === wantedName,
        );

        if (folders.length === 0) return { ok: false, error: 'folder_missing' };
        if (folders.length > 1) return { ok: false, error: 'folder_duplicate' };

        const folderId = folders[0].id as string;

        // Direct children only (sub-folders are neither listed nor walked).
        const children = await listAll(
          `'${escapeQueryValue(folderId)}' in parents` +
            ` and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false`,
        );

        const files: DriveFile[] = [];
        for (const file of children) {
          if (!file.id || !file.name) continue;
          files.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType ?? 'application/octet-stream',
            modifiedTime: file.modifiedTime ?? null,
            folderPath: null,
          });
        }
        return { ok: true, data: files };
      } catch (error) {
        console.error('googleDrive.listFiles failed', describeDriveError(error));
        return { ok: false, error: toDriveError(error) };
      }
    },
  };
}
