import { listDocuments } from '@/actions/document';
import { getLastMattermostMessage } from '@/actions/mattermost';
import { getActiveProject, listProjects } from '@/actions/project';
import { ContextPanel } from '@/components/ContextPanel';
import { MattermostPanel } from '@/components/MattermostPanel';
import { ProjectSelector } from '@/components/ProjectSelector';

// Reads APP_STATE (mutable, changed by the `selectProject` Server Action)
// on every request — Next must not cache this as a static shell from
// build time, or a reload after selecting a project would still show the
// selector.
export const dynamic = 'force-dynamic';

// Story 1.2 — Sélection d'un projet Octopod. No project selected yet →
// only the selector renders (no conversation/skills/livrable surface).
// Once a project is active, this is a top bar naming it plus the
// Contexte panel (Story 1.3); the Livrables/Mattermost panels and
// conversation surface arrive in later stories. Not yet the full
// three-column workspace grid — a single panel below the top bar is
// enough until Epic 2 has a center conversation to put beside it.
export default async function Home() {
  const activeProjectResult = await getActiveProject();

  // A failed read is not the same state as "no project selected yet": the
  // latter is expected on first run, the former can hide an already
  // -persisted `activeProjectId` behind what would otherwise look like an
  // identical empty selector (silently contradicting "selection persists
  // across reloads"). Surface it distinctly instead of falling through.
  if (!activeProjectResult.ok) {
    return (
      <main className="empty-state">
        <p className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
          {activeProjectResult.error}
        </p>
      </main>
    );
  }

  const activeProject = activeProjectResult.data;

  if (!activeProject) {
    const projectsResult = await listProjects();
    const projects = projectsResult.ok ? projectsResult.data : null;

    return (
      <main className="empty-state">
        <span className="text-display" style={{ color: 'var(--color-accent)' }}>
          GenAI4Consulting
        </span>
        <p className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
          Sélectionnez un projet Octopod pour commencer.
        </p>
        <ProjectSelector projects={projects} />
      </main>
    );
  }

  const documentsResult = await listDocuments(activeProject.id);
  const documents = documentsResult.ok ? documentsResult.data : null;

  // Read straight from the provider on every render (via the action),
  // never synced into a table first — unlike documents, this preview is
  // never reused elsewhere as context, so there's no other reader that
  // would need a durable row to read from.
  const mattermostResult = await getLastMattermostMessage(
    activeProject.mattermostChannelRef,
  );

  return (
    <div>
      <header className="top-bar">
        <span className="text-heading">{activeProject.name}</span>
      </header>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-gutter)',
        }}
      >
        <ContextPanel projectId={activeProject.id} documents={documents} />
        <MattermostPanel result={mattermostResult} />
      </div>
    </div>
  );
}
