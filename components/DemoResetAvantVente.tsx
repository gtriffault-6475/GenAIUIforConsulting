'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { resetAvantVenteWorkflow } from '@/actions/demo';

// spec-simulation-demarrage-avant-vente.md. Demo-only tool, mounted by
// `app/page.tsx` right after `<Stepper />`, under the same
// `activeProject.type === 'avant-vente'` condition — never rendered for a
// `mission` project. Destructive and irreversible (wipes this project's
// CONVERSATION/MESSAGE rows, then immediately recreates a first-step
// conversation — `actions/demo.ts`'s `resetAvantVenteWorkflow`), so it is
// the app's first flow that needs a confirmation step before acting: no
// existing confirmation surface to reuse (no other action in this app is
// destructive), so a native `window.confirm()` is enough for a demo tool —
// not `OverlayProvider` (AD-8 governs floating surfaces this app renders
// itself, not the browser's own native dialog). Its text enumerates
// exactly what gets erased (conversations and messages only, per this
// spec's revised Décision — never "livrables"/"suggestions", which this
// action no longer touches at all).
//
// Same shape as `Stepper.tsx`/`GlobalRevisionField.tsx`: `useTransition` +
// a synchronous `busyRef` re-entrancy guard (closes the window
// `isPending` alone leaves open between a click and React's next commit)
// + `router.refresh()` on success so the Stepper, ConversationList, etc.
// all reflect the freshly recreated first-step conversation immediately —
// landing the consultant straight on the proactive suggestion.
export function DemoResetAvantVente({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busyRef = useRef(false);

  function handleReset() {
    if (isPending || busyRef.current) return;

    const confirmed = window.confirm(
      'Réinitialiser cette avant-vente supprime définitivement ses ' +
        'conversations et ses messages, puis recrée immédiatement la ' +
        'conversation de la première étape. Cette action est ' +
        'irréversible. Continuer ?',
    );
    if (!confirmed) return;

    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await resetAvantVenteWorkflow(projectId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        // Defense-in-depth: `resetAvantVenteWorkflow` always resolves to an
        // `ActionResult` today, but a rejected promise (e.g. a
        // transport-level failure of the Server Action call itself) must
        // still surface something rather than vanish as an unhandled
        // rejection.
        console.error('DemoResetAvantVente: resetAvantVenteWorkflow call failed', err);
        setError('Une erreur est survenue lors de la réinitialisation.');
      } finally {
        busyRef.current = false;
      }
    });
  }

  return (
    <div className="demo-reset-avant-vente">
      <button
        type="button"
        className="button-later"
        disabled={isPending}
        onClick={handleReset}
      >
        Réinitialiser cette avant-vente (démo)
      </button>

      {error && (
        <p className="text-caption" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
