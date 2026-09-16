'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { db } from '@/db/client';
import { livrable } from '@/db/schema';

// AD-2 — this is the only file allowed to read or write LIVRABLE.
// Components never touch `db/` directly; they call this Server Action.

// The shape `LivrablesPanel` sees: a livrable row reduced to the field
// its card actually renders. Never carries `content` — nothing in this
// round-1 story reads or edits a livrable's body (only its *shape* is
// fixed at creation, per AD-9 — see `db/schema.ts`), and never carries
// `conversationId` either: this panel must never become a path by which
// conversation content reaches a surface other than the conversation's
// own view (FR-10 boundary, Story 2.3), even indirectly by exposing which
// conversation a livrable came from.
export type LivrableSummary = {
  id: string;
  title: string;
};

type FixtureLivrable = {
  title: string;
  blockText: string;
};

// Story 2.6 seed data. No real creation mechanism exists yet — the actual
// "create a livrable" flow is an agent tool (`propose_livrable_content`,
// AD-3) explicitly deferred to Epic 4 — so, mirroring `seedFixturesIfEmpty`
// in `actions/skill.ts`, this file seeds one fixture row per known seed
// project directly, rather than going through any mechanism a future
// creation flow would also need to use. Titles read plausibly against
// each seed project's shape (`integrations/mock/project-provider.ts`'s
// RFP and mission projects), same spirit as `SEED_DOCUMENTS`/
// `FIXTURE_CONVERSATIONS`. `conversationId` stays null for these fixture
// rows — they weren't produced by any real conversation.
const FIXTURE_LIVRABLES: Record<string, FixtureLivrable> = {
  'proj-acme-rfp': {
    title: "Réponse à l'appel d'offres",
    blockText: 'Contenu à venir.',
  },
  'proj-audit-mission': {
    title: 'Note de cadrage de mission',
    blockText: 'Contenu à venir.',
  },
};

// Seeds this project's fixture LIVRABLE row — but only when the project
// has zero rows yet and is one of the two known fixture projects above —
// so repeated calls (every page load) stay idempotent. Same synchronous
// `db.transaction` shape as `seedFixturesIfEmpty` in `actions/skill.ts`:
// the existence check and the insert run inside one callback with no
// `await` boundary between them, so nothing else on this single-threaded,
// synchronous `node:sqlite` driver can interleave between "check" and
// "act".
function seedFixturesIfEmpty(projectId: string): void {
  const fixture = FIXTURE_LIVRABLES[projectId];
  if (!fixture) return;

  db.transaction((tx) => {
    const existing = tx
      .select({ id: livrable.id })
      .from(livrable)
      .where(eq(livrable.projectId, projectId))
      .all();

    if (existing.length > 0) return;

    // AD-9's minimal-but-valid shape: one block, a stable id assigned at
    // creation and never reused — nothing reads this content yet, but the
    // shape must already be correct so Epic 4 never has to migrate it.
    const content = JSON.stringify({
      blocks: [{ id: crypto.randomUUID(), text: fixture.blockText }],
    });

    tx.insert(livrable)
      .values({
        id: crypto.randomUUID(),
        projectId,
        conversationId: null,
        title: fixture.title,
        content,
      })
      .run();
  });
}

export async function listLivrables(
  projectId: string,
): Promise<ActionResult<LivrableSummary[]>> {
  try {
    seedFixturesIfEmpty(projectId);

    const rows = await db
      .select({ id: livrable.id, title: livrable.title })
      .from(livrable)
      .where(eq(livrable.projectId, projectId));

    return { ok: true, data: rows };
  } catch (error) {
    console.error('listLivrables failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les livrables du projet.',
    };
  }
}
