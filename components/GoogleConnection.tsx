'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import {
  disconnectGoogle,
  dismissGoogleOAuthOutcome,
  type GoogleConnectionStatus,
  type GoogleOAuthOutcome,
} from '@/actions/google-connection';
import { useOverlay } from '@/components/OverlayProvider';

// Story 5.1 — Connexion du compte Google (EXPERIENCE.md "Connexion
// Google"). Top bar, right of the project selector. Renders nothing in
// `demo` mode ("aucune mention de Google") and in `unconfigured` mode
// ("aucune action Drive proposée"). Connecting is a plain link to the
// OAuth start route (a full-page redirect to Google's consent screen,
// never a Server Action — AD-12). Once connected: the account email, with
// "Se déconnecter" in a small disclosure panel (plain button +
// `aria-expanded`, no ARIA menu pattern) that goes through
// `OverlayProvider` (AD-8).
const OVERLAY_ID = 'google-account-menu';

const OUTCOME_MESSAGES: Record<GoogleOAuthOutcome, string> = {
  cancelled: 'La connexion à Google Drive a été annulée.',
  failed: 'La connexion à Google Drive a échoué. Réessayez.',
};

export function GoogleConnection({
  status,
  outcome,
}: {
  status: GoogleConnectionStatus | null;
  outcome: GoogleOAuthOutcome | null;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const [error, setError] = useState<string | null>(null);
  // Kept locally once shown: the cookie carrying it is cleared on mount
  // below, so a reload never shows the same message twice.
  const [message, setMessage] = useState<string | null>(
    outcome ? OUTCOME_MESSAGES[outcome] : null,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (outcome) void dismissGoogleOAuthOutcome();
  }, [outcome]);

  if (!status || status.mode === 'demo' || status.mode === 'unconfigured') {
    return null;
  }

  const isOpen = isOverlayOpen(OVERLAY_ID);

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

  return (
    <div className="google-connection" ref={isOpen ? contentRef : undefined}>
      {status.mode === 'connected' && status.accountEmail ? (
        <button
          type="button"
          className="google-connection-trigger text-body"
          aria-expanded={isOpen}
          aria-label={`Compte Google connecté : ${status.accountEmail}`}
          onClick={() => (isOpen ? closeOverlay() : openOverlay(OVERLAY_ID))}
        >
          {status.accountEmail}
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
      ) : (
        <a className="google-connection-connect" href="/api/google/oauth/start">
          Connecter Google Drive
        </a>
      )}

      {isOpen && (
        <div className="card google-connection-menu">
          <button
            type="button"
            className="nav-row"
            disabled={isPending}
            onClick={handleDisconnect}
          >
            Se déconnecter
          </button>
          {error && (
            <p className="text-caption google-connection-message" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {message && !isOpen && (
        <p className="text-caption google-connection-message" role="status">
          {message}{' '}
          <button
            type="button"
            className="google-connection-dismiss"
            aria-label="Fermer le message"
            onClick={() => setMessage(null)}
          >
            ×
          </button>
        </p>
      )}
    </div>
  );
}
