'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { selectStep } from '@/actions/conversation';
import type { StepWithStatus } from '@/domain/workflow';

// Story 3.1 — Stepper de workflow (avant-vente). Rendered by
// `app/page.tsx` above `.workspace-grid`, unconditionally for any active
// project (Story 3.2 will scope this to avant-vente projects only — out
// of this story's boundaries). Same client-component shape as
// `ConversationList.tsx`'s `handleSelect`: `useTransition` + a
// synchronous re-entrancy guard + `router.refresh()` after a successful
// Server Action call, so the newly active conversation's history and this
// stepper's own status (read back from `activeConversation.stepKey`, per
// AD-6 — never the other way around) reflect immediately. The violet
// `--color-ai-accent` never appears here (see `app/globals.css`'s
// `.stepper-step-*` rules): this is user-driven navigation, not an
// AI-originated element.
export function Stepper({
  projectId,
  steps,
}: {
  projectId: string;
  steps: StepWithStatus[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSelect(stepKey: string, status: StepWithStatus['status']) {
    // Synchronous re-entry guard, same reasoning as
    // `ConversationList.handleSelect`: skip a click on the already-active
    // step (I/O matrix: "aucun effet") and any click while a previous
    // selection is still in flight, before React has had a chance to
    // commit `disabled={isPending}`.
    if (isPending || status === 'active') return;

    setError(null);
    startTransition(async () => {
      const result = await selectStep(projectId, stepKey);
      if (!result.ok) {
        // Stepper keeps its prior visual state — no crash, no optimistic
        // change until the action actually succeeds (I/O matrix: "le
        // stepper ne change pas d'état, message d'erreur affiché").
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <nav aria-label="Étapes du workflow" className="stepper">
        {steps.map((step, index) => (
          <div key={step.key} className="stepper-item">
            <button
              type="button"
              className={`stepper-step stepper-step-${step.status}`}
              aria-current={step.status === 'active' ? 'step' : undefined}
              disabled={isPending}
              onClick={() => handleSelect(step.key, step.status)}
            >
              <span className="stepper-step-marker" aria-hidden="true">
                {step.status === 'done' ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span>{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <span className="stepper-connector" aria-hidden="true" />
            )}
          </div>
        ))}
      </nav>

      {error && (
        <p className="text-caption" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
