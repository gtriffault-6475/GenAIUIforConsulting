import type { SuggestionSummary } from '@/actions/suggestion';
import { resolveAnchorPosition } from '@/domain/suggestion';

// Story 4.2 — Génération des suggestions ancrées à l'écriture (FR-24).
// Server Component: `app/livrables/[id]/page.tsx` already read
// `listSuggestions(id)` before rendering this, so nothing here triggers an
// agent call or even a fresh DB read of its own — the "instantané, aucun
// appel IA visible au chargement" Acceptance Criterion is satisfied purely
// by that caller-side sequencing.
//
// Read-only: no Accepter/Rejeter/Retravailler button anywhere (Never —
// that UI, and the `button-ai-primary` it would use, is Story 4.3). Reuses
// `ai-suggestion-card` exactly as Story 3.3 defined it (full `ai-tint`
// fill, no colored border) — no new CSS class for this component (Code
// Map). Suggestions are stacked in one column below the livrable's content
// card (Never: "une seule colonne — le panneau latéral dédié... différé à
// 4.3"), never a side panel in this story.
export function SuggestionsPanel({
  blocks,
  suggestions,
}: {
  blocks: { id: string; text: string }[];
  suggestions: SuggestionSummary[];
}) {
  if (suggestions.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {suggestions.map((item) => {
        // `anchorRef` is a block id, never a position (epic-4-context.md's
        // Technical Decisions) — resolved to a display position only here,
        // at render time, against the livrable's current blocks.
        // `resolveAnchorPosition` returns `null` when it can't find a
        // match; not reachable from this story's own write path (every
        // suggestion this story creates anchors to a block from the same
        // transaction), but a future regeneration could leave a stale ref,
        // so this falls back to a bare `¶` rather than crashing.
        const position = item.anchorRef
          ? resolveAnchorPosition(blocks, item.anchorRef)
          : null;
        const anchorLabel = position !== null ? `¶${position}` : '¶';

        return (
          <section
            key={item.id}
            className="ai-suggestion-card"
            aria-label={`Suggestion ancrée, paragraphe ${anchorLabel}`}
          >
            <p
              className="text-body-strong"
              style={{ margin: 0, color: 'var(--color-ai-accent)' }}
            >
              {anchorLabel}
            </p>
            <p className="text-body" style={{ margin: 0 }}>
              {item.text}
            </p>
          </section>
        );
      })}
    </div>
  );
}
