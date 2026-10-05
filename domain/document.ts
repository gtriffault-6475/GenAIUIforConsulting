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
