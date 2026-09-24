'use server';

import { eq } from 'drizzle-orm';

import type { ActionResult } from '@/actions/types';
import { insertMessage } from '@/actions/insert-message';
import {
  createLivrableWithSuggestions,
  updateLivrableWithSuggestions,
} from '@/actions/livrable';
import { listLoadedSkillInstructions } from '@/actions/skill';
import { db } from '@/db/client';
import { conversation, livrable, message } from '@/db/schema';
import type { ExecuteToolResult } from '@/skills/buildRequest';
import { sendToAgent } from '@/skills/buildRequest';
import { MODELS, resolveModelLabel } from '@/skills/models';
import {
  PROPOSE_LIVRABLE_CONTENT_TOOL,
  parseProposeLivrableContentInput,
} from '@/skills/propose_livrable_content';

// AD-2 — this is the only file allowed to read or write MESSAGE, except
// `actions/conversation.ts`'s `seedFixturesIfEmpty`, which inserts fixture
// MESSAGE rows alongside their owning CONVERSATION (that file's own header
// comment) — every other MESSAGE read/write stays this file's exclusive
// concern. `actions/conversation.ts` keeps CONVERSATION; this file took
// over MESSAGE (epic-2-retro-item-13/epic-4 retro, split out of
// `actions/conversation.ts` once it grew past 758 lines) — `sendMessage`
// moved here unchanged (signature, logic, internal comments), only its own
// file-location references and its 2 callers' import paths changed
// (`components/Composer.tsx`, `actions/livrable.ts`). Components never
// touch `db/` directly; they call this Server Action. Both inserts below
// go through `actions/insert-message.ts`'s shared `insertMessage`
// (epic-2-retro-item-15) rather than a raw `db.insert(message)` — the
// AD-2 exclusivity above is unaffected: that file exists only so this file
// and `actions/conversation.ts`'s fixture-seeding exception can share one
// write path, never a third table owner.

// Story 2.5 — Sélection du modèle et envoi d'un message. The user message
// is always persisted first, in its own `try/catch`: only a failure of
// *that* insert returns `{ok:false,error}` (the spec's boundary — "jamais
// perdu sur une panne réseau/clé API absente"). Everything after that
// point (loading skills, calling `skills/buildRequest.ts`'s `sendToAgent`
// — AD-11's single assembly point — and persisting the reply) is wrapped
// in a second `try/catch` whose failures still resolve as `{ok:true,
// data:{assistantFailed:true, error}}`: the caller (`Composer.tsx`) can
// then show that error next to the (already visible, already persisted)
// user message instead of losing it.
export async function sendMessage(
  conversationId: string,
  content: string,
  model: string,
): Promise<ActionResult<{ assistantFailed: boolean; error?: string }>> {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { ok: false, error: 'Le message ne peut pas être vide.' };
  }

  // Defense in depth: the composer only ever offers `MODELS`' three ids
  // (Boundaries — "jamais un défaut caché ailleurs"), but a Server Action
  // is a network-reachable endpoint a client-side restriction can't bind —
  // reject an out-of-list model before it ever reaches the real, billed
  // Anthropic API, the same way `addManualDocument` re-validates
  // client-checked input server-side.
  if (!MODELS.some((entry) => entry.id === model)) {
    return { ok: false, error: 'Modèle invalide.' };
  }

  let projectId: string;
  const userMessageId = crypto.randomUUID();
  try {
    const [conversationRow] = await db
      .select({ projectId: conversation.projectId })
      .from(conversation)
      .where(eq(conversation.id, conversationId));

    if (!conversationRow) {
      return { ok: false, error: 'Cette conversation est introuvable.' };
    }
    projectId = conversationRow.projectId;

    insertMessage(db, {
      id: userMessageId,
      conversationId,
      role: 'user',
      content: trimmedContent,
      model: null,
    });
  } catch (error) {
    console.error('sendMessage failed to persist the user message', error);
    return { ok: false, error: "Impossible d'envoyer ce message." };
  }

  // epic-2-retro-item-16 — durable, not just transient, failure indicator.
  // `Composer.tsx`'s `assistantError` state (below, via `data.assistantFailed`/
  // `data.error`) is lost on the next navigation/refresh/tab close; this
  // `UPDATE` marks the already-persisted user message itself, with the real
  // error text of whichever branch below calls it, so `ConversationHistory`
  // (`actions/conversation.ts`'s `getActiveConversation`) still shows it
  // afterwards. Only this function ever calls it, only on `userMessageId`
  // (this call's own user message, never any other row), and only from a
  // real failure path below — never from fixture seeding
  // (`actions/conversation.ts`'s `seedFixturesIfEmpty`), which has no
  // notion of failure and never touches these columns.
  function markAssistantFailed(errorText: string): void {
    try {
      const result = db
        .update(message)
        .set({ assistantFailed: true, assistantErrorText: errorText })
        .where(eq(message.id, userMessageId))
        .run();

      if (result.changes === 0) {
        // A concurrent deletion of this row (or its whole conversation) —
        // `actions/demo.ts`'s `resetAvantVenteWorkflow` deletes MESSAGE rows
        // for a project — could race between this call's own insert above
        // and this `UPDATE`. Never silent: the transient `assistantFailed`
        // already returned to the caller below still displays once in
        // `Composer.tsx`, but the durable indicator this was meant to leave
        // behind never landed, which is worth knowing about even though it
        // isn't this function's job to recover from.
        console.error(
          'sendMessage: markAssistantFailed UPDATE matched 0 rows (message deleted concurrently?)',
          userMessageId,
        );
      }
    } catch (updateError) {
      // Same reasoning as the 0-row case above: only log. Never let a
      // failure of this secondary write turn an otherwise-successful
      // `ActionResult` into `{ok:false}`.
      console.error(
        'sendMessage: failed to persist assistantFailed on the user message',
        updateError,
      );
    }
  }

  // From here on the user message is durably saved regardless of what
  // happens next — every remaining failure surfaces as `assistantFailed`
  // inside a *successful* ActionResult, never as `{ok:false}`.
  try {
    const loadedSkillsResult = await listLoadedSkillInstructions(projectId);
    if (!loadedSkillsResult.ok) {
      // Distinct from "this project has zero loaded skills" (a real,
      // empty-but-successful list): a failed read must not silently
      // become the same `[]` an agent call proceeds on, or the consultant
      // gets an answer that looks skill-informed but never was, with
      // nothing surfaced to explain why.
      markAssistantFailed(loadedSkillsResult.error);
      return {
        ok: true,
        data: { assistantFailed: true, error: loadedSkillsResult.error },
      };
    }
    const loadedSkills = loadedSkillsResult.data;

    const historyRows = await db
      .select({ role: message.role, content: message.content })
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(message.createdAt);

    // Story 4.2 — Génération des suggestions ancrées à l'écriture (AD-3).
    // This tool is offered on *every* `sendMessage` call, never gated
    // behind a loaded skill (Always) — only its own `description` guides
    // the model toward using it. `executeTool` is the one point where a
    // tool call turns into persistence, and it never touches `db` itself
    // (AD-2): it only parses the model's input and delegates to
    // `createLivrableWithSuggestions`/`updateLivrableWithSuggestions`,
    // which do the actual transaction.
    //
    // Story 4.4 — Révision globale (AD-10). Before creating, this now
    // checks whether a LIVRABLE already exists for this conversation: a
    // global revision is always posted into the livrable's own origin
    // conversation (never a new one, `actions/livrable.ts`'s
    // `requestGlobalRevision`), so the agent replying here — via this same
    // `propose_livrable_content` tool — must update that existing livrable
    // rather than create a second one for the same conversation. No
    // existing row: unchanged creation behavior (Story 4.2).
    const executeTool = async (
      input: unknown,
    ): Promise<ExecuteToolResult> => {
      const parsed = parseProposeLivrableContentInput(input);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }

      const [existingLivrable] = await db
        .select({ id: livrable.id })
        .from(livrable)
        .where(eq(livrable.conversationId, conversationId));

      if (existingLivrable) {
        const updated = await updateLivrableWithSuggestions(
          existingLivrable.id,
          parsed.data,
        );
        if (!updated.ok) {
          return { ok: false, error: updated.error };
        }

        // Same rule as the creation branch below: this text is only the
        // tool's `tool_result`, read by the model on the second call, never
        // persisted to MESSAGE itself. No title clause here, unlike the
        // creation branch: `updateLivrableWithSuggestions` never writes
        // `LIVRABLE.title` back (it only replaces `content`), so echoing
        // `parsed.data.title` would tell the model a rename took effect
        // when it never did.
        return {
          ok: true,
          content: `Le livrable a été mis à jour avec ${parsed.data.suggestions.length} suggestion(s) ancrée(s).`,
        };
      }

      const created = await createLivrableWithSuggestions(
        projectId,
        conversationId,
        parsed.data,
      );
      if (!created.ok) {
        return { ok: false, error: created.error };
      }

      // This text becomes the tool's `tool_result` content, read only by
      // the model on the second call (Design Notes) — never persisted to
      // MESSAGE itself (Always: "MESSAGE ne stocke jamais l'échange
      // outil"), only the final natural-language reply built from it is.
      return {
        ok: true,
        content: `Le livrable "${parsed.data.title}" a été créé avec ${parsed.data.suggestions.length} suggestion(s) ancrée(s).`,
      };
    };

    // Fiabilité de la révision globale et de la concurrence des suggestions
    // (spec-fiabilite-revision-suggestions, CAP-1). `MESSAGE` never stores
    // the tool exchange itself (Always, Story 4.2) — only the model's short
    // confirmation text is persisted, never the real document. Without
    // this, a later call on this same conversation (in particular a global
    // revision, which resends the *entire* `blocks` array, no partial/diff
    // mode — `skills/propose_livrable_content.ts`) would have the model
    // regenerate the whole document from its own unverified memory of an
    // earlier turn, risking fabricated or silently dropped paragraphs the
    // revision never intended to touch. So: read the livrable's current,
    // real content here and, only when one already exists for this
    // conversation (never on the very first creation — Always), push it as
    // a synthetic `loadedSkills` entry, the same system-prompt assembly
    // mechanism every other loaded skill already goes through (AD-11), with
    // zero change to `skills/buildRequest.ts` itself. Read-only for the
    // model: this entry is assembled fresh on every call, never persisted
    // or made into an object something else could write back to.
    //
    // A failure reading or parsing that content must not regress today's
    // behavior (I/O matrix: "comportement identique à aujourd'hui -- pas de
    // régression") — logged only, falling back to no injection, exactly as
    // if no livrable existed yet for this conversation.
    let effectiveLoadedSkills = loadedSkills;
    try {
      const [existingLivrableForContext] = await db
        .select({ content: livrable.content })
        .from(livrable)
        .where(eq(livrable.conversationId, conversationId));

      if (existingLivrableForContext) {
        const parsedContent = JSON.parse(
          existingLivrableForContext.content,
        ) as { blocks?: { text?: unknown }[] };

        if (Array.isArray(parsedContent?.blocks)) {
          const paragraphs = parsedContent.blocks
            .map((block, index) => `${index + 1}. ${String(block?.text ?? '')}`)
            .join('\n');

          effectiveLoadedSkills = [
            ...loadedSkills,
            {
              skillKey: '__current_livrable_context',
              instructions:
                'Contenu actuel du livrable pour cette conversation (avant toute révision) ' +
                '-- chaque paragraphe non concerné par la demande en cours doit revenir ' +
                `inchangé dans le document régénéré :\n${paragraphs}`,
            },
          ];
        } else {
          console.error(
            'sendMessage: malformed existing livrable content, skipping context injection',
            conversationId,
          );
        }
      }
    } catch (error) {
      console.error(
        'sendMessage: failed to read existing livrable content for context injection',
        error,
      );
    }

    const agentResult = await sendToAgent({
      loadedSkills: effectiveLoadedSkills,
      history: historyRows,
      model,
      tool: PROPOSE_LIVRABLE_CONTENT_TOOL,
      executeTool,
    });

    if (!agentResult.ok) {
      markAssistantFailed(agentResult.error);
      return {
        ok: true,
        data: { assistantFailed: true, error: agentResult.error },
      };
    }

    insertMessage(db, {
      id: crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      content: agentResult.content,
      // Persist the human-readable label (e.g. "Claude Sonnet 5"), not
      // the raw API slug (`model`, e.g. "claude-sonnet-5") — matches
      // `actions/conversation.ts`'s fixture data and keeps
      // `ConversationHistory` free of technical identifiers. The raw
      // `model` id is still what was actually sent to `sendToAgent` above.
      model: resolveModelLabel(model),
    });

    return { ok: true, data: { assistantFailed: false } };
  } catch (error) {
    console.error(
      'sendMessage: agent call or reply persistence failed after the user message was saved',
      error,
    );
    const errorText = "Une erreur est survenue lors de l'appel à l'agent.";
    markAssistantFailed(errorText);
    return {
      ok: true,
      data: {
        assistantFailed: true,
        error: errorText,
      },
    };
  }
}
