'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import { reimportPresentation } from '@/actions/livrable';

// Story 5.3 — "Réimporter" (AD-13), the secondary action of a drive
// livrable's header in the Éditeur assisté. Explicit only: it replaces the
// blocks with the presentation as it is now in Drive. When a block was
// modified in the app (`hasLocalChanges`, from `domain/livrable.ts`'s
// `isBlockModified`), the page already shows a warning and this asks for
// an inline confirmation before calling the server with
// `discardLocalChanges`; the server re-checks and may still ask for it
// (`needsConfirmation`). Outside the `connected` mode the button stays
// focusable but inactive (`aria-disabled`), described by "Connectez Google
// Drive pour enregistrer." States are announced as text, never by color
// alone. Reentrancy: synchronous `busyRef` guard, same shape as
// `GlobalRevisionField.tsx`.
export function ReimportPresentation({
  livrableId,
  connected,
  hasLocalChanges,
}: {
  livrableId: string;
  connected: boolean;
  hasLocalChanges: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busyRef = useRef(false);
  const offlineId = useId();

  function run(discardLocalChanges: boolean) {
    if (isPending || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setDone(false);
    startTransition(async () => {
      try {
        const result = await reimportPresentation(livrableId, discardLocalChanges);
        if (!result.ok) {
          setConfirming(false);
          setError(result.error);
          router.refresh();
          return;
        }
        if (result.data.needsConfirmation) {
          setConfirming(true);
          router.refresh();
          return;
        }
        setConfirming(false);
        setDone(true);
        router.refresh();
      } catch (callError) {
        console.error('ReimportPresentation: reimportPresentation call failed', callError);
        setConfirming(false);
        setError('Impossible de réimporter cette présentation.');
      } finally {
        busyRef.current = false;
      }
    });
  }

  function handleClick() {
    if (!connected || isPending || busyRef.current) return;
    if (hasLocalChanges) {
      setError(null);
      setDone(false);
      setConfirming(true);
      return;
    }
    run(false);
  }

  return (
    <div className="reimport-presentation">
      {!confirming && (
        <button
          type="button"
          className="button-neutral"
          onClick={handleClick}
          aria-disabled={!connected || isPending}
          aria-describedby={connected ? undefined : offlineId}
        >
          {isPending ? 'Réimport en cours…' : 'Réimporter'}
        </button>
      )}

      {!connected && (
        <p id={offlineId} className="text-caption">
          Connectez Google Drive pour enregistrer.
        </p>
      )}

      {confirming && (
        <div className="reimport-confirm" role="group" aria-label="Confirmer le réimport">
          <p className="text-caption">
            Les changements acceptés qui ne sont pas enregistrés dans Drive seront remplacés
            par le texte actuel de la présentation.
          </p>
          <div className="reimport-confirm-actions">
            <button
              type="button"
              className="button-neutral"
              onClick={() => run(true)}
              aria-disabled={isPending}
            >
              {isPending ? 'Réimport en cours…' : 'Réimporter quand même'}
            </button>
            <button
              type="button"
              className="button-later"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {done && (
        <p className="text-caption" role="status">
          Présentation réimportée depuis Drive.
        </p>
      )}
      {error && (
        <p className="text-caption" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
