# Conventions — accessibility & microcopy

Established in Story 1.1 (scaffolding) to guide every user-facing string and
every interactive layout in every later story, inside and outside Epic 1.
See `DESIGN.md` and `EXPERIENCE.md` for the visual/interaction rules this
complements.

## Microcopy

- **Vouvoiement.** Address the user as "vous", never "tu".
- **Registre professionnel sobre.** Plain, direct, businesslike French —
  this is a tool consultants use, not a product being sold to them.
- **Never use emoji.**
- **Never use exclamation marks.** State outcomes and next steps plainly.
- **No false familiarity.** No jokes, no hedging enthusiasm ("Super !",
  "C'est parti !"). Say what happened or what is possible, plainly.
- User-facing strings are French and live in `components/`/`app/` (never in
  `domain/`, `actions/`, or `db/` — see ARCHITECTURE-SPINE.md's naming
  convention: code is English, user-visible text is French).

## Accessibility

- **Tab order follows reading order** on every screen — the DOM order of
  interactive elements must match their visual left-to-right,
  top-to-bottom reading order. Do not reorder elements visually (e.g. via
  `flex-direction: row-reverse` or absolute positioning) without also
  reordering them in the DOM.
- **`Escape` closes the last-opened floating element** — this is
  mechanically guaranteed by `components/OverlayProvider.tsx` (see AD-8);
  no component should add its own `Escape` handler for a floating surface.
