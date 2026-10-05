'use server';

import { and, eq } from 'drizzle-orm';

import { getActiveDriveProvider } from '@/actions/google-drive';
import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { document, project } from '@/db/schema';
import { isAgentReadable } from '@/domain/document';
import type { DriveError } from '@/integrations/ports/drive-provider';
import {
  demoReferenceDocumentId,
  isDemoReferenceDocument,
  originFor,
  readDemoModeActive,
} from '@/actions/document-context';

// spec-demo-document-reference.md — id dérivé de `projectId` (jamais
// `crypto.randomUUID()`, jamais un seul id fixe partagé entre projets) :
// `document.id` est la clé primaire globale de cette table, donc un seul
// id constant ne pourrait jamais appartenir qu'à un seul projet à la fois
// -- trouvé par l'orchestrateur en vérifiant que le tool-call démo (comme
// tout `matchDemoChatEntry`, jamais scopé par `projectId`) peut en théorie
// se déclencher sur n'importe quel projet, pas seulement `proj-acme-rfp`.
// Un id par projet laisse chaque projet obtenir sa propre copie, tout en
// restant idempotent (vérifié avant insertion, Boundaries: "un second
// déclenchement ne doit jamais créer de doublon") pour ce même projet.
// L'id lui-même est dérivé par `demoReferenceDocumentId`
// (`actions/document-context.ts`, non `'use server'`, rétrospective Epic 5
// A3), partagé avec le filtre qui masque ce document hors mode démo.

// Revue (blind-hunter, Review Triage Log #3) : `resetAvantVenteWorkflow`
// (`actions/demo.ts`) doit pouvoir supprimer ce même document lors d'un
// reset avant-vente (sans quoi rejouer la démo sur un projet déjà utilisé
// montre le document de référence dès le premier message, avant même que le
// tool-call RFP ne se redéclenche). AD-2 reste respecté : `actions/demo.ts`
// ne recalcule jamais l'id à la main, il appelle cette Server Action,
// qui délègue à `demoReferenceDocumentId`. `async` uniquement pour la contrainte Server Action
// ci-dessus ; le corps lui-même n'a besoin d'aucun `await`.
export async function resolveDemoReferenceDocumentId(
  projectId: string,
): Promise<string> {
  return demoReferenceDocumentId(projectId);
}

// AD-2 — this is the only file allowed to write DOCUMENT (plus the
// documented demo-reset exception in `actions/demo.ts`); the agent-context
// reads live in its server-only companion `actions/document-context.ts`.
// Components never touch `db/` or `integrations/` directly; they call
// these Server Actions.

// What the Contexte panel needs about a document — never its `content`
// (Story 5.2: no document text in any client payload).
export type DocumentSummary = {
  id: string;
  name: string;
  source: 'drive' | 'manual';
  folderPath: string | null;
  mimeType: string | null;
  // Story 5.3 — lets the Livrables panel tell imported presentations apart.
  driveFileId: string | null;
  readable: boolean;
  usedAsContext: boolean;
};

// Why no drive files are listed, when that is the case. Mirrors the
// EXPERIENCE.md states; `error` covers quota/network/unknown Google errors.
export type DriveListingState =
  | 'ok'
  | 'unconfigured'
  | 'disconnected'
  | 'folder_missing'
  | 'folder_duplicate'
  | 'error';

export type ContextPanelData = {
  projectName: string;
  drive: { state: DriveListingState; files: DocumentSummary[] };
  manual: DocumentSummary[];
};

type DocumentRow = typeof document.$inferSelect;

function toSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    folderPath: row.folderPath,
    mimeType: row.mimeType,
    driveFileId: row.driveFileId,
    readable: row.source === 'manual' || isAgentReadable(row.mimeType),
    usedAsContext: row.usedAsContext,
  };
}

function listingStateFor(error: DriveError): DriveListingState {
  if (error === 'folder_missing' || error === 'folder_duplicate') return error;
  if (error === 'token_revoked' || error === 'disconnected') return 'disconnected';
  if (error === 'unconfigured') return 'unconfigured';
  return 'error';
}

// Story 5.2 (AD-1) — the single resync of a project's Drive folder into
// DOCUMENT, shared by the Contexte panel today and the Livrables panel
// from Story 5.3 (sync-then-read). With a provider (demo → mock,
// connected → Google): upserts every listed file keyed by
// `(projectId, driveFileId)` (name, type, modified date — never
// `usedAsContext`), deletes rows of this origin whose file left the
// folder, keeps (without showing or sending) drive rows of the other
// origin so selections survive a demo round-trip, and re-exports the text
// of selected readable files whose Drive modified date changed. Without a
// provider (`unconfigured`/`disconnected`) nothing is written and no
// drive row is shown. `token_revoked` forgets the Google connection.
async function syncDriveFolder(
  projectId: string,
  projectName: string,
): Promise<{ state: DriveListingState; origin: 'mock' | 'google' | null }> {
  const { mode, provider } = await getActiveDriveProvider();
  const origin = originFor(mode);
  if (!provider || !origin) {
    return { state: mode === 'unconfigured' ? 'unconfigured' : 'disconnected', origin: null };
  }

  const listing = await provider.listFiles(projectName);
  if (!listing.ok) {
    // The project folder itself is gone or ambiguous: its rows (and the
    // selections on them) go too, so the agent never keeps receiving files
    // the panel can no longer show. Transient errors (quota, network) keep
    // them until the next successful listing.
    if (listing.error === 'folder_missing' || listing.error === 'folder_duplicate') {
      db.delete(document)
        .where(
          and(
            eq(document.projectId, projectId),
            eq(document.source, 'drive'),
            eq(document.origin, origin),
          ),
        )
        .run();
    }
    return { state: listingStateFor(listing.error), origin: null };
  }

  const files = listing.data;
  const existing = db
    .select()
    .from(document)
    .where(and(eq(document.projectId, projectId), eq(document.source, 'drive')))
    .all();
  const existingByFileId = new Map(
    existing
      .filter((row) => row.origin === origin && row.driveFileId)
      .map((row) => [row.driveFileId as string, row]),
  );

  // Selected files whose text must be (re-)exported: modified in Drive
  // since the last export, or selected but never exported.
  const toExport = files.filter((file) => {
    const row = existingByFileId.get(file.fileId);
    return (
      row?.usedAsContext &&
      isAgentReadable(file.mimeType) &&
      (row.modifiedTime !== file.modifiedTime || row.content === '')
    );
  });
  const exported = new Map<string, string>();
  for (const file of toExport) {
    const result = await provider.exportText(file.fileId, file.mimeType);
    if (result.ok) {
      exported.set(file.fileId, result.data);
    } else {
      if (result.error === 'token_revoked') {
        return { state: 'disconnected', origin: null };
      }
      console.error('syncDriveFolder: could not refresh a selected file, keeping its previous text', file.fileId, result.error);
    }
  }

  const listedIds = new Set(files.map((file) => file.fileId));
  db.transaction((tx) => {
    // Only rows of the current origin can be "gone from the folder". Rows
    // of the other origin (mock vs google) are kept as they are — with
    // their text and selection — but never shown nor sent while the other
    // mode is active (filtered by origin on every read), so the
    // consultant's selections survive a round-trip through demo mode.
    // Deliberate deviation from AD-1's "purge" rule, recorded in the
    // architecture spine.
    for (const row of existing) {
      if (row.origin !== origin) continue;
      if (!row.driveFileId || !listedIds.has(row.driveFileId)) {
        tx.delete(document).where(eq(document.id, row.id)).run();
      }
    }

    for (const file of files) {
      const row = existingByFileId.get(file.fileId);
      const freshText = exported.get(file.fileId);
      if (row) {
        tx.update(document)
          .set({
            name: file.name,
            mimeType: file.mimeType,
            // Only advance the stored date once the text matching it is
            // stored, so a failed re-export is retried next time.
            ...(freshText !== undefined ||
            !row.usedAsContext ||
            !isAgentReadable(file.mimeType)
              ? { modifiedTime: file.modifiedTime }
              : {}),
            ...(freshText !== undefined ? { content: freshText } : {}),
            // A selected file that became unreadable (type changed) is
            // no longer sent: its text is dropped, the choice is kept.
            ...(!isAgentReadable(file.mimeType) ? { content: '' } : {}),
          })
          .where(eq(document.id, row.id))
          .run();
      } else {
        tx.insert(document)
          .values({
            id: crypto.randomUUID(),
            projectId,
            name: file.name,
            source: 'drive',
            folderPath: null,
            content: '',
            driveFileId: file.fileId,
            mimeType: file.mimeType,
            origin,
            modifiedTime: file.modifiedTime,
            usedAsContext: false,
          })
          // Two overlapping resyncs (two tabs, a render and a refresh) may
          // both insert a newly listed file: the second insert is a no-op.
          .onConflictDoNothing()
          .run();
      }
    }
  });

  return { state: 'ok', origin };
}

function readProjectName(projectId: string): string | null {
  return (
    db.select({ name: project.name }).from(project).where(eq(project.id, projectId)).get()
      ?.name ?? null
  );
}

export async function getContextPanel(
  projectId: string,
): Promise<ActionResult<ContextPanelData>> {
  try {
    const projectName = readProjectName(projectId);
    if (projectName === null) {
      return { ok: false, error: 'Impossible de récupérer les documents du projet.' };
    }

    // A failing resync never hides the manual documents: the drive part
    // just shows its generic error state.
    let sync: Awaited<ReturnType<typeof syncDriveFolder>>;
    try {
      sync = await syncDriveFolder(projectId, projectName);
    } catch (error) {
      console.error('getContextPanel: drive resync failed', error);
      sync = { state: 'error', origin: null };
    }
    const { state, origin } = sync;

    const rows = db
      .select()
      .from(document)
      .where(eq(document.projectId, projectId))
      .all();

    const files = origin
      ? rows
          .filter((row) => row.source === 'drive' && row.origin === origin)
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
          .map(toSummary)
      : [];
    // Epic 5 retrospective (A3): the demo's staged document only in demo.
    const demoModeActive = await readDemoModeActive();
    const manual = rows
      .filter((row) => row.source === 'manual')
      .filter((row) => demoModeActive || !isDemoReferenceDocument(row.id))
      .map(toSummary);

    return { ok: true, data: { projectName, drive: { state, files }, manual } };
  } catch (error) {
    console.error('getContextPanel failed', error);
    return { ok: false, error: 'Impossible de récupérer les documents du projet.' };
  }
}

// Story 5.2 — "Utiliser comme contexte". Checking exports the file's text
// first (from the adapter of the current mode, and only for a row of that
// mode's origin); if the export fails, nothing changes. Unchecking clears
// the choice and the stored text.
export async function setDocumentUsedAsContext(
  documentId: string,
  used: boolean,
): Promise<ActionResult<void>> {
  try {
    const row = db.select().from(document).where(eq(document.id, documentId)).get();
    if (!row || row.source !== 'drive' || !row.driveFileId) {
      return { ok: false, error: 'Ce document est introuvable.' };
    }

    if (!used) {
      db.update(document)
        .set({ usedAsContext: false, content: '' })
        .where(eq(document.id, documentId))
        .run();
      return { ok: true, data: undefined };
    }

    const { mode, provider } = await getActiveDriveProvider();
    if (!provider || row.origin !== originFor(mode) || !isAgentReadable(row.mimeType)) {
      return { ok: false, error: 'Impossible de lire ce fichier.' };
    }

    const result = await provider.exportText(row.driveFileId, row.mimeType as string);
    if (!result.ok) {
      return { ok: false, error: 'Impossible de lire ce fichier.' };
    }

    db.update(document)
      .set({ usedAsContext: true, content: result.data })
      .where(eq(document.id, documentId))
      .run();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('setDocumentUsedAsContext failed', error);
    return { ok: false, error: 'Impossible de modifier ce choix. Réessayez.' };
  }
}

// Story 1.4 — Ajout d'un document hors-drive. A manually-added document is
// NOT Octopod data (AD-1): it never goes through `DriveProvider` or any
// `integrations/*` adapter — this Server Action writes the `DOCUMENT` row
// directly, the same table `getContextPanel` reads from, so the new row is
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
        // FR-4: a manually added document is always sent to the agent.
        usedAsContext: true,
      })
      .run();

    return {
      ok: true,
      data: {
        id,
        name: trimmedName,
        source: 'manual',
        folderPath: trimmedFolderPath,
        mimeType: null,
        driveFileId: null,
        readable: true,
        usedAsContext: true,
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

// spec-demo-document-reference.md — appelée uniquement par
// `actions/message.ts`'s `executeTool`, juste après un
// `createLivrableWithSuggestions`/`updateLivrableWithSuggestions` réussi
// sur l'entrée de création RFP du script démo (`skills/demoScript.ts`), et
// seulement quand le mode démo est actif -- la garde elle-même vit dans
// `actions/message.ts` (déjà en train de vérifier `getDemoModeActive()`
// pour cette même entrée), pas ici. `source: 'manual'` (jamais `'drive'`,
// AD-1) : ce n'est pas une donnée Octopod, seulement une mise en scène du
// mode démo -- ne sera jamais retiré ni écrasé par le prochain
// `getContextPanel`/resync drive (qui ne touche que les lignes
// `source: 'drive'`). Idempotente par projet (`demoReferenceDocumentId`
// ci-dessus) : ne fait rien si ce projet a déjà sa copie, pour qu'un
// second déclenchement du même tool-call (ex. la révision globale, même
// point d'accroche) ne duplique jamais le document -- mais chaque projet
// où ce tool-call se déclenche obtient bien la sienne. `async` (bien que
// le corps n'ait besoin d'`await` que pour la lecture) parce que ce
// fichier porte `'use server'` -- toute fonction exportée en devient une
// Server Action, et Next rejette une Server Action synchrone (même leçon
// déjà rencontrée pour `actions/insert-message.ts`/`actions/message.ts` :
// "Server Actions must be async functions").
//
// Revue (blind-hunter) : cette fonction est appelée depuis `executeTool`
// (`actions/message.ts`), juste après que le livrable ait déjà été créé/mis
// à jour avec succès -- un échec ici ne doit donc jamais remonter comme une
// exception (elle serait attrapée par `sendToAgent`'s propre `try/catch` et
// transformerait tout l'échange en `assistantFailed: true`, alors que le
// vrai travail du tool-call a déjà réussi), d'où le `try/catch` local qui ne
// fait que logger. Le `SELECT` puis `INSERT` reste un check-then-act non
// atomique (deux déclenchements concurrents sur le même projet pourraient
// tous les deux passer le `SELECT` avant qu'aucun n'insère) ; `onConflictDoNothing`
// rend l'`INSERT` lui-même idempotent indépendamment de ce `SELECT`, qui
// reste comme court-circuit pour le cas non concurrent (la grande majorité).
export async function seedDemoReferenceDocument(projectId: string): Promise<void> {
  const id = demoReferenceDocumentId(projectId);

  try {
    const [existing] = await db
      .select({ id: document.id })
      .from(document)
      .where(eq(document.id, id));

    if (existing) return;

    db.insert(document)
      .values({
        id,
        projectId,
        name: 'Références clients — secteur Acme Corp.xlsx',
        source: 'manual',
        usedAsContext: true,
        folderPath: 'Références',
        content:
          "Liste des missions déjà menées par le cabinet pour des acteurs du secteur d'Acme Corp, avec la portée de chaque mission et les résultats obtenus -- base de travail pour la réponse à l'appel d'offres en cours.",
      })
      .onConflictDoNothing({ target: document.id })
      .run();
  } catch (error) {
    console.error(
      'seedDemoReferenceDocument failed -- continuing without the reference document',
      error,
    );
  }
}
