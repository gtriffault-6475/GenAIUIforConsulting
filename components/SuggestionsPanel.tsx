import type { SuggestionSummary } from '@/actions/suggestion';
import { AcceptAllSuggestions } from '@/components/AcceptAllSuggestions';
import { SuggestionCard } from '@/components/SuggestionCard';
import {
  acceptableSuggestions,
  countPending,
  orderSuggestionsByAnchor,
} from '@/domain/suggestion';

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
//
// spec-editeur-deux-panneaux.md — the top of the editor's right-hand AI
// panel: a header ("Suggestions de l'IA", "N en attente"), then the cards
// in document order (D2, `orderSuggestionsByAnchor`) in their own scroll
// area, or an empty-panel message. `GlobalRevisionField` sits below this,
// pinned at the bottom of the panel (`app/livrables/[id]/page.tsx`).
//
// spec-moins-de-clics.md — the header is rendered by the client
// `AcceptAllSuggestions` ("Tout accepter" next to "N en attente", its inline
// confirmation and outcome below), given the count of suggestions it can
// accept (`acceptableSuggestions`, the same rule as the server action).
export function SuggestionsPanel({
  livrableId,
  blocks,
  suggestions,
}: {
  livrableId: string;
  blocks: { id: string; text: string }[];
  suggestions: SuggestionSummary[];
}) {
  const ordered = orderSuggestionsByAnchor(blocks, suggestions);
  const pending = countPending(suggestions);
  const acceptableCount = acceptableSuggestions(blocks, suggestions).length;

  return (
    <div className="editor-ai-suggestions">
      <AcceptAllSuggestions
        livrableId={livrableId}
        acceptableCount={acceptableCount}
        heading={
          <h2 className="text-body-strong" style={{ margin: 0 }}>
            Suggestions de l&rsquo;IA
          </h2>
        }
        meta={
          suggestions.length > 0 ? (
            <span className="text-caption" role="status">
              {pending} en attente
            </span>
          ) : null
        }
      />
      <div className="editor-ai-list">
        {ordered.length === 0 ? (
          <p className="text-body" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Aucune suggestion pour le moment. Demandez une révision ci-dessous.
          </p>
        ) : (
          ordered.map((item) => (
            <SuggestionCard key={item.id} blocks={blocks} suggestion={item} />
          ))
        )}
      </div>
    </div>
  );
}
