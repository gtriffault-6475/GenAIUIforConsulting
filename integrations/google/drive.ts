import { drive as createDriveClient, type drive_v3 } from '@googleapis/drive';
import { slides as createSlidesClient, type slides_v1 } from '@googleapis/slides';

import {
  EXPORT_FORMAT_BY_MIME_TYPE,
  type DriveError,
  type DriveFile,
  type DriveProvider,
  type DriveResult,
  type PresentationContent,
  type PresentationSlide,
  type PresentationTextBox,
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

// Story 5.3 — the text of one shape: its text runs and auto texts (e.g. a
// slide number) in order, without Slides' closing paragraph break (every
// shape's text ends with one). Line breaks inside a paragraph stay as
// Slides' vertical tab, paragraph breaks as `\n`, so the text stays the
// exact image of the file (compared again before any later write).
function readShapeText(text: slides_v1.Schema$TextContent | undefined): string {
  let result = '';
  for (const element of text?.textElements ?? []) {
    result += element.textRun?.content ?? element.autoText?.content ?? '';
  }
  return result.endsWith('\n') ? result.slice(0, -1) : result;
}

// Story 5.3 — the text boxes of a list of page elements, in order,
// descending into groups at any depth. A shape without text (or with only
// whitespace) is not a text box; tables, images, videos, lines, charts
// and word art are ignored.
function collectTextBoxes(
  elements: slides_v1.Schema$PageElement[] | undefined,
  into: PresentationTextBox[],
): PresentationTextBox[] {
  for (const element of elements ?? []) {
    if (element.elementGroup) {
      collectTextBoxes(element.elementGroup.children ?? undefined, into);
      continue;
    }
    if (!element.objectId || !element.shape?.text) continue;
    const text = readShapeText(element.shape.text);
    if (text.trim() === '') continue;
    into.push({ objectId: element.objectId, text });
  }
  return into;
}

// Pure (no Google call): a `presentations.get` response to the port's
// `PresentationContent`. Exported so it can be checked against a recorded
// response.
export function toPresentationContent(
  presentation: slides_v1.Schema$Presentation,
): PresentationContent {
  const slides: PresentationSlide[] = [];
  for (const slide of presentation.slides ?? []) {
    // A slide always has an id; one without would be unusable as an
    // anchor, but keeps its rank so the numbering stays the file's.
    slides.push({
      objectId: slide.objectId ?? '',
      textBoxes: collectTextBoxes(slide.pageElements ?? undefined, []),
    });
  }
  return { title: presentation.title ?? '', slides };
}

export function createGoogleDriveProvider(
  config: GoogleConfig,
  refreshToken: string,
): DriveProvider {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });
  const client = createDriveClient({ version: 'v3', auth, timeout: REQUEST_TIMEOUT_MS });
  const slidesClient = createSlidesClient({ version: 'v1', auth, timeout: REQUEST_TIMEOUT_MS });

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

    // Story 5.7 — `files.get` for the type (the port only takes the id),
    // then `files.export` in the matching text format: plain text for Docs
    // and Slides, CSV of the first sheet for Sheets. Google caps an export
    // at 10 MB (an error, mapped like any other). Only ever called for a
    // file the consultant selected (NFR8).
    async exportText(fileId): Promise<DriveResult<string>> {
      try {
        const metadata = await client.files.get({
          fileId,
          fields: 'mimeType, trashed',
          supportsAllDrives: true,
        });
        const format = metadata.data.mimeType
          ? EXPORT_FORMAT_BY_MIME_TYPE[metadata.data.mimeType]
          : undefined;
        if (!format || metadata.data.trashed) return { ok: false, error: 'not_found' };

        const response = await client.files.export(
          { fileId, mimeType: format },
          { responseType: 'text' },
        );
        if (typeof response.data !== 'string') {
          console.error('googleDrive.exportText: unexpected response body type', typeof response.data);
          return { ok: false, error: 'unknown' };
        }
        // Drive prefixes text exports with a UTF-8 byte order mark.
        return { ok: true, data: response.data.replace(/^\uFEFF/, '') };
      } catch (error) {
        console.error('googleDrive.exportText failed', describeDriveError(error));
        return { ok: false, error: toDriveError(error) };
      }
    },

    // Story 5.3 — `presentations.get`, read only: the file is never
    // modified. Speaker notes live under `slideProperties`, which the
    // field mask leaves out.
    async readPresentation(fileId): Promise<DriveResult<PresentationContent>> {
      try {
        const response = await slidesClient.presentations.get({
          presentationId: fileId,
          fields: 'title,slides(objectId,pageElements)',
        });
        return { ok: true, data: toPresentationContent(response.data) };
      } catch (error) {
        console.error('googleDrive.readPresentation failed', describeDriveError(error));
        return { ok: false, error: toDriveError(error) };
      }
    },
  };
}
