'use server';

import { and, eq, inArray } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { sendMessage } from '@/actions/message';
import { seedIfEmpty } from '@/actions/seed-if-empty';
import { db } from '@/db/client';
import { conversation, livrable, presentationProposal, project, suggestion } from '@/db/schema';
import { findDrivePresentation } from '@/actions/document-context';
import { getActiveDriveProvider, type DriveMode } from '@/actions/google-connection';
import {
  hasUnsavedDriveChanges,
  isBlockModified,
  parseLivrableBlocks,
  planDriveSave,
  reimportKeepsSuggestion,
  slidesToBlocks,
  type LivrableBlock,
} from '@/domain/livrable';
import { folderDuplicateMessage, folderMissingMessage } from '@/domain/drive-messages';
import { resolveAnchorPosition } from '@/domain/suggestion';
import { MODELS } from '@/skills/models';
import { parseStoredSlides } from '@/skills/propose_presentation';
import type { DriveProvider } from '@/integrations/ports/drive-provider';
import type { ProposedLivrableContent } from '@/skills/propose_livrable_content';

// AD-2 — this is the only file allowed to read or write LIVRABLE. The one
// exception is `SUGGESTION`: `createLivrableWithSuggestions` below inserts
// both rows in a single transaction (the spec's Always: "LIVRABLE+SUGGESTION
// dans une seule transaction synchrone"), so that insert lives here rather
// than in `actions/suggestion.ts` — every other read/write of `SUGGESTION`
// stays that file's exclusive concern (its own header comment).
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
  // Story 5.3 — `drive` = imported from a Google Slides presentation.
  source: 'local' | 'drive';
  driveFileId: string | null;
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
export type LivrableDetail = {
  id: string;
  title: string;
  blocks: LivrableBlock[];
  // Story 5.3 — drive livrables are grouped by slide and can be
  // reimported, the latter only while Google is connected. `driveMode`
  // lets the editor say why it cannot (and say nothing in demo mode).
  source: 'local' | 'drive';
  // Story 5.5: also gates "Enregistrer dans Drive".
  driveConnected: boolean;
  driveMode: DriveMode | null;
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

    // Never fail the editor over this: unknown mode = cannot reimport.
    let driveMode: DriveMode | null = null;
    if (row.source === 'drive') {
      try {
        driveMode = (await getActiveDriveProvider()).mode;
      } catch (error) {
        console.error('getLivrable: could not resolve the drive mode', error);
      }
    }
    const driveConnected = driveMode === 'connected';

    return {
      ok: true,
      data: {
        id: row.id,
        title: row.title,
        blocks: content.blocks as LivrableBlock[],
        source: row.source,
        driveConnected,
        driveMode,
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
      .select({
        id: livrable.id,
        title: livrable.title,
        source: livrable.source,
        driveFileId: livrable.driveFileId,
      })
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
      .select({ conversationId: livrable.conversationId })
      .from(livrable)
      .where(eq(livrable.id, livrableId));

    if (!row) {
      return { ok: false, error: 'Ce livrable est introuvable.' };
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

// Story 5.3 — Import d'une présentation comme livrable (AD-13, AD-14).
// Reads the presentation (never writes to Drive) and creates, in one
// synchronous transaction, the `source = 'drive'` livrable and its
// dedicated conversation titled after the presentation. Writing
// CONVERSATION here is a documented AD-2 exception, like
// `actions/demo.ts`: the two rows must land together so a livrable never
// exists without its conversation. The active conversation is left
// untouched. A presentation already imported on this project returns its
// existing livrable — checked before reading Drive and again inside the
// transaction; a concurrent import that wins the unique index race is
// read back instead of failing.
export async function importDrivePresentation(
  projectId: string,
  documentId: string,
): Promise<ActionResult<{ livrableId: string }>> {
  const failure = {
    ok: false as const,
    error: "Impossible d'importer cette présentation. Réessayez.",
  };
  try {
    const file = findDrivePresentation(projectId, documentId);
    if (!file) return failure;

    const { mode, provider } = await getActiveDriveProvider();
    if (mode !== 'connected' || !provider) {
      const existing = findImportedLivrable(projectId, file.driveFileId);
      return existing ? { ok: true, data: { livrableId: existing } } : failure;
    }

    const imported = await importDriveFile(projectId, file.driveFileId, file.name, provider);
    return imported ? { ok: true, data: { livrableId: imported } } : failure;
  } catch (error) {
    console.error('importDrivePresentation failed', error);
    return failure;
  }
}

function findImportedLivrable(projectId: string, driveFileId: string): string | null {
  return (
    db
      .select({ id: livrable.id })
      .from(livrable)
      .where(and(eq(livrable.projectId, projectId), eq(livrable.driveFileId, driveFileId)))
      .get()?.id ?? null
  );
}

// Story 5.3's import core, shared with Story 5.6's creation: reads the
// deck, then creates its conversation + Drive livrable in one transaction.
// A deck already imported on this project returns its existing livrable —
// checked before reading Drive and again inside the transaction; a
// concurrent import that wins the unique index race is read back instead
// of failing. `null` = the deck could not be read (logged). Not exported:
// every export of this 'use server' file is a callable Server Action.
async function importDriveFile(
  projectId: string,
  driveFileId: string,
  fallbackTitle: string,
  provider: DriveProvider,
): Promise<string | null> {
  const already = findImportedLivrable(projectId, driveFileId);
  if (already) return already;

  const presentation = await provider.readPresentation(driveFileId);
  if (!presentation.ok) {
    console.error('importDriveFile: readPresentation failed', presentation.error);
    return null;
  }

  const title = presentation.data.title.trim() || fallbackTitle;
  const blocks = slidesToBlocks(presentation.data);
  const livrableId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();

  try {
    return db.transaction((tx) => {
      const raced = tx
        .select({ id: livrable.id })
        .from(livrable)
        .where(and(eq(livrable.projectId, projectId), eq(livrable.driveFileId, driveFileId)))
        .get();
      if (raced) return raced.id;

      tx.insert(conversation)
        .values({ id: conversationId, projectId, title, stepKey: null })
        .run();
      tx.insert(livrable)
        .values({
          id: livrableId,
          projectId,
          conversationId,
          title,
          content: JSON.stringify({ blocks }),
          source: 'drive',
          driveFileId,
        })
        .run();
      return livrableId;
    });
  } catch (error) {
    const winner = findImportedLivrable(projectId, driveFileId);
    if (winner) return winner;
    throw error;
  }
}

// Story 5.6 — "Créer dans Drive" on a presentation proposal (AD-13). Copies
// the OCTO template into the project folder, fills it
// (`DriveProvider.createPresentation`), then imports the new deck exactly
// like Story 5.3 and marks the proposal `created`. A proposal already
// created returns its livrable; two clicks racing in this server process
// share the same creation (no second deck). On any failure the proposal
// stays `pending`.
export type CreatePresentationResult = { livrableId: string };

const creationsInFlight = new Map<string, Promise<ActionResult<CreatePresentationResult>>>();

export async function createPresentationFromProposal(
  proposalId: string,
): Promise<ActionResult<CreatePresentationResult>> {
  const inFlight = creationsInFlight.get(proposalId);
  if (inFlight) return inFlight;
  const run = runPresentationCreation(proposalId).finally(() => {
    creationsInFlight.delete(proposalId);
  });
  creationsInFlight.set(proposalId, run);
  return run;
}

async function runPresentationCreation(
  proposalId: string,
): Promise<ActionResult<CreatePresentationResult>> {
  const failure = {
    ok: false as const,
    error: 'La création de la présentation a échoué. Réessayez.',
  };
  try {
    const row = db
      .select({
        id: presentationProposal.id,
        title: presentationProposal.title,
        slides: presentationProposal.slides,
        status: presentationProposal.status,
        livrableId: presentationProposal.livrableId,
        projectId: conversation.projectId,
        projectName: project.name,
      })
      .from(presentationProposal)
      .innerJoin(conversation, eq(conversation.id, presentationProposal.conversationId))
      .innerJoin(project, eq(project.id, conversation.projectId))
      .where(eq(presentationProposal.id, proposalId))
      .get();
    if (!row) return failure;
    if (row.status === 'created' && row.livrableId) {
      return { ok: true, data: { livrableId: row.livrableId } };
    }

    const slides = parseStoredSlides(row.slides);
    if (slides.length === 0) return failure;

    const { mode, provider } = await getActiveDriveProvider();
    if (mode !== 'connected' || !provider) {
      return { ok: false, error: 'Connectez Google Drive pour créer la présentation.' };
    }

    const created = await provider.createPresentation(row.projectName, row.title, slides);
    if (!created.ok) {
      console.error('createPresentationFromProposal: createPresentation failed', created.error);
      if (created.error === 'unconfigured') {
        return {
          ok: false,
          error: "Le modèle de présentation OCTO n'est pas configuré pour cette installation.",
        };
      }
      // Retrying cannot help: same folder messages as the panels (Story 5.2).
      if (created.error === 'folder_missing') {
        return { ok: false, error: folderMissingMessage(row.projectName) };
      }
      if (created.error === 'folder_duplicate') {
        return { ok: false, error: folderDuplicateMessage(row.projectName) };
      }
      return failure;
    }

    const livrableId = await importDriveFile(
      row.projectId,
      created.data.fileId,
      row.title,
      provider,
    );
    if (!livrableId) {
      console.error(
        `createPresentationFromProposal: deck created (${created.data.fileId}) but not imported`,
      );
      return failure;
    }

    db.update(presentationProposal)
      .set({ status: 'created', livrableId })
      .where(eq(presentationProposal.id, proposalId))
      .run();
    return { ok: true, data: { livrableId } };
  } catch (error) {
    console.error('createPresentationFromProposal failed', error);
    return failure;
  }
}

// Story 5.3 — "Réimporter" (AD-13). Replaces every block by the current
// Drive version; a pending/revising suggestion survives only if its zone
// still exists and Drive's text for it did not change, otherwise it is
// deleted; resolved (accepted/rejected) suggestions stay as history. The
// confirmation about unsaved accepted changes happens in the page
// (`components/DriveLivrableActions.tsx`) before this is called. SUGGESTION is
// written here for the same reason as `createLivrableWithSuggestions`:
// blocks and suggestions must change in one transaction.
//
// `confirmed`: the consultant accepted losing unsaved accepted changes.
// The check is redone here, inside the transaction, so a suggestion
// accepted after the page rendered (another tab) is never lost silently:
// without confirmation, the action returns `needsConfirmation` instead.
export async function reimportDriveLivrable(
  livrableId: string,
  confirmed: boolean,
): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const failure = {
    ok: false as const,
    error: 'Impossible de réimporter cette présentation. Réessayez.',
  };
  try {
    const row = db.select().from(livrable).where(eq(livrable.id, livrableId)).get();
    if (!row || row.source !== 'drive' || !row.driveFileId) return failure;

    const { mode, provider } = await getActiveDriveProvider();
    if (mode !== 'connected' || !provider) return failure;

    const presentation = await provider.readPresentation(row.driveFileId);
    if (!presentation.ok) {
      console.error('reimportDriveLivrable: readPresentation failed', presentation.error);
      return failure;
    }
    const newBlocks = slidesToBlocks(presentation.data);

    const needsConfirmation = db.transaction((tx) => {
      const current = tx.select().from(livrable).where(eq(livrable.id, livrableId)).get();
      if (!current) return false;
      const oldBlocks = parseLivrableBlocks(current.content);
      if (!confirmed && hasUnsavedDriveChanges(oldBlocks)) return true;

      const open = tx
        .select({ id: suggestion.id, anchorRef: suggestion.anchorRef })
        .from(suggestion)
        .where(
          and(
            eq(suggestion.livrableId, livrableId),
            inArray(suggestion.status, ['pending', 'revising']),
          ),
        )
        .all();
      const dropped = open
        .filter((item) => !reimportKeepsSuggestion(oldBlocks, newBlocks, item.anchorRef))
        .map((item) => item.id);
      if (dropped.length > 0) {
        tx.delete(suggestion).where(inArray(suggestion.id, dropped)).run();
      }

      tx.update(livrable)
        .set({ content: JSON.stringify({ blocks: newBlocks }) })
        .where(eq(livrable.id, livrableId))
        .run();
      return false;
    });

    return { ok: true, data: { needsConfirmation } };
  } catch (error) {
    console.error('reimportDriveLivrable failed', error);
    return failure;
  }
}

// Story 5.5 — Enregistrement dans Drive (AD-13). Read → compare → write:
// re-reads the deck (fresh `revisionId`); if any modified zone is gone or
// changed in Slides since its `driveText`, nothing is written
// (`conflict`). Otherwise one guarded `batchUpdate` rewrites the text of
// the modified zones only; a revision refusal between the read and the
// write restarts the cycle once (a second one is a conflict). After
// success, `driveText` becomes the text that was written — not whatever
// the block holds by then, so a change accepted during the save stays
// "modified".
export type SaveToDriveStatus = 'saved' | 'conflict' | 'nothing';

export async function saveLivrableToDrive(
  livrableId: string,
): Promise<ActionResult<{ status: SaveToDriveStatus }>> {
  const failure = {
    ok: false as const,
    error: "L'enregistrement dans Drive a échoué. Réessayez.",
  };
  try {
    const readRow = () => db.select().from(livrable).where(eq(livrable.id, livrableId)).get();
    const row = readRow();
    if (!row || row.source !== 'drive' || !row.driveFileId) return failure;
    if (parseLivrableBlocks(row.content).filter(isBlockModified).length === 0) {
      return { ok: true, data: { status: 'nothing' } };
    }

    const { mode, provider } = await getActiveDriveProvider();
    if (mode !== 'connected' || !provider) return failure;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // Re-read local blocks on each attempt: they may have changed while
      // the previous attempt waited on Google.
      const modified = parseLivrableBlocks(readRow()?.content ?? '').filter(isBlockModified);
      if (modified.length === 0) return { ok: true, data: { status: 'nothing' } };

      const presentation = await provider.readPresentation(row.driveFileId);
      if (!presentation.ok) {
        console.error('saveLivrableToDrive: readPresentation failed', presentation.error);
        return failure;
      }
      if (!presentation.data.revisionId) {
        console.error('saveLivrableToDrive: no revisionId in the presentation read');
        return failure;
      }
      const remoteTexts = new Map(
        presentation.data.slides.flatMap((slide) =>
          slide.textBoxes.map((box) => [box.objectId, box.text] as const),
        ),
      );
      const plan = planDriveSave(modified, remoteTexts);
      if (plan.conflicts.length > 0) return { ok: true, data: { status: 'conflict' } };

      const edits = plan.toWrite.map((block) => ({ objectId: block.id, text: block.text }));
      if (edits.length > 0) {
        const written = await provider.writePresentationText(
          row.driveFileId,
          edits,
          presentation.data.revisionId,
        );
        if (!written.ok) {
          if (written.error === 'revision_conflict') {
            if (attempt === 2) return { ok: true, data: { status: 'conflict' } };
            continue;
          }
          console.error('saveLivrableToDrive: writePresentationText failed', written.error);
          return failure;
        }
      }

      // `driveText` := the text now in Drive, only for blocks still based
      // on the `driveText` this save compared against (a reimport running
      // meanwhile keeps its fresh values).
      const savedText = new Map(
        [...plan.toWrite, ...plan.alreadySaved].map((block) => [
          block.id,
          { written: block.text, basedOn: block.driveText },
        ]),
      );
      db.transaction((tx) => {
        const current = tx.select({ content: livrable.content }).from(livrable).where(eq(livrable.id, livrableId)).get();
        if (!current) return;
        const blocks = parseLivrableBlocks(current.content).map((block) => {
          const saved = savedText.get(block.id);
          return saved && block.driveText === saved.basedOn
            ? { ...block, driveText: saved.written }
            : block;
        });
        tx.update(livrable)
          .set({ content: JSON.stringify({ blocks }) })
          .where(eq(livrable.id, livrableId))
          .run();
      });
      return { ok: true, data: { status: 'saved' } };
    }
    return { ok: true, data: { status: 'conflict' } };
  } catch (error) {
    console.error('saveLivrableToDrive failed', error);
    return failure;
  }
}
