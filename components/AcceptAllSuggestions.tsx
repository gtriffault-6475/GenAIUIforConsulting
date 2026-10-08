'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';

import { acceptAllSuggestions } from '@/actions/suggestion';

// spec-moins-de-clics.md — "Tout accepter" in the AI panel header. Renders
// the whole header (its `heading` and `meta` — "N en attente" — come from
// `SuggestionsPanel`) so the button, the inline confirmation and the
// outcome below the header share one state.
// - The button shows only when at least two suggestions can be accepted
//   (`acceptableSuggestions`, domain — one is "Accepter" on its card).
//   `.button-ai-primary`: it applies AI content (DESIGN.md).
// - Confirmation inline under the header, never a modal (AD-8): D1's text
//   with the count, "Tout accepter" (autofocus) and "Annuler"; Échap cancels.
// - Busy guard as in `SuggestionCard.tsx` (ref + `useTransition`). Card
//   buttons stay enabled: the server skips what is no longer pending.
// - Outcome in a `role="status"` region, then `router.refresh()`.
export function AcceptAllSuggestions({
  livrableId,
  acceptableCount,
  heading,
  meta,
}: {
  livrableId: string;
  acceptableCount: number;
  heading: ReactNode;
  meta: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busyRef = useRef(false);

  const canAcceptAll = acceptableCount >= 2;

  // A card action can drop the count below 2 while the confirmation is
  // open: close it, so it does not come back on its own later.
  useEffect(() => {
    if (!canAcceptAll) setConfirming(false);
  }, [canAcceptAll]);

  function handleOpen() {
    if (isPending || busyRef.current) return;
    setOutcome(null);
    setError(null);
    setConfirming(true);
  }

  function handleCancel() {
    if (busyRef.current) return;
    setConfirming(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  }

  function handleConfirm() {
    if (isPending || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await acceptAllSuggestions(livrableId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const { accepted, remaining } = result.data;
        const acceptedText =
          accepted === 0
            ? 'Aucune suggestion à accepter.'
            : `${accepted} ${accepted > 1 ? 'acceptées' : 'acceptée'}.`;
        const remainingText =
          remaining === 0
            ? ''
            : ` ${remaining} ${remaining === 1 ? 'reste' : 'restent'} à traiter.`;
        setOutcome(`${acceptedText}${remainingText}`);
        setConfirming(false);
        router.refresh();
      } catch (callError) {
        // Same defense-in-depth as `SuggestionCard.tsx`: a transport-level
        // failure of the Server Action call still surfaces a message.
        console.error('AcceptAllSuggestions: acceptAllSuggestions call failed', callError);
        setError("Impossible d'accepter les suggestions. Réessayez.");
      } finally {
        busyRef.current = false;
      }
    });
  }

  return (
    <div className="editor-ai-panel-top">
      <div className="editor-ai-panel-header">
        {heading}
        <div className="editor-ai-panel-header-actions">
          {meta}
          {canAcceptAll && (
            <button
              type="button"
              className="button-ai-primary button-compact"
              aria-expanded={confirming}
              disabled={isPending}
              onClick={handleOpen}
            >
              Tout accepter
            </button>
          )}
        </div>
      </div>

      {confirming && canAcceptAll && (
        <div
          className="editor-ai-accept-all-confirm"
          role="alertdialog"
          aria-label="Confirmer l'acceptation de toutes les suggestions"
          onKeyDown={handleKeyDown}
        >
          <p className="text-caption" style={{ margin: 0 }}>
            Accepter les {acceptableCount} suggestions en attente ? Leur texte remplace celui des
            paragraphes.
          </p>
          <div className="drive-actions-confirm-buttons">
            <button
              type="button"
              className="button-ai-primary"
              disabled={isPending}
              onClick={handleConfirm}
              autoFocus
            >
              Tout accepter
            </button>
            <button
              type="button"
              className="button-later"
              disabled={isPending}
              onClick={handleCancel}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite">
        {outcome && (
          <p className="text-caption editor-ai-accept-all-outcome">{outcome}</p>
        )}
      </div>
      {error && (
        <p className="text-caption editor-ai-accept-all-outcome" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
