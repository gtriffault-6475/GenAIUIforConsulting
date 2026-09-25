import { getActiveConversation, listConversations } from '@/actions/conversation';
import { getDemoModeActive } from '@/actions/demo';
import { listDocuments } from '@/actions/document';
import { listLivrables } from '@/actions/livrable';
import { getLastMattermostMessage } from '@/actions/mattermost';
import { getActiveProject, listProjects } from '@/actions/project';
import { listProjectSkills } from '@/actions/skill';
import { Composer } from '@/components/Composer';
import { ContextPanel } from '@/components/ContextPanel';
import { ConversationHistory } from '@/components/ConversationHistory';
import { ConversationList } from '@/components/ConversationList';
import { DemoModeToggle } from '@/components/DemoModeToggle';
import { DemoResetAvantVente } from '@/components/DemoResetAvantVente';
import { LivrablesPanel } from '@/components/LivrablesPanel';
import { MattermostPanel } from '@/components/MattermostPanel';
import { ProactiveSuggestion } from '@/components/ProactiveSuggestion';
import { ProjectSelector } from '@/components/ProjectSelector';
import { SkillsPanel } from '@/components/SkillsPanel';
import { Stepper } from '@/components/Stepper';
import { computeStepStatuses, STEPS } from '@/domain/workflow';

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
// composer — Story 2.1/2.5), right (Contexte, then Livrables, then
// Mattermost panels — Story 1.3/2.6/1.5, order fixed by
// `epic-2-context.md`).
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
  // with the conversation seed. `listLivrables` (Story 2.6) adds a third,
  // equally independent idempotent seed helper over `LIVRABLE` — same
  // reasoning again.
  const [
    conversationsResult,
    activeConversationResult,
    documentsResult,
    mattermostResult,
    skillsResult,
    livrablesResult,
    projectsResult,
    demoModeResult,
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
    listLivrables(activeProject.id),
    // spec-changement-de-projet-a-la-volee.md. Fetched here (rather
    // than only on demand when the top-bar trigger is clicked) so the
    // reopened dropdown never blocks on its own request — same
    // parallelization reasoning as every other read in this
    // `Promise.all`, independent of them all.
    listProjects(),
    // spec-toggle-mode-demo-ui.md. A second, independent read of the same
    // singleton `getDemoModeActive` already calls from `app/layout.tsx` —
    // that one drives the banner/border, this one only seeds
    // `DemoModeToggle`'s initial `active` prop below; there is no shared
    // request-scoped cache to reuse between the two Server Components.
    getDemoModeActive(),
  ]);
  const conversations = conversationsResult.ok ? conversationsResult.data : null;
  const activeConversationId =
    activeConversationResult.ok && activeConversationResult.data
      ? activeConversationResult.data.conversation.id
      : null;
  const documents = documentsResult.ok ? documentsResult.data : null;
  const skills = skillsResult.ok ? skillsResult.data : null;
  const livrables = livrablesResult.ok ? livrablesResult.data : null;
  const projects = projectsResult.ok ? projectsResult.data : null;
  const demoModeActive = demoModeResult.ok ? demoModeResult.data : false;
  // Story 3.1 — Stepper de workflow. Read from the active conversation's
  // own `stepKey` (AD-6: never the other way around) — a fixture
  // conversation or a failed read both fall back to `null`, which
  // `computeStepStatuses` (a pure function, `domain/workflow.ts`) turns
  // into "every step upcoming, none active" rather than crashing or
  // guessing.
  const steps = computeStepStatuses(
    activeConversationResult.ok
      ? (activeConversationResult.data?.conversation.stepKey ?? null)
      : null,
  );

  // Story 3.3 — Suggestion proactive de démarrage (FR-17/FR-18). Single
  // display condition, per the spec's Boundaries: avant-vente project AND
  // active conversation attached to a step (`stepKey !== null`) AND that
  // conversation has zero messages — covers both "ouverture de projet" et
  // "passage à une nouvelle étape" without a dedicated code path for
  // either, since both land on the same "step conversation, no message"
  // state. A failed or absent active conversation (`ok:false` or `null`)
  // simply never satisfies this condition, same fallback as `steps` above.
  const activeConversationData = activeConversationResult.ok
    ? activeConversationResult.data
    : null;
  const showStartingSuggestion =
    activeProject.type === 'avant-vente' &&
    activeConversationData !== null &&
    activeConversationData.conversation.stepKey !== null &&
    activeConversationData.messages.length === 0;

  // Generating a suggestion is a real, billed Anthropic API call
  // (`skills/propose_starting_point.ts` → AD-11's `sendToAgent`) — this
  // Server Component only resolves the step's French label here; it must
  // never call `getStartingSuggestion` itself. Doing so here would block
  // this render (and every other panel on the page) behind a live agent
  // call, and would re-run that call on every unrelated `router.refresh()`
  // (e.g. another panel refreshing the page) for as long as the
  // conversation stays empty. `ProactiveSuggestion` calls it exactly once,
  // client-side, on its own mount instead (see that component).
  let startingSuggestionStepLabel: string | null = null;
  if (showStartingSuggestion && activeConversationData) {
    const stepKey = activeConversationData.conversation.stepKey;
    const step = STEPS.find((candidate) => candidate.key === stepKey);
    // `selectStep` (Story 3.1) only ever writes one of `STEPS`' 4 keys, so
    // this should always match — but the suggestion needs a French label
    // to build its prompt from, and silently skipping an unmatched key is
    // the safer fallback over passing a garbage label to the agent.
    if (step) {
      startingSuggestionStepLabel = step.label;
    }
  }

  return (
    <div>
      <header className="top-bar">
        <ProjectSelector projects={projects} activeProject={activeProject} />
        <DemoModeToggle active={demoModeActive} />
      </header>
      {/* Story 3.2 — Workflow du cas "livrable de mission" (FR-15). A
          mission project never has a step to be active in, but the stepper
          must not be gated on that alone: it is a UI-level concern, not a
          consequence of `computeStepStatuses`'s own logic (which stays
          identical for both project types, AD-5). */}
      {activeProject.type === 'avant-vente' && (
        <>
          <Stepper projectId={activeProject.id} steps={steps} />
          <DemoResetAvantVente projectId={activeProject.id} />
        </>
      )}
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
          {startingSuggestionStepLabel && activeConversationData?.conversation.stepKey && (
            // `key` is namespaced (`suggestion-${id}`), not the bare
            // conversation id: `Composer` below is a direct sibling under
            // this same `.workspace-center` and already keys itself on that
            // bare id (`activeConversationId ?? 'none'`) — React warns on
            // "two children with the same key" for any two direct siblings
            // sharing one, regardless of element type, which is exactly
            // what a bare `id` here collided with. The remount-per-
            // conversation behavior this key exists for (AD-7's masked/
            // accepted state never surviving a conversation switch, FR-18)
            // only depends on the key changing together with the id, not on
            // its exact string — the namespace prefix preserves that.
            <ProactiveSuggestion
              key={`suggestion-${activeConversationData.conversation.id}`}
              projectId={activeProject.id}
              stepKey={activeConversationData.conversation.stepKey}
              stepLabel={startingSuggestionStepLabel}
            />
          )}
          <ConversationHistory result={activeConversationResult} />
          {/* `key` forces a fresh `Composer` instance per conversation — its
              draft/error state is local `useState`, never reset by a prop
              change alone. Without this, switching conversations kept the
              previous conversation's typed draft and error banner, and a
              draft could be sent into the wrong conversation (see the
              Epic 2 retrospective). */}
          <Composer key={activeConversationId ?? 'none'} conversationId={activeConversationId} />
        </div>
        {/* FR-10 boundary (Story 2.3): `activeConversationResult` carries
            the active conversation's message content and is scoped to this
            whole function — but it must only ever reach `ConversationHistory`
            above. `LivrablesPanel` below fetches its own data
            (`listLivrables`, which never reads `MESSAGE`) and must never be
            passed `activeConversationResult` (or `.data.messages`); any
            future panel added to this right sidebar must do the same. */}
        <aside className="workspace-sidebar-right">
          <ContextPanel projectId={activeProject.id} documents={documents} />
          <LivrablesPanel livrables={livrables} />
          <MattermostPanel result={mattermostResult} />
        </aside>
      </div>
    </div>
  );
}
