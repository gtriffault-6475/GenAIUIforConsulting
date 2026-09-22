'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { selectProject, type ProjectSummary } from '@/actions/project';
import { useOverlay } from '@/components/OverlayProvider';

const OVERLAY_ID = 'project-selector';

export function ProjectSelector({
  projects,
  activeProject = null,
}: {
  // `null` means the project list failed to load (distinct from a
  // genuinely empty list) — see `app/page.tsx`.
  projects: ProjectSummary[] | null;
  // spec-changement-de-projet-a-la-volee.md. `null` (default)
  // preserves Story 1.2's original behavior (first-launch selector, no
  // project active yet). When set, the trigger becomes the active
  // project's name (top bar) instead of the "Se connecter..." button, and
  // the matching entry in the reopened list is shown as active rather
  // than a normal clickable choice.
  activeProject?: ProjectSummary | null;
}) {
  const { openOverlay, closeOverlay, isOverlayOpen, contentRef } = useOverlay();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isOpen = isOverlayOpen(OVERLAY_ID);

  function handleToggle() {
    if (isOpen) {
      closeOverlay();
    } else {
      setError(null);
      openOverlay(OVERLAY_ID);
    }
  }

  function handleChoose(projectId: string) {
    if (projectId === activeProject?.id) {
      // Already active — the entry stays focusable/announceable (see the
      // `aria-disabled` note below) but selecting it is a no-op.
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await selectProject(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeOverlay();
      router.refresh();
    });
  }

  return (
    // `contentRef` covers the trigger button too (not just the dropdown
    // panel below): otherwise a click on the button while open registers
    // as "outside" to `OverlayProvider`, which closes the overlay on
    // pointerdown just before the button's own click handler reopens it
    // — the button could open the dropdown but never close it. Only
    // attached while this overlay is actually the open one, so an
    // always-mounted `ProjectSelector` never steals the content ref from
    // a different overlay opened elsewhere (AD-8 covers the whole app).
    <div className="project-selector" ref={isOpen ? contentRef : undefined}>
      {activeProject ? (
        <button
          type="button"
          className="project-selector-trigger text-heading"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`${activeProject.name} — changer de projet`}
          onClick={handleToggle}
        >
          {activeProject.name}
          <svg
            className="project-selector-trigger-chevron"
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
        <button
          type="button"
          className="button-primary"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={handleToggle}
        >
          Se connecter à un projet Octopod
        </button>
      )}

      {isOpen && (
        <div
          role="listbox"
          aria-label="Projets Octopod disponibles"
          className="card project-selector-dropdown"
        >
          <span className="text-label">Projets disponibles</span>
          {projects === null ? (
            <p className="text-caption">
              Impossible de charger les projets Octopod.
            </p>
          ) : projects.length === 0 ? (
            <p className="text-caption">Aucun projet disponible.</p>
          ) : (
            <ul>
              {projects.map((p) => {
                const isActive = p.id === activeProject?.id;
                return (
                  // `role="presentation"` keeps this `<li>` out of the
                  // accessibility tree so each button's `role="option"` is
                  // read as a direct child of the `role="listbox"` above,
                  // per the ARIA listbox pattern.
                  <li key={p.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      aria-disabled={isActive || undefined}
                      className={
                        isActive ? 'nav-row nav-row-active' : 'nav-row'
                      }
                      disabled={isPending}
                      onClick={() => handleChoose(p.id)}
                    >
                      {p.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="text-caption project-selector-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
