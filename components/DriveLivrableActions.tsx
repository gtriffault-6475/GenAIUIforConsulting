'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { checkDriveChanges, reimportDriveLivrable, saveLivrableToDrive } from '@/actions/livrable';
import { OpenInGoogleLink } from '@/components/OpenInGoogleLink';
import { SLIDE_PREVIEWS_REFRESH_EVENT } from '@/components/SlidePreview';

// Story 5.3 / 5.5 — editor header actions of a livrable imported from
// Google Slides (EXPERIENCE.md "Enregistrer dans Drive", "Réimporter").
// - "Enregistrer dans Drive": neutral primary button (`.button-primary`,
//   the navy accent — never the AI purple), disabled while no
//   zone is modified (`hasUnsavedChanges`, from `domain/livrable.ts`);
//   an inline reminder about formatting comes before the first write of
//   the browser session (spec-moins-de-clics.md D3).
// - "Réimporter": secondary; an inline confirmation first when accepted
//   changes are not saved yet (re-checked by the action itself).
// Both disabled outside the `connected` mode, with the connect hint only
// when connecting would help; the page never renders this in demo mode.
// Outcomes are announced in text, never by color alone.
// Ouvrir dans Google Slides: the link is shown in every mode this renders
// in (D1, opening only needs the browser's Google session). Once it was
// clicked in this tab, each return to the tab (`visibilitychange`) re-reads
// the deck while `connected` (D3, never at page open); changed text shows a
// banner whose "Réimporter" is the header's flow, confirmation included. A
// failed check shows nothing (logged server-side).
type Pending = 'save' | 'reimport' | null;

// spec-moins-de-clics.md (D3) — the formatting reminder before "Enregistrer
// dans Drive" is asked once per browser session, for every Drive livrable:
// set only when the consultant confirms "Enregistrer" in it. Never skipped
// forever (sessionStorage, not localStorage). Storage unavailable (blocked,
// private mode) → read as "not confirmed": the reminder is asked every time.
const SAVE_REMINDER_KEY = 'genai4consulting.driveSaveReminderConfirmed';

function saveReminderConfirmed(): boolean {
  try {
    return window.sessionStorage.getItem(SAVE_REMINDER_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSaveReminder() {
  try {
    window.sessionStorage.setItem(SAVE_REMINDER_KEY, '1');
  } catch {
    // Storage blocked: the reminder will simply be asked again next time.
  }
}

const CONFLICT_MESSAGE =
  "Ce fichier a été modifié dans Google Slides depuis l'import. Réimportez-le pour repartir de la dernière version.";

export function DriveLivrableActions({
  livrableId,
  driveFileId,
  connected,
  showConnectHint,
  hasUnsavedChanges,
}: {
  livrableId: string;
  driveFileId: string | null;
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
  const [changedInSlides, setChangedInSlides] = useState(false);
  // Set by a click on "Ouvrir dans Google Slides" in this tab.
  const openedInSlidesRef = useRef(false);
  const checkingRef = useRef(false);
  // Bumped by each check and by a successful reimport/save: a check still
  // in flight then is stale (computed against the previous content).
  const checkSeqRef = useRef(0);

  useEffect(() => {
    if (!connected) return;
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (!openedInSlidesRef.current || checkingRef.current) return;
      checkingRef.current = true;
      // Each return starts hidden: "Ignorer" lasts until the next return.
      setChangedInSlides(false);
      const seq = ++checkSeqRef.current;
      checkDriveChanges(livrableId)
        .then((result) => {
          if (!result.ok) return;
          // spec-apercu-diapositives — the server dropped the cached images.
          if (result.data.changed) window.dispatchEvent(new Event(SLIDE_PREVIEWS_REFRESH_EVENT));
          if (seq === checkSeqRef.current) setChangedInSlides(result.data.changed);
        })
        .catch((callError) => {
          console.error('DriveLivrableActions: checkDriveChanges call failed', callError);
        })
        .finally(() => {
          checkingRef.current = false;
        });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [connected, livrableId]);

  // A later accepted change makes the deck unsaved again: drop a stale
  // "Enregistré dans Drive." next to the re-enabled button.
  useEffect(() => {
    if (hasUnsavedChanges) setStatus((current) => (current === 'saved' ? null : current));
  }, [hasUnsavedChanges]);

  // Synchronous guard: with the session reminder already confirmed, a click
  // calls `save()` directly, and `isPending` alone leaves a double click
  // room to start two saves before React's next commit.
  const savingRef = useRef(false);

  function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setStatus(null);
    setConfirming(null);
    setRunning('save');
    startTransition(async () => {
      try {
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
        checkSeqRef.current += 1;
        setStatus(result.data.status);
        // spec-apercu-diapositives — the slide images show the saved text.
        if (result.data.status === 'saved') {
          window.dispatchEvent(new Event(SLIDE_PREVIEWS_REFRESH_EVENT));
        }
        router.refresh();
      } finally {
        savingRef.current = false;
      }
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
      checkSeqRef.current += 1;
      setChangedInSlides(false);
      window.dispatchEvent(new Event(SLIDE_PREVIEWS_REFRESH_EVENT));
      router.refresh();
    });
  }

  const requestReimport = () => (hasUnsavedChanges ? setConfirming('reimport') : reimport(false));

  return (
    <div className="drive-actions">
      <div className="drive-actions-buttons">
        {driveFileId && (
          <OpenInGoogleLink
            driveFileId={driveFileId}
            onOpen={() => {
              openedInSlidesRef.current = true;
            }}
          />
        )}
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
            if (saveReminderConfirmed()) {
              save();
              return;
            }
            setStatus(null);
            setConfirming('save');
          }}
        >
          {running === 'save' ? 'Enregistrement…' : 'Enregistrer dans Drive'}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {changedInSlides && connected && confirming === null && (
          <div className="drive-actions-conflict drive-actions-changed">
            <p className="text-caption">Cette présentation a été modifiée dans Google Slides.</p>
            <div className="drive-actions-confirm-buttons">
              <button type="button" className="button-later" disabled={isPending} onClick={requestReimport}>
                Réimporter
              </button>
              <button
                type="button"
                className="button-later"
                disabled={isPending}
                onClick={() => setChangedInSlides(false)}
              >
                Ignorer
              </button>
            </div>
          </div>
        )}
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
            <button
              type="button"
              className="button-primary"
              disabled={isPending}
              onClick={() => {
                rememberSaveReminder();
                save();
              }}
              autoFocus
            >
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
