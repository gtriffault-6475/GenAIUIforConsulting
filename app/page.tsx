import { getActiveConversation, listConversations } from '@/actions/conversation';
import { listDocuments } from '@/actions/document';
import { getLastMattermostMessage } from '@/actions/mattermost';
import { getActiveProject, listProjects } from '@/actions/project';
import { listProjectSkills } from '@/actions/skill';
import { Composer } from '@/components/Composer';
import { ContextPanel } from '@/components/ContextPanel';
import { ConversationHistory } from '@/components/ConversationHistory';
import { ConversationList } from '@/components/ConversationList';
import { MattermostPanel } from '@/components/MattermostPanel';
import { ProjectSelector } from '@/components/ProjectSelector';
import { SkillsPanel } from '@/components/SkillsPanel';

// Reads APP_STATE (mutable, changed by the `selectProject` Server Action)
// on every request — Next must not cache this as a static shell from
// build time, or a reload after selecting a project would still show the
// selector.
export const dynamic = 'force-dynamic';

// Story 1.2 — Sélection d'un projet Octopod. No project selected yet →
// only the selector renders (no conversation/skills/livrable surface).
// Once a project is active, this is a top bar naming it plus the
// three-column workspace grid: left (conversation list, then Skills
// panel — Story 2.1/2.4), center (active conversation's history, then the
// composer — Story 2.1/2.5), right (Contexte/Mattermost panels, Story
// 1.3/1.5). The Livrables panel arrives in a later Epic 2 story (2.6).
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
  // reaches its own first `await` on `Promise.all`. `listProjectSkills`
  // (Story 2.4) has its own, separate idempotent seed helper over a
  // different table (`PROJECT_SKILL`) — same reasoning, no interaction
  // with the conversation seed.
  const [
    conversationsResult,
    activeConversationResult,
    documentsResult,
    mattermostResult,
    skillsResult,
  ] = await Promise.all([
    listConversations(activeProject.id),
    getActiveConversation(activeProject.id),
    listDocuments(activeProject.id),
    // Read straight from the provider on every render (via the action),
    // never synced into a table first — unlike documents, this preview
    // is never reused elsewhere as context, so there's no other reader
    // that would need a durable row to read from.
    getLastMattermostMessage(activeProject.mattermostChannelRef),
    listProjectSkills(activeProject.id),
  ]);
  const conversations = conversationsResult.ok ? conversationsResult.data : null;
  const activeConversationId =
    activeConversationResult.ok && activeConversationResult.data
      ? activeConversationResult.data.conversation.id
      : null;
  const documents = documentsResult.ok ? documentsResult.data : null;
  const skills = skillsResult.ok ? skillsResult.data : null;

  return (
    <div>
      <header className="top-bar">
        <span className="text-heading">{activeProject.name}</span>
      </header>
      <div className="workspace-grid">
        <aside className="workspace-sidebar-left">
          <ConversationList
            projectId={activeProject.id}
            conversations={conversations}
            activeConversationId={activeConversationId}
          />
          <SkillsPanel projectId={activeProject.id} skills={skills} />
        </aside>
        <div className="workspace-center">
          <ConversationHistory result={activeConversationResult} />
          <Composer conversationId={activeConversationId} />
        </div>
        {/* FR-10 boundary (Story 2.3): `activeConversationResult` carries
            the active conversation's message content and is scoped to this
            whole function — but it must only ever reach `ConversationHistory`
            above. A future panel added to this right sidebar (e.g. Story
            2.6's Livrables) must fetch its own data; never pass
            `activeConversationResult` (or `.data.messages`) to it. */}
        <aside className="workspace-sidebar-right">
          <ContextPanel projectId={activeProject.id} documents={documents} />
          <MattermostPanel result={mattermostResult} />
        </aside>
      </div>
    </div>
  );
}
