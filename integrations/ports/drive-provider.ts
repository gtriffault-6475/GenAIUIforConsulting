// AD-1 (Ports & Adapters) — `actions/` and `domain/` reach a project's
// drive files only through this interface, never through a concrete
// adapter. `integrations/index.ts`'s `createDriveProvider(mode)` is the
// single place a mode becomes an adapter: the simulated one
// (`integrations/mock/drive-provider.ts`) in demo mode, the Google one
// (`integrations/google/drive.ts`) when an account is connected.
//
// Story 5.2 — `listDocuments(projectId)` became `listFiles(projectName)`:
// the project folder is resolved by name inside the adapter (a direct
// child of the root folder bearing exactly the project's name), and every
// method returns a typed result instead of throwing.

// A file directly inside the project folder (sub-folders are never
// listed nor walked). `folderPath` is only ever set by the simulated
// adapter, which keeps its simulated folder grouping for the demo; the
// Google adapter always returns `null`.
export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  folderPath: string | null;
};

// epic-5-context.md "Port DriveProvider". Never carries Google's raw
// error: adapters log the detail server-side and only return the code.
export type DriveError =
  | 'unconfigured'
  | 'disconnected'
  | 'folder_missing'
  | 'folder_duplicate'
  | 'token_revoked'
  | 'not_found'
  | 'revision_conflict'
  | 'quota'
  | 'unknown';

export type DriveResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DriveError };

// Story 5.7 — the only file types whose text can be exported for the
// agent ("Utiliser comme contexte"), with the format requested from
// Drive's `files.export`: plain text for Docs and Slides, CSV for Sheets
// (Drive exports the first sheet only). Every other type is "non lisible
// par l'agent".
export const EXPORT_FORMAT_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

export function isExportableMimeType(mimeType: string | null): boolean {
  return mimeType !== null && Object.hasOwn(EXPORT_FORMAT_BY_MIME_TYPE, mimeType);
}

export interface DriveProvider {
  listFiles(projectName: string): Promise<DriveResult<DriveFile[]>>;
  // Story 5.7 — the text of one file, for the agent. Only ever called for
  // a file the consultant selected as context (NFR8). A file of a type
  // outside `EXPORT_FORMAT_BY_MIME_TYPE` answers `not_found`.
  exportText(fileId: string): Promise<DriveResult<string>>;
}

// Story 5.1 (AD-1, epic-5-context.md "Mode drive") — computed once by
// `actions/drive-mode.ts`'s `resolveDriveMode`, in this priority order,
// and passed to `integrations/index.ts`'s `createDriveProvider`, the only
// place a mode is turned into a concrete adapter.
export type DriveMode = 'demo' | 'unconfigured' | 'disconnected' | 'connected';
