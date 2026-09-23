'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import {
  acceptSuggestion,
  rejectSuggestion,
  reworkSuggestion,
} from '@/actions/suggestion';
import type { SuggestionSummary } from '@/actions/suggestion';
import { useOverlay } from '@/components/OverlayProvider';
import { resolveAnchorPosition } from '@/domain/suggestion';

// Story 4.3 — Traitement d'une suggestion ancrée (FR-21). Client component:
// one card per suggestion, replacing `SuggestionsPanel.tsx`'s own
// read-only rendering (Story 4.2) with the three actions Accepter/
// Rejeter/Retravailler. `button-ai-primary` (DESIGN.md, UX-DR4) finds its
// first real consumers here — Accepter and "Envoyer la demande de
// retravail" only (Always); Rejeter and the Retravailler trigger stay
// `.button-later`, the same neutral secondary style `ProactiveSuggestion`
// already uses for "Plus tard" — neither is an AI-originated action.
//
// The rework field is a real `OverlayProvider` floating surface (AD-8), one
// id per suggestion (`rework-${id}`) — never a local `isOpen` boolean, so
// opening one suggestion's rework field or the composer's model dropdown
// automatically closes any other already-open floating surface.
//
// Reentrancy: a synchronous `busyRef` guard, same shape as
// `Composer.tsx`'s `sendingRef`/`Stepper.tsx`'s `isPending` check — closes
// the residual window `useTransition`'s `isPending` alone leaves open
// between a click and React's next commit. One ref is shared across all
// three actions since only one may ever be in flight for a given card at
// a time.
export function SuggestionCard({
  blocks,
  suggestion,
}: {
  blocks: { id: string; text: string }[];
  suggestion: SuggestionSummary;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const [reworkText, setReworkText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busyRef = useRef(false);

  const overlayId = `rework-${suggestion.id}`;
  const isReworkOpen = isOverlayOpen(overlayId);

  const isResolved =
    suggestion.status === 'accepted' || suggestion.status === 'rejected';

  // `anchorRef` is a block id, never a position (epic-4-context.md's
  // Technical Decisions) — resolved to a display position at render time
  // against the livrable's current blocks. spec-position-figee-suggestions-
  // resolues: once a suggestion is `accepted`/`rejected`, prefer the
  // `resolvedPosition` frozen at that transition — it never degrades even
  // after a global revision regenerates every block id, unlike live
  // resolution below. Falls back to live resolution (via `anchorRef`) for
  // `pending`/`revising` suggestions (unchanged behavior), and also for an
  // already-resolved suggestion whose `resolvedPosition` is still `null`
  // (resolved before this column existed — no backfill, same degrade-to-
  // live-then-possibly-bare-`¶` behavior as before this feature).
  const position =
    isResolved && suggestion.resolvedPosition !== null
      ? suggestion.resolvedPosition
      : suggestion.anchorRef
        ? resolveAnchorPosition(blocks, suggestion.anchorRef)
        : null;
  const anchorLabel = position !== null ? `¶${position}` : '¶';

  function handleAccept() {
    if (isPending || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await acceptSuggestion(suggestion.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        // Defense-in-depth: `acceptSuggestion` always resolves to an
        // `ActionResult` today, but a rejected promise (e.g. a transport-
        // level failure of the Server Action call itself) must still
        // surface something rather than vanish as an unhandled rejection.
        console.error('SuggestionCard: acceptSuggestion call failed', error);
        setError('Une erreur est survenue lors du traitement de cette suggestion.');
      } finally {
        busyRef.current = false;
      }
    });
  }

  function handleReject() {
    if (isPending || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        // No confirmation (Never: "Aucune confirmation sur Rejeter") — the
        // document is unchanged either way, so there is nothing this
        // action could destroy that a confirmation would protect.
        const result = await rejectSuggestion(suggestion.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        // Same defense-in-depth as `handleAccept` above.
        console.error('SuggestionCard: rejectSuggestion call failed', error);
        setError('Une erreur est survenue lors du traitement de cette suggestion.');
      } finally {
        busyRef.current = false;
      }
    });
  }

  function handleToggleRework() {
    if (isPending || busyRef.current) return;
    if (isReworkOpen) {
      closeOverlay();
    } else {
      setError(null);
      openOverlay(overlayId);
    }
  }

  function handleSubmitRework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || busyRef.current) return;

    const trimmed = reworkText.trim();
    if (!trimmed) {
      // Blocked client-side, no Server Action call — matches the spec's
      // "Instructions non vides" precondition.
      return;
    }

    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await reworkSuggestion(suggestion.id, trimmed);
        if (!result.ok) {
          // Suggestion is already back to `pending`+ancien texte
          // server-side (Always) — keep the field open with the typed
          // instructions and the error so the consultant can retry rather
          // than losing what they wrote.
          setError(result.error);
          return;
        }
        setReworkText('');
        closeOverlay();
        router.refresh();
      } catch (error) {
        // Same defense-in-depth as `handleAccept`/`handleReject` above.
        console.error('SuggestionCard: reworkSuggestion call failed', error);
        setError('Une erreur est survenue lors du retravail de cette suggestion.');
      } finally {
        busyRef.current = false;
      }
    });
  }

  return (
    <section
      className="ai-suggestion-card"
      aria-label={`Suggestion ancrée, paragraphe ${anchorLabel}`}
    >
      <p
        className="text-body-strong"
        style={{ margin: 0, color: 'var(--color-ai-accent)' }}
      >
        {anchorLabel}
      </p>
      <p
        className={isResolved ? 'text-body ai-suggestion-card-resolved-text' : 'text-body'}
        style={{ margin: 0 }}
      >
        {suggestion.text}
      </p>

      {suggestion.status === 'pending' && (
        <div
          className="ai-suggestion-card-actions suggestion-rework-wrap"
          // `contentRef` covers the whole actions row (trigger button
          // included), not just the floating field — same reasoning as
          // `Composer.tsx`'s `model-selector`/`SkillsPanel.tsx`'s
          // `skill-add-entry-wrap`: otherwise a click on "Retravailler"
          // while its own field is open registers as "outside" to
          // `OverlayProvider` and closes it just before the button's own
          // handler would reopen it.
          ref={isReworkOpen ? contentRef : undefined}
        >
          <button
            type="button"
            className="button-ai-primary"
            disabled={isPending}
            onClick={handleAccept}
          >
            Accepter
          </button>
          <button
            type="button"
            className="button-later"
            disabled={isPending}
            onClick={handleReject}
          >
            Rejeter
          </button>
          <button
            type="button"
            className="button-later"
            aria-expanded={isReworkOpen}
            disabled={isPending}
            onClick={handleToggleRework}
          >
            Retravailler
          </button>

          {isReworkOpen && (
            <form
              onSubmit={handleSubmitRework}
              className="card rework-field"
              aria-label="Retravailler cette suggestion"
            >
              <textarea
                aria-label="Précisions pour retravailler cette suggestion"
                placeholder="Précisez ce qui doit changer…"
                value={reworkText}
                onChange={(event) => setReworkText(event.target.value)}
                disabled={isPending}
              />
              <button
                type="submit"
                className="button-ai-primary"
                disabled={isPending || reworkText.trim() === ''}
              >
                Envoyer la demande de retravail
              </button>
            </form>
          )}
        </div>
      )}

      {suggestion.status === 'revising' && (
        <p className="text-caption" style={{ margin: 0 }}>
          Nouvelle proposition en cours de génération.
        </p>
      )}

      {isResolved && (
        <div className="ai-suggestion-status">
          {suggestion.status === 'accepted' && (
            <svg
              className="ai-suggestion-status-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="3"
              aria-hidden="true"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
          <span className="text-caption" style={{ margin: 0 }}>
            {suggestion.status === 'accepted' ? 'Acceptée' : 'Rejetée'}
          </span>
        </div>
      )}

      {error && (
        <p className="text-caption" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
