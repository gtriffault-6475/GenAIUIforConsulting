import { and, eq } from 'drizzle-orm';

import { getDemoModeActive } from '@/actions/demo';
import { resolveDriveMode } from '@/actions/google-connection';
import { db } from '@/db/client';
import { document } from '@/db/schema';
import { GOOGLE_SLIDES_MIME, isAgentReadable } from '@/domain/document';
import type { DriveMode } from '@/integrations/ports/drive-provider';
import type { ContextDocument } from '@/skills/buildRequest';

// Story 5.2 (AD-11). Deliberately NOT a 'use server' file: every export of
// one becomes a Server Action any browser can call, and this module hands
// out document *text* — which must never reach a client payload. It is a
// server-only helper imported by actions (`actions/document.ts`,
// `actions/message.ts`, `actions/conversation.ts`, `actions/suggestion.ts`)
// and, with `actions/document.ts`, the only code reading DOCUMENT (AD-2).
// It also holds `readDemoModeActive`, the server-side demo-mode read the
// agent calls need.

// Which adapter's rows belong to the current mode (AD-1).
export function originFor(mode: DriveMode): 'mock' | 'google' | null {
  if (mode === 'demo') return 'mock';
  if (mode === 'connected') return 'google';
  return null;
}

// The documents every real agent call receives: all manual documents
// (FR-4) and the selected drive documents of the current mode's origin —
// never a stale row of the other origin, none at all after disconnecting.
// Read from the table only — no Drive call on the send path; the text was
// exported at selection and refreshed at resync.
export async function listAgentContextDocuments(
  projectId: string,
  // Story 5.4 (AD-11): the Drive file of the conversation's own livrable
  // is never also sent as a context document.
  { excludeDriveFileId = null }: { excludeDriveFileId?: string | null } = {},
): Promise<ContextDocument[]> {
  try {
    const origin = originFor(await resolveDriveMode());
    return db
      .select()
      .from(document)
      .where(and(eq(document.projectId, projectId), eq(document.usedAsContext, true)))
      .all()
      .filter(
        (row) =>
          row.content !== '' &&
          (excludeDriveFileId === null || row.driveFileId !== excludeDriveFileId) &&
          (row.source === 'manual' ||
            (origin !== null && row.origin === origin && isAgentReadable(row.mimeType))),
      )
      // Order matters once the total budget is reached
      // (`budgetContextDocuments`): manual documents first (always meant
      // for the agent, FR-4), then drive documents, each by name.
      .sort((a, b) =>
        a.source === b.source ? a.name.localeCompare(b.name, 'fr') : a.source === 'manual' ? -1 : 1,
      )
      .map((row) => ({ name: row.name, content: row.content }));
  } catch (error) {
    // Never block a message on this read: the agent answers without
    // documents, as it did before Story 5.2.
    console.error('listAgentContextDocuments failed, sending without documents', error);
    return [];
  }
}

// Story 5.3 — the Drive presentation behind a Contexte/Livrables row, for
// `importDrivePresentation` (`actions/livrable.ts`): only a Google Slides
// file of the current Google resync, of this project.
export function findDrivePresentation(
  projectId: string,
  documentId: string,
): { driveFileId: string; name: string } | null {
  const row = db
    .select()
    .from(document)
    .where(and(eq(document.id, documentId), eq(document.projectId, projectId)))
    .get();
  if (
    !row ||
    row.source !== 'drive' ||
    row.origin !== 'google' ||
    row.mimeType !== GOOGLE_SLIDES_MIME ||
    !row.driveFileId
  ) {
    return null;
  }
  return { driveFileId: row.driveFileId, name: row.name };
}

// Also here, for the same "not a Server Action" reason as the rest of
// this module: the demo-mode flag `sendToAgent` needs (AD-11: it no
// longer reads the database). A failed read degrades to `false`, the real path — the same
// fail-safe direction as before.
export async function readDemoModeActive(): Promise<boolean> {
  const result = await getDemoModeActive();
  return result.ok && result.data;
}
