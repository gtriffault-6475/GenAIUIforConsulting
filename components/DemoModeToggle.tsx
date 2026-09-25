'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setDemoModeActive } from '@/actions/demo';

// spec-toggle-mode-demo-ui.md. Mounted in the top bar (`app/page.tsx`),
// next to `ProjectSelector` — same `<header className="top-bar">`. `active`
// is read server-side once per render by `app/page.tsx` (`getDemoModeActive`,
// `actions/demo.ts`), never local `useState`/`localStorage` (Boundaries:
// the toggle's state must be readable by `sendToAgent`, a Server Action —
// server persistence is mandatory). Same `useTransition`/inline-error shape
// as `ProjectSelector.tsx`'s `handleChoose`: call the Server Action, surface
// its error inline on failure (state unchanged, per the spec's I/O Matrix),
// or `router.refresh()` on success so this button, `app/layout.tsx`'s
// banner/border, and everything else on the page pick up the new state
// together, immediately, with no separate reload/confirmation step.
export function DemoModeToggle({ active }: { active: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await setDemoModeActive(!active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="demo-mode-toggle">
      <button
        type="button"
        className={active ? 'button-toggle button-toggle-active' : 'button-toggle'}
        aria-pressed={active}
        disabled={isPending}
        onClick={handleToggle}
      >
        Mode démo {active ? 'activé' : 'désactivé'}
      </button>

      {error && (
        <p className="text-caption demo-mode-toggle-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
