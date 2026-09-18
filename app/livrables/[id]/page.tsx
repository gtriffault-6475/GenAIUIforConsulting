import Link from 'next/link';

import { getLivrable } from '@/actions/livrable';

// Story 4.1 — Éditeur assisté (FR-19). First route of the app besides `/`.
// Read-only: shows the livrable's existing content, nothing more —
// Stories 4.2-4.5 populate this same page with anchored suggestions, the
// suggestions panel, and the global revision field. `getLivrable` only
// ever does a `SELECT` (`epic-4-context.md`'s Technical Decisions) so this
// page never triggers an agent call just by being opened.
//
// Reads APP_STATE indirectly through nothing here — this page looks up
// the livrable by `id` alone (Boundaries: mono-projet-actif this round,
// `id` is an opaque UUID), so unlike `/` it needs no `force-dynamic`
// override for an active-project read. It still must never be statically
// cached across different `id`s, which the dynamic segment itself already
// guarantees (`params` requires a request to resolve).
export default async function LivrablePage({
  params,
}: {
  // This version of Next resolves `params` as a Promise — see
  // `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getLivrable(id);

  return (
    <div>
      {/* Fil d'Ariane — stays visible regardless of what `result` holds
          below (Always: "toujours pouvoir revenir à l'espace de
          travail"), so it lives outside every branch of the conditional. */}
      <header className="top-bar">
        <Link href="/" className="breadcrumb-link">
          ← Espace de travail
        </Link>
      </header>

      <main style={{ padding: 'var(--space-gutter)' }}>
        {!result.ok ? (
          // Read failure (`{ok:false}`) — distinct from "id introuvable"
          // below, per this story's Always. Same inline-message pattern as
          // `app/page.tsx`'s failed-`getActiveProject` branch: no
          // `error.tsx` boundary, ever (Never).
          <p
            className="text-body"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {result.error}
          </p>
        ) : result.data === null ? (
          // No row for this id (e.g. a stale or hand-typed URL) — a plain
          // inline message, never Next's `notFound()`/404 page (Never).
          <p
            className="text-body"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Livrable introuvable.
          </p>
        ) : (
          <div
            className="card"
            style={{
              padding: 'var(--space-panel-padding)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              maxWidth: '660px',
            }}
          >
            <h1 className="text-heading">{result.data.title}</h1>
            {/* Rendered in `content.blocks`' own array order, keyed by
                `block.id` — never the block's text — since Story 4.2's
                anchored suggestions will target this same stable id and it
                must never be regenerated here (Always). Read-only: no
                `<textarea>`/`contentEditable` anywhere on this content
                (Never). */}
            {result.data.blocks.length === 0 ? (
              // A valid livrable with zero blocks — same inline-message
              // style as the "introuvable" branch above, rather than
              // rendering the title alone in an otherwise-empty card.
              <p
                className="text-body"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Ce livrable ne contient aucun contenu pour le moment.
              </p>
            ) : (
              result.data.blocks.map((block) => (
                <p key={block.id} className="text-body">
                  {block.text}
                </p>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
