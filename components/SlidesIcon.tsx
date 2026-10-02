// Story 5.3 — marks every Livrables panel item backed by a Google Slides
// file of the project's Drive (epic-5-context.md "Panneau Livrables"):
// a presentation screen, in place of the plain livrable page icon. Same
// size and stroke as `.skill-card-icon`; decorative (the item's text says
// what it is).
export function SlidesIcon() {
  return (
    <svg
      className="skill-card-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M12 16v4M8 20h8" />
    </svg>
  );
}
