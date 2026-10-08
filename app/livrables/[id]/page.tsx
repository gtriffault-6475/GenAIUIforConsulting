import Link from 'next/link';

import { getLivrable } from '@/actions/livrable';
import { listSuggestions } from '@/actions/suggestion';
import { GlobalRevisionField } from '@/components/GlobalRevisionField';
import { DriveLivrableActions } from '@/components/DriveLivrableActions';
import { JumpButton } from '@/components/EditorJump';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';
import {
  groupBlocksBySlide,
  hasUnsavedDriveChanges,
  type LivrableBlock,
} from '@/domain/livrable';

// Story 4.1 — Éditeur assisté (FR-19). First route of the app besides `/`.
// Story 4.2 (FR-24) adds `listSuggestions` alongside `getLivrable` and
// renders `SuggestionsPanel` (spec-editeur-deux-panneaux.md: in the AI
// panel beside the document, no longer below it) — both reads are plain
// `SELECT`s (`epic-4-context.md`'s Technical Decisions), so this page still
// never triggers an agent call just by being opened; suggestions already
// persisted by `propose_livrable_content` (`actions/message.ts`)
// simply appear. Stories 4.3-4.5 still populate this same page with
// suggestion actions and the global revision field.
//
// `force-dynamic` (Tour 2, spec-toggle-mode-demo-ui.md, verification-gap
// lens): this file's own comment previously claimed the dynamic `[id]`
// segment alone was enough to keep this page off the Full Route Cache
// ("`params` requires a request to resolve") — confirmed wrong against
// this Next version's own bundled docs
// (`node_modules/next/dist/docs/01-app/04-glossary.md`'s "Request-time
// APIs" list: `cookies()`/`headers()`/`searchParams`/`draftMode()`, never
// `params`) and against `use-router.md`'s own note that `router.refresh()`
// "does not invalidate the server-side cache". Without this, a production
// `next build`/`next start` could serve a cached render of this exact
// `id` from before a `router.refresh()`-triggered mutation (an accepted/
// rejected/reworked suggestion, or — the boundary this spec actually
// needs — the demo-mode banner/border toggled from `/`) instead of the
// current state. `next dev` never surfaces this: dev mode always renders
// on demand regardless.
export const dynamic = 'force-dynamic';

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
  // this degrades silently (`activeSuggestionIdByAnchor.has(block.id)`
  // just stops matching) rather than failing loudly.
  //
  // spec-editeur-deux-panneaux.md — the same map drives both the tint and
  // the paragraph → card link (the marker button), so they never drift:
  // anchor → id of the `pending`/`revising` suggestion targeting it (at
  // most one pending anchored suggestion per paragraph, epic-4-context.md;
  // a `revising` one replaces it while it is regenerated).
  const activeSuggestionIdByAnchor = new Map<string, string>();
  for (const suggestion of suggestions) {
    if (
      suggestion.anchorRef !== null &&
      (suggestion.status === 'pending' || suggestion.status === 'revising')
    ) {
      activeSuggestionIdByAnchor.set(suggestion.anchorRef, suggestion.id);
    }
  }

  return (
    <div className="editor-page">
      {/* Fil d'Ariane — stays visible regardless of what `result` holds
          below (Always: "toujours pouvoir revenir à l'espace de
          travail"), so it lives outside every branch of the conditional. */}
      <header className="top-bar">
        <Link href="/" className="breadcrumb-link">
          ← Espace de travail
        </Link>
      </header>

      {!result.ok ? (
        <main style={{ padding: 'var(--space-gutter)' }}>
          {/* Read failure (`{ok:false}`) — distinct from "id introuvable"
              below, per Story 4.1's Always. Same inline-message pattern as
              `app/page.tsx`'s failed-`getActiveProject` branch: no
              `error.tsx` boundary, ever (Never). */}
          <p
            className="text-body"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {result.error}
          </p>
        </main>
      ) : result.data === null ? (
        <main style={{ padding: 'var(--space-gutter)' }}>
          {/* No row for this id (e.g. a stale or hand-typed URL) — a plain
              inline message, never Next's `notFound()`/404 page (Never). */}
          <p
            className="text-body"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Livrable introuvable.
          </p>
        </main>
      ) : (
        <>
          {/* spec-editeur-deux-panneaux.md — full-width header above both
              panes: title, and on a Drive livrable its actions and the
              "modifié dans Google Slides" banner. */}
          <div className="editor-header livrable-header">
            <h1 className="text-heading" style={{ margin: 0 }}>
              {result.data.title}
            </h1>
            {/* Story 5.3 / 5.5 — Drive livrables only: Réimporter, Enregistrer dans Drive. */}
            {result.data.source === 'drive' && result.data.driveMode !== 'demo' && (
              <DriveLivrableActions
                livrableId={result.data.id}
                driveFileId={result.data.driveFileId}
                connected={result.data.driveConnected}
                showConnectHint={result.data.driveMode === 'disconnected'}
                hasUnsavedChanges={hasUnsavedDriveChanges(result.data.blocks)}
              />
            )}
          </div>

          {/* spec-editeur-deux-panneaux.md — two panes (≥ 1100px): the
              document on the left, the AI panel on the right, each with
              its own scroll; stacked in one column below 1100px (D4). */}
          <div className="editor-panes">
            <main className="editor-document">
              <div className="card editor-document-card">
                {/* Rendered in `content.blocks`' own array order, keyed by
                    `block.id` — never the block's text — since Story 4.2's
                    anchored suggestions target this same stable id and it
                    must never be regenerated here (Always). Read-only: no
                    `<textarea>`/`contentEditable` anywhere on this content
                    (Never). */}
                {result.data.blocks.length === 0 ? (
                  // A valid livrable with zero blocks — same inline-message
                  // style as the "introuvable" branch above.
                  <p
                    className="text-body"
                    style={{ color: 'var(--color-text-secondary)', margin: 0 }}
                  >
                    Ce livrable ne contient aucun contenu pour le moment.
                  </p>
                ) : (
                  <LivrableBlocks
                    blocks={result.data.blocks}
                    bySlide={result.data.source === 'drive'}
                    activeSuggestionIdByAnchor={activeSuggestionIdByAnchor}
                  />
                )}
              </div>
            </main>

            <aside className="editor-ai-panel" aria-label="Panneau IA">
              {/* Story 4.2 (FR-24) — suggestions already persisted for this
                  livrable, in document order (D2). */}
              <SuggestionsPanel blocks={result.data.blocks} suggestions={suggestions} />

              {/* Story 4.4 (FR-23, UX-DR15) — révision globale, distincte des
                  suggestions ancrées ci-dessus, pinned at the bottom of the
                  AI panel. Story 5.4 — on a presentation imported from
                  Drive, the agent answers with anchored suggestions only
                  (AD-14). */}
              <div className="editor-ai-panel-footer">
                <GlobalRevisionField
                  livrableId={result.data.id}
                  zoneByZone={result.data.source === 'drive'}
                />
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

// One paragraph of the livrable, tinted while an anchored suggestion
// targets it. spec-editeur-deux-panneaux.md: its `¶N` sits in the left
// margin (same numbering as `resolveAnchorPosition`); on a targeted
// paragraph the marker is a button to its suggestion card. The paragraph
// itself carries `id="block-{id}"` and `tabIndex={-1}` so a card's marker
// can bring it into view and focus it.
function BlockParagraph({
  block,
  position,
  isActiveTarget,
  activeSuggestionId,
}: {
  block: LivrableBlock;
  position: number;
  isActiveTarget: boolean;
  activeSuggestionId: string | undefined;
}) {
  return (
    <div className="editor-block">
      {activeSuggestionId ? (
        <JumpButton
          targetId={`suggestion-${activeSuggestionId}`}
          label={`Voir la suggestion pour ¶${position}`}
          className="editor-block-marker text-caption"
        >
          ¶{position}
        </JumpButton>
      ) : (
        // Decorative here: read aloud before every paragraph otherwise.
        <span className="editor-block-marker text-caption" aria-hidden="true">
          ¶{position}
        </span>
      )}
      <p
        id={`block-${block.id}`}
        tabIndex={-1}
        className={
          isActiveTarget ? 'text-body ai-tint-block' : 'text-body'
        }
      >
        {/* A Slides soft line break (vertical tab) shows as a line break. */}
        {block.text.replace(/\u000b/g, '\n')}
        {/* Non-visual counterpart to the tint (bmad-review
            blind-hunter finding, oneshot pass): the color
            alone conveys nothing to a screen reader. A child span (not
            `aria-label` on the `<p>` itself, which would replace the
            paragraph's own text as its accessible name instead of adding
            to it) appends this without being seen. */}
        {isActiveTarget && (
          <span className="sr-only">
            {' '}
            (suggestion IA en attente)
          </span>
        )}
      </p>
    </div>
  );
}

// Rendered in `content.blocks`' own array order, keyed by `block.id`.
// Story 5.3 — a presentation imported from Drive is read slide by slide,
// under "Diapositive N" headings; `¶N` numbering runs across slides.
function LivrableBlocks({
  blocks,
  bySlide,
  activeSuggestionIdByAnchor,
}: {
  blocks: LivrableBlock[];
  bySlide: boolean;
  activeSuggestionIdByAnchor: Map<string, string>;
}) {
  // 1-based position in the stored array — the same numbering as
  // `resolveAnchorPosition` (domain/suggestion.ts), computed once.
  const positions = new Map(blocks.map((block, index) => [block.id, index + 1]));
  const renderBlock = (block: LivrableBlock) => (
    <BlockParagraph
      key={block.id}
      block={block}
      position={positions.get(block.id) ?? 0}
      isActiveTarget={activeSuggestionIdByAnchor.has(block.id)}
      activeSuggestionId={activeSuggestionIdByAnchor.get(block.id)}
    />
  );
  if (!bySlide) return <>{blocks.map(renderBlock)}</>;
  return (
    <>
      {groupBlocksBySlide(blocks).map((group) => (
        <section
          key={`slide-${group.slideNumber}`}
          className="livrable-slide"
          aria-label={`Diapositive ${group.slideNumber}`}
        >
          <h2 className="text-label">Diapositive {group.slideNumber}</h2>
          {group.blocks.map(renderBlock)}
        </section>
      ))}
    </>
  );
}
