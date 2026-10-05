import { drive, type drive_v3 } from '@googleapis/drive';
import { slides, type slides_v1 } from '@googleapis/slides';
import { OAuth2Client } from 'google-auth-library';

import { exportMimeTypeFor } from '@/domain/document';

import type {
  DriveError,
  DriveFile,
  DrivePresentation,
  DriveProvider,
  DriveResult,
  DriveTextBox,
} from '../ports/drive-provider';

// Story 5.2 — the real drive adapter (AD-1), wired by
// `integrations/index.ts` only in `connected` mode. Never reads the
// database: the caller passes the credentials in. Every Google error is
// converted to a `DriveError` here; the raw detail is only logged.

export type GoogleDriveCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  rootFolderId: string;
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// The Contexte panel resyncs on every workspace render: a hanging Google
// call must not block the page indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

// Drive query string literal: backslash and single quote must be escaped.
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

type GoogleLikeError = {
  message?: string;
  status?: number;
  code?: number | string;
  response?: { status?: number; data?: { error?: unknown } };
  errors?: { reason?: string }[];
};

type GoogleErrorBody = { errors?: { reason?: string }[] };

// Quota reasons may sit on the error itself or in the response body
// (`{ error: { errors: [{ reason }] } }`), depending on the client layer.
function errorReasons(e: GoogleLikeError): string[] {
  const body = e.response?.data?.error;
  const nested =
    body && typeof body === 'object' ? ((body as GoogleErrorBody).errors ?? []) : [];
  return [...(e.errors ?? []), ...nested].map((item) => item.reason ?? '');
}

// Story 5.5 — a refused `requiredRevisionId` (HTTP 400 mentioning the
// revision), as opposed to any other invalid request.
export function isRevisionMismatch(error: unknown): boolean {
  const e = (error ?? {}) as GoogleLikeError;
  const status = e.response?.status ?? e.status ?? (typeof e.code === 'number' ? e.code : undefined);
  if (status !== 400) return false;
  const body = e.response?.data?.error;
  const bodyMessage =
    body && typeof body === 'object' ? String((body as { message?: unknown }).message ?? '') : '';
  const bodyStatus =
    body && typeof body === 'object' ? String((body as { status?: unknown }).status ?? '') : '';
  return bodyStatus === 'FAILED_PRECONDITION' || /revision/i.test(`${e.message ?? ''} ${bodyMessage}`);
}

export function toDriveError(error: unknown): DriveError {
  const e = (error ?? {}) as GoogleLikeError;
  const status = e.response?.status ?? e.status ?? (typeof e.code === 'number' ? e.code : undefined);
  const dataError = e.response?.data?.error;
  const reasons = errorReasons(e);

  // A wrong client ID/secret is an installation problem, not a revoked
  // token: never let it delete the consultant's connection.
  if (
    dataError === 'invalid_client' ||
    (typeof e.message === 'string' && e.message.includes('invalid_client'))
  ) {
    return 'unknown';
  }
  if (
    dataError === 'invalid_grant' ||
    (typeof e.message === 'string' && e.message.includes('invalid_grant')) ||
    status === 401
  ) {
    return 'token_revoked';
  }
  if (
    status === 429 ||
    reasons.some((reason) => /ratelimitexceeded|quotaexceeded/i.test(reason))
  ) {
    return 'quota';
  }
  if (status === 404) return 'not_found';
  return 'unknown';
}

function fail<T>(context: string, error: unknown): DriveResult<T> {
  const driveError = toDriveError(error);
  console.error(`googleDriveProvider.${context} failed (${driveError})`, error);
  return { ok: false, error: driveError };
}

async function listAll(
  api: drive_v3.Drive,
  q: string,
): Promise<drive_v3.Schema$File[]> {
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const response = await api.files.list(
      {
        q,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

// Story 5.3 — a shape's text: its text runs concatenated, minus the final
// paragraph newline Slides always ends a text box with.
function shapeText(shape: slides_v1.Schema$Shape | undefined): string {
  const runs = (shape?.text?.textElements ?? [])
    .map((element) => element.textRun?.content ?? '')
    .join('');
  return runs.endsWith('\n') ? runs.slice(0, -1) : runs;
}

// Text boxes of a slide in reading order of the API, recursing into
// groups; tables, images, videos and lines are skipped. Shapes without
// text are kept (text '') so a zone emptied by a save is still found by
// the next save's conflict check; the import (`slidesToBlocks`) is what
// leaves blank boxes out of the livrable.
function collectTextBoxes(
  elements: slides_v1.Schema$PageElement[] | undefined,
  into: DriveTextBox[],
): DriveTextBox[] {
  for (const element of elements ?? []) {
    if (element.elementGroup) {
      collectTextBoxes(element.elementGroup.children, into);
    } else if (element.shape && element.objectId) {
      into.push({ objectId: element.objectId, text: shapeText(element.shape) });
    }
  }
  return into;
}

export function toDrivePresentation(
  presentation: slides_v1.Schema$Presentation,
): DrivePresentation {
  return {
    // Empty when untitled: the caller falls back to the Drive file name.
    title: presentation.title ?? '',
    revisionId: presentation.revisionId ?? '',
    slides: (presentation.slides ?? []).map((slide, index) => ({
      slideId: slide.objectId ?? `slide-${index + 1}`,
      slideNumber: index + 1,
      textBoxes: collectTextBoxes(slide.pageElements, []),
    })),
  };
}

export function createGoogleDriveProvider(
  credentials: GoogleDriveCredentials,
  // Injectable for scratch verification against stubbed Google APIs.
  apiOverride?: drive_v3.Drive,
  slidesOverride?: slides_v1.Slides,
): DriveProvider {
  const auth = new OAuth2Client({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  });
  auth.setCredentials({ refresh_token: credentials.refreshToken });
  const api = apiOverride ?? drive({ version: 'v3', auth });
  const slidesApi = slidesOverride ?? slides({ version: 'v1', auth });

  return {
    async listFiles(projectName) {
      try {
        // The project folder: exactly this name, directly under the root
        // folder, never created by the app (FR-26).
        const folders = await listAll(
          api,
          `${quote(credentials.rootFolderId)} in parents and name = ${quote(projectName)} and mimeType = ${quote(FOLDER_MIME)} and trashed = false`,
        );
        if (folders.length === 0) return { ok: false, error: 'folder_missing' };
        if (folders.length > 1) return { ok: false, error: 'folder_duplicate' };

        const children = await listAll(
          api,
          `${quote(folders[0].id ?? '')} in parents and mimeType != ${quote(FOLDER_MIME)} and trashed = false`,
        );
        const files: DriveFile[] = children
          .filter((file) => file.id && file.name && file.mimeType)
          .map((file) => ({
            fileId: file.id as string,
            name: file.name as string,
            mimeType: file.mimeType as string,
            modifiedTime: file.modifiedTime ?? '',
          }));
        return { ok: true, data: files };
      } catch (error) {
        return fail('listFiles', error);
      }
    },

    async exportText(fileId, mimeType) {
      try {
        const response = await api.files.export(
          { fileId, mimeType: exportMimeTypeFor(mimeType) },
          { responseType: 'text', timeout: REQUEST_TIMEOUT_MS },
        );
        return { ok: true, data: typeof response.data === 'string' ? response.data : String(response.data ?? '') };
      } catch (error) {
        return fail('exportText', error);
      }
    },

    // Read-only: `presentations.get`, never a write (Story 5.3).
    async readPresentation(fileId) {
      try {
        const response = await slidesApi.presentations.get(
          {
            presentationId: fileId,
            fields:
              'title,revisionId,slides(objectId,pageElements(objectId,shape(text(textElements(textRun(content)))),elementGroup))',
          },
          { timeout: REQUEST_TIMEOUT_MS },
        );
        return { ok: true, data: toDrivePresentation(response.data) };
      } catch (error) {
        return fail('readPresentation', error);
      }
    },

    // Story 5.5 (AD-13) — the only write to Drive: per zone, delete its
    // whole text then insert the new text (formatting of the zone may be
    // simplified, the consultant is warned), all in one atomic
    // `batchUpdate` guarded by `requiredRevisionId`. No other request.
    async writePresentationText(fileId, edits, requiredRevisionId) {
      try {
        const requests: slides_v1.Schema$Request[] = edits.flatMap((edit) => [
          { deleteText: { objectId: edit.objectId, textRange: { type: 'ALL' } } },
          ...(edit.text === ''
            ? []
            : [{ insertText: { objectId: edit.objectId, insertionIndex: 0, text: edit.text } }]),
        ]);
        await slidesApi.presentations.batchUpdate(
          {
            presentationId: fileId,
            requestBody: { requests, writeControl: { requiredRevisionId } },
          },
          { timeout: REQUEST_TIMEOUT_MS },
        );
        return { ok: true, data: undefined };
      } catch (error) {
        // Google answers 400 when the deck moved past `requiredRevisionId`.
        if (isRevisionMismatch(error)) {
          console.error('googleDriveProvider.writePresentationText: revision mismatch', error);
          return { ok: false, error: 'revision_conflict' };
        }
        return fail('writePresentationText', error);
      }
    },
  };
}
