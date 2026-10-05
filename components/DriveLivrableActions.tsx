'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { reimportDriveLivrable, saveLivrableToDrive } from '@/actions/livrable';

// Story 5.3 / 5.5 — editor header actions of a livrable imported from
// Google Slides (EXPERIENCE.md "Enregistrer dans Drive", "Réimporter").
// - "Enregistrer dans Drive": neutral primary button (`.button-primary`,
//   the navy accent — never the AI purple), disabled while no
//   zone is modified (`hasUnsavedChanges`, from `domain/livrable.ts`);
//   an inline reminder about formatting comes before any write.
// - "Réimporter": secondary; an inline confirmation first when accepted
//   changes are not saved yet (re-checked by the action itself).
// Both disabled outside the `connected` mode, with the connect hint only
// when connecting would help; the page never renders this in demo mode.
// Outcomes are announced in text, never by color alone.
type Pending = 'save' | 'reimport' | null;

const CONFLICT_MESSAGE =
  "Ce fichier a été modifié dans Google Slides depuis l'import. Réimportez-le pour repartir de la dernière version.";

export function DriveLivrableActions({
  livrableId,
  connected,
  showConnectHint,
  hasUnsavedChanges,
}: {
  livrableId: string;
  connected: boolean;
  showConnectHint: boolean;
  hasUnsavedChanges: boolean;
}) {
  const [confirming, setConfirming] = useState<Pending>(null);
  const [running, setRunning] = useState<Pending>(null);
  const [status, setStatus] = useState<'saved' | 'conflict' | 'nothing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // A later accepted change makes the deck unsaved again: drop a stale
  // "Enregistré dans Drive." next to the re-enabled button.
  useEffect(() => {
    if (hasUnsavedChanges) setStatus((current) => (current === 'saved' ? null : current));
  }, [hasUnsavedChanges]);

  function save() {
    setError(null);
    setStatus(null);
    setConfirming(null);
    setRunning('save');
    startTransition(async () => {
      const result = await saveLivrableToDrive(livrableId);
      setRunning(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.status === 'conflict') {
        setStatus('conflict');
        return;
      }
      setStatus(result.data.status);
      router.refresh();
    });
  }

  function reimport(confirmed: boolean) {
    setError(null);
    setStatus(null);
    setRunning('reimport');
    startTransition(async () => {
      const result = await reimportDriveLivrable(livrableId, confirmed);
      setRunning(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.needsConfirmation) {
        setConfirming('reimport');
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  const requestReimport = () => (hasUnsavedChanges ? setConfirming('reimport') : reimport(false));

  return (
    <div className="drive-actions">
      <div className="drive-actions-buttons">
        <button
          type="button"
          className="button-later"
          disabled={!connected || isPending}
          onClick={requestReimport}
        >
          {running === 'reimport' ? 'Réimport…' : 'Réimporter'}
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={!connected || !hasUnsavedChanges || isPending}
          onClick={() => {
            setStatus(null);
            setConfirming('save');
          }}
        >
          {running === 'save' ? 'Enregistrement…' : 'Enregistrer dans Drive'}
        </button>
      </div>

      {!connected && showConnectHint && (
        <p className="text-caption">Connectez Google Drive pour enregistrer.</p>
      )}

      {confirming === 'save' && connected && (
        <div className="drive-actions-confirm" role="alertdialog" aria-label="Confirmer l'enregistrement">
          <p className="text-caption">
            Seul le texte des zones modifiées est réécrit ; leur mise en forme peut être simplifiée.
          </p>
          <div className="drive-actions-confirm-buttons">
            <button type="button" className="button-primary" disabled={isPending} onClick={save} autoFocus>
              Enregistrer
            </button>
            <button type="button" className="button-later" disabled={isPending} onClick={() => setConfirming(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {confirming === 'reimport' && connected && (
        <div className="drive-actions-confirm" role="alertdialog" aria-label="Confirmer le réimport">
          <p className="text-caption">
            Des changements acceptés ne sont pas encore enregistrés dans Drive. Réimporter les
            remplace par la version Drive.
          </p>
          <div className="drive-actions-confirm-buttons">
            <button type="button" className="button-primary" disabled={isPending} onClick={() => reimport(true)} autoFocus>
              Réimporter quand même
            </button>
            <button type="button" className="button-later" disabled={isPending} onClick={() => setConfirming(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite">
        {status === 'saved' && <p className="text-caption">Enregistré dans Drive.</p>}
        {status === 'nothing' && <p className="text-caption">Aucun changement à enregistrer.</p>}
        {status === 'conflict' && (
          <div className="drive-actions-conflict">
            <p className="text-caption">{CONFLICT_MESSAGE}</p>
            <button type="button" className="button-later" disabled={isPending} onClick={requestReimport}>
              Réimporter
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="text-caption context-panel-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
