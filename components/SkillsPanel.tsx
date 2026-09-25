'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addProjectSkillDemo, type ProjectSkillSummary } from '@/actions/skill';
import { useOverlay } from '@/components/OverlayProvider';
import { SKILL_CATALOG } from '@/skills/catalog';

const OVERLAY_ID = 'add-skill';

// Left-sidebar Skills panel (Story 2.4 — Panneau Skills), rendered below
// `ConversationList` in `workspace-sidebar-left`. Client component only
// because "Ajouter une skill" opens a floating surface through the shared
// `OverlayProvider` (AD-8) — the skill list itself is plain server data
// read by `app/page.tsx` and passed down, the same `null`-means-failed
// convention as `ConversationList`'s `conversations` prop. Outside demo
// mode, this one never calls a Server Action: the real "attach a skill to
// a project" mechanism is explicitly deferred beyond this epic (PRD OQ-6,
// ARCHITECTURE-SPINE.md Deferred), so the overlay stays a short, honest,
// static message — never a form that looks functional but silently does
// nothing.
//
// spec-demo-ajout-skill.md — when `demoModeActive` is true, the overlay
// additionally lists the catalog's (`skills/catalog.ts`, safe to import
// client-side — plain data, no `db`/secrets) not-yet-loaded skills as
// clickable entries, each calling the new `addProjectSkillDemo` (real
// `PROJECT_SKILL` insert, `actions/skill.ts`) then `router.refresh()` —
// same shape as `ProjectSelector.tsx`'s `handleChoose`. Outside demo mode
// this list is never computed/shown, so the honest message stays the only
// thing this panel ever offers in a real deployment.
export function SkillsPanel({
  projectId,
  skills,
  demoModeActive,
}: {
  projectId: string;
  // `null` means the read failed — distinct from a genuinely empty list.
  // Either way "Ajouter une skill" below stays the first, always-visible
  // element — never replaced by the error message.
  skills: ProjectSkillSummary[] | null;
  demoModeActive: boolean;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isOpen = isOverlayOpen(OVERLAY_ID);

  // Demo-mode-only: catalog entries not already loaded on this project —
  // `null` (a failed read) degrades to "nothing addable" rather than
  // risking an add on top of an unknown current state.
  const loadedKeys = new Set((skills ?? []).map((skill) => skill.skillKey));
  const availableToAdd = demoModeActive
    ? Object.values(SKILL_CATALOG).filter((skill) => !loadedKeys.has(skill.key))
    : [];

  function handleToggle() {
    if (isOpen) {
      closeOverlay();
    } else {
      setError(null);
      openOverlay(OVERLAY_ID);
    }
  }

  function handleAdd(skillKey: string) {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await addProjectSkillDemo(projectId, skillKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Tour 2 (bmad-review, blind-hunter) : referme l'overlay au succès --
      // manquait au tour 1, alors que le commentaire de ce handler
      // affirmait déjà "même forme que `ProjectSelector.tsx`'s
      // `handleChoose`", qui le fait.
      closeOverlay();
      router.refresh();
    });
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
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            {/* Tour 2 (bmad-review, blind-hunter) : ce message ne s'affiche
                plus quand la liste d'ajout ci-dessous est proposée -- au
                tour 1, les deux coexistaient ("pas encore disponible"
                juste au-dessus de boutons réellement cliquables),
                contredisant directement le principe honnête que ce
                commentaire de fichier revendique. Reste seul, inchangé,
                dans tous les autres cas (mode démo inactif, ou actif mais
                plus aucune skill du catalogue à ajouter). */}
            {availableToAdd.length === 0 && (
              <p className="text-caption" style={{ margin: 0 }}>
                L&rsquo;ajout d&rsquo;une skill à ce projet n&rsquo;est pas
                encore disponible depuis cette interface.
              </p>
            )}

            {availableToAdd.length > 0 && (
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
                {availableToAdd.map((skill) => (
                  <li key={skill.key}>
                    <button
                      type="button"
                      className="skill-add-catalog-entry"
                      disabled={isPending}
                      onClick={() => handleAdd(skill.key)}
                    >
                      {/* Tour 2 (bmad-review, blind-hunter) : verbe
                          d'action explicite -- le nom seul de la skill ne
                          signalait pas qu'un clic l'ajoute au projet. */}
                      Ajouter : {skill.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p className="text-caption" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}
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
