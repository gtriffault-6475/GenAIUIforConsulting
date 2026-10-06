// Story 5.2 — pure document rules (AD-5: no I/O).

export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
export const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const READABLE_MIME_TYPES = new Set([GOOGLE_DOC_MIME, GOOGLE_SLIDES_MIME, GOOGLE_SHEET_MIME]);

// Only Google Docs, Slides and Sheets can be exported as text for the
// agent; every other format is listed as "non lisible par l'agent".
export function isAgentReadable(mimeType: string | null): boolean {
  return mimeType !== null && READABLE_MIME_TYPES.has(mimeType);
}

// Export format per readable type: Sheets → CSV (first sheet only — a
// Drive export limitation), Docs/Slides → plain text.
export function exportMimeTypeFor(mimeType: string): 'text/csv' | 'text/plain' {
  return mimeType === GOOGLE_SHEET_MIME ? 'text/csv' : 'text/plain';
}

// AD-11 — per-document cap on the text sent to the agent.
export const CONTEXT_DOCUMENT_CHAR_CAP = 30_000;

export function truncateForContext(
  text: string,
  cap: number = CONTEXT_DOCUMENT_CHAR_CAP,
): { text: string; truncated: boolean } {
  if (text.length <= cap) return { text, truncated: false };
  // Never cut a UTF-16 surrogate pair (emoji) in half.
  const code = text.charCodeAt(cap - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? cap - 1 : cap;
  return { text: text.slice(0, end), truncated: true };
}

// AD-11 — total budget across all the context documents of one agent call
// (ported from the parallel Epic 5 series): on top of the per-document
// cap, documents are filled in order until the budget is spent; the one
// that crosses it is cut, the following ones are left out.
export const CONTEXT_TOTAL_CHAR_CAP = 60_000;

// Below this, a document cut by the total budget is left out instead of
// sending a meaningless fragment.
const MIN_USEFUL_SLICE = 500;

export type BudgetedContextDocument = {
  name: string;
  text: string;
  // Why it was cut, if it was: its own cap, or the total budget.
  truncatedBy: 'document' | 'total' | null;
};

export function budgetContextDocuments(
  documents: { name: string; content: string }[],
  perDocumentCap: number = CONTEXT_DOCUMENT_CHAR_CAP,
  totalCap: number = CONTEXT_TOTAL_CHAR_CAP,
): { included: BudgetedContextDocument[]; omitted: string[] } {
  const included: BudgetedContextDocument[] = [];
  const omitted: string[] = [];
  let remaining = totalCap;
  for (const doc of documents) {
    const cap = Math.min(perDocumentCap, remaining);
    const cutByTotal = doc.content.length > remaining && remaining < perDocumentCap;
    if (remaining <= 0 || (cutByTotal && remaining < MIN_USEFUL_SLICE)) {
      omitted.push(doc.name);
      continue;
    }
    const { text, truncated } = truncateForContext(doc.content, cap);
    included.push({
      name: doc.name,
      text,
      truncatedBy: !truncated ? null : cutByTotal ? 'total' : 'document',
    });
    remaining -= text.length;
  }
  return { included, omitted };
}

// Upload of a document to the project Drive folder (spec-upload-document-drive)
// — every file is converted to a Google format on upload so the agent can
// read it. Decided by the file extension (browsers often send an empty or
// generic MIME type). `null` = format not supported.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const UPLOAD_TARGETS: Record<string, string> = {
  doc: GOOGLE_DOC_MIME,
  docx: GOOGLE_DOC_MIME,
  odt: GOOGLE_DOC_MIME,
  rtf: GOOGLE_DOC_MIME,
  txt: GOOGLE_DOC_MIME,
  md: GOOGLE_DOC_MIME,
  html: GOOGLE_DOC_MIME,
  htm: GOOGLE_DOC_MIME,
  pdf: GOOGLE_DOC_MIME,
  xls: GOOGLE_SHEET_MIME,
  xlsx: GOOGLE_SHEET_MIME,
  ods: GOOGLE_SHEET_MIME,
  csv: GOOGLE_SHEET_MIME,
  ppt: GOOGLE_SLIDES_MIME,
  pptx: GOOGLE_SLIDES_MIME,
  odp: GOOGLE_SLIDES_MIME,
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function uploadTargetMimeType(fileName: string): string | null {
  return UPLOAD_TARGETS[extensionOf(fileName)] ?? null;
}

export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_BYTES / (1024 * 1024)} Mo`;

// The source type declared to Drive for the conversion: from the extension
// when the browser sends none or a generic one (common for .md, .csv, .odt).
const SOURCE_MIME_TYPES: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  md: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

export function uploadSourceMimeType(fileName: string, browserType: string): string {
  if (browserType && browserType !== 'application/octet-stream') return browserType;
  return SOURCE_MIME_TYPES[extensionOf(fileName)] ?? 'application/octet-stream';
}

// Accept list for the file input, from the same table.
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TARGETS)
  .map((extension) => `.${extension}`)
  .join(',');

// The Drive name of an uploaded file: its name without the extension
// (the Google version has none).
export function uploadedFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
  return base || fileName.trim();
}
