'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
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

// Story 1.4 — Ajout d'un document hors-drive. A manually-added document is
// NOT Octopod data (AD-1): it never goes through `DriveProvider` or any
// `integrations/*` adapter — this Server Action writes the `DOCUMENT` row
// directly, the same table `listDocuments` reads from, so the new row is
// visible immediately without any resync. The client (`AddDocumentForm`)
// already blocks empty name/content before ever calling this action; the
// checks below are a second line of defense so this function never trusts
// its caller and never throws an uncaught exception to the UI.
export async function addManualDocument({
  projectId,
  name,
  folderPath,
  content,
}: {
  projectId: string;
  name: string;
  folderPath: string | null;
  content: string;
}): Promise<ActionResult<DocumentSummary>> {
  const trimmedName = name.trim();
  const trimmedContent = content.trim();
  const trimmedFolderPath = folderPath?.trim() || null;

  if (!trimmedName || !trimmedContent) {
    return {
      ok: false,
      error: 'Le nom et le contenu sont obligatoires.',
    };
  }

  try {
    const id = crypto.randomUUID();

    db.insert(document)
      .values({
        id,
        projectId,
        name: trimmedName,
        source: 'manual',
        folderPath: trimmedFolderPath,
        content: trimmedContent,
      })
      .run();

    return {
      ok: true,
      data: {
        id,
        name: trimmedName,
        source: 'manual',
        folderPath: trimmedFolderPath,
      },
    };
  } catch (error) {
    console.error('addManualDocument failed', error);
    return {
      ok: false,
      error: "Impossible d'ajouter ce document.",
    };
  }
}
