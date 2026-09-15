'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { document } from '@/db/schema';
import { driveProvider } from '@/integrations';

// AD-2 — this is the only file allowed to read or write DOCUMENT.
// Components never touch `db/` or `integrations/` directly; they call
// this Server Action. Story 1.3 only ever inserts/reads rows with
// `source: 'drive'` — Story 1.4 adds `source: 'manual'` rows through this
// same file, alongside these.

export type DocumentSummary = {
  id: string;
  name: string;
  source: 'drive' | 'manual';
  folderPath: string | null;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function listDocuments(
  projectId: string,
): Promise<ActionResult<DocumentSummary[]>> {
  try {
    const driveDocuments = await driveProvider.listDocuments(projectId);

    // Mirrors `selectProject` in `actions/project.ts`: sync the (mocked)
    // drive listing into DOCUMENT before reading it back, so this table
    // — not the provider — is the single read path the Contexte panel
    // depends on, exactly as it will be once Story 1.4 starts inserting
    // `source: 'manual'` rows into the same table.
    db.transaction((tx) => {
      for (const doc of driveDocuments) {
        tx.insert(document)
          .values({
            id: doc.id,
            projectId,
            name: doc.name,
            source: 'drive',
            folderPath: doc.folderPath,
            content: doc.content,
          })
          .onConflictDoUpdate({
            target: document.id,
            set: {
              name: doc.name,
              folderPath: doc.folderPath,
              content: doc.content,
            },
          })
          .run();
      }
    });

    const rows = await db
      .select({
        id: document.id,
        name: document.name,
        source: document.source,
        folderPath: document.folderPath,
      })
      .from(document)
      .where(eq(document.projectId, projectId));

    return { ok: true, data: rows };
  } catch (error) {
    console.error('listDocuments failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les documents du projet.',
    };
  }
}
