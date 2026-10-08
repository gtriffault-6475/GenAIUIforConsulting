import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { MessageInsertExecutor } from '@/actions/insert-message';
import { db } from '@/db/client';
import { conversation, presentationProposal, project } from '@/db/schema';

// Epic 5 retro A10 (AD-2) — the only file reading or writing
// PRESENTATION_PROPOSAL (Story 5.6). Deliberately NOT a 'use server' file:
// these are synchronous helpers for other actions (`actions/message.ts`
// inserts a proposal with its reply, `actions/conversation.ts` shows them,
// `actions/livrable.ts` creates the deck, `actions/demo.ts` resets), never
// endpoints a browser could call (`import 'server-only'` also keeps them
// out of client bundles). Like `actions/insert-message.ts`, the insert and
// the reset delete accept an already-open transaction (`node:sqlite`
// transactions don't nest).

type Executor = MessageInsertExecutor;

export function insertPresentationProposal(
  executor: Executor,
  values: { conversationId: string; messageId: string; title: string; slides: string },
): void {
  executor
    .insert(presentationProposal)
    .values({
      id: crypto.randomUUID(),
      ...values,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function listConversationProposals(conversationId: string) {
  return db
    .select({
      id: presentationProposal.id,
      messageId: presentationProposal.messageId,
      title: presentationProposal.title,
      slides: presentationProposal.slides,
      status: presentationProposal.status,
      livrableId: presentationProposal.livrableId,
      driveFileId: presentationProposal.driveFileId,
    })
    .from(presentationProposal)
    .where(eq(presentationProposal.conversationId, conversationId))
    .all();
}

// The proposal with what the creation needs (its project and name).
export function readProposalForCreation(proposalId: string) {
  return db
    .select({
      id: presentationProposal.id,
      title: presentationProposal.title,
      slides: presentationProposal.slides,
      status: presentationProposal.status,
      livrableId: presentationProposal.livrableId,
      driveFileId: presentationProposal.driveFileId,
      projectId: conversation.projectId,
      projectName: project.name,
    })
    .from(presentationProposal)
    .innerJoin(conversation, eq(conversation.id, presentationProposal.conversationId))
    .innerJoin(project, eq(project.id, conversation.projectId))
    .where(eq(presentationProposal.id, proposalId))
    .get();
}

// Retro A8 — the deck copied for this proposal; only recorded on a
// still-pending proposal that has none yet.
export function recordProposalDeck(proposalId: string, driveFileId: string): void {
  db.update(presentationProposal)
    .set({ driveFileId })
    .where(
      and(
        eq(presentationProposal.id, proposalId),
        isNull(presentationProposal.driveFileId),
        eq(presentationProposal.status, 'pending'),
      ),
    )
    .run();
}

export function forgetProposalDeck(proposalId: string): void {
  db.update(presentationProposal)
    .set({ driveFileId: null })
    .where(eq(presentationProposal.id, proposalId))
    .run();
}

export function markProposalCreated(proposalId: string, livrableId: string): void {
  db.update(presentationProposal)
    .set({ status: 'created', livrableId })
    .where(eq(presentationProposal.id, proposalId))
    .run();
}

// Demo reset (`actions/demo.ts`): proposals reference MESSAGE and
// CONVERSATION, so they go first.
export function deleteProposalsOfConversations(executor: Executor, conversationIds: string[]): void {
  if (conversationIds.length === 0) return;
  executor
    .delete(presentationProposal)
    .where(inArray(presentationProposal.conversationId, conversationIds))
    .run();
}
