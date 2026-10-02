'use server';

import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';

import { getDemoModeActive } from '@/actions/demo';
import { resolveDriveMode } from '@/actions/drive-mode';
import {
  deleteRevokedGoogleConnection,
  readGoogleRefreshToken,
} from '@/actions/google-credentials';
import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { document, project } from '@/db/schema';
import { createDriveProvider, type DriveError, type DriveFile } from '@/integrations';

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
// Non exportée (ce fichier porte `'use server'` -- toute fonction exportée
// en devient une Server Action, et Next rejette une Server Action
// synchrone). `resolveDemoReferenceDocumentId` ci-dessous est le seul point
// d'accès pour un appelant externe (`actions/demo.ts`).
function demoReferenceDocumentId(projectId: string): string {
  return `doc-demo-references-${projectId}`;
}

// Revue (blind-hunter, Review Triage Log #3) : `resetAvantVenteWorkflow`
// (`actions/demo.ts`) doit pouvoir supprimer ce même document lors d'un
// reset avant-vente (sans quoi rejouer la démo sur un projet déjà utilisé
// montre le document de référence dès le premier message, avant même que le
// tool-call RFP ne se redéclenche). AD-2 reste respecté : `actions/demo.ts`
// ne recalcule jamais l'id à la main, il appelle cette Server Action --
// seule source pour le dériver, ici comme dans `seedDemoReferenceDocument`
// ci-dessous. `async` uniquement pour la contrainte Server Action
// ci-dessus ; le corps lui-même n'a besoin d'aucun `await`.
export async function resolveDemoReferenceDocumentId(
  projectId: string,
): Promise<string> {
  return demoReferenceDocumentId(projectId);
}

// AD-2 — this is the only file allowed to read or write DOCUMENT.
// Components never touch `db/` or `integrations/` directly; they call
// this Server Action. Drive rows (`source: 'drive'`) are written only by
// the resync below; `source: 'manual'` rows by `addManualDocument` and
// `seedDemoReferenceDocument`.

export type DocumentSummary = {
  id: string;
  name: string;
  source: 'drive' | 'manual';
  folderPath: string | null;
};

// Story 5.2 — what the Contexte panel shows in place of (or alongside)
// the drive files. A code, not French copy: the panel owns the wording
// (CONVENTIONS.md). `ok` covers demo mode too (simulated drive).
export type DriveStatus =
  | 'ok'
  | 'unconfigured'
  | 'disconnected'
  | 'folder_missing'
  | 'folder_duplicate'
  | 'error';

export type DocumentListing = {
  // Drive files first (only when `driveStatus` is `ok`), then the
  // documents added outside the drive, always.
  documents: DocumentSummary[];
  driveStatus: DriveStatus;
};

type DriveOrigin = 'mock' | 'google';

function toDriveStatus(error: DriveError): DriveStatus {
  switch (error) {
    case 'unconfigured':
    case 'folder_missing':
    case 'folder_duplicate':
      return error;
    case 'disconnected':
    case 'token_revoked':
      return 'disconnected';
    default:
      return 'error';
  }
}

// The single drive resync (sync-then-read, epic-5-context.md
// "Resynchronisation"), one synchronous transaction:
// - purges the project's drive rows of another origin than `origin`
//   (every drive row when `origin` is `null`: no drive outside demo mode
//   without a connected account);
// - updates name, type and folder of the files still listed — never
//   `content` nor `usedAsContext`;
// - inserts new files with a fresh UUID, an empty `content` and
//   `usedAsContext` left to its default (false);
// - deletes the rows of files that disappeared from the listing.
// Rows are matched on `driveFileId`, never on DOCUMENT's own `id`.
// `files: null` (the listing failed) only purges the other origin: the
// current origin's rows are kept as they are, and simply not shown.
function syncDriveRows(
  projectId: string,
  origin: DriveOrigin | null,
  files: DriveFile[] | null,
): void {
  const isProjectDriveRow = and(
    eq(document.projectId, projectId),
    eq(document.source, 'drive'),
  );

  db.transaction((tx) => {
    tx.delete(document)
      .where(
        origin === null
          ? isProjectDriveRow
          : and(isProjectDriveRow, or(isNull(document.origin), ne(document.origin, origin))),
      )
      .run();

    if (origin === null || files === null) return;

    const existing = tx
      .select({ id: document.id, driveFileId: document.driveFileId })
      .from(document)
      .where(isProjectDriveRow)
      .all();
    const rowIdByFileId = new Map<string, string>();
    for (const row of existing) {
      if (row.driveFileId) rowIdByFileId.set(row.driveFileId, row.id);
    }

    const listedFileIds = new Set<string>();
    for (const file of files) {
      if (listedFileIds.has(file.id)) continue;
      listedFileIds.add(file.id);

      const rowId = rowIdByFileId.get(file.id);
      if (rowId) {
        tx.update(document)
          .set({ name: file.name, mimeType: file.mimeType, folderPath: file.folderPath })
          .where(eq(document.id, rowId))
          .run();
      } else {
        tx.insert(document)
          .values({
            id: crypto.randomUUID(),
            projectId,
            name: file.name,
            source: 'drive',
            folderPath: file.folderPath,
            content: '',
            driveFileId: file.id,
            mimeType: file.mimeType,
            origin,
          })
          .run();
      }
    }

    for (const row of existing) {
      if (!row.driveFileId || !listedFileIds.has(row.driveFileId)) {
        tx.delete(document).where(eq(document.id, row.id)).run();
      }
    }
  });
}

export async function listDocuments(
  projectId: string,
): Promise<ActionResult<DocumentListing>> {
  try {
    const [projectRow] = await db
      .select({ name: project.name })
      .from(project)
      .where(eq(project.id, projectId));
    if (!projectRow) {
      return { ok: false, error: 'Ce projet est introuvable.' };
    }

    const mode = await resolveDriveMode();
    // Read server-side only, straight into the factory: the token never
    // leaves this function, and nothing returned below carries it.
    const tokenRead =
      mode === 'connected' || mode === 'disconnected'
        ? readGoogleRefreshToken()
        : ({ ok: true, refreshToken: null } as const);
    const refreshToken = tokenRead.ok ? tokenRead.refreshToken : null;

    // `resolveDriveMode` degrades an unreadable demo flag or connection
    // row to `disconnected`. Only a confirmed absence of connection (demo
    // flag readable and off, connection row read and absent) may purge
    // the drive rows: a read failure shows the generic error and leaves
    // every row untouched (Story 5.7's selections survive it).
    let readFailed = !tokenRead.ok;
    if (mode === 'disconnected' && !readFailed) {
      const demoModeResult = await getDemoModeActive();
      readFailed = !demoModeResult.ok || demoModeResult.data || refreshToken !== null;
    }

    let driveStatus: DriveStatus;
    if (readFailed) {
      driveStatus = 'error';
    } else {
      const result = await createDriveProvider(mode, refreshToken).listFiles(
        projectRow.name,
      );

      if (result.ok) {
        driveStatus = 'ok';
        syncDriveRows(projectId, mode === 'demo' ? 'mock' : 'google', result.data);
      } else {
        if (result.error === 'token_revoked' && refreshToken) {
          // AD-1: a dead connection is removed, back to `disconnected`.
          deleteRevokedGoogleConnection(refreshToken);
        }
        driveStatus = toDriveStatus(result.error);
        // No account (or no configuration): no drive rows may remain. Any
        // other failure (folder missing/duplicate, quota, network…) only
        // purges the other origin's rows; the current origin's are kept
        // (Story 5.7's selections survive a transient error) and hidden.
        if (driveStatus === 'disconnected' || driveStatus === 'unconfigured') {
          syncDriveRows(projectId, null, null);
        } else {
          syncDriveRows(projectId, mode === 'demo' ? 'mock' : 'google', null);
        }
      }
    }

    const rows = await db
      .select({
        id: document.id,
        name: document.name,
        source: document.source,
        folderPath: document.folderPath,
      })
      .from(document)
      .where(eq(document.projectId, projectId))
      .orderBy(sql`rowid`);

    const driveRows =
      driveStatus === 'ok'
        ? rows
            .filter((row) => row.source === 'drive')
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        : [];
    const manualRows = rows.filter((row) => row.source === 'manual');

    return {
      ok: true,
      data: { documents: [...driveRows, ...manualRows], driveStatus },
    };
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
        // FR-4: a document added outside the drive is always context.
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
// `listDocuments`/sync drive (qui ne touche que les lignes `source:
// 'drive'`). Idempotente par projet (`demoReferenceDocumentId`
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
        folderPath: 'Références',
        content:
          "Liste des missions déjà menées par le cabinet pour des acteurs du secteur d'Acme Corp, avec la portée de chaque mission et les résultats obtenus -- base de travail pour la réponse à l'appel d'offres en cours.",
        // Story 5.2: every `manual` row is used as context (FR-4).
        usedAsContext: true,
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
