'use client';

import { useRouter } from 'next/navigation';

import type { DocumentSummary } from '@/actions/document';
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
export function ContextPanel({
  projectId,
  documents,
}: {
  projectId: string;
  // `null` means the document list failed to load — distinct from a
  // genuinely empty list, which gets its own explicit message below.
  // Mirrors the same convention as `ProjectSelector`'s `projects` prop.
  documents: DocumentSummary[] | null;
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
      style={{ width: 320, padding: 'var(--space-panel-padding)' }}
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

      {documents === null ? (
        <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
          Impossible de charger les documents du projet.
        </p>
      ) : documents.length === 0 ? (
        <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
          Aucun document pour ce projet.
        </p>
      ) : (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {groupByFolder(documents).map(([folderPath, docs]) => (
            <div key={folderPath ?? ''} style={{ marginTop: 'var(--space-3)' }}>
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
                        contradict this panel's read-only intent. No visual
                        distinction between `drive` and `manual` sources
                        here, per spec — explicitly out of scope. */}
                    <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                      {doc.name}
                    </div>
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
