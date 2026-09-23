'use server';

import { and, eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { insertMessage } from '@/actions/insert-message';
import { seedIfEmpty } from '@/actions/seed-if-empty';
import { listLoadedSkillInstructions } from '@/actions/skill';
import { db } from '@/db/client';
import { conversation, message, project } from '@/db/schema';
import { STEPS } from '@/domain/workflow';
import { proposeStartingPoint } from '@/skills/propose_starting_point';

// AD-2 — this is the only file allowed to read or write CONVERSATION.
// MESSAGE is owned by `actions/message.ts` (`sendMessage` moved there,
// epic-2-retro-item-13) — the one exception is `seedFixturesIfEmpty`
// below, which still inserts fixture MESSAGE rows alongside their owning
// CONVERSATION in the same transaction; every other MESSAGE read/write
// stays `actions/message.ts`'s exclusive concern. Components never touch
// `db/` directly; they call these Server Actions. Mirrors
// `actions/project.ts`'s shape.

// FR-10 boundary (Story 2.3 — Confidentialité de la conversation): this is
// the only shape a conversation may take *outside* its own view. It is
// consumed by every surface that lists conversations without rendering
// them — `ConversationList.tsx` today, a future Livrables panel (Story
// 2.6) tomorrow — so it must never gain a message/content field. Only
// `getActiveConversation` below returns message content, and only to
// `ConversationHistory`, the conversation's own view. A future Server
// Action that reads MESSAGE must stay called exclusively from that
// conversation's own render path — never from a list/summary surface.
export type ConversationSummary = {
  id: string;
  projectId: string;
  title: string;
  // Story 3.1 — Stepper de workflow. `null` for a free conversation not
  // attached to any stepper step (fixtures, "Nouvelle conversation").
  // FR-10 is unaffected: this is not content, just which fixed step (if
  // any) this conversation belongs to (see `db/schema.ts`'s comment on
  // `conversation.stepKey`).
  stepKey: string | null;
};

// FR-10 boundary (Story 2.3): this is the content-bearing type
// `ConversationSummary` above is deliberately kept free of. It is produced
// only by `getActiveConversation` and consumed only by
// `ConversationHistory` (the conversation's own view) — never pass a
// `MessageSummary[]` (or anything holding `.content`) to a list/summary
// surface, a log line, or any component other than `ConversationHistory`.
export type MessageSummary = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  createdAt: string;
};

type FixtureMessage = {
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
};

type FixtureConversation = {
  title: string;
  messages: FixtureMessage[];
};

// Story 2.1 seed data. No OCTO-side provider produces conversations
// (AD-1 exempts app-internal data — see the spec's Design Notes), so this
// file writes fixture rows directly, the same way `addManualDocument`
// (`actions/document.ts`) writes app-internal DOCUMENT rows, rather than
// going through an `integrations/mock/*` adapter. Content is generic
// enough to read plausibly against either seed project shape
// (`integrations/mock/project-provider.ts`'s RFP and mission projects),
// same "no obviously-fake names" spirit as `SEED_DOCUMENTS`.
const FIXTURE_CONVERSATIONS: FixtureConversation[] = [
  {
    title: 'Cadrage de la note de mission',
    messages: [
      {
        role: 'user',
        content:
          "Pouvez-vous m'aider à structurer la note de mission pour ce projet ?",
        model: null,
      },
      {
        role: 'assistant',
        content:
          'Je vous propose un plan en quatre parties : contexte, objectifs, périmètre et livrables attendus. Souhaitez-vous que je détaille chaque partie ?',
        model: 'Claude Sonnet 5',
      },
      {
        role: 'user',
        content: 'Oui, commençons par le contexte.',
        model: null,
      },
    ],
  },
  {
    title: "Réponse à l'appel d'offres",
    messages: [
      {
        role: 'user',
        content:
          "Quels sont les points clés à mettre en avant dans notre réponse à cet appel d'offres ?",
        model: null,
      },
      {
        role: 'assistant',
        content:
          "Trois éléments ressortent du cahier des charges : la maîtrise du domaine réglementaire, les références sur des projets similaires et la disponibilité de l'équipe proposée.",
        model: 'Claude Opus 5',
      },
    ],
  },
];

// Seeds `FIXTURE_CONVERSATIONS` for `projectId` — and makes the first one
// active — but only when the project has zero CONVERSATION rows yet, so
// repeated calls (every page load) stay idempotent. The existence check
// and the inserts run inside the same synchronous transaction callback
// (`node:sqlite` is a synchronous driver — see `actions/project.ts:90-116`
// and `db/client.ts`), so nothing else on this single-threaded process can
// interleave between "check" and "act": two callers racing to seed the
// same empty project (e.g. `listConversations` and `getActiveConversation`
// both called from the same `Promise.all` in `app/page.tsx`) cannot both
// observe zero rows and both insert.
function seedFixturesIfEmpty(projectId: string): void {
  db.transaction((tx) => {
    seedIfEmpty(
      () => {
        const existing = tx
          .select({ id: conversation.id })
          .from(conversation)
          .where(eq(conversation.projectId, projectId))
          .all();

        return existing.length > 0;
      },
      () => {
        let firstConversationId: string | null = null;

        // Story 2.5 — Sélection du modèle et envoi d'un message. `MESSAGE.
        // createdAt` orders history now that real messages are appended one
        // at a time (see the column's comment in `db/schema.ts`); fixture
        // messages get deterministic, strictly increasing timestamps
        // (spaced one second apart, per the spec's Code Map) rather than
        // all sharing the instant this transaction runs, so their order is
        // guaranteed the same way a real conversation's would be.
        //
        // The base anchors 5 minutes *before* this seeding instant, not at
        // it: seeding is lazy (triggered by the first `listConversations`/
        // `getActiveConversation` call on an empty project), and
        // `sendMessage` (`actions/message.ts`) can run moments later, in
        // the same session, using the real wall clock for its own
        // `createdAt`. Anchoring fixtures at `Date.now()` and counting
        // forward would reserve timestamps *ahead* of that real clock — a
        // message sent within a few seconds of seeding would then sort
        // into the middle of the fixture conversation instead of after it
        // (caught during this story's manual verification: a message sent
        // ~20ms after seeding landed between fixture messages 1 and 2,
        // whose synthetic timestamps were already 1-2 seconds "ahead"). A
        // margin comfortably larger than any realistic fixture-message
        // count keeps every fixture timestamp safely in the past instead.
        let fixtureCreatedAt = Date.now() - 5 * 60 * 1000;
        function nextFixtureCreatedAt(): string {
          const iso = new Date(fixtureCreatedAt).toISOString();
          fixtureCreatedAt += 1000;
          return iso;
        }

        for (const fixture of FIXTURE_CONVERSATIONS) {
          const conversationId = crypto.randomUUID();
          firstConversationId ??= conversationId;

          tx.insert(conversation)
            .values({ id: conversationId, projectId, title: fixture.title })
            .run();

          for (const fixtureMessage of fixture.messages) {
            insertMessage(tx, {
              id: crypto.randomUUID(),
              conversationId,
              role: fixtureMessage.role,
              content: fixtureMessage.content,
              model: fixtureMessage.model,
              createdAt: nextFixtureCreatedAt(),
            });
          }
        }

        // Only this first-ever seed defaults `activeConversationId` — a
        // real selection (`selectConversation`) always overwrites it
        // afterwards, and this branch never runs again once the project
        // has rows.
        tx.update(project)
          .set({ activeConversationId: firstConversationId })
          .where(eq(project.id, projectId))
          .run();
      },
    );
  });
}

export async function listConversations(
  projectId: string,
): Promise<ActionResult<ConversationSummary[]>> {
  try {
    seedFixturesIfEmpty(projectId);

    const rows = await db
      .select({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        stepKey: conversation.stepKey,
      })
      .from(conversation)
      .where(eq(conversation.projectId, projectId));

    return { ok: true, data: rows };
  } catch (error) {
    console.error('listConversations failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les conversations du projet.',
    };
  }
}

export async function getActiveConversation(projectId: string): Promise<
  ActionResult<{
    conversation: ConversationSummary;
    messages: MessageSummary[];
  } | null>
> {
  try {
    // Ensures fixtures (and a default active conversation) exist before
    // reading `PROJECT.activeConversationId` below — idempotent no-op on
    // every call after the first, same as `listConversations`.
    seedFixturesIfEmpty(projectId);

    const [projectRow] = await db
      .select({ activeConversationId: project.activeConversationId })
      .from(project)
      .where(eq(project.id, projectId));

    if (!projectRow?.activeConversationId) {
      return { ok: true, data: null };
    }

    const [conversationRow] = await db
      .select({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        stepKey: conversation.stepKey,
      })
      .from(conversation)
      .where(eq(conversation.id, projectRow.activeConversationId));

    // `activeConversationId` set but no matching CONVERSATION row is not
    // "no conversation active" — it means the FK target itself went
    // missing, which should surface as an error rather than silently
    // rendering an empty center column (mirrors `getActiveProject`'s same
    // distinction in `actions/project.ts`).
    if (!conversationRow) {
      console.error(
        'getActiveConversation: PROJECT.activeConversationId points at a missing CONVERSATION row',
        projectRow.activeConversationId,
      );
      return { ok: false, error: 'La conversation active est introuvable.' };
    }

    // Defense in depth for conversation privacy (FR-10): never return a
    // conversation that does not belong to the requested project, even
    // though `selectConversation` never lets this happen today.
    if (conversationRow.projectId !== projectId) {
      console.error(
        'getActiveConversation: PROJECT.activeConversationId points at a CONVERSATION from a different project',
        { projectId, conversationProjectId: conversationRow.projectId },
      );
      return { ok: false, error: 'La conversation active est introuvable.' };
    }

    const messages = await db
      .select({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        model: message.model,
        createdAt: message.createdAt,
      })
      .from(message)
      .where(eq(message.conversationId, conversationRow.id))
      .orderBy(message.createdAt);

    return { ok: true, data: { conversation: conversationRow, messages } };
  } catch (error) {
    console.error('getActiveConversation failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer la conversation active.',
    };
  }
}

export async function selectConversation(
  conversationId: string,
): Promise<ActionResult<void>> {
  try {
    const [conversationRow] = await db
      .select({ projectId: conversation.projectId })
      .from(conversation)
      .where(eq(conversation.id, conversationId));

    if (!conversationRow) {
      return { ok: false, error: 'Cette conversation est introuvable.' };
    }

    db.update(project)
      .set({ activeConversationId: conversationId })
      .where(eq(project.id, conversationRow.projectId))
      .run();

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('selectConversation failed', error);
    return {
      ok: false,
      error: 'Impossible de sélectionner cette conversation.',
    };
  }
}

// Story 2.2 — Création d'une nouvelle conversation. Inserts an empty
// CONVERSATION row (default French title, no MESSAGE rows) and makes it
// active in the same synchronous `db.transaction` callback as
// `seedFixturesIfEmpty` above, for the same reason: the insert and the
// `PROJECT.activeConversationId` update must land atomically, with no
// `await` boundary between them where another reader could observe one
// without the other.
export async function createConversation(
  projectId: string,
): Promise<ActionResult<ConversationSummary>> {
  try {
    const newConversation: ConversationSummary = {
      id: crypto.randomUUID(),
      projectId,
      title: 'Nouvelle conversation',
      // A manually created conversation is always free-form, never
      // attached to a stepper step (Story 3.1's `selectStep` below is the
      // only path that sets `stepKey`).
      stepKey: null,
    };

    db.transaction((tx) => {
      tx.insert(conversation).values(newConversation).run();

      tx.update(project)
        .set({ activeConversationId: newConversation.id })
        .where(eq(project.id, projectId))
        .run();
    });

    return { ok: true, data: newConversation };
  } catch (error) {
    console.error('createConversation failed', error);
    return {
      ok: false,
      error: 'Impossible de créer une nouvelle conversation.',
    };
  }
}

// Story 3.1 — Stepper de workflow (avant-vente). Finds the project's
// existing CONVERSATION for `stepKey` or creates one (titled with that
// step's French label from `domain/workflow.ts`'s `STEPS` — the only
// place that list of labels lives), then activates it — the same
// find-or-create-then-activate shape as `createConversation` above, in
// one synchronous `db.transaction` callback (no `await` inside): the
// existence check and the insert/update must stay atomic, exactly like
// `seedFixturesIfEmpty`, so two concurrent callers can never both observe
// "no conversation for this step yet" and both insert one — which the
// partial unique index on `(project_id, step_key)` (`db/schema.ts`) would
// otherwise reject as a constraint violation instead of just reusing the
// existing row.
export async function selectStep(
  projectId: string,
  stepKey: string,
): Promise<ActionResult<void>> {
  // Defense in depth: `Stepper.tsx` only ever sends one of `STEPS`' 4
  // keys, but a Server Action is a network-reachable endpoint a
  // client-side restriction can't bind — reject an out-of-list key before
  // it ever reaches the DB, the same way `sendMessage` re-validates
  // `model` against `MODELS`. Without this, an arbitrary `stepKey` would
  // silently create a permanent conversation `computeStepStatuses` can
  // never light up (unmatched key → every step stays "upcoming"),
  // consuming a slot in the partial unique index with no way to reach or
  // clean it up again through the UI.
  const step = STEPS.find((candidate) => candidate.key === stepKey);
  if (!step) {
    return { ok: false, error: 'Étape invalide.' };
  }

  try {
    db.transaction((tx) => {
      const [existing] = tx
        .select({ id: conversation.id })
        .from(conversation)
        .where(
          and(
            eq(conversation.projectId, projectId),
            eq(conversation.stepKey, stepKey),
          ),
        )
        .all();

      let conversationId: string;
      if (existing) {
        conversationId = existing.id;
      } else {
        conversationId = crypto.randomUUID();

        tx.insert(conversation)
          .values({
            id: conversationId,
            projectId,
            title: step.label,
            stepKey,
          })
          .run();
      }

      tx.update(project)
        .set({ activeConversationId: conversationId })
        .where(eq(project.id, projectId))
        .run();
    });

    return { ok: true, data: undefined };
  } catch (error) {
    console.error('selectStep failed', error);
    return { ok: false, error: 'Impossible de sélectionner cette étape.' };
  }
}

// Story 3.3 — Suggestion proactive de démarrage. Called by `app/page.tsx`
// only when its display condition is already true (avant-vente project,
// `stepKey` non-null active conversation, zero messages) — this function
// itself does not re-check that condition, it only generates the text.
// Loads the project's skills the same way `sendMessage` does
// (`listLoadedSkillInstructions`, already used there) so the suggestion
// is informed by the same skills a real message would be, then delegates
// to `skills/propose_starting_point.ts` (AD-11's `sendToAgent`, via that
// dedicated assembly point). Nothing here is persisted (AD-7): the result
// is either shown once or discarded, never written to MESSAGE or any
// other table. Per the spec's Boundaries ("un échec de génération reste
// silencieux"), a failure is only logged here — `app/page.tsx` simply
// does not render `ProactiveSuggestion` when this returns `{ok:false}`,
// never a visible error.
export async function getStartingSuggestion(
  projectId: string,
  stepLabel: string,
): Promise<ActionResult<string>> {
  try {
    const loadedSkillsResult = await listLoadedSkillInstructions(projectId);
    if (!loadedSkillsResult.ok) {
      console.error(
        'getStartingSuggestion: failed to load skills',
        loadedSkillsResult.error,
      );
      return { ok: false, error: loadedSkillsResult.error };
    }

    const result = await proposeStartingPoint({
      stepLabel,
      loadedSkills: loadedSkillsResult.data,
    });

    if (!result.ok) {
      console.error('getStartingSuggestion: proposeStartingPoint failed', result.error);
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result.content };
  } catch (error) {
    console.error('getStartingSuggestion failed', error);
    return {
      ok: false,
      error: "Impossible de générer une suggestion de démarrage.",
    };
  }
}
