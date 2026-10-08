'use client';

import type { ReactNode } from 'react';

// spec-editeur-deux-panneaux.md — two-way links between a paragraph
// (`block-{id}`) and its suggestion card (`suggestion-{id}`). Located by DOM
// id only: no React state shared across the server page. The target is
// centred inside its own scrolling pane (`scrollIntoView` only scrolls the
// target's ancestors, so the other pane never moves), receives focus (it
// carries `tabIndex={-1}`) so the jump is never a colour-only cue, and gets
// a short outline highlight.
const HIGHLIGHT_CLASS = 'editor-jump-highlight';
const HIGHLIGHT_MS = 2000;

const highlightTimers = new Map<string, number>();

function jumpTo(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  // `preventScroll`: the scroll above already brings it into view, and a
  // focus-driven scroll would cut the smooth one short.
  target.focus({ preventScroll: true });

  // Restart the highlight on a repeated click.
  window.clearTimeout(highlightTimers.get(targetId));
  target.classList.remove(HIGHLIGHT_CLASS);
  void target.offsetWidth;
  target.classList.add(HIGHLIGHT_CLASS);
  highlightTimers.set(
    targetId,
    window.setTimeout(() => {
      target.classList.remove(HIGHLIGHT_CLASS);
      highlightTimers.delete(targetId);
    }, HIGHLIGHT_MS),
  );
}

export function JumpButton({
  targetId,
  label,
  children,
  className,
}: {
  targetId: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ? `editor-jump-button ${className}` : 'editor-jump-button'}
      aria-label={label}
      title={label}
      onClick={() => jumpTo(targetId)}
    >
      {children}
    </button>
  );
}
