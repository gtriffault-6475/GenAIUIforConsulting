'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useTransition } from 'react';

import { disconnectGoogle } from '@/actions/google-connection';
import { useOverlay } from '@/components/OverlayProvider';

const OVERLAY_ID = 'google-account-menu';

const CONNECTION_FAILED_MESSAGE = 'La connexion à Google a échoué. Réessayez.';

// Story 5.1 — Connexion du compte Google. Mounted in the top bar
// (`app/page.tsx`), right of `ProjectSelector`. Never mounted in demo mode
// (the page doesn't render it then: no mention of Google at all), so
// `mode` here is only ever one of the three non-demo drive modes.
//
// Props carry the account's email only — never the refresh token, which
// no Server Action ever returns (`actions/google-connection.ts`).
//
// - `unconfigured`: the button stays focusable (`aria-disabled`, not
//   `disabled`) and is described by a visible sentence, so the reason is
//   reachable by keyboard and screen readers, not only on hover.
// - `disconnected`: a plain link to the server-side OAuth start route —
//   a full navigation to Google's consent screen, not a Server Action.
// - `connected`: the account's email opens a menu (AD-8 floating surface
//   via `OverlayProvider`, same pattern as `ProjectSelector`) holding
//   "Se déconnecter" — a disclosure (`aria-expanded`/`aria-controls`), not
//   an ARIA `menu`, since it holds a single plain button.
export function GoogleConnection({
  mode,
  accountEmail,
  connectionFailed,
}: {
  mode: 'unconfigured' | 'disconnected' | 'connected';
  accountEmail: string | null;
  // `/?google=connection-failed`, set by the OAuth callback route.
  connectionFailed: boolean;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const [error, setError] = useState<string | null>(
    connectionFailed ? CONNECTION_FAILED_MESSAGE : null,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const infoId = useId();
  const menuId = useId();

  // Drop the failure flag from the address bar once its message is held
  // in local state, so a later reload doesn't show it again.
  useEffect(() => {
    if (connectionFailed) {
      window.history.replaceState(null, '', '/');
    }
  }, [connectionFailed]);

  const isOpen = isOverlayOpen(OVERLAY_ID);

  function handleToggle() {
    if (isOpen) {
      closeOverlay();
    } else {
      setError(null);
      openOverlay(OVERLAY_ID);
    }
  }

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectGoogle();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeOverlay();
      router.refresh();
    });
  }

  const errorMessage = error && (
    <p className="text-caption google-connection-error" role="alert">
      {error}
    </p>
  );

  if (mode === 'unconfigured') {
    return (
      <div className="google-connection">
        <button
          type="button"
          className="button-neutral"
          aria-disabled="true"
          aria-describedby={infoId}
          onClick={(event) => event.preventDefault()}
        >
          Connecter Google Drive
        </button>
        <span id={infoId} className="text-caption google-connection-info">
          Google Drive n&apos;est pas configuré pour cette installation.
        </span>
      </div>
    );
  }

  if (mode === 'disconnected' || !accountEmail) {
    return (
      <div className="google-connection">
        <a className="button-neutral" href="/api/google/oauth/start">
          Connecter Google Drive
        </a>
        {errorMessage}
      </div>
    );
  }

  return (
    // `contentRef` wraps the trigger too, same reason as `ProjectSelector`:
    // otherwise a click on the trigger while open counts as "outside".
    <div className="google-connection" ref={isOpen ? contentRef : undefined}>
      <button
        type="button"
        className="google-connection-trigger"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`Compte Google Drive : ${accountEmail}`}
        onClick={handleToggle}
      >
        {accountEmail}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div id={menuId} className="card google-connection-menu">
          <span className="text-label">Google Drive</span>
          <p className="text-caption">Connecté avec {accountEmail}</p>
          <button
            type="button"
            className="nav-row"
            disabled={isPending}
            onClick={handleDisconnect}
          >
            Se déconnecter
          </button>
          {errorMessage}
        </div>
      )}
      {!isOpen && errorMessage}
    </div>
  );
}
