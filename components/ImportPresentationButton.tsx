'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { importPresentation } from '@/actions/livrable';
import { SlidesIcon } from '@/components/SlidesIcon';

// Story 5.3 — one presentation of the "Dans le Drive du projet" group of
// the Livrables panel. Clicking imports it (`importPresentation`: reads the
// file, never writes it, no AI call) and opens the Éditeur assisté on the
// new livrable — or on the existing one if it was imported in between.
// Same card look as the "En cours" links, as a real `<button>`. Reentrancy:
// synchronous `busyRef` guard, same shape as `GlobalRevisionField.tsx`.
export function ImportPresentationButton({
  projectId,
  documentId,
  name,
}: {
  projectId: string;
  documentId: string;
  name: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busyRef = useRef(false);

  function handleClick() {
    if (isPending || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await importPresentation(projectId, documentId);
        if (!result.ok) {
          // No refresh here: it would usually unmount the Drive group (and
          // this error with it) when the failure came from a lost
          // connection or listing.
          setError(result.error);
          return;
        }
        router.push(`/livrables/${result.data.livrableId}`);
      } catch (callError) {
        console.error('ImportPresentationButton: importPresentation call failed', callError);
        setError("Impossible d'importer cette présentation.");
      } finally {
        busyRef.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="card skill-card livrable-import-button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
      >
        <SlidesIcon />
        <span className="livrable-import-text">
          <span className="text-body-strong">{name}</span>
          <span className="text-caption">
            {isPending ? 'Import en cours…' : 'Importer comme livrable'}
          </span>
        </span>
      </button>
      {error && (
        <p className="text-caption livrable-import-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
