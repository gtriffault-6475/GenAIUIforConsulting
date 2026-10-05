---
title: 'Epic 5 retro A10 — table ownership and server-only Google helpers'
type: 'refactor'
created: '2026-10-05'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-retro-2026-10-05.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Retro findings V1–V3: `PRESENTATION_PROPOSAL` is written by three files with no owner (AD-2); `actions/google-connection.ts` is a `'use server'` module whose every export — including `getActiveDriveProvider`, `resolveDriveMode`, `beginGoogleConnection`, `completeGoogleConnection` — is a browser-callable Server Action, protected today only by serialization and cookie-path details (AD-12); some AD-2 header comments no longer match the code; `actions/livrable.ts` grew to ~920 lines.

**Approach:** Owner decision (retro action A10, 2026-10-05): (1) a single non-action module owns PRESENTATION_PROPOSAL and every other file goes through it; (2) server-only Google helpers move to a non-`'use server'` module that becomes the only writer of GOOGLE_CONNECTION, while `actions/google-connection.ts` keeps only what the browser legitimately calls; (3) AD-2/AD-12 headers and the architecture spine are updated. No behaviour change.

## Boundaries & Constraints

**Always:**
- `actions/presentation-proposal.ts` (not `'use server'`): insert (inside the reply transaction), list per conversation, read for creation, set/clear deck id, mark created, delete per conversations (demo reset). `message.ts`, `conversation.ts`, `livrable.ts`, `demo.ts` call it; no other file touches the table.
- `actions/google-drive.ts` (not `'use server'`): config reads, `resolveDriveMode`, `getActiveDriveProvider` (+ revoked-token wrapper), `beginGoogleConnection`, `completeGoogleConnection`, connection status data, and the row delete used by disconnect. Route handlers and server-side actions import from it.
- `actions/google-connection.ts` (`'use server'`) keeps only `getGoogleConnectionStatus`, `disconnectGoogle`, `getGoogleOAuthOutcome`, `dismissGoogleOAuthOutcome`, delegating to `google-drive.ts`; `DriveMode` type re-export kept for components.
- Spine: AD-2 table-ownership notes and AD-12 ("le callback n'écrit le jeton que via `actions/google-drive.ts`") updated with a dated note.

**Never:** No behaviour, schema or UI change; no change to `integrations/`.

</frozen-after-approval>

## Code Map

- `actions/google-connection.ts` (298 lines) -- split as above; components import `GoogleConnection.tsx` (status, disconnect, dismiss), `ConversationHistory.tsx`/`PresentationProposalCard.tsx` (type only), `app/page.tsx` (status, outcome).
- Callers to repoint: `actions/document.ts`, `actions/document-context.ts`, `actions/message.ts`, `actions/livrable.ts` (`getActiveDriveProvider`, `resolveDriveMode`), `app/api/google/oauth/{start,callback}/route.ts`.
- `presentationProposal` uses: `actions/message.ts` (insert in `db.transaction`, history read), `actions/conversation.ts` (`getActiveConversation`), `actions/livrable.ts` (`runPresentationCreation`), `actions/demo.ts` (reset delete in `tx`).
- `ARCHITECTURE-SPINE.md` (`_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/`) AD-2, AD-12, section 4.5 file list.

## Tasks & Acceptance

**Execution:**
- [ ] `actions/presentation-proposal.ts` + callers.
- [ ] `actions/google-drive.ts`, slimmed `actions/google-connection.ts` + callers and route handlers.
- [ ] AD-2 header comments (`document.ts`, `livrable.ts`, `message.ts`) and spine.

**Acceptance Criteria:**
- Given the refactor, `grep` finds `presentationProposal` table access only in `actions/presentation-proposal.ts` (and `db/schema.ts`), and `googleConnection` only in `actions/google-drive.ts`.
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.

## Design Notes

`actions/livrable.ts` is not split: it is AD-2's single writer of LIVRABLE, and its Drive functions (import, reimport, save, create from proposal) all write LIVRABLE in their transactions; moving them would create a second writer, the erosion this item fixes. Its proposal reads/writes leave with (1).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Manual checks (if no CLI):**
- Scratch: rerun the Story 5.6 / retro scratch flows (proposal stored with reply, history replay, creation retry, demo reset) and a browser pass on the production build (top bar status, disconnect, OAuth start redirect).
