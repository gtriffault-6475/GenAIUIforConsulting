'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import { requestGlobalRevision } from '@/actions/livrable';

// Story 4.4 — Révision globale (FR-23, UX-DR15, AD-10). Client component,
// rendered below `SuggestionsPanel` at the bottom of the Éditeur assisté's
// AI panel — distinct from the anchored suggestions above it, since it
// never targets a precise paragraph (epic-4-context.md). Submitting posts
// the instructions as a user message into the livrable's own origin
// conversation (`actions/livrable.ts`'s `requestGlobalRevision`, AD-10) —
// never a new conversation, and no anchored SUGGESTION is ever created
// here directly: the agent's reply, if it produces one, goes through the
// same `propose_livrable_content` mechanism as Story 4.2.
//
// A plain inline form, never an `OverlayProvider` surface (Always: "un
// seul existe, en bas du panneau, rien à empiler par-dessus") — unlike
// `SuggestionCard.tsx`'s rework field, this one has nothing to close or
// stack against. Submit button is `.button-primary`, never
// `.button-ai-primary`: submitting a global revision request is a purely
// user action, not one that applies AI-originated content (Always). No
// model selector either — always `MODELS[0].id`, resolved server-side by
// `requestGlobalRevision` itself, same motif as the rework field (Story
// 4.3) not exposing one.
//
// Reentrancy: synchronous `busyRef` guard, same shape as
// `Composer.tsx`/`SuggestionCard.tsx` — closes the residual window
// `useTransition`'s `isPending` alone leaves open between a click and
// React's next commit.
export function GlobalRevisionField({ livrableId }: { livrableId: string }) {
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busyRef = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || busyRef.current) return;

    const trimmed = instructions.trim();
    if (!trimmed) {
      // Blocked entirely client-side, no Server Action call — matches the
      // spec's "Instructions vides ou espaces seuls" row.
      return;
    }

    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestGlobalRevision(livrableId, trimmed);

        if (!result.ok) {
          // Refused outright (no conversation d'origine, livrable
          // introuvable, etc.) — keep the typed instructions, nothing was
          // ever posted.
          setError(result.error);
          return;
        }

        // Past this point the instructions are durably posted as a user
        // message in the livrable's conversation either way (mirrors
        // `Composer.tsx`'s own `sendMessage` handling) — clear the field
        // regardless, then surface only the agent's own failure, if any.
        setInstructions('');
        if (result.data.assistantFailed) {
          setError(
            result.data.error ?? "L'agent n'a pas pu traiter cette révision.",
          );
        }
        router.refresh();
      } catch (error) {
        // Defense-in-depth: `requestGlobalRevision` always resolves to an
        // `ActionResult` today, but a rejected promise (e.g. a transport-
        // level failure of the Server Action call itself) must still
        // surface something rather than vanish as an unhandled rejection.
        console.error(
          'GlobalRevisionField: requestGlobalRevision call failed',
          error,
        );
        setError(
          'Une erreur est survenue lors de la soumission de cette révision.',
        );
      } finally {
        busyRef.current = false;
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Demander une révision globale"
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-panel-padding)',
      }}
    >
      <label
        className="text-body-strong"
        htmlFor="global-revision-instructions"
      >
        Révision globale
      </label>
      <textarea
        id="global-revision-instructions"
        aria-label="Instructions pour une révision globale du livrable"
        placeholder="Décrivez l'ajustement d'ensemble souhaité…"
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        disabled={isPending}
      />
      <button
        type="submit"
        className="button-primary"
        disabled={isPending || instructions.trim() === ''}
      >
        Soumettre
      </button>

      {error && (
        <p className="text-caption" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
