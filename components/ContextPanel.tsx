'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  setDocumentUsedAsContext,
  type DocumentSummary,
  type DriveStatus,
} from '@/actions/document';
import { AddDocumentForm } from '@/components/AddDocumentForm';
import { useOverlay } from '@/components/OverlayProvider';

const OVERLAY_ID = 'add-document-form';

// Read-only document listing (Story 1.3 — Panneau Contexte), now a client
// component (Story 1.4 — Ajout d'un document hors-drive) so it can open
// the add-document form through the shared `OverlayProvider` (AD-8) and
// call `router.refresh()` after a successful add — mirrors
// `ProjectSelector.tsx`'s `handleChoose`. Reuses the existing
// `card`/`text-label`/`text-caption`/`nav-row` tokens (app/globals.css)
// rather than introducing new component classes for the list itself;
// only layout-specific spacing (not a reusable token) is set inline here.
//
// Story 5.2 — the drive part is the project's real Drive folder when a
// Google account is connected, the simulated one in demo mode, and a
// state message otherwise (EXPERIENCE.md "State Patterns"); the documents
// added outside the drive always follow it. `driveStatus` is a code from
// `listDocuments`; the French copy lives here.
export function ContextPanel({
  projectId,
  projectName,
  documents,
  driveStatus,
}: {
  projectId: string;
  projectName: string;
  // `null` means the document list failed to load — distinct from a
  // genuinely empty list, which gets its own explicit message below.
  // Mirrors the same convention as `ProjectSelector`'s `projects` prop.
  // Otherwise: drive files first (only when `driveStatus` is `ok`), then
  // the documents added outside the drive.
  documents: DocumentSummary[] | null;
  driveStatus: DriveStatus | null;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const router = useRouter();

  const isOpen = isOverlayOpen(OVERLAY_ID);

  function handleToggle() {
    if (isOpen) {
      closeOverlay();
    } else {
      openOverlay(OVERLAY_ID);
    }
  }

  function handleAdded() {
    closeOverlay();
    router.refresh();
  }

  return (
    <section
      className="card"
      aria-label="Contexte"
      style={{ padding: 'var(--space-panel-padding)' }}
    >
      {/* `contentRef` covers the trigger button too (not just the dropdown
          form below): otherwise a click on the button while open registers
          as "outside" to `OverlayProvider`, which closes the overlay on
          pointerdown just before the button's own click handler reopens it
          — same reasoning as `ProjectSelector.tsx`'s wrapping div. Only
          attached while this overlay is actually the open one, so an
          always-mounted `ContextPanel` never steals the content ref from a
          different overlay opened elsewhere. */}
      <div
        className="context-panel-header"
        ref={isOpen ? contentRef : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="text-label">Contexte</span>
        <button
          type="button"
          className="button-primary"
          aria-expanded={isOpen}
          onClick={handleToggle}
        >
          Ajouter un document
        </button>

        {isOpen && (
          // No `role="dialog"`/`aria-haspopup="dialog"` on the trigger:
          // this disclosure has no focus trap and no modal behavior, so
          // claiming the dialog role would promise more than it delivers
          // (see the Epic 1 retrospective). The revealed `<form>` already
          // carries its own accessible name (`AddDocumentForm`'s
          // `aria-label`), so this wrapper needs none of its own.
          <div className="card add-document-dropdown">
            <AddDocumentForm projectId={projectId} onAdded={handleAdded} />
          </div>
        )}
      </div>

      {documents !== null && driveStatus !== null && driveStatus !== 'ok' && (
        <DriveNotice status={driveStatus} projectName={projectName} />
      )}

      {documents === null ? (
        <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
          Impossible de charger les documents du projet.
        </p>
      ) : documents.length === 0 ? (
        driveStatus === 'ok' && (
          <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
            Aucun document pour ce projet.
          </p>
        )
      ) : (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {[
            ...groupByFolder(documents.filter((doc) => doc.source === 'drive')).map(
              (group) => ['drive', group] as const,
            ),
            ...groupByFolder(documents.filter((doc) => doc.source === 'manual')).map(
              (group) => ['manual', group] as const,
            ),
          ].map(([source, [folderPath, docs]]) => (
            <div
              key={`${source}:${folderPath ?? ''}`}
              style={{ marginTop: 'var(--space-3)' }}
            >
              {folderPath && (
                <span className="text-caption">{folderPath}</span>
              )}
              <ul
                style={{
                  listStyle: 'none',
                  margin: 'var(--space-1) 0 0',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                }}
              >
                {docs.map((doc) => (
                  <li key={doc.id}>
                    {/* Matches `nav-row`'s padding without its class — the
                        class also carries a hover/focus highlight meant for
                        genuinely clickable rows, which would visually
                        contradict this panel's read-only intent. */}
                    {doc.contextSelection === 'selectable' ? (
                      <ContextFileRow doc={doc} />
                    ) : (
                      <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                        {doc.name}
                        {doc.contextSelection === 'unreadable' && (
                          <span className="text-caption context-file-note">
                            non lisible par l&apos;agent
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Story 5.7 — a Google Docs/Slides/Sheets of the project folder: a real
// checkbox "Utiliser comme contexte", labelled by the file's name
// (EXPERIENCE.md). The server state (`doc.usedAsContext`) is the checked
// state; while the Server Action runs, the box shows the requested state
// and is disabled. On failure (export failed, refused) the box falls back
// to the server state — unchecked for a failed selection — and the
// message stays under the row until the next change; the panel is
// refreshed either way.
function ContextFileRow({ doc }: { doc: DocumentSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requested, setRequested] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = `context-file-${doc.id}`;
  const errorId = `${inputId}-error`;

  function handleChange(used: boolean) {
    setError(null);
    setRequested(used);
    startTransition(async () => {
      const result = await setDocumentUsedAsContext({ documentId: doc.id, used });
      if (!result.ok) setError(result.error);
      // After a failure too: the mode or the connection may have changed
      // (e.g. a revoked token), and the panel must follow.
      router.refresh();
      setRequested(null);
    });
  }

  return (
    <div className="context-file-row">
      <input
        id={inputId}
        type="checkbox"
        checked={requested ?? doc.usedAsContext}
        disabled={isPending}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => handleChange(event.target.checked)}
      />
      <label htmlFor={inputId}>
        <span className="sr-only">Utiliser comme contexte : </span>
        {doc.name}
      </label>
      {error && (
        <p id={errorId} className="text-caption context-file-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// The drive part's state message, in place of the drive files (the
// documents added outside the drive still follow). Exact copy from
// EXPERIENCE.md "State Patterns". `role="status"`: it can appear after a
// refresh (e.g. a revoked connection), and is not an error the consultant
// caused.
function DriveNotice({
  status,
  projectName,
}: {
  status: Exclude<DriveStatus, 'ok'>;
  projectName: string;
}) {
  const message = {
    disconnected: 'Connectez Google Drive pour afficher les fichiers du projet.',
    unconfigured: "Google Drive n'est pas configuré pour cette installation.",
    folder_missing: `Aucun dossier « ${projectName} » dans le Drive racine.`,
    folder_duplicate: `Plusieurs dossiers portent le nom « ${projectName} ».`,
    error: 'Impossible de récupérer les fichiers du Drive du projet.',
  }[status];

  return (
    <div className="context-drive-notice" role="status">
      <p className="text-caption">{message}</p>
      {status === 'disconnected' && (
        // Same server-side OAuth entry point as the top bar's button
        // (`components/GoogleConnection.tsx`): a full navigation, not a
        // Server Action.
        <a className="button-neutral" href="/api/google/oauth/start">
          Connecter Google Drive
        </a>
      )}
    </div>
  );
}

// Groups documents by `folderPath`, root-level documents (`null`) first,
// then named folders in alphabetical order — stable regardless of the
// order the provider/DB returns rows in.
function groupByFolder(
  documents: DocumentSummary[],
): [string | null, DocumentSummary[]][] {
  const groups = new Map<string | null, DocumentSummary[]>();
  for (const doc of documents) {
    const list = groups.get(doc.folderPath) ?? [];
    list.push(doc);
    groups.set(doc.folderPath, list);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });
}
