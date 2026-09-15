'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { conversation, message, project } from '@/db/schema';

// AD-2 — this is the only file allowed to read or write
// CONVERSATION/MESSAGE. Components never touch `db/` directly; they call
// these Server Actions. Mirrors `actions/project.ts`'s shape.

export type ConversationSummary = {
  id: string;
  projectId: string;
  title: string;
};

export type MessageSummary = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
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
    const existing = tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(eq(conversation.projectId, projectId))
      .all();

    if (existing.length > 0) return;

    let firstConversationId: string | null = null;

    for (const fixture of FIXTURE_CONVERSATIONS) {
      const conversationId = crypto.randomUUID();
      firstConversationId ??= conversationId;

      tx.insert(conversation)
        .values({ id: conversationId, projectId, title: fixture.title })
        .run();

      for (const fixtureMessage of fixture.messages) {
        tx.insert(message)
          .values({
            id: crypto.randomUUID(),
            conversationId,
            role: fixtureMessage.role,
            content: fixtureMessage.content,
            model: fixtureMessage.model,
          })
          .run();
      }
    }

    // Only this first-ever seed defaults `activeConversationId` — a real
    // selection (`selectConversation`) always overwrites it afterwards,
    // and this branch never runs again once the project has rows.
    tx.update(project)
      .set({ activeConversationId: firstConversationId })
      .where(eq(project.id, projectId))
      .run();
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
      })
      .from(message)
      .where(eq(message.conversationId, conversationRow.id));

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
