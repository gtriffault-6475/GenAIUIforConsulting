'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';

import {
  setDocumentUsedAsContext,
  type ContextPanelData,
  type DocumentSummary,
  type DriveListingState,
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
// Story 5.2 — EXPERIENCE.md "Panneau Contexte" and its error states.
// Drive files come first (real folder when connected, simulated in demo
// mode), then documents added outside the drive. Only a readable Google
// Docs/Slides/Sheets file gets a "Utiliser comme contexte" checkbox (a real
// labelled form control); other formats say "non lisible par l'agent".
// Manual documents are always sent to the agent, so they have no box.
const DRIVE_STATE_MESSAGES: Record<'disconnected' | 'unconfigured' | 'error', string> = {
  disconnected: 'Connectez Google Drive pour afficher les fichiers du projet.',
  unconfigured: "Google Drive n'est pas configuré pour cette installation.",
  error: 'Impossible de lire le Drive du projet. Réessayez plus tard.',
};

function driveStateMessage(state: DriveListingState, projectName: string): string | null {
  if (state === 'ok') return null;
  if (state === 'folder_missing') return `Aucun dossier « ${projectName} » dans le Drive racine.`;
  if (state === 'folder_duplicate') return `Plusieurs dossiers portent le nom « ${projectName} ».`;
  return DRIVE_STATE_MESSAGES[state];
}

export function ContextPanel({
  projectId,
  data,
}: {
  projectId: string;
  // `null` means the panel data failed to load — distinct from a
  // genuinely empty project, which gets its own explicit message below.
  data: ContextPanelData | null;
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

      {data === null ? (
        <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
          Impossible de charger les documents du projet.
        </p>
      ) : (
        <>
          <DriveFiles data={data} />
          {data.manual.length > 0 && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              {groupByFolder(data.manual).map(([folderPath, docs]) => (
                <div key={folderPath ?? ''} style={{ marginTop: 'var(--space-3)' }}>
                  {folderPath && <span className="text-caption">{folderPath}</span>}
                  <ul className="context-panel-list">
                    {docs.map((doc) => (
                      <li key={doc.id} className="context-panel-row">
                        {doc.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {data.drive.state === 'ok' &&
            data.drive.files.length === 0 &&
            data.manual.length === 0 && (
              <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
                Aucun document pour ce projet.
              </p>
            )}
        </>
      )}
    </section>
  );
}

function DriveFiles({ data }: { data: ContextPanelData }) {
  const message = driveStateMessage(data.drive.state, data.projectName);
  if (message) {
    return (
      <div className="context-panel-drive-state">
        <p className="text-caption">{message}</p>
        {data.drive.state === 'disconnected' && (
          <a className="google-connection-connect" href="/api/google/oauth/start">
            Connecter Google Drive
          </a>
        )}
      </div>
    );
  }
  if (data.drive.files.length === 0) return null;
  return (
    <ul className="context-panel-list" style={{ marginTop: 'var(--space-3)' }}>
      {data.drive.files.map((file) => (
        <DriveFileRow key={file.id} file={file} />
      ))}
    </ul>
  );
}

function DriveFileRow({ file }: { file: DocumentSummary }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Shows the new state at once while the text is exported (the export
  // can take a moment on a real Drive); falls back to the server value
  // when the transition ends — so a failed export unchecks the box again.
  const [checked, setChecked] = useOptimistic(file.usedAsContext);
  const router = useRouter();

  if (!file.readable) {
    return (
      <li className="context-panel-row">
        <span>{file.name}</span>
        <span className="text-caption context-panel-unreadable">non lisible par l'agent</span>
      </li>
    );
  }

  const inputId = `context-${file.id}`;
  function handleChange(next: boolean) {
    setError(null);
    startTransition(async () => {
      setChecked(next);
      const result = await setDocumentUsedAsContext(file.id, next);
      if (!result.ok) {
        setError(result.error);
        // The failure may have changed the drive state (e.g. a revoked
        // Google connection): re-read the panel.
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="context-panel-row">
      <span>{file.name}</span>
      <label className="context-panel-toggle" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.checked)}
        />
        <span className="text-caption">Utiliser comme contexte</span>
        {/* Accessible name "Utiliser comme contexte : <fichier>" — keeps
            the visible label first (WCAG 2.5.3) and names the file. */}
        <span className="sr-only"> : {file.name}</span>
      </label>
      {error && (
        <p className="text-caption context-panel-error" role="alert">
          {error}
        </p>
      )}
    </li>
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
