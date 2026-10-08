'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import type { PresentationProposalSummary } from '@/actions/conversation';
import type { DriveMode } from '@/actions/google-connection';
import { createPresentationFromProposal } from '@/actions/livrable';
import { prefillComposer } from '@/components/composer-prefill';
import { OpenInGoogleLink } from '@/components/OpenInGoogleLink';

const ADJUST_PREFIX = 'Ajuste la proposition de présentation : ';
const PREVIEW_LINES = 2;

// First lines of a slide's body; an ellipsis marks the cut.
function previewOf(content: string): string {
  const lines = content.split('\n');
  const shown = lines.slice(0, PREVIEW_LINES).join('\n');
  return lines.length > PREVIEW_LINES ? `${shown}…` : shown;
}

// Story 5.6 — a presentation proposed by the agent, shown under the reply
// that carries it. Nothing exists in Drive until "Créer dans Drive" (copy
// of the OCTO template, then the Story 5.3 import and the editor opens).
// "Ajuster" only prefills the composer. Never rendered in demo mode.
export function PresentationProposalCard({
  proposal,
  driveMode,
  templateConfigured,
}: {
  proposal: PresentationProposalSummary;
  driveMode: DriveMode | null;
  templateConfigured: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Synchronous double-click guard, same reason as `Composer.tsx`.
  const creatingRef = useRef(false);

  if (driveMode === 'demo') return null;

  const created = proposal.status === 'created' && proposal.livrableId !== null;
  const connected = driveMode === 'connected';
  const unavailable = !connected
    ? 'Connectez Google Drive pour créer la présentation.'
    : !templateConfigured
      ? "Le modèle de présentation OCTO n'est pas configuré pour cette installation."
      : null;

  function create() {
    if (creatingRef.current || unavailable) return;
    creatingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPresentationFromProposal(proposal.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/livrables/${result.data.livrableId}`);
      } catch (callError) {
        console.error('PresentationProposalCard: createPresentationFromProposal call failed', callError);
        setError('La création de la présentation a échoué. Réessayez.');
      } finally {
        creatingRef.current = false;
      }
    });
  }

  return (
    <section className="presentation-proposal" aria-label={`Proposition de présentation : ${proposal.title}`}>
      <span className="text-caption">Proposition de présentation</span>
      <span className="text-body-strong">{proposal.title}</span>
      <ol className="presentation-proposal-slides">
        {proposal.slides.map((slide, index) => (
          <li key={index}>
            <span className="text-body-strong">{slide.title || `Diapositive ${index + 1}`}</span>
            {slide.content && (
              <span className="text-caption presentation-proposal-preview">
                {previewOf(slide.content)}
              </span>
            )}
          </li>
        ))}
      </ol>

      {created ? (
        <p className="text-caption" role="status" style={{ margin: 0 }}>
          Présentation créée —{' '}
          <Link href={`/livrables/${proposal.livrableId}`}>ouvrir le livrable</Link>
          {proposal.driveFileId && (
            <>
              {' · '}
              <OpenInGoogleLink driveFileId={proposal.driveFileId} variant="inline" />
            </>
          )}
        </p>
      ) : (
        <>
          <div className="drive-actions-buttons">
            <button
              type="button"
              className="button-primary"
              disabled={isPending || unavailable !== null}
              onClick={create}
            >
              {isPending ? 'Création…' : 'Créer dans Drive'}
            </button>
            <button
              type="button"
              className="button-later"
              disabled={isPending || !connected}
              onClick={() => prefillComposer(ADJUST_PREFIX)}
            >
              Ajuster
            </button>
          </div>
          {unavailable && <p className="text-caption" style={{ margin: 0 }}>{unavailable}</p>}
          {error && (
            <p className="text-caption" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
