// AD-1 (Ports & Adapters) — `actions/` and `domain/` reach a project's
// drive only through this interface, never through a concrete adapter.
// Two adapters implement it: `integrations/mock/drive-provider.ts` (demo
// mode only) and `integrations/google/drive-provider.ts` (connected mode),
// chosen by the factory in `integrations/index.ts`, the single wiring
// point.
//
// Story 5.2 replaced Round 1's `listDocuments(projectId)` with
// `listFiles(projectName)` + `exportText`: the real Drive is organised by
// folder name (one sub-folder of the root folder per project, named
// exactly like the project), and a file's text is only read when the
// consultant selects it as context (AD-11). Story 5.3+ add
// `readPresentation`, `writePresentationText` and `createPresentation`.

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

// Typed results, never thrown: an adapter converts every Google error into
// a `DriveError` and only logs the raw detail.
export type DriveResult<T> = { ok: true; data: T } | { ok: false; error: DriveError };

// A file directly inside the project folder (sub-folders are not listed).
// `modifiedTime` is an RFC 3339 string, used to re-export a selected
// file's text only when it changed in Drive.
export type DriveFile = {
  fileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
};

// Story 5.3 — a Google Slides presentation as read for import: every
// slide in order (`slideNumber` is its 1-based rank, slides without text
// included) with its text boxes (shapes holding text, including inside
// groups). Tables, images and speaker notes are not part of it.
export type DriveTextBox = { objectId: string; text: string };

export type DrivePresentation = {
  title: string;
  // Story 5.5 — the revision just read: a write is only accepted by Google
  // while the deck is still at this revision (AD-13). Guaranteed for a
  // short time only, so it is never stored, always read fresh.
  revisionId: string;
  slides: { slideId: string; slideNumber: number; textBoxes: DriveTextBox[] }[];
};

export interface DriveProvider {
  listFiles(projectName: string): Promise<DriveResult<DriveFile[]>>;
  exportText(fileId: string, mimeType: string): Promise<DriveResult<string>>;
  readPresentation(fileId: string): Promise<DriveResult<DrivePresentation>>;
  // Story 5.5 — rewrites the whole text of the given text boxes, nothing
  // else, if the deck is still at `requiredRevisionId`; otherwise
  // `revision_conflict` and nothing is written.
  writePresentationText(
    fileId: string,
    edits: DriveTextBox[],
    requiredRevisionId: string,
  ): Promise<DriveResult<void>>;
}

// Story 5.1 (AD-1) — computed only by `resolveDriveMode`
// (`actions/google-connection.ts`), strict priority
// demo > unconfigured > disconnected > connected, then passed to the
// factory in `integrations/index.ts`. Declared here, next to the port it
// selects an adapter for, so `integrations/` never imports `actions/`.
export type DriveMode = 'demo' | 'unconfigured' | 'disconnected' | 'connected';
