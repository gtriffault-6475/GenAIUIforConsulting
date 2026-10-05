import { randomBytes } from 'node:crypto';

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
  NewSlide,
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
  // Story 5.6 — the OCTO template copied by `createPresentation`; `null`
  // makes that one method answer `unconfigured`.
  slidesTemplateId?: string | null;
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// The Contexte panel resyncs on every workspace render: a hanging Google
// call must not block the page indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;
// Story 5.6 — copying a template deck and filling it can take longer.
const CREATE_TIMEOUT_MS = 30_000;

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

// Story 5.6 — the layout placeholders a new slide's texts go into.
type PlaceholderRef = { type: string; index: number };
type SlideLayoutChoice = {
  reference: slides_v1.Schema$LayoutReference;
  title: PlaceholderRef | null;
  body: PlaceholderRef | null;
};

function layoutPlaceholders(layout: slides_v1.Schema$Page): PlaceholderRef[] {
  return (layout.pageElements ?? [])
    .map((element) => element.shape?.placeholder)
    .filter((placeholder): placeholder is slides_v1.Schema$Placeholder => Boolean(placeholder?.type))
    .map((placeholder) => ({ type: placeholder.type as string, index: placeholder.index ?? 0 }));
}

// Owner decision (spec-5-6): the cover is the first template layout with
// a centered-title placeholder, the other slides use the first layout with
// a title and a body placeholder; Google's predefined `TITLE` /
// `TITLE_AND_BODY` layouts when the template has none.
export function chooseSlideLayouts(layouts: slides_v1.Schema$Page[]): {
  cover: SlideLayoutChoice;
  content: SlideLayoutChoice;
} {
  let cover: SlideLayoutChoice | null = null;
  let content: SlideLayoutChoice | null = null;
  for (const layout of layouts) {
    if (!layout.objectId) continue;
    const placeholders = layoutPlaceholders(layout);
    const find = (type: string) => placeholders.find((item) => item.type === type) ?? null;
    if (!cover && find('CENTERED_TITLE')) {
      cover = {
        reference: { layoutId: layout.objectId },
        title: find('CENTERED_TITLE'),
        body: find('SUBTITLE') ?? find('BODY'),
      };
    }
    if (!content && find('TITLE') && find('BODY')) {
      content = { reference: { layoutId: layout.objectId }, title: find('TITLE'), body: find('BODY') };
    }
  }
  return {
    cover: cover ?? {
      reference: { predefinedLayout: 'TITLE' },
      title: { type: 'CENTERED_TITLE', index: 0 },
      body: { type: 'SUBTITLE', index: 0 },
    },
    content: content ?? {
      reference: { predefinedLayout: 'TITLE_AND_BODY' },
      title: { type: 'TITLE', index: 0 },
      body: { type: 'BODY', index: 0 },
    },
  };
}

// Story 5.6 — the single `batchUpdate` filling a fresh copy of the
// template: one new slide per proposed slide (appended, with its
// placeholders given known ids), their texts, then the template's own
// example slides deleted. `idPrefix` keeps the new object ids unique in
// the deck (5–50 characters, Slides rules).
export function buildPresentationRequests(
  layouts: slides_v1.Schema$Page[],
  templateSlideIds: string[],
  slides: NewSlide[],
  idPrefix: string,
): slides_v1.Schema$Request[] {
  const { cover, content } = chooseSlideLayouts(layouts);
  const creates: slides_v1.Schema$Request[] = [];
  const texts: slides_v1.Schema$Request[] = [];
  slides.forEach((slide, index) => {
    const layout = index === 0 ? cover : content;
    const slideId = `${idPrefix}_${index}`;
    const mappings: slides_v1.Schema$LayoutPlaceholderIdMapping[] = [];
    const fill = (placeholder: PlaceholderRef | null, suffix: string, text: string) => {
      if (!placeholder) {
        if (text) console.error(`googleDriveProvider.createPresentation: slide ${index + 1} has no ${suffix} placeholder, text dropped`);
        return;
      }
      const objectId = `${slideId}_${suffix}`;
      mappings.push({ layoutPlaceholder: placeholder, objectId });
      // `insertText` rejects an empty string: an empty placeholder stays as
      // the layout shows it.
      if (text) texts.push({ insertText: { objectId, insertionIndex: 0, text } });
    };
    fill(layout.title, 'title', slide.title);
    fill(layout.body, 'body', slide.content);
    creates.push({
      createSlide: {
        objectId: slideId,
        slideLayoutReference: layout.reference,
        placeholderIdMappings: mappings,
      },
    });
  });
  const deletes = templateSlideIds.map((objectId) => ({ deleteObject: { objectId } }));
  return [...creates, ...texts, ...deletes];
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

  // The project folder: exactly this name, directly under the root
  // folder, never created by the app (FR-26). Throws on a Google error
  // (the caller's `catch` converts it).
  async function resolveProjectFolder(projectName: string): Promise<DriveResult<string>> {
    const folders = await listAll(
      api,
      `${quote(credentials.rootFolderId)} in parents and name = ${quote(projectName)} and mimeType = ${quote(FOLDER_MIME)} and trashed = false`,
    );
    if (folders.length > 1) return { ok: false, error: 'folder_duplicate' };
    if (folders.length === 0 || !folders[0].id) return { ok: false, error: 'folder_missing' };
    return { ok: true, data: folders[0].id };
  }

  return {
    async listFiles(projectName) {
      try {
        const folder = await resolveProjectFolder(projectName);
        if (!folder.ok) return folder;

        const children = await listAll(
          api,
          `${quote(folder.data)} in parents and mimeType != ${quote(FOLDER_MIME)} and trashed = false`,
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

    // Story 5.6 (AD-13) — copy of the OCTO template into the project
    // folder, then one `batchUpdate` on that new copy only. A copy left
    // behind by a failed fill is logged with its id, never deleted or
    // reused (the consultant may still want it).
    async createPresentation(projectName, title, newSlides) {
      const templateId = credentials.slidesTemplateId?.trim();
      if (!templateId) return { ok: false, error: 'unconfigured' };
      let copiedId: string | null = null;
      try {
        const folder = await resolveProjectFolder(projectName);
        if (!folder.ok) return folder;

        const copy = await api.files.copy(
          {
            fileId: templateId,
            supportsAllDrives: true,
            fields: 'id',
            requestBody: { name: title, parents: [folder.data] },
          },
          { timeout: CREATE_TIMEOUT_MS },
        );
        copiedId = copy.data.id ?? null;
        if (!copiedId) return fail('createPresentation', new Error('files.copy returned no id'));

        const deck = await slidesApi.presentations.get(
          {
            presentationId: copiedId,
            fields:
              'slides(objectId),layouts(objectId,pageElements(shape(placeholder(type,index))))',
          },
          { timeout: REQUEST_TIMEOUT_MS },
        );
        const templateSlideIds = (deck.data.slides ?? [])
          .map((slide) => slide.objectId)
          .filter((id): id is string => Boolean(id));
        const requests = buildPresentationRequests(
          deck.data.layouts ?? [],
          templateSlideIds,
          newSlides,
          `g56${randomBytes(4).toString('hex')}`,
        );
        await slidesApi.presentations.batchUpdate(
          { presentationId: copiedId, requestBody: { requests } },
          { timeout: CREATE_TIMEOUT_MS },
        );
        return { ok: true, data: { fileId: copiedId } };
      } catch (error) {
        if (copiedId) {
          console.error(
            `googleDriveProvider.createPresentation: deck copied (${copiedId}) but not filled`,
          );
        }
        return fail('createPresentation', error);
      }
    },
  };
}
