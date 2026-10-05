'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { reimportDriveLivrable } from '@/actions/livrable';

// Story 5.3 — "Réimporter" (EXPERIENCE.md): a secondary, explicit action in
// the editor header of a Drive livrable that reloads the Drive version.
// When accepted changes are not saved to Drive yet (`hasUnsavedChanges`,
// computed by `domain/livrable.ts`), an inline confirmation comes first —
// no browser dialog; the action re-checks on its side and asks for this
// same confirmation if changes were accepted after the page rendered.
// Disabled outside the `connected` mode, with the connect hint only when
// connecting would help (`disconnected`); never rendered in demo mode
// (no Google wording there — the page skips it).
export function ReimportButton({
  livrableId,
  canReimport,
  showConnectHint,
  hasUnsavedChanges,
}: {
  livrableId: string;
  canReimport: boolean;
  showConnectHint: boolean;
  hasUnsavedChanges: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reimport(confirmed: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await reimportDriveLivrable(livrableId, confirmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.needsConfirmation) {
        setConfirming(true);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="reimport">
      <button
        type="button"
        className="button-later reimport-trigger"
        disabled={!canReimport || isPending}
        onClick={() => (hasUnsavedChanges ? setConfirming(true) : reimport(false))}
      >
        {isPending ? 'Réimport…' : 'Réimporter'}
      </button>
      {!canReimport && showConnectHint && (
        <p className="text-caption">Connectez Google Drive pour enregistrer.</p>
      )}
      {confirming && canReimport && (
        <div className="reimport-confirm" role="alertdialog" aria-label="Confirmer le réimport">
          <p className="text-caption">
            Des changements acceptés ne sont pas encore enregistrés dans Drive. Réimporter les
            remplace par la version Drive.
          </p>
          <div className="reimport-confirm-actions">
            <button type="button" className="button-primary" disabled={isPending} onClick={() => reimport(true)}>
              Réimporter quand même
            </button>
            <button
              type="button"
              className="button-later"
              disabled={isPending}
              onClick={() => setConfirming(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-caption context-panel-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
