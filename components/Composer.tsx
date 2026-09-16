'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import { sendMessage } from '@/actions/conversation';
import { useOverlay } from '@/components/OverlayProvider';
import { MODELS } from '@/skills/models';

const OVERLAY_ID = 'model-selector';

// Center-column composer, rendered below `ConversationHistory` (Story 2.5
// — Sélection du modèle et envoi d'un message). Client component: it
// calls the `sendMessage` Server Action and opens the model dropdown
// through the shared `OverlayProvider` (AD-8), mirroring
// `ConversationList.tsx`'s `useTransition` + `router.refresh()` shape and
// `ProjectSelector.tsx`'s dropdown/`contentRef` pattern. `ConversationHistory`
// itself is unchanged (still read-only) — a failed agent call is shown
// here, next to the composer, never injected into the persisted message
// list.
export function Composer({ conversationId }: { conversationId: string | null }) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const [content, setContent] = useState('');
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // `isPending` (from `useTransition`) only updates on React's next
  // render/commit, not synchronously with the event that triggered it —
  // two submit events dispatched before that commit (key-repeat, a fast
  // double-Enter) would both read the same stale `isPending === false`
  // from their respective closures and both proceed, sending two
  // messages and triggering two real, paid Anthropic API calls whose
  // histories could interleave. A plain ref flips synchronously within
  // the same tick, closing that window; `useTransition` is kept only for
  // its `isPending` (disables the UI) and concurrent-safe scheduling.
  const sendingRef = useRef(false);

  const isOpen = isOverlayOpen(OVERLAY_ID);
  // No active conversation (failed read, or none yet) — the composer stays
  // mounted but disabled rather than disappearing, per the spec's "désactivé
  // /masqué (pas de crash)" edge case.
  const disabled = conversationId === null;
  const selectedModel = MODELS.find((entry) => entry.id === model) ?? MODELS[0];

  function handleToggleModel() {
    if (isOpen) {
      closeOverlay();
    } else {
      openOverlay(OVERLAY_ID);
    }
  }

  function handleChooseModel(nextModel: string) {
    setModel(nextModel);
    closeOverlay();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Synchronous re-entry guard (see `ConversationList.tsx`'s
    // `handleCreate`): `disabled={isPending}` only takes effect once React
    // commits, which is not synchronous with the submit event itself.
    // `sendingRef` closes the residual window `isPending` alone leaves
    // open (see its declaration above).
    if (isPending || sendingRef.current || conversationId === null) return;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      // Blocked client-side, no Server Action call — matches the spec's
      // "Message vide" row.
      return;
    }

    const activeConversationId = conversationId;

    setSubmitError(null);
    setAssistantError(null);
    sendingRef.current = true;

    startTransition(async () => {
      try {
        const result = await sendMessage(activeConversationId, trimmedContent, model);

        if (!result.ok) {
          // User message was never persisted — keep the typed content so
          // nothing is lost, same as `AddDocumentForm`'s `submitError` path.
          setSubmitError(result.error);
          return;
        }

        // User message is persisted either way past this point — clear the
        // field and let `router.refresh()` bring it (and any assistant
        // reply) into `ConversationHistory`.
        setContent('');
        setAssistantError(
          result.data.assistantFailed
            ? (result.data.error ?? "L'agent n'a pas pu répondre à ce message.")
            : null,
        );
        router.refresh();
      } catch (error) {
        // `sendMessage` itself never throws (its own try/catch always
        // returns an ActionResult) — this catches a transport-level
        // failure of the Server Action call itself (e.g. a dropped
        // connection), which would otherwise be an unhandled rejection
        // inside `startTransition` with nothing shown to the user.
        console.error('Composer: sendMessage call failed', error);
        setSubmitError("Une erreur est survenue lors de l'envoi.");
      } finally {
        sendingRef.current = false;
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Écrire à l'agent"
      className="card composer"
    >
      <div className="composer-row">
        <input
          type="text"
          aria-label="Message"
          placeholder="Écrivez à l'IA…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={disabled || isPending}
        />

        {/* `contentRef` covers the trigger button too — same reasoning as
            `ProjectSelector.tsx`/`SkillsPanel.tsx`: otherwise a click on the
            button while open registers as "outside" to `OverlayProvider`
            and closes the overlay just before the button's own handler
            reopens it. */}
        <div className="model-selector" ref={isOpen ? contentRef : undefined}>
          <button
            type="button"
            className="model-selector-trigger"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            disabled={disabled || isPending}
            onClick={handleToggleModel}
          >
            {selectedModel.label}
          </button>

          {isOpen && (
            <div
              role="listbox"
              aria-label="Modèles disponibles"
              className="card model-selector-dropdown"
            >
              <ul>
                {MODELS.map((entry) => (
                  <li key={entry.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={entry.id === model}
                      className={
                        entry.id === model ? 'nav-row nav-row-active' : 'nav-row'
                      }
                      onClick={() => handleChooseModel(entry.id)}
                    >
                      {entry.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="button-primary"
          disabled={disabled || isPending}
        >
          Envoyer
        </button>
      </div>

      {submitError && (
        <p className="text-caption" role="alert" style={{ margin: 'var(--space-2) 0 0' }}>
          {submitError}
        </p>
      )}

      {assistantError && (
        <p className="text-caption" role="alert" style={{ margin: 'var(--space-2) 0 0' }}>
          {assistantError}
        </p>
      )}
    </form>
  );
}
