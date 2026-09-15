'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { selectProject, type ProjectSummary } from '@/actions/project';
import { useOverlay } from '@/components/OverlayProvider';

const OVERLAY_ID = 'project-selector';

export function ProjectSelector({
  projects,
}: {
  // `null` means the project list failed to load (distinct from a
  // genuinely empty list) — see `app/page.tsx`.
  projects: ProjectSummary[] | null;
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
      <button
        type="button"
        className="button-primary"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        Se connecter à un projet Octopod
      </button>

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
              {projects.map((p) => (
                // `role="presentation"` keeps this `<li>` out of the
                // accessibility tree so each button's `role="option"` is
                // read as a direct child of the `role="listbox"` above,
                // per the ARIA listbox pattern.
                <li key={p.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className="nav-row"
                    disabled={isPending}
                    onClick={() => handleChoose(p.id)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
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
