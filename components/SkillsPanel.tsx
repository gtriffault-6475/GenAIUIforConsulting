'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { addProjectSkillDemo, type ProjectSkillSummary } from '@/actions/skill';
import { useOverlay } from '@/components/OverlayProvider';
import { SkillCatalogDialog } from '@/components/SkillCatalogDialog';

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
// spec-demo-ajout-skill.md / spec-demo-catalogue-skills.md — when
// `demoModeActive` is true, the trigger opens `SkillCatalogDialog` (modal
// "Catalogue de skills OCTO": search, categories, cards) instead; its
// "Ajouter" buttons call `addProjectSkillDemo` (real `PROJECT_SKILL`
// insert, `actions/skill.ts`) then `router.refresh()` — same shape as
// `ProjectSelector.tsx`'s `handleChoose`. Outside demo mode the popup is
// never rendered, so the honest message stays the only thing this panel
// ever offers in a real deployment.
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

  // spec-demo-catalogue-skills.md — the demo popup is modal, so focus
  // goes back to "Ajouter une skill" whenever it closes (Escape, backdrop
  // click, "Fermer", or a successful add). Only on an open -> closed
  // transition while the demo popup was the one shown.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasDemoDialogOpenRef = useRef(false);
  const isDemoDialogOpen = isOpen && demoModeActive;
  useEffect(() => {
    if (wasDemoDialogOpenRef.current && !isDemoDialogOpen) {
      triggerRef.current?.focus();
    }
    wasDemoDialogOpenRef.current = isDemoDialogOpen;
  }, [isDemoDialogOpen]);

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
        ref={isOpen && !demoModeActive ? contentRef : undefined}
      >
        <button
          ref={triggerRef}
          type="button"
          className="skill-add-entry"
          aria-expanded={isOpen}
          aria-haspopup={demoModeActive ? 'dialog' : undefined}
          onClick={handleToggle}
        >
          <span className="skill-add-entry-icon" aria-hidden="true">
            +
          </span>
          Ajouter une skill
        </button>

        {/* Hors mode démo : message honnête seul, inchangé. No
            `role="dialog"`/`aria-haspopup="dialog"` on the trigger: this
            disclosure has no focus trap and no modal behavior, so claiming
            the dialog role would promise more than it delivers — same
            reasoning as `ContextPanel.tsx`'s add-document disclosure (see
            the Epic 1 retrospective). */}
        {isOpen && !demoModeActive && (
          <div
            role="region"
            aria-label="Ajouter une skill"
            className="card skill-add-overlay"
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            <p className="text-caption" style={{ margin: 0 }}>
              L&rsquo;ajout d&rsquo;une skill à ce projet n&rsquo;est pas
              encore disponible depuis cette interface.
            </p>
          </div>
        )}

        {/* spec-demo-catalogue-skills.md — en mode démo, la popup modale
            "Catalogue de skills OCTO" remplace l'ancien menu ancré. */}
        {isOpen && demoModeActive && (
          <SkillCatalogDialog
            skills={skills}
            isPending={isPending}
            error={error}
            onAdd={handleAdd}
            onClose={closeOverlay}
            contentRef={contentRef}
          />
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
