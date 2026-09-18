import type { SuggestionSummary } from '@/actions/suggestion';
import { SuggestionCard } from '@/components/SuggestionCard';

// Story 4.2 (FR-24) introduced this as a Server Component that rendered
// each suggestion itself, read-only. Story 4.3 (FR-21) turns it into a
// plain server wrapper that only renders one `SuggestionCard` per
// suggestion — all rendering logic (anchor resolution, status-dependent
// display, the three actions) now lives in that client component, since
// treating a suggestion needs interactivity this Server Component cannot
// provide. Still no read of its own: `app/livrables/[id]/page.tsx` already
// read `listSuggestions(id)` before rendering this, so nothing here
// triggers an agent call or a fresh DB read — the "instantané, aucun appel
// IA visible au chargement" guarantee from Story 4.2 still holds.
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
      {suggestions.map((item) => (
        <SuggestionCard key={item.id} blocks={blocks} suggestion={item} />
      ))}
    </div>
  );
}
