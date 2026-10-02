'use server';

import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { getDemoModeActive } from '@/actions/demo';
import { resolveDriveMode } from '@/actions/drive-mode';
import {
  deleteRevokedGoogleConnection,
  readGoogleRefreshToken,
} from '@/actions/google-credentials';
import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { document, project } from '@/db/schema';
import {
  createDriveProvider,
  isExportableMimeType,
  type DriveError,
  type DriveFile,
  type DriveMode,
  type DriveProvider,
} from '@/integrations';
import type { ContextDocument } from '@/skills/buildRequest';

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
  // Story 5.7 — drive files only (`null` for `manual` rows, always sent):
  // `selectable` for a Google Docs/Slides/Sheets (checkbox "Utiliser comme
  // contexte"), `unreadable` otherwise ("non lisible par l'agent").
  contextSelection: 'selectable' | 'unreadable' | null;
  usedAsContext: boolean;
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

// Story 5.7 (Décision 1) — the drive origin shown and sent in a mode:
// `mock` in demo mode, `google` when connected, none otherwise. Rows of
// another origin are kept (with their `content` and `usedAsContext`, so a
// selection survives a switch to demo mode or a disconnection) but are
// neither shown nor sent.
function originForMode(mode: DriveMode): DriveOrigin | null {
  if (mode === 'demo') return 'mock';
  if (mode === 'connected') return 'google';
  return null;
}

// The provider of the current mode, with the stored refresh token when
// connected (read server-side straight into the factory, never returned).
// `null` when the token could not be read.
function currentDriveProvider(
  mode: DriveMode,
): { provider: DriveProvider; refreshToken: string | null } | null {
  if (mode !== 'connected') {
    return { provider: createDriveProvider(mode), refreshToken: null };
  }
  const tokenRead = readGoogleRefreshToken();
  if (!tokenRead.ok) return null;
  return {
    provider: createDriveProvider(mode, tokenRead.refreshToken),
    refreshToken: tokenRead.refreshToken,
  };
}

// A selected file whose text must be exported again (Story 5.7): its
// `modifiedTime` changed in Drive, or it was never exported at resync
// (`driveModifiedTime` NULL, written by a selection).
type StaleContextRow = {
  rowId: string;
  driveFileId: string;
  modifiedTime: string | null;
};

// The single drive resync (sync-then-read, epic-5-context.md
// "Resynchronisation", AD-1 as amended by Story 5.7), one synchronous
// transaction, for a successful listing of the current mode (`origin`):
// - updates name, type, folder and `driveModifiedTime` of the files still
//   listed — never `usedAsContext`, and never `content` (only the export
//   below writes it). A selected file is left on its old
//   `driveModifiedTime` until its re-export succeeds;
// - inserts new files with a fresh UUID, an empty `content` and
//   `usedAsContext` left to its default (false);
// - deletes the rows of this origin whose file disappeared from the
//   listing, and the legacy drive rows without origin;
// - keeps the rows of the other origin untouched (hidden, never sent).
// Rows are matched on `driveFileId`, never on DOCUMENT's own `id`.
// Returns the selected rows to re-export — never an unselected one (NFR8).
function syncDriveRows(
  projectId: string,
  origin: DriveOrigin,
  files: DriveFile[],
): StaleContextRow[] {
  const isProjectDriveRow = and(
    eq(document.projectId, projectId),
    eq(document.source, 'drive'),
  );

  return db.transaction((tx) => {
    tx.delete(document)
      .where(and(isProjectDriveRow, isNull(document.origin)))
      .run();

    const existing = tx
      .select({
        id: document.id,
        driveFileId: document.driveFileId,
        content: document.content,
        usedAsContext: document.usedAsContext,
        driveModifiedTime: document.driveModifiedTime,
      })
      .from(document)
      .where(and(isProjectDriveRow, eq(document.origin, origin)))
      .all();
    const rowByFileId = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      if (row.driveFileId) rowByFileId.set(row.driveFileId, row);
    }

    const stale: StaleContextRow[] = [];
    const listedFileIds = new Set<string>();
    for (const file of files) {
      if (listedFileIds.has(file.id)) continue;
      listedFileIds.add(file.id);

      const row = rowByFileId.get(file.id);
      if (row) {
        const needsExport =
          row.usedAsContext &&
          isExportableMimeType(file.mimeType) &&
          row.driveModifiedTime !== file.modifiedTime;
        if (needsExport) {
          stale.push({ rowId: row.id, driveFileId: file.id, modifiedTime: file.modifiedTime });
        }
        tx.update(document)
          .set({
            name: file.name,
            mimeType: file.mimeType,
            folderPath: file.folderPath,
            ...(needsExport ? {} : { driveModifiedTime: file.modifiedTime }),
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
            folderPath: file.folderPath,
            content: '',
            driveFileId: file.id,
            mimeType: file.mimeType,
            origin,
            driveModifiedTime: file.modifiedTime,
          })
          .run();
      }
    }

    for (const row of existing) {
      if (!row.driveFileId || !listedFileIds.has(row.driveFileId)) {
        tx.delete(document).where(eq(document.id, row.id)).run();
      }
    }

    return stale;
  });
}

// Story 5.7 — at most 20,000 characters of a document are ever sent
// (`skills/buildRequest.ts`); an export (up to 10 MB) is stored cut a
// little above that, never half of a surrogate pair.
const MAX_STORED_EXPORT_CHARS = 25_000;

function capStoredText(text: string): string {
  if (text.length <= MAX_STORED_EXPORT_CHARS) return text;
  let end = MAX_STORED_EXPORT_CHARS;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

// Story 5.7 — re-exports the selected files the resync found stale. On
// success, `content` and `driveModifiedTime` are written together, and
// only if the row is still selected (a deselection in between wins). On
// failure the old text is kept and the failure logged; the unchanged
// `driveModifiedTime` makes the next resync try again. Stops at the first
// `token_revoked` (the connection is then deleted).
async function refreshStaleContextRows(
  provider: DriveProvider,
  refreshToken: string | null,
  stale: StaleContextRow[],
): Promise<void> {
  for (const row of stale) {
    const result = await provider.exportText(row.driveFileId);
    if (!result.ok) {
      console.error('listDocuments: context document refresh failed, old text kept', {
        documentId: row.rowId,
        error: result.error,
      });
      if (result.error === 'token_revoked') {
        if (refreshToken) deleteRevokedGoogleConnection(refreshToken);
        return;
      }
      continue;
    }
    db.update(document)
      .set({ content: capStoredText(result.data), driveModifiedTime: row.modifiedTime })
      .where(and(eq(document.id, row.rowId), eq(document.usedAsContext, true)))
      .run();
  }
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
    const origin = originForMode(mode);

    // `resolveDriveMode` degrades an unreadable demo flag or connection
    // row to `disconnected`: the panel then shows the generic error rather
    // than the connection prompt. No drive row is ever written or deleted
    // outside a successful listing (Story 5.7: rows are hidden, not
    // purged).
    let readFailed = false;
    if (mode === 'disconnected') {
      const demoModeResult = await getDemoModeActive();
      const tokenRead = readGoogleRefreshToken();
      readFailed =
        !demoModeResult.ok ||
        demoModeResult.data ||
        !tokenRead.ok ||
        tokenRead.refreshToken !== null;
    }
    const current = readFailed ? null : currentDriveProvider(mode);

    let driveStatus: DriveStatus;
    if (!current) {
      driveStatus = 'error';
    } else {
      const { provider, refreshToken } = current;
      const result = await provider.listFiles(projectRow.name);

      if (result.ok && origin) {
        driveStatus = 'ok';
        const stale = syncDriveRows(projectId, origin, result.data);
        await refreshStaleContextRows(provider, refreshToken, stale);
      } else if (result.ok) {
        // Unreachable: only `demo` and `connected` list files.
        driveStatus = 'error';
      } else {
        if (result.error === 'token_revoked' && refreshToken) {
          // AD-1: a dead connection is removed, back to `disconnected`.
          deleteRevokedGoogleConnection(refreshToken);
        }
        driveStatus = toDriveStatus(result.error);
      }
    }

    const rows = await db
      .select({
        id: document.id,
        name: document.name,
        source: document.source,
        folderPath: document.folderPath,
        origin: document.origin,
        mimeType: document.mimeType,
        usedAsContext: document.usedAsContext,
      })
      .from(document)
      .where(eq(document.projectId, projectId))
      .orderBy(sql`rowid`);

    const driveRows: DocumentSummary[] =
      driveStatus === 'ok' && origin
        ? rows
            .filter((row) => row.source === 'drive' && row.origin === origin)
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
            .map((row) => ({
              id: row.id,
              name: row.name,
              source: 'drive',
              folderPath: row.folderPath,
              contextSelection: isExportableMimeType(row.mimeType) ? 'selectable' : 'unreadable',
              usedAsContext: row.usedAsContext,
            }))
        : [];
    const manualRows: DocumentSummary[] = rows
      .filter((row) => row.source === 'manual')
      .map((row) => ({
        id: row.id,
        name: row.name,
        source: 'manual',
        folderPath: row.folderPath,
        contextSelection: null,
        usedAsContext: true,
      }));

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

// Story 5.7 — "Utiliser comme contexte" on a drive file. Refused outside
// the `connected` and `demo` modes, for a row of another origin than the
// current mode's, and for a type that cannot be exported. Selecting
// exports the file's text into `content` first (the only export of a file
// outside the resync, NFR8): on failure nothing changes and the box stays
// unchecked. Deselecting empties `content`, so the text is no longer sent.
export async function setDocumentUsedAsContext({
  documentId,
  used,
}: {
  documentId: string;
  used: boolean;
}): Promise<ActionResult<void>> {
  const refused = {
    ok: false as const,
    error: 'Ce fichier ne peut pas être utilisé comme contexte.',
  };
  const exportFailed = {
    ok: false as const,
    error: "Impossible de lire ce fichier pour l'agent.",
  };

  try {
    const [row] = await db
      .select({
        source: document.source,
        origin: document.origin,
        mimeType: document.mimeType,
        driveFileId: document.driveFileId,
      })
      .from(document)
      .where(eq(document.id, documentId));

    const mode = await resolveDriveMode();
    const origin = originForMode(mode);
    if (
      !row ||
      row.source !== 'drive' ||
      !row.driveFileId ||
      origin === null ||
      row.origin !== origin ||
      !isExportableMimeType(row.mimeType)
    ) {
      return refused;
    }

    if (!used) {
      db.update(document)
        .set({ usedAsContext: false, content: '' })
        .where(eq(document.id, documentId))
        .run();
      return { ok: true, data: undefined };
    }

    const current = currentDriveProvider(mode);
    if (!current) return exportFailed;

    const result = await current.provider.exportText(row.driveFileId);
    if (!result.ok) {
      if (result.error === 'token_revoked' && current.refreshToken) {
        deleteRevokedGoogleConnection(current.refreshToken);
      }
      return exportFailed;
    }

    const updated = db
      .update(document)
      // `driveModifiedTime` NULL: the export's own date is unknown, so the
      // next resync re-exports once and stores the file's real date.
      .set({ usedAsContext: true, content: capStoredText(result.data), driveModifiedTime: null })
      .where(eq(document.id, documentId))
      .run();
    // The row vanished in between (concurrent resync): nothing selected.
    if (updated.changes === 0) return exportFailed;
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('setDocumentUsedAsContext failed', error);
    return exportFailed;
  }
}

export type AgentContext = {
  demoModeActive: boolean;
  contextDocuments: ContextDocument[];
};

// Story 5.7 (AD-11) — what every action that calls the agent passes to
// `sendToAgent`: the demo flag (from the drive mode, so it is read once;
// an unreadable flag degrades to the real path, as before) and the
// project's context documents — every `manual` document, plus the drive
// files selected as context whose `origin` matches the current mode
// (none outside `demo`/`connected`). A document with an empty text is
// skipped. The size caps are applied by `skills/buildRequest.ts`.
// Never fails: a failed read is logged and degrades to no context
// documents, with the demo flag read on its own (`false` if that fails
// too, the previous behavior), so the scripted demo chat is unaffected.
export async function getAgentContext(projectId: string): Promise<AgentContext> {
  try {
    const mode = await resolveDriveMode();
    const origin = originForMode(mode);

    const rows = await db
      .select({ name: document.name, content: document.content })
      .from(document)
      .where(
        and(
          eq(document.projectId, projectId),
          eq(document.usedAsContext, true),
          origin === null
            ? eq(document.source, 'manual')
            : or(
                eq(document.source, 'manual'),
                and(eq(document.source, 'drive'), eq(document.origin, origin)),
              ),
        ),
      )
      .orderBy(sql`rowid`);

    return {
      demoModeActive: mode === 'demo',
      contextDocuments: rows.filter((row) => row.content !== ''),
    };
  } catch (error) {
    console.error('getAgentContext failed, continuing without context documents', error);
    const demoModeResult = await getDemoModeActive();
    return {
      demoModeActive: demoModeResult.ok ? demoModeResult.data : false,
      contextDocuments: [],
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
        contextSelection: null,
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
