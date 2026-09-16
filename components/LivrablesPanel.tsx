import type { LivrableSummary } from '@/actions/livrable';

// Right-sidebar Livrables panel (Story 2.6 — Panneau Livrables), rendered
// between `ContextPanel` and `MattermostPanel` in `workspace-sidebar-right`
// (order fixed by `epic-2-context.md`'s UX pattern). Server Component —
// like `MattermostPanel.tsx`: no mutation, no overlay, no client-side
// state. Cards are deliberately not clickable in this story — the
// click-through to the Éditeur assisté is Story 4.1's concern (explicit
// note on this story's AC in `epics.md`), not this one's, so no `<a>`/
// `<button>`/click handler appears anywhere below.
//
// Reuses `.card`/`.skill-card`/`.skill-card-icon` from Story 2.4 rather
// than introducing a livrable-specific class (Code Map: "réutilise .card,
// pas de nouvelle classe si les styles existants suffisent") — the layout
// those classes already provide (small icon + title, icon alone tinted
// `--color-ai-accent`) is exactly what DESIGN.md prescribes for a
// livrable card too: it lists "icône livrable en cours de travail avec
// l'IA" alongside "icône skills" as an `ai-accent` use case, and the
// `Main.dc.html` mockup's Livrables section uses the same icon+label row
// shape as the Skills cards.
export function LivrablesPanel({
  livrables,
}: {
  // `null` means the read failed — distinct from a genuinely empty list,
  // which gets its own short creation prompt below rather than a silent
  // empty area (this story's Always). Same convention as `SkillsPanel`'s
  // `skills` prop / `ConversationList`'s `conversations` prop.
  livrables: LivrableSummary[] | null;
}) {
  return (
    <section
      className="card"
      aria-label="Livrables"
      style={{
        padding: 'var(--space-panel-padding)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <span className="text-label">Livrables</span>

      {livrables === null ? (
        <p className="text-caption">
          Impossible de charger les livrables du projet.
        </p>
      ) : livrables.length === 0 ? (
        // Honest about the real creation mechanism — the agent, inside a
        // conversation — rather than a button that would simulate a
        // creation flow that does not exist yet (`propose_livrable_content`
        // is an agent tool deferred to Epic 4, AD-3). Never a silent empty
        // area, per this story's Always.
        <p className="text-caption">
          Aucun livrable pour le moment. Demandez à l&rsquo;agent d&rsquo;en
          créer un dans une conversation.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {livrables.map((item) => (
            // A plain, non-interactive `<li>` — not a `<button>`/`<a>` —
            // since this story's Never is explicit: no click-through, no
            // simulated interactivity.
            <li key={item.id} className="card skill-card">
              <svg
                className="skill-card-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
                <path d="M15 2v5h5" />
              </svg>
              <span className="text-body-strong">{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
