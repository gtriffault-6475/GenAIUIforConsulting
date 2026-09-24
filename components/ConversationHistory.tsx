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
                  {msg.role === 'user' && msg.assistantFailed && (
                    // epic-2-retro-item-16 — durable, not just transient,
                    // failed-response indicator, sourced from the persisted
                    // `MESSAGE.assistantFailed`/`assistantErrorText` columns
                    // instead of local React state, so it survives a
                    // conversation switch, a page reload, or a return days
                    // later. The real error text of whichever `sendMessage`
                    // failure branch set it (Spec Change Log: a single fixed
                    // generic sentence lost real diagnostic detail and was
                    // factually wrong for the "reply persistence failed"
                    // branch) — a JS expression, never raw JSX text with
                    // hand-escaped entities, same convention as
                    // `Composer.tsx`'s `{assistantError}`. `role="status"`,
                    // not `role="alert"`: fits both ways this can appear —
                    // present at initial SSR render (a reload, a return days
                    // later) where `alert` would never be announced at all
                    // (only on a post-load change), and freshly inserted by
                    // `Composer.tsx`'s own `router.refresh()` right after a
                    // failed send, where `status`'s polite live-region
                    // semantics still announce it correctly. Passive only —
                    // no retry action (Boundaries: out of scope for this
                    // item).
                    <p className="text-caption" role="status" style={{ margin: 0 }}>
                      {msg.assistantErrorText ??
                        "L'agent n'a pas pu répondre à ce message."}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
