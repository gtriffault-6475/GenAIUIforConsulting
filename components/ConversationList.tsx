'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { selectConversation, type ConversationSummary } from '@/actions/conversation';

// Left-sidebar conversation list (Story 2.1 — Conversations multiples et
// sélection active). Client component so a click can call the
// `selectConversation` Server Action and refresh the page — same
// `useTransition` + `router.refresh()` shape as `ProjectSelector.tsx`'s
// `handleChoose`. No `OverlayProvider` here (AD-8 only governs floating
// surfaces): this list renders in normal flow, not as a dropdown/overlay.
export function ConversationList({
  conversations,
  activeConversationId,
}: {
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

  return (
    <nav
      aria-label="Conversations"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <span className="text-label">Conversations</span>

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
