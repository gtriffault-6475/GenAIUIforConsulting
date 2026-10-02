'use server';

import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { currentDriveProvider } from '@/actions/current-drive-provider';
import { getDrivePresentation, listDrivePresentations } from '@/actions/document';
import { resolveDriveMode } from '@/actions/drive-mode';
import { deleteRevokedGoogleConnection } from '@/actions/google-credentials';
import type { ActionResult } from '@/actions/types';
import { sendMessage } from '@/actions/message';
import { seedIfEmpty } from '@/actions/seed-if-empty';
import { db } from '@/db/client';
import { conversation, livrable, suggestion } from '@/db/schema';
import {
  hasModifiedBlocks,
  keepsSuggestionAfterReimport,
  toSlideBlocks,
  type LivrableBlock,
} from '@/domain/livrable';
import { resolveAnchorPosition } from '@/domain/suggestion';
import type { PresentationContent } from '@/integrations';
import { MODELS } from '@/skills/models';
import type { ProposedLivrableContent } from '@/skills/propose_livrable_content';

// AD-2 — this is the only file allowed to read or write LIVRABLE. The one
// exception is `SUGGESTION`: `createLivrableWithSuggestions` below inserts
// both rows in a single transaction (the spec's Always: "LIVRABLE+SUGGESTION
// dans une seule transaction synchrone"), so that insert lives here rather
// than in `actions/suggestion.ts` — every other read/write of `SUGGESTION`
// stays that file's exclusive concern (its own header comment).
// Story 5.3 adds two more exceptions of the same kind: `importPresentation`
// inserts the dedicated CONVERSATION with its LIVRABLE (AD-14), and
// `reimportPresentation` deletes the stale unresolved SUGGESTION rows in
// the same transaction as the new blocks.
// Components never touch `db/` directly; they call this Server Action.

// The shape `LivrablesPanel` sees: a livrable row reduced to the field
// its card actually renders. Never carries `content` — nothing in this
// round-1 story reads or edits a livrable's body (only its *shape* is
// fixed at creation, per AD-9 — see `db/schema.ts`), and never carries
// `conversationId` either: this panel must never become a path by which
// conversation content reaches a surface other than the conversation's
// own view (FR-10 boundary, Story 2.3), even indirectly by exposing which
// conversation a livrable came from.
//
// Story 5.3 — `source` drives the Slides icon of a drive livrable.
export type LivrableSummary = {
  id: string;
  title: string;
  source: 'local' | 'drive';
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
    seedIfEmpty(
      () => {
        const existing = tx
          .select({ id: livrable.id })
          .from(livrable)
          .where(eq(livrable.projectId, projectId))
          .all();

        return existing.length > 0;
      },
      () => {
        // AD-9's minimal-but-valid shape: one block, a stable id assigned
        // at creation and never reused — nothing reads this content yet,
        // but the shape must already be correct so Epic 4 never has to
        // migrate it.
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
      },
    );
  });
}

// The shape the Éditeur assisté (Story 4.1, `app/livrables/[id]/page.tsx`)
// reads: unlike `LivrableSummary`, this carries `content.blocks` — each
// block keeps its stable `id` (AD-9, `crypto.randomUUID()` at creation,
// never regenerated) since Story 4.2's anchored suggestions will target it
// as `anchorRef`. Still never carries `conversationId` — nothing in this
// story needs it, and exposing it here would be the same FR-10-adjacent
// leak `LivrableSummary`'s comment already rules out for the panel.
//
// Story 5.3 — `source` tells the editor to group the blocks by slide and
// offer "Réimporter"; a drive livrable's blocks carry their slide and
// `driveText` (AD-13).
export type LivrableDetail = {
  id: string;
  title: string;
  source: 'local' | 'drive';
  blocks: LivrableBlock[];
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
        source: row.source,
        blocks: content.blocks as LivrableBlock[],
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
      .select({ id: livrable.id, title: livrable.title, source: livrable.source })
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

// Story 4.2 — Génération des suggestions ancrées à l'écriture (AD-2, AD-9).
// Called from `actions/message.ts`'s `sendMessage`, via the
// `executeTool` closure it hands to `skills/buildRequest.ts`'s
// `sendToAgent` — the model's validated tool input
// (`ProposedLivrableContent`, from `parseProposeLivrableContentInput`)
// becomes one new LIVRABLE row plus its `SUGGESTION` rows, in a single
// synchronous `db.transaction`, same shape as `selectStep`/`selectProject`
// (Always). Always inserts a brand-new LIVRABLE — never updates an
// existing row (Never: "jamais de mise à jour d'un livrable existant ici",
// régénération deferred to Story 4.4).
//
// Block ids are generated here, server-side, one per `proposal.blocks`
// entry (Always: "Ids de bloc toujours générés côté serveur") — the model
// never sees or invents one. Each `proposal.suggestions[].blockIndex` is
// then resolved against that same freshly generated array to find the
// block id it anchors to, before the SUGGESTION row is inserted — a
// `blockIndex` out of range at this point would be a defense-in-depth gap
// even though `parseProposeLivrableContentInput` already rejects it, so it
// is still checked here rather than trusted blindly.
export async function createLivrableWithSuggestions(
  projectId: string,
  conversationId: string,
  proposal: ProposedLivrableContent,
): Promise<ActionResult<{ livrableId: string }>> {
  try {
    const livrableId = crypto.randomUUID();

    const blocks = proposal.blocks.map((text) => ({
      id: crypto.randomUUID(),
      text,
    }));

    const content = JSON.stringify({ blocks });

    db.transaction((tx) => {
      tx.insert(livrable)
        .values({
          id: livrableId,
          projectId,
          conversationId,
          title: proposal.title,
          content,
        })
        .run();

      for (const item of proposal.suggestions) {
        const block = blocks[item.blockIndex];
        if (!block) {
          // Defense in depth only — `parseProposeLivrableContentInput`
          // already rejects any out-of-range `blockIndex` before this
          // function is ever called. Skip rather than throw mid-transaction
          // so one bad entry never orphans the LIVRABLE row itself.
          console.error(
            'createLivrableWithSuggestions: suggestion blockIndex out of range',
            item.blockIndex,
          );
          continue;
        }

        tx.insert(suggestion)
          .values({
            id: crypto.randomUUID(),
            livrableId,
            type: 'anchored',
            anchorRef: block.id,
            text: item.text,
            status: 'pending',
          })
          .run();
      }
    });

    return { ok: true, data: { livrableId } };
  } catch (error) {
    console.error('createLivrableWithSuggestions failed', error);
    return {
      ok: false,
      error: 'Impossible de créer ce livrable.',
    };
  }
}

// Story 4.4 — Révision globale (FR-23, AD-9, AD-10). Called from
// `actions/message.ts`'s `executeTool` when a LIVRABLE already exists
// for the conversation the agent is replying in — the regeneration
// counterpart to `createLivrableWithSuggestions` above, same synchronous
// `db.transaction` shape. Only `content` is replaced (Boundaries: "remplace
// tout content.blocks... et insère les nouvelles SUGGESTION ancrées") — the
// livrable's `title` is left untouched, unlike creation.
//
// New block ids are generated here exactly like creation (AD-9: never
// reused) — every previous block, and therefore every SUGGESTION still
// anchored to one, is stale the instant this transaction commits. Before
// inserting the new suggestions, every `anchored` suggestion already on
// this livrable that has not yet resolved to `accepted`/`rejected` —
// `pending` or mid-rework `revising` alike — is transitioned to
// `rejected`: its targeted block disappears with the regeneration, and
// this state/label ("Rejetée") is already supported by
// `SuggestionCard.tsx` (Story 4.3). `revising` must be included here too:
// left untouched, it would later resolve back to `pending` carrying a
// stale `anchorRef` from before the regeneration, and `acceptSuggestion`
// would then silently "succeed" against a block that no longer means what
// it did. This also preemptively closes Story 4.3's deferred finding #2 —
// `acceptSuggestion` can no longer ever meet an `anchorRef` that doesn't
// resolve to a current block, since nothing pending or revising+anchored
// survives a regeneration.
//
// spec-position-figee-suggestions-resolues (Boundaries — Révision après
// revue, `review_loop_iteration: 1`): this mass `pending`/`revising` ->
// `rejected` transition is a second write path to the same status as
// `actions/suggestion.ts`'s manual `rejectSuggestion`, and the spec's own
// Acceptance Criteria ("toute suggestion... acceptée ou rejetée") does not
// distinguish how a suggestion became `rejected`. So this path must also
// freeze `resolvedPosition` — computed against the blocks as they stood
// *before* this same function regenerates them below, read here while they
// are still the current row, never against the freshly-minted `blocks`
// array a few lines down (that would already be the wrong, post-
// regeneration answer). Everything else about this function — the id
// regeneration itself, `createLivrableWithSuggestions`'s counterpart shape
// — stays untouched, per the Boundaries' own "seul ce point précis... reste
// inchangé".
export async function updateLivrableWithSuggestions(
  livrableId: string,
  proposal: ProposedLivrableContent,
): Promise<ActionResult<{ livrableId: string }>> {
  try {
    const blocks = proposal.blocks.map((text) => ({
      id: crypto.randomUUID(),
      text,
    }));

    const content = JSON.stringify({ blocks });

    db.transaction((tx) => {
      // Read the *old* blocks and the suggestions about to be auto-rejected
      // before `content` below overwrites them — same defensive JSON
      // handling as `acceptSuggestion`/`rejectSuggestion`
      // (`actions/suggestion.ts`): a malformed pre-existing `content` only
      // degrades every `resolvedPosition` in this batch to `null`, it never
      // blocks the regeneration itself.
      let oldBlocks: { id: string; text: string }[] = [];
      const [existingLivrableRow] = tx
        .select({ content: livrable.content })
        .from(livrable)
        .where(eq(livrable.id, livrableId))
        .all();

      if (existingLivrableRow) {
        try {
          const existingContent = JSON.parse(existingLivrableRow.content) as {
            blocks?: unknown;
          };
          if (Array.isArray(existingContent?.blocks)) {
            oldBlocks = existingContent.blocks as { id: string; text: string }[];
          } else {
            console.error(
              'updateLivrableWithSuggestions: malformed content.blocks before regeneration',
              livrableId,
            );
          }
        } catch (error) {
          console.error(
            'updateLivrableWithSuggestions: failed to parse pre-regeneration content',
            livrableId,
            error,
          );
        }
      }

      const toReject = tx
        .select({ id: suggestion.id, anchorRef: suggestion.anchorRef })
        .from(suggestion)
        .where(
          and(
            eq(suggestion.livrableId, livrableId),
            inArray(suggestion.status, ['pending', 'revising']),
            eq(suggestion.type, 'anchored'),
          ),
        )
        .all();

      tx.update(livrable)
        .set({ content })
        .where(eq(livrable.id, livrableId))
        .run();

      for (const item of toReject) {
        const resolvedPosition =
          item.anchorRef !== null
            ? resolveAnchorPosition(oldBlocks, item.anchorRef)
            : null;

        tx.update(suggestion)
          .set({ status: 'rejected', resolvedPosition })
          .where(eq(suggestion.id, item.id))
          .run();
      }

      for (const item of proposal.suggestions) {
        const block = blocks[item.blockIndex];
        if (!block) {
          // Defense in depth only, same reasoning as
          // `createLivrableWithSuggestions` above — not reachable via
          // `parseProposeLivrableContentInput`'s own validation.
          console.error(
            'updateLivrableWithSuggestions: suggestion blockIndex out of range',
            item.blockIndex,
          );
          continue;
        }

        tx.insert(suggestion)
          .values({
            id: crypto.randomUUID(),
            livrableId,
            type: 'anchored',
            anchorRef: block.id,
            text: item.text,
            status: 'pending',
          })
          .run();
      }
    });

    return { ok: true, data: { livrableId } };
  } catch (error) {
    console.error('updateLivrableWithSuggestions failed', error);
    return {
      ok: false,
      error: 'Impossible de mettre à jour ce livrable.',
    };
  }
}

// Story 4.4 — Révision globale (FR-23, AD-10). Called by
// `components/GlobalRevisionField.tsx`. Never creates a `global` SUGGESTION
// row itself (Always: "seul un MESSAGE est produit") — it only posts the
// consultant's instructions as a user message into the livrable's own
// origin conversation (AD-10: never a new one), via `sendMessage`
// (`actions/message.ts`), which is what actually drives the agent
// back through `propose_livrable_content` and, from there,
// `updateLivrableWithSuggestions` above. Whatever `sendMessage` returns —
// success, `assistantFailed`, or an outright failure — is relayed as-is;
// this function's own `{ok:false}` branches are reserved for the one thing
// `sendMessage` cannot check itself: whether this livrable even has an
// origin conversation to post into.
export async function requestGlobalRevision(
  livrableId: string,
  instructions: string,
): Promise<ActionResult<{ assistantFailed: boolean; error?: string }>> {
  try {
    const [row] = await db
      .select({ conversationId: livrable.conversationId, source: livrable.source })
      .from(livrable)
      .where(eq(livrable.id, livrableId));

    if (!row) {
      return { ok: false, error: 'Ce livrable est introuvable.' };
    }

    // Story 5.3 — guard until Story 5.4: the global revision goes through
    // `propose_livrable_content`, which would regenerate the presentation
    // and its text box ids. The editor hides the field; this refuses a
    // direct call too.
    if (row.source === 'drive') {
      return {
        ok: false,
        error: "La révision globale n'est pas encore disponible pour une présentation importée.",
      };
    }

    if (row.conversationId === null) {
      // Fixture livrable (Story 2.6) with no real origin conversation —
      // refuse with a clear message rather than attempting to post
      // anywhere (Always).
      return {
        ok: false,
        error: "Ce livrable n'a pas de conversation d'origine.",
      };
    }

    return await sendMessage(row.conversationId, instructions, MODELS[0].id);
  } catch (error) {
    console.error('requestGlobalRevision failed', error);
    return {
      ok: false,
      error: 'Impossible de soumettre cette révision globale.',
    };
  }
}

// Story 5.3 — the presentations the Livrables panel offers in its "Dans
// le Drive du projet" group: those of the project folder (as listed by the
// last resync, `actions/document.ts`'s `listDrivePresentations`) not yet
// imported as a livrable of this project — an imported presentation only
// appears once, under "En cours". `null`: no such group (demo mode, not
// connected, or the last listing of the folder failed).
export type ImportablePresentation = {
  documentId: string;
  name: string;
};

export async function listImportablePresentations(
  projectId: string,
): Promise<ActionResult<ImportablePresentation[] | null>> {
  try {
    const presentationsResult = await listDrivePresentations(projectId);
    if (!presentationsResult.ok) return presentationsResult;
    if (presentationsResult.data === null) return { ok: true, data: null };

    const imported = await db
      .select({ driveFileId: livrable.driveFileId })
      .from(livrable)
      .where(and(eq(livrable.projectId, projectId), isNotNull(livrable.driveFileId)));
    const importedIds = new Set(imported.map((row) => row.driveFileId));

    return {
      ok: true,
      data: presentationsResult.data
        .filter((presentation) => !importedIds.has(presentation.driveFileId))
        .map(({ documentId, name }) => ({ documentId, name })),
    };
  } catch (error) {
    console.error('listImportablePresentations failed', error);
    return {
      ok: false,
      error: 'Impossible de récupérer les présentations du dossier Drive.',
    };
  }
}

const IMPORT_FAILED = "Impossible d'importer cette présentation.";
const DRIVE_DISCONNECTED = 'Connectez Google Drive pour enregistrer.';

// Story 5.3 — reads a presentation through the current (`connected`)
// provider. On `token_revoked` the dead connection is deleted (AD-1, back
// to `disconnected`). Never modifies the file.
async function readDrivePresentation(
  driveFileId: string,
): Promise<{ ok: true; data: PresentationContent } | { ok: false }> {
  const current = currentDriveProvider('connected');
  if (!current) return { ok: false };
  const result = await current.provider.readPresentation(driveFileId);
  if (!result.ok) {
    if (result.error === 'token_revoked' && current.refreshToken) {
      deleteRevokedGoogleConnection(current.refreshToken);
    }
    console.error('readDrivePresentation failed', { driveFileId, error: result.error });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}

function findDriveLivrableId(
  projectId: string,
  driveFileId: string,
): string | null {
  const [row] = db
    .select({ id: livrable.id })
    .from(livrable)
    .where(and(eq(livrable.projectId, projectId), eq(livrable.driveFileId, driveFileId)))
    .all();
  return row?.id ?? null;
}

// Story 5.3 — Import d'une présentation comme livrable (FR-28, AD-13,
// AD-14). `documentId` is the presentation's `DOCUMENT` row (Livrables
// panel), refused unless it belongs to `projectId`. An already imported presentation reopens its livrable. Otherwise
// the presentation is read (`presentations.get`, never a write, no AI
// call) and, in one synchronous transaction, a dedicated CONVERSATION
// titled after the presentation and the `drive` LIVRABLE are inserted —
// the CONVERSATION insert lives here rather than in
// `actions/conversation.ts` so both rows land atomically (same exception
// as `createLivrableWithSuggestions`' SUGGESTION rows). The active
// conversation is left unchanged. Refused outside the `connected` mode; a
// failed read creates nothing.
export async function importPresentation(
  projectId: string,
  documentId: string,
): Promise<ActionResult<{ livrableId: string }>> {
  try {
    if ((await resolveDriveMode()) !== 'connected') {
      return { ok: false, error: IMPORT_FAILED };
    }

    // Same gate as the panel's list: the row belongs to this project and
    // the project's last listing is a successful `google` one.
    const presentationResult = await getDrivePresentation(projectId, documentId);
    if (!presentationResult.ok || presentationResult.data === null) {
      return { ok: false, error: IMPORT_FAILED };
    }
    const { driveFileId, name } = presentationResult.data;

    const existingId = findDriveLivrableId(projectId, driveFileId);
    if (existingId) return { ok: true, data: { livrableId: existingId } };

    const read = await readDrivePresentation(driveFileId);
    if (!read.ok) return { ok: false, error: IMPORT_FAILED };

    const title = read.data.title.trim() || name;
    const blocks = toSlideBlocks(read.data.slides);

    const livrableId = db.transaction((tx) => {
      // Imported in between (double click, second tab): reopen that one.
      const [already] = tx
        .select({ id: livrable.id })
        .from(livrable)
        .where(and(eq(livrable.projectId, projectId), eq(livrable.driveFileId, driveFileId)))
        .all();
      if (already) return already.id;

      const conversationId = crypto.randomUUID();
      const newLivrableId = crypto.randomUUID();
      tx.insert(conversation)
        .values({ id: conversationId, projectId, title, stepKey: null })
        .run();
      tx.insert(livrable)
        .values({
          id: newLivrableId,
          projectId,
          conversationId,
          title,
          content: JSON.stringify({ blocks }),
          source: 'drive',
          driveFileId,
        })
        .run();
      return newLivrableId;
    });

    return { ok: true, data: { livrableId } };
  } catch (error) {
    console.error('importPresentation failed', error);
    return { ok: false, error: IMPORT_FAILED };
  }
}

// Story 5.3 — "Réimporter" (AD-13): replaces a drive livrable's blocks with
// the presentation as it is now in Drive. Explicit action only, refused
// outside the `connected` mode. When a block is modified (`text ≠
// driveText`, `domain/livrable.ts`), the editor asks for confirmation
// first: without `discardLocalChanges` the re-import is refused
// (`needsConfirmation`), re-checked inside the transaction against the
// current content. Suggestions: an unresolved (`pending`/`revising`) one is
// kept only if its text box still exists, its Drive text did not change
// and the block was not modified in the app (`keepsSuggestionAfterReimport`),
// otherwise deleted; `accepted`/`rejected` ones stay as history. A failed read changes nothing. Like the
// import, never writes to the file and never calls the AI. The title is
// left unchanged.
export async function reimportPresentation(
  livrableId: string,
  discardLocalChanges: boolean,
): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const failed = { ok: false as const, error: "Impossible de réimporter cette présentation." };
  try {
    if ((await resolveDriveMode()) !== 'connected') {
      return { ok: false, error: DRIVE_DISCONNECTED };
    }

    const [row] = await db
      .select({ source: livrable.source, driveFileId: livrable.driveFileId, content: livrable.content })
      .from(livrable)
      .where(eq(livrable.id, livrableId));
    if (!row) return { ok: false, error: 'Ce livrable est introuvable.' };
    if (row.source !== 'drive' || !row.driveFileId) return failed;

    const parseBlocks = (content: string): LivrableBlock[] | null => {
      const parsed = JSON.parse(content) as { blocks?: unknown };
      return Array.isArray(parsed?.blocks) ? (parsed.blocks as LivrableBlock[]) : null;
    };

    const currentBlocks = parseBlocks(row.content);
    if (!currentBlocks) {
      console.error('reimportPresentation: malformed content.blocks', livrableId);
      return failed;
    }
    if (hasModifiedBlocks(currentBlocks) && !discardLocalChanges) {
      return { ok: true, data: { needsConfirmation: true } };
    }

    const read = await readDrivePresentation(row.driveFileId);
    if (!read.ok) return failed;
    const nextBlocks = toSlideBlocks(read.data.slides);

    const outcome = db.transaction((tx): 'done' | 'needs_confirmation' | 'missing' | 'malformed' => {
      // Re-read: a suggestion may have been accepted during the Drive read.
      const [fresh] = tx
        .select({ content: livrable.content })
        .from(livrable)
        .where(eq(livrable.id, livrableId))
        .all();
      if (!fresh) return 'missing';
      const previousBlocks = parseBlocks(fresh.content);
      if (!previousBlocks) return 'malformed';
      if (hasModifiedBlocks(previousBlocks) && !discardLocalChanges) {
        return 'needs_confirmation';
      }

      tx.update(livrable)
        .set({ content: JSON.stringify({ blocks: nextBlocks }) })
        .where(eq(livrable.id, livrableId))
        .run();

      const unresolved = tx
        .select({ id: suggestion.id, anchorRef: suggestion.anchorRef })
        .from(suggestion)
        .where(
          and(
            eq(suggestion.livrableId, livrableId),
            inArray(suggestion.status, ['pending', 'revising']),
          ),
        )
        .all();
      for (const item of unresolved) {
        if (!keepsSuggestionAfterReimport(previousBlocks, nextBlocks, item.anchorRef)) {
          tx.delete(suggestion).where(eq(suggestion.id, item.id)).run();
        }
      }
      return 'done';
    });

    if (outcome === 'missing') return { ok: false, error: 'Ce livrable est introuvable.' };
    if (outcome === 'malformed') {
      console.error('reimportPresentation: malformed content.blocks', livrableId);
      return failed;
    }
    return { ok: true, data: { needsConfirmation: outcome === 'needs_confirmation' } };
  } catch (error) {
    console.error('reimportPresentation failed', error);
    return failed;
  }
}
