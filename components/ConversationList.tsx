'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  createConversation,
  selectConversation,
  type ConversationSummary,
} from '@/actions/conversation';

// Left-sidebar conversation list (Story 2.1 — Conversations multiples et
// sélection active; Story 2.2 — Création d'une nouvelle conversation).
// Client component so a click can call the `selectConversation`/
// `createConversation` Server Actions and refresh the page — same
// `useTransition` + `router.refresh()` shape as `ProjectSelector.tsx`'s
// `handleChoose`. No `OverlayProvider` here (AD-8 only governs floating
// surfaces): this list renders in normal flow, not as a dropdown/overlay.
export function ConversationList({
  projectId,
  conversations,
  activeConversationId,
}: {
  projectId: string;
  // `null` means the conversation list failed to load — distinct from a
  // genuinely empty list. Mirrors `ContextPanel`'s `documents` convention.
  conversations: ConversationSummary[] | null;
  activeConversationId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSelect(conversationId: string) {
    if (conversationId === activeConversationId) return;

    setError(null);
    startTransition(async () => {
      const result = await selectConversation(conversationId);
      if (!result.ok) {
        // Keep the prior selection on screen — no crash, no optimistic
        // row change until the action actually succeeds.
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCreate() {
    // Synchronous re-entry guard: `disabled={isPending}` only takes effect
    // once React commits the re-render, leaving a window where a second
    // activation (key-repeat, assistive tech) could fire before that paint
    // — this check closes it immediately, matching `handleSelect`'s own
    // guard against redundant re-entry.
    if (isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await createConversation(projectId);
      if (!result.ok) {
        // No ghost row in the list and no change to the active selection
        // until the action actually succeeds.
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <nav
      aria-label="Conversations"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <span className="text-label">Conversations</span>

      <button
        type="button"
        className="nav-row"
        disabled={isPending}
        onClick={handleCreate}
      >
        Nouvelle conversation
      </button>

      {conversations === null ? (
        <p className="text-caption">
          Impossible de charger les conversations du projet.
        </p>
      ) : conversations.length === 0 ? (
        <p className="text-caption">Aucune conversation pour ce projet.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <li key={conv.id}>
                <button
                  type="button"
                  className={isActive ? 'nav-row nav-row-active' : 'nav-row'}
                  aria-current={isActive ? 'true' : undefined}
                  disabled={isPending}
                  onClick={() => handleSelect(conv.id)}
                >
                  {conv.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="text-caption" role="alert">
          {error}
        </p>
      )}
    </nav>
  );
}
