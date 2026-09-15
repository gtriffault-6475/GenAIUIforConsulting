import { getActiveConversation, listConversations } from '@/actions/conversation';
import { listDocuments } from '@/actions/document';
import { getLastMattermostMessage } from '@/actions/mattermost';
import { getActiveProject, listProjects } from '@/actions/project';
import { ContextPanel } from '@/components/ContextPanel';
import { ConversationHistory } from '@/components/ConversationHistory';
import { ConversationList } from '@/components/ConversationList';
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
// three-column workspace grid (Story 2.1): left (conversation list),
// center (active conversation's history), right (Contexte/Mattermost
// panels, Story 1.3/1.5). The Skills/Livrables panels arrive in later
// Epic 2 stories.
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

  // Independent reads (different tables/providers, no data dependency
  // between them) — run concurrently rather than paying every mock's
  // simulated latency back-to-back on the app's single most
  // latency-sensitive path (`dynamic = 'force-dynamic'` disables caching).
  // `listConversations` and `getActiveConversation` both call the same
  // idempotent fixture-seeding helper (`seedFixturesIfEmpty`). No double
  // seed is possible regardless of array order here: `node:sqlite` is
  // synchronous and the helper's `db.transaction()` callback never
  // `await`s, so each call runs its seed check and (if needed) insert to
  // full completion before yielding control — before this function even
  // reaches its own first `await` on `Promise.all`.
  const [conversationsResult, activeConversationResult, documentsResult, mattermostResult] =
    await Promise.all([
      listConversations(activeProject.id),
      getActiveConversation(activeProject.id),
      listDocuments(activeProject.id),
      // Read straight from the provider on every render (via the action),
      // never synced into a table first — unlike documents, this preview
      // is never reused elsewhere as context, so there's no other reader
      // that would need a durable row to read from.
      getLastMattermostMessage(activeProject.mattermostChannelRef),
    ]);
  const conversations = conversationsResult.ok ? conversationsResult.data : null;
  const activeConversationId =
    activeConversationResult.ok && activeConversationResult.data
      ? activeConversationResult.data.conversation.id
      : null;
  const documents = documentsResult.ok ? documentsResult.data : null;

  return (
    <div>
      <header className="top-bar">
        <span className="text-heading">{activeProject.name}</span>
      </header>
      <div className="workspace-grid">
        <aside className="workspace-sidebar-left">
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
          />
        </aside>
        <div className="workspace-center">
          <ConversationHistory result={activeConversationResult} />
        </div>
        <aside className="workspace-sidebar-right">
          <ContextPanel projectId={activeProject.id} documents={documents} />
          <MattermostPanel result={mattermostResult} />
        </aside>
      </div>
    </div>
  );
}
