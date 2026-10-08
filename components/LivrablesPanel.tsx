'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { DocumentSummary, DriveListingState } from '@/actions/document';
import { importDrivePresentation, type LivrableSummary } from '@/actions/livrable';
import { driveStateMessage } from '@/components/drive-state-message';
import { OpenInGoogleLink } from '@/components/OpenInGoogleLink';

// Story 2.6 — Panneau Livrables; Story 5.3 (EXPERIENCE.md "Panneau
// Livrables") adds a second group. "En cours": livrables open in the app,
// Drive-backed or not. "Dans le Drive du projet": the folder's Google
// Slides presentations not imported yet — clicking one imports it, then
// opens the editor. That group is absent in demo mode (`drive === null`)
// and shows the Contexte panel's message when the Drive cannot be read.
// A Slides icon marks every Drive-backed item. Outside demo mode, a Drive
// livrable also gets a compact "Ouvrir dans Google Slides" link beside its
// card — a sibling of the card link, never nested in it.
export type DriveLivrables = {
  projectName: string;
  state: DriveListingState;
  presentations: DocumentSummary[];
};

function DocumentIcon() {
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
      <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
      <path d="M15 2v5h5" />
    </svg>
  );
}

// A presentation board on an easel: the Slides marker, drawn in the same
// stroke style as the document icon.
function SlidesIcon() {
  return (
    <svg
      className="skill-card-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      role="img"
      aria-label="Présentation Google Slides"
    >
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M8 20h8" />
    </svg>
  );
}

export function LivrablesPanel({
  projectId,
  livrables,
  drive,
}: {
  projectId: string;
  livrables: LivrableSummary[] | null;
  drive: DriveLivrables | null;
}) {
  return (
    <section
      className="card"
      aria-label="Livrables"
      style={{
        padding: 'var(--space-panel-padding)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <span className="text-label">Livrables</span>

      {drive !== null && <span className="text-caption livrables-group-title">En cours</span>}
      {livrables === null ? (
        <p className="text-caption">Impossible de charger les livrables du projet.</p>
      ) : livrables.length === 0 ? (
        <p className="text-caption">
          Aucun livrable pour le moment. Demandez à l&rsquo;agent d&rsquo;en créer un dans une
          conversation.
        </p>
      ) : (
        <ul className="livrables-list">
          {livrables.map((item) => (
            <li key={item.id} className="livrables-item">
              <Link
                href={`/livrables/${item.id}`}
                className="card skill-card livrables-item-card"
                style={{ textDecoration: 'none' }}
              >
                {item.source === 'drive' ? <SlidesIcon /> : <DocumentIcon />}
                <span className="text-body-strong">{item.title}</span>
              </Link>
              {drive !== null && item.source === 'drive' && item.driveFileId && (
                <OpenInGoogleLink driveFileId={item.driveFileId} variant="compact" />
              )}
            </li>
          ))}
        </ul>
      )}

      {drive !== null && <DriveGroup projectId={projectId} drive={drive} />}
    </section>
  );
}

function DriveGroup({ projectId, drive }: { projectId: string; drive: DriveLivrables }) {
  const message = driveStateMessage(drive.state, drive.projectName);
  return (
    <>
      <span className="text-caption livrables-group-title">Dans le Drive du projet</span>
      {message ? (
        <div className="context-panel-drive-state" style={{ marginTop: 0 }}>
          <p className="text-caption">{message}</p>
          {drive.state === 'disconnected' && (
            <a className="google-connection-connect" href="/api/google/oauth/start">
              Connecter Google Drive
            </a>
          )}
        </div>
      ) : drive.presentations.length === 0 ? (
        <p className="text-caption">Aucune autre présentation dans le dossier du projet.</p>
      ) : (
        <ul className="livrables-list">
          {drive.presentations.map((file) => (
            <DrivePresentationItem key={file.id} projectId={projectId} file={file} />
          ))}
        </ul>
      )}
    </>
  );
}

function DrivePresentationItem({
  projectId,
  file,
}: {
  projectId: string;
  file: DocumentSummary;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleImport() {
    setError(null);
    startTransition(async () => {
      const result = await importDrivePresentation(projectId, file.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/livrables/${result.data.livrableId}`);
    });
  }

  return (
    <li>
      <button
        type="button"
        className="card skill-card livrables-import"
        disabled={isPending}
        onClick={handleImport}
      >
        <SlidesIcon />
        <span className="text-body-strong">{file.name}</span>
        {isPending && <span className="text-caption">Import…</span>}
      </button>
      {error && (
        <p className="text-caption context-panel-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
