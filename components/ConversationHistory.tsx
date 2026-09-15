import type { ConversationSummary, MessageSummary } from '@/actions/conversation';
import type { ActionResult } from '@/actions/types';

// Center-column, read-only history of the active conversation (Story 2.1
// — Conversations multiples et sélection active). No composer here
// (Story 2.5): this renders the ordered messages only. Server Component,
// like `MattermostPanel.tsx` — nothing here is interactive — and takes
// the action's `ActionResult` directly the same way, distinguishing a
// provider/DB failure (`ok: false`) from the valid "no conversation
// active yet" state (`ok: true, data: null`).
export function ConversationHistory({
  result,
}: {
  result: ActionResult<{
    conversation: ConversationSummary;
    messages: MessageSummary[];
  } | null>;
}) {
  return (
    <section
      className="card"
      aria-label="Conversation"
      style={{
        padding: 'var(--space-panel-padding)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {!result.ok ? (
        <p className="text-caption">{result.error}</p>
      ) : result.data === null ? (
        <p className="text-caption">Aucune conversation active.</p>
      ) : (
        <>
          <span className="text-heading">{result.data.conversation.title}</span>

          {result.data.messages.length === 0 ? (
            <p className="text-caption">
              Cette conversation ne contient aucun message.
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              {result.data.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                  }}
                >
                  <span className="text-caption">
                    {msg.role === 'user' ? 'Vous' : msg.model ?? 'Assistant'}
                  </span>
                  <p className="text-body" style={{ margin: 0 }}>
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
