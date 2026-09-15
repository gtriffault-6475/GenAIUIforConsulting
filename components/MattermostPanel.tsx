import type { ActionResult } from '@/actions/types';
import type { MattermostMessage } from '@/integrations/ports/mattermost-provider';

// Read-only Mattermost preview (Story 1.5 — Panneau Mattermost). Server
// Component: nothing here is interactive (no `OverlayProvider`, no
// client state) — a single message, an "Ouvrir dans Mattermost" link,
// nothing else. Mirrors the read-only structure of `ContextPanel.tsx`
// (card, `text-label` header, `text-caption` empty/error states) minus
// the add-document affordance, which has no equivalent here: the spec is
// explicit that this panel never offers an input or send action.
export function MattermostPanel({
  result,
}: {
  // Distinguishes three states the spec calls out separately: a real
  // message, an explicit "no message" (`ok: true, data: null` — the
  // provider has no last message for this channel), and a provider
  // failure (`ok: false`) — never collapsed into a single generic empty
  // state, so the consultant isn't left guessing which one occurred.
  result: ActionResult<MattermostMessage | null>;
}) {
  return (
    <section
      className="card"
      aria-label="Mattermost"
      style={{ width: 320, padding: 'var(--space-panel-padding)' }}
    >
      <span className="text-label">Mattermost</span>

      {!result.ok ? (
        <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
          {result.error}
        </p>
      ) : result.data === null ? (
        <p className="text-caption" style={{ marginTop: 'var(--space-3)' }}>
          Aucun message pour ce canal.
        </p>
      ) : (
        <div
          style={{
            marginTop: 'var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-2)',
            }}
          >
            <span className="text-body-strong">{result.data.author}</span>
            <span className="text-caption">
              {formatPostedAt(result.data.postedAt)}
            </span>
          </div>
          <p className="text-body" style={{ margin: 0 }}>
            {result.data.content}
          </p>
          <a
            href={result.data.permalinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link text-body-strong"
          >
            Ouvrir dans Mattermost
          </a>
        </div>
      )}
    </section>
  );
}

// `postedAt` is stored as an ISO string (see
// `integrations/ports/mattermost-provider.ts`) — formatted for display
// here rather than in the action, keeping the action's return value a
// plain serializable value.
function formatPostedAt(postedAt: string): string {
  return new Date(postedAt).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
