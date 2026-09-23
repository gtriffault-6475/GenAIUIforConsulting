import Link from 'next/link';

import { getLivrable } from '@/actions/livrable';
import { listSuggestions } from '@/actions/suggestion';
import { GlobalRevisionField } from '@/components/GlobalRevisionField';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';

// Story 4.1 — Éditeur assisté (FR-19). First route of the app besides `/`.
// Story 4.2 (FR-24) adds `listSuggestions` alongside `getLivrable` and
// renders `SuggestionsPanel` below the content card — both reads are plain
// `SELECT`s (`epic-4-context.md`'s Technical Decisions), so this page still
// never triggers an agent call just by being opened; suggestions already
// persisted by `propose_livrable_content` (`actions/conversation.ts`)
// simply appear. Stories 4.3-4.5 still populate this same page with
// suggestion actions and the global revision field.
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
  // Parallel, both plain `SELECT`s — `listSuggestions` reads by the same
  // `id` (a LIVRABLE's id doubles as its own suggestions' `livrableId`
  // scope), never gating one read on the other's result.
  const [result, suggestionsResult] = await Promise.all([
    getLivrable(id),
    listSuggestions(id),
  ]);

  // A failed suggestions read degrades to "no suggestions shown" rather
  // than a second visible error on this page — logged for troubleshooting,
  // same spirit as other silent background-read failures in this app
  // (e.g. `getStartingSuggestion`).
  if (!suggestionsResult.ok) {
    console.error('LivrablePage: listSuggestions failed', suggestionsResult.error);
  }
  const suggestions = suggestionsResult.ok ? suggestionsResult.data : [];

  // spec-ai-tint-paragraphe-cible.md (epic-4-context.md: "le paragraphe
  // ciblé... utilise aussi le fond ai-tint pour se signaler comme zone
  // IA"). Only `pending`/`revising` — an unresolved, still-actionable
  // suggestion — count as "targeting" a paragraph; `accepted`/`rejected`
  // are already settled (their own card fades, per the same UX pattern)
  // and have no reason to keep flagging the paragraph as an active AI
  // zone.
  //
  // Epic 4 retrospective (follow-up, 2026-09-23), finding #5: this filter
  // implicitly trusts that no `pending`/`revising` anchored suggestion ever
  // holds an `anchorRef` pointing at a block id absent from the current
  // `blocks` array. That invariant is enforced elsewhere, not here —
  // `actions/suggestion.ts`'s `reworkSuggestion` (its three guarded
  // `WHERE status = 'revising'` write-backs) and `actions/livrable.ts`'s
  // `updateLivrableWithSuggestions` (its `rejected` transition on
  // regeneration) are what keep it true. If either guard is ever weakened,
  // this line degrades silently (`activeAnchorRefs.has(block.id)` just
  // stops matching) rather than failing loudly.
  const activeAnchorRefs = new Set(
    suggestions
      .filter(
        (suggestion) =>
          suggestion.anchorRef !== null &&
          (suggestion.status === 'pending' || suggestion.status === 'revising'),
      )
      .map((suggestion) => suggestion.anchorRef),
  );

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
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              maxWidth: '660px',
            }}
          >
            <div
              className="card"
              style={{
                padding: 'var(--space-panel-padding)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <h1 className="text-heading">{result.data.title}</h1>
              {/* Rendered in `content.blocks`' own array order, keyed by
                  `block.id` — never the block's text — since Story 4.2's
                  anchored suggestions target this same stable id and it
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
                result.data.blocks.map((block) => {
                  const isActiveTarget = activeAnchorRefs.has(block.id);
                  return (
                    <p
                      key={block.id}
                      className={
                        isActiveTarget ? 'text-body ai-tint-block' : 'text-body'
                      }
                    >
                      {block.text}
                      {/* Non-visual counterpart to the tint (bmad-review
                          blind-hunter finding, oneshot pass): the color
                          alone conveys nothing to a screen reader, and the
                          suggestion's own card is a separate DOM subtree
                          below this one with no structural link back here.
                          A child span (not `aria-label` on the `<p>`
                          itself, which would replace the paragraph's own
                          text as its accessible name instead of adding to
                          it) appends this without being seen. */}
                      {isActiveTarget && (
                        <span className="sr-only">
                          {' '}
                          (suggestion IA en attente)
                        </span>
                      )}
                    </p>
                  );
                })
              )}
            </div>

            {/* Story 4.2 (FR-24) — suggestions already persisted alongside
                this livrable's creation, stacked below its content in one
                column (Never: no dedicated side panel yet, deferred to
                Story 4.3). */}
            <SuggestionsPanel blocks={result.data.blocks} suggestions={suggestions} />

            {/* Story 4.4 (FR-23, UX-DR15) — révision globale, distincte des
                suggestions ancrées ci-dessus, toujours en bas de la
                colonne. */}
            <GlobalRevisionField livrableId={result.data.id} />
          </div>
        )}
      </main>
    </div>
  );
}
