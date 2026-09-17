// Story 3.1 — Stepper de workflow (avant-vente). First file in `domain/`
// (previously empty, tracked only via `domain/.gitkeep`) — a pure
// function turning data into visual stepper state. AD-5: `domain/`
// imports neither `db/`, nor `integrations/`, nor `actions/`, nor React —
// `actions/conversation.ts` (`selectStep`) persists the find-or-create
// and activation, `app/page.tsx` calls `computeStepStatuses` below and
// hands the result to `components/Stepper.tsx` to render.

export type StepKey = 'qualification' | 'references' | 'experts' | 'redaction';

export type StepStatus = 'done' | 'active' | 'upcoming';

export type Step = {
  key: StepKey;
  label: string;
};

export type StepWithStatus = Step & { status: StepStatus };

// Fixed order and French labels per the spec's Intent/Boundaries — 4
// fixed steps for round 1 (Qualification → Références → Experts →
// Rédaction), no configuration, no per-project variation (Story 3.2
// decides whether/how this applies to mission projects, out of scope
// here).
export const STEPS: Step[] = [
  { key: 'qualification', label: 'Qualification' },
  { key: 'references', label: 'Références' },
  { key: 'experts', label: 'Experts' },
  { key: 'redaction', label: 'Rédaction' },
];

// Pure: given the active conversation's `stepKey` (or `null` for a free
// conversation not attached to any step — Story 2.1's fixtures, a
// manually created conversation, or a future mission-case conversation
// from Story 3.2), returns all 4 steps with their visual status. A step
// before `activeStepKey`'s position in `STEPS` is `'done'`, the matching
// step is `'active'`, the following ones are `'upcoming'`. When
// `activeStepKey` is `null` or does not match any known step, every step
// is `'upcoming'` — no step is ever considered active or done in that
// case (the spec's I/O matrix: fixture conversations never light up a
// step).
export function computeStepStatuses(
  activeStepKey: string | null,
): StepWithStatus[] {
  const activeIndex = STEPS.findIndex((step) => step.key === activeStepKey);

  return STEPS.map((step, index) => {
    let status: StepStatus;
    if (activeIndex === -1) {
      status = 'upcoming';
    } else if (index < activeIndex) {
      status = 'done';
    } else if (index === activeIndex) {
      status = 'active';
    } else {
      status = 'upcoming';
    }
    return { ...step, status };
  });
}
