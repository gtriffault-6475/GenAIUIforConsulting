'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { getStartingSuggestion, selectStep } from '@/actions/conversation';

// Story 3.3 — Suggestion proactive de démarrage. Rendered by `app/page.tsx`
// only when its display condition holds (avant-vente project, active
// conversation attached to a step, zero messages), with `key={conversation.id}`
// so a fresh instance mounts per conversation — the same pattern
// `Composer.tsx` already uses to reset local state on conversation change.
// `status`/`suggestion` live only in this component's `useState` (AD-7):
// masked or accepted is never written anywhere, so a `router.refresh()` in
// the same conversation does not remount this component (same `key`) and
// the suggestion stays hidden, while switching conversation or reloading
// the page creates a fresh instance that shows it again if the condition
// still holds.
//
// `getStartingSuggestion` (a real, billed Anthropic call) is deliberately
// called from here, once, in a `useEffect` on mount — never from
// `app/page.tsx`'s Server Component render. Calling it there would block
// the whole page behind a live agent call and would re-run it on every
// unrelated `router.refresh()` (e.g. another panel refreshing the page)
// for as long as the conversation stays empty. Fetching it once per mount
// here relies on exactly the same `key={conversation.id}` guarantee that
// already makes the masked/accepted state not survive a conversation
// switch (see above) — a `router.refresh()` within the same conversation
// does not remount this component, so it does not re-fetch either.
export function ProactiveSuggestion({
  projectId,
  stepKey,
  stepLabel,
}: {
  projectId: string;
  stepKey: string;
  stepLabel: string;
}) {
  const [status, setStatus] = useState<'loading' | 'visible' | 'hidden'>('loading');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Same reasoning as `Composer.tsx`'s `sendingRef`/`Stepper.tsx`'s
  // synchronous guard: `isPending` only updates on React's next
  // render/commit, which is not synchronous with the click that triggers
  // it — a fast double-click before that commit would otherwise call
  // `selectStep` twice.
  const acceptingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getStartingSuggestion(projectId, stepLabel)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSuggestion(result.data);
          setStatus('visible');
        } else {
          // A failed generation stays silent per the spec's Boundaries —
          // no card, no visible error; `getStartingSuggestion` already
          // logged it server-side.
          setStatus('hidden');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('ProactiveSuggestion: getStartingSuggestion call failed', error);
        setStatus('hidden');
      });

    return () => {
      cancelled = true;
    };
    // Intentionally empty: this must run exactly once per mount (per
    // conversation, via the parent's `key`), never re-fetch on a
    // re-render — `projectId`/`stepLabel` are fixed for the lifetime of a
    // given mount (they change only via the `key`-driven remount above).
  }, []);

  if (status !== 'visible' || suggestion === null) return null;

  function handleLater() {
    if (isPending || acceptingRef.current) return;
    // No server call at all (spec's I/O matrix: "Carte masquée, aucun
    // appel serveur") — purely local state.
    setStatus('hidden');
  }

  function handleAccept() {
    if (isPending || acceptingRef.current) return;

    acceptingRef.current = true;
    // Masked immediately and unconditionally: the spec's I/O matrix says
    // a failed `selectStep` still leaves the card masked client-side
    // ("pas de blocage") rather than restoring it and letting the
    // consultant retry — the step this reasserts is already active
    // regardless, so there is nothing a retry would gain.
    setStatus('hidden');

    startTransition(async () => {
      try {
        // Reasserts the already-active step via the same find-or-create
        // mechanism as `Stepper.tsx` (Story 3.1) — never a new mutation
        // path. Only `router.refresh()` on success; a failure is logged
        // and otherwise silent, matching this action's own error-handling
        // shape elsewhere (no visible error for a background reassertion).
        const result = await selectStep(projectId, stepKey);
        if (result.ok) {
          router.refresh();
        } else {
          console.error('ProactiveSuggestion: selectStep failed', result.error);
        }
      } finally {
        acceptingRef.current = false;
      }
    });
  }

  return (
    <section className="ai-suggestion-card" aria-label="Suggestion de démarrage">
      <p className="text-body" style={{ margin: 0 }}>
        {suggestion}
      </p>
      <div className="ai-suggestion-card-actions">
        <button
          type="button"
          className="button-primary"
          disabled={isPending}
          onClick={handleAccept}
        >
          Oui, commençons
        </button>
        <button
          type="button"
          className="button-later"
          disabled={isPending}
          onClick={handleLater}
        >
          Plus tard
        </button>
      </div>
    </section>
  );
}
