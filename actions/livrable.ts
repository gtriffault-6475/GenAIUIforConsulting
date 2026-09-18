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

// The shape the Éditeur assisté (Story 4.1, `app/livrables/[id]/page.tsx`)
// reads: unlike `LivrableSummary`, this carries `content.blocks` — each
// block keeps its stable `id` (AD-9, `crypto.randomUUID()` at creation,
// never regenerated) since Story 4.2's anchored suggestions will target it
// as `anchorRef`. Still never carries `conversationId` — nothing in this
// story needs it, and exposing it here would be the same FR-10-adjacent
// leak `LivrableSummary`'s comment already rules out for the panel.
export type LivrableDetail = {
  id: string;
  title: string;
  blocks: { id: string; text: string }[];
};

// Reads a single LIVRABLE row by id alone, no project filter (Boundaries:
// this round is mono-projet-actif, `APP_STATE` singleton, and `id` is an
// opaque, non-guessable UUID — nothing in `epic-4-context.md` asks for a
// project check on top of that, and "Ouvrir l'Éditeur assisté ne fait
// qu'un SELECT" per its Technical Decisions). `data: null` means "no row
// for this id" — distinct from `{ok:false}` (a read failure), same
// convention as `getActiveConversation`/`getActiveProject`: the page must
// never confuse the two.
export async function getLivrable(
  id: string,
): Promise<ActionResult<LivrableDetail | null>> {
  try {
    const [row] = await db.select().from(livrable).where(eq(livrable.id, id));

    if (!row) {
      return { ok: true, data: null };
    }

    const content = JSON.parse(row.content) as { blocks?: unknown };

    // `JSON.parse` only guarantees valid JSON, not the expected shape — a
    // bare type assertion here would let a malformed `content` (e.g. `{}`)
    // through as `{ok:true, data:{...,blocks:undefined}}`, a silent
    // success the caller has no way to distinguish from a real empty
    // livrable. Validate before trusting it, same as the catch branch
    // below treats any other read failure.
    if (!Array.isArray(content?.blocks)) {
      console.error('getLivrable: malformed content.blocks', id);
      return {
        ok: false,
        error: 'Impossible de récupérer ce livrable.',
      };
    }

    return {
      ok: true,
      data: {
        id: row.id,
        title: row.title,
        blocks: content.blocks as { id: string; text: string }[],
      },
    };
  } catch (error) {
    console.error('getLivrable failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer ce livrable.',
    };
  }
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
