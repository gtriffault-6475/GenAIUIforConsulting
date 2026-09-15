import type { DocumentSummary } from '@/actions/document';

// Read-only Contexte panel (Story 1.3 — Panneau Contexte). Reuses the
// existing `card`/`text-label`/`text-caption`/`nav-row` tokens
// (app/globals.css) rather than introducing new component classes; only
// layout-specific spacing (not a reusable token) is set inline here.
export function ContextPanel({
  documents,
}: {
  // `null` means the document list failed to load — distinct from a
  // genuinely empty list, which gets its own explicit message below.
  // Mirrors the same convention as `ProjectSelector`'s `projects` prop.
  documents: DocumentSummary[] | null;
}) {
  return (
    <section
      className="card"
      aria-label="Contexte"
      style={{ width: 320, padding: 'var(--space-panel-padding)' }}
    >
      <span className="text-label">Contexte</span>

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
                        contradict this panel's read-only intent. */}
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
