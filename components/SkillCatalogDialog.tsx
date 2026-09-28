'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import { createPortal } from 'react-dom';

import type { ProjectSkillSummary } from '@/actions/skill';
import { SKILL_CATALOG, type Skill } from '@/skills/catalog';

// spec-demo-catalogue-skills.md — demo-mode-only "Catalogue de skills OCTO"
// modal, opened from `SkillsPanel.tsx`'s "Ajouter une skill" trigger. It
// is one surface of the shared `OverlayProvider` (AD-8, id `'add-skill'`):
// Escape and a click outside `contentRef` close it through the provider's
// existing handlers. `contentRef` is attached to the panel only — the
// darkened backdrop sits outside it, so a click on the backdrop is an
// "outside" click and closes the popup with no extra code here.
//
// Rendered through a portal on `document.body` so `position: fixed`
// covers the whole viewport regardless of the sidebar's own layout.
// Unlike the old anchored menu, this popup has a real focus trap (Tab
// cycles inside the panel) and `SkillsPanel` returns focus to its trigger
// on close, so `role="dialog"`/`aria-modal` are legitimate here.

const ALL_CATEGORIES = '__all__';

// Case- and accent-insensitive comparison: "redaction" matches "Rédaction".
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesQuery(skill: Skill, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true;
  return normalize(`${skill.name} ${skill.description} ${skill.category}`).includes(
    normalizedQuery,
  );
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function SkillCatalogDialog({
  skills,
  isPending,
  error,
  onAdd,
  onClose,
  contentRef,
}: {
  // Same `null`-means-failed convention as `SkillsPanel`: with an unknown
  // current state, no "Ajouter" button is ever enabled.
  skills: ProjectSkillSummary[] | null;
  isPending: boolean;
  error: string | null;
  onAdd: (skillKey: string) => void;
  onClose: () => void;
  contentRef: RefCallback<HTMLElement>;
}) {
  const titleId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const catalog = useMemo(() => Object.values(SKILL_CATALOG), []);
  // Derived from the catalog (in first-seen order) so future entries with
  // new categories appear here without any change to this component.
  const categories = useMemo(
    () => Array.from(new Set(catalog.map((skill) => skill.category))),
    [catalog],
  );

  const normalizedQuery = normalize(query.trim());
  const searchMatches = catalog.filter((skill) => matchesQuery(skill, normalizedQuery));
  const visible =
    category === ALL_CATEGORIES
      ? searchMatches
      : searchMatches.filter((skill) => skill.category === category);

  const loadedKeys = new Set((skills ?? []).map((skill) => skill.skillKey));

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Focus trap on `document` rather than on the panel: focus can land on
  // <body> (click on non-focusable panel text, or the clicked "Ajouter"
  // becoming disabled), where a panel-level `onKeyDown` would never fire
  // and Tab would escape into the page behind the modal.
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const panel = panelRef.current;
      if (event.key !== 'Tab' || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function setPanelNode(node: HTMLDivElement | null) {
    panelRef.current = node;
    contentRef(node);
  }

  function countFor(categoryName: string): number {
    return searchMatches.filter((skill) => skill.category === categoryName).length;
  }

  return createPortal(
    <div
      className="skill-catalog-backdrop"
      // The provider closes the popup on this same pointerdown and
      // `SkillsPanel` moves focus back to the trigger — preventing the
      // default here suppresses the compatibility mousedown, whose own
      // default would otherwise immediately blur that trigger to <body>.
      // Propagation is untouched, so the provider's handler still runs.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={setPanelNode}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card skill-catalog-panel"
      >
        <div className="skill-catalog-header">
          <div>
            <h2 id={titleId} className="text-heading" style={{ margin: 0 }}>
              Catalogue de skills OCTO
            </h2>
            <p className="text-caption" style={{ margin: 0 }}>
              Les skills partagées par le cabinet, à charger sur ce projet.
            </p>
          </div>
          <button type="button" className="button-later" onClick={onClose}>
            Fermer
          </button>
        </div>

        <label htmlFor={searchId} className="text-label">
          Rechercher
        </label>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          className="skill-catalog-search"
          placeholder="Nom, description ou catégorie…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="skill-catalog-body">
          <ul className="skill-catalog-categories" aria-label="Catégories">
            <li>
              <button
                type="button"
                className={
                  category === ALL_CATEGORIES
                    ? 'skill-catalog-category skill-catalog-category-active'
                    : 'skill-catalog-category'
                }
                aria-pressed={category === ALL_CATEGORIES}
                onClick={() => setCategory(ALL_CATEGORIES)}
              >
                <span>Toutes</span>
                <span className="skill-catalog-count">{searchMatches.length}</span>
              </button>
            </li>
            {categories.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={
                    category === name
                      ? 'skill-catalog-category skill-catalog-category-active'
                      : 'skill-catalog-category'
                  }
                  aria-pressed={category === name}
                  onClick={() => setCategory(name)}
                >
                  <span>{name}</span>
                  <span className="skill-catalog-count">{countFor(name)}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="skill-catalog-list">
            {visible.length === 0 ? (
              <p className="text-caption" style={{ margin: 0 }}>
                {normalizedQuery !== ''
                  ? `Aucune skill ne correspond à « ${query.trim()} ».`
                  : 'Aucune skill dans cette catégorie.'}
              </p>
            ) : (
              <ul className="skill-catalog-cards">
                {visible.map((skill) => {
                  const alreadyLoaded = loadedKeys.has(skill.key);
                  return (
                    <li key={skill.key} className="card skill-catalog-card">
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
                      <div className="skill-catalog-card-text">
                        <span className="text-body-strong">{skill.name}</span>
                        <span className="text-label skill-catalog-card-category">
                          {skill.category}
                        </span>
                        <p className="text-caption" style={{ margin: 0 }}>
                          {skill.description}
                        </p>
                      </div>
                      <div className="skill-catalog-card-action">
                        {alreadyLoaded && (
                          <span className="skill-catalog-badge">Déjà chargée</span>
                        )}
                        <button
                          type="button"
                          className="button-primary"
                          disabled={isPending || skills === null || alreadyLoaded}
                          aria-label={
                            alreadyLoaded
                              ? `${skill.name} : déjà chargée`
                              : `Ajouter ${skill.name}`
                          }
                          onClick={() => onAdd(skill.key)}
                        >
                          Ajouter
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {skills === null && (
          <p className="text-caption" style={{ margin: 0 }}>
            Impossible de charger les skills du projet : ajout indisponible.
          </p>
        )}

        {error && (
          <p className="text-caption" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
