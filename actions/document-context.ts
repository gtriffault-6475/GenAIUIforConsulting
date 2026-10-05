import { and, eq } from 'drizzle-orm';

import { resolveDriveMode } from '@/actions/google-connection';
import { db } from '@/db/client';
import { document } from '@/db/schema';
import { isAgentReadable } from '@/domain/document';
import type { DriveMode } from '@/integrations/ports/drive-provider';
import type { ContextDocument } from '@/skills/buildRequest';

// Story 5.2 (AD-11). Deliberately NOT a 'use server' file: every export of
// one becomes a Server Action any browser can call, and this module hands
// out document *text* — which must never reach a client payload. It is a
// server-only helper imported by actions (`actions/document.ts`,
// `actions/message.ts`, `actions/conversation.ts`, `actions/suggestion.ts`)
// and, with `actions/document.ts`, the only code reading DOCUMENT (AD-2).

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
          (row.source === 'manual' ||
            (origin !== null && row.origin === origin && isAgentReadable(row.mimeType))),
      )
      .map((row) => ({ name: row.name, content: row.content }));
  } catch (error) {
    // Never block a message on this read: the agent answers without
    // documents, as it did before Story 5.2.
    console.error('listAgentContextDocuments failed, sending without documents', error);
    return [];
  }
}
