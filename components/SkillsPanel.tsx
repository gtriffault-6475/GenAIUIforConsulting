'use client';

import type { ProjectSkillSummary } from '@/actions/skill';
import { useOverlay } from '@/components/OverlayProvider';

const OVERLAY_ID = 'add-skill';

// Left-sidebar Skills panel (Story 2.4 — Panneau Skills), rendered below
// `ConversationList` in `workspace-sidebar-left`. Client component only
// because "Ajouter une skill" opens a floating surface through the shared
// `OverlayProvider` (AD-8) — the skill list itself is plain server data
// read by `app/page.tsx` and passed down, the same `null`-means-failed
// convention as `ConversationList`'s `conversations` prop. Unlike
// `ContextPanel`'s add-document entry point, this one never calls a
// Server Action: the real "attach a skill to a project" mechanism is
// explicitly deferred beyond this epic (PRD OQ-6, ARCHITECTURE-SPINE.md
// Deferred), so the overlay is a short, honest, static message — never a
// form that looks functional but silently does nothing. `projectId` is
// accepted (per the spec's Code Map, mirroring every other panel's
// props) even though this round-1 entry point does not need it yet.
export function SkillsPanel({
  skills,
}: {
  projectId: string;
  // `null` means the read failed — distinct from a genuinely empty list.
  // Either way "Ajouter une skill" below stays the first, always-visible
  // element — never replaced by the error message.
  skills: ProjectSkillSummary[] | null;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();

  const isOpen = isOverlayOpen(OVERLAY_ID);

  function handleToggle() {
    if (isOpen) {
      closeOverlay();
    } else {
      openOverlay(OVERLAY_ID);
    }
  }

  return (
    <nav
      aria-label="Skills"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <span className="text-label">Skills chargées</span>

      {/* `contentRef` covers the trigger button too (not just the overlay
          panel below): otherwise a click on the button while open
          registers as "outside" to `OverlayProvider`, which closes the
          overlay on pointerdown just before the button's own click
          handler reopens it — same reasoning as `ProjectSelector.tsx`/
          `ContextPanel.tsx`. Only attached while this overlay is actually
          the open one, so an always-mounted `SkillsPanel` never steals
          the content ref from a different overlay opened elsewhere. */}
      <div
        className="skill-add-entry-wrap"
        ref={isOpen ? contentRef : undefined}
      >
        <button
          type="button"
          className="skill-add-entry"
          aria-expanded={isOpen}
          onClick={handleToggle}
        >
          <span className="skill-add-entry-icon" aria-hidden="true">
            +
          </span>
          Ajouter une skill
        </button>

        {isOpen && (
          // No `role="dialog"`/`aria-haspopup="dialog"` on the trigger:
          // this disclosure has no focus trap and no modal behavior, so
          // claiming the dialog role would promise more than it delivers
          // — same reasoning as `ContextPanel.tsx`'s add-document
          // disclosure (see the Epic 1 retrospective).
          <div
            role="region"
            aria-label="Ajouter une skill"
            className="card skill-add-overlay"
          >
            <p className="text-caption" style={{ margin: 0 }}>
              L&rsquo;ajout d&rsquo;une skill à ce projet n&rsquo;est pas
              encore disponible depuis cette interface.
            </p>
          </div>
        )}
      </div>

      {skills === null ? (
        <p className="text-caption">
          Impossible de charger les skills du projet.
        </p>
      ) : skills.length === 0 ? (
        <p className="text-caption">Aucune skill chargée sur ce projet.</p>
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
          {skills.map((skill) => (
            <li key={skill.skillKey} className="card skill-card">
              <svg
                className="skill-card-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
              </svg>
              <div>
                <span className="text-body-strong">{skill.name}</span>
                <p className="text-caption" style={{ margin: 0 }}>
                  {skill.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
