---
title: 'Epic 5 retro A10 — table ownership and server-only Google helpers'
type: 'refactor'
created: '2026-10-05'
status: 'done'
baseline_commit: 'af90d7d426191770dba3cb427d5d5f61066bcce4'
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
- [x] `actions/presentation-proposal.ts` + callers.
- [x] `actions/google-drive.ts`, slimmed `actions/google-connection.ts` + callers and route handlers.
- [x] AD-2 header comments (`document.ts`, `livrable.ts`, `message.ts`) and spine.

**Acceptance Criteria:**
- Given the refactor, `grep` finds `presentationProposal` table access only in `actions/presentation-proposal.ts` (and `db/schema.ts`), and `googleConnection` only in `actions/google-drive.ts`.
- Given `rm -f db/local.db* && npm run build`, then it succeeds; `npx tsc --noEmit` is clean.

## Design Notes

`actions/livrable.ts` is not split: it is AD-2's single writer of LIVRABLE, and its Drive functions (import, reimport, save, create from proposal) all write LIVRABLE in their transactions; moving them would create a second writer, the erosion this item fixes. Its proposal reads/writes leave with (1).

## Implementation Notes

- `actions/presentation-proposal.ts` (server-only): insert (with a transaction), list per conversation, read for creation, record/forget deck, mark created, delete per conversations. Callers: `message.ts`, `conversation.ts`, `livrable.ts`, `demo.ts`.
- `actions/google-drive.ts` (server-only): everything from `google-connection.ts` except the four browser actions, which now delegate (`readGoogleConnectionStatus`, `disconnectGoogleConnection`, `readGoogleOAuthOutcome`, `clearGoogleOAuthOutcome`). Callers and both OAuth routes repointed; types re-exported for components.
- Both new modules start with `import 'server-only'` (handled internally by Next, no package needed — `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`). Shared `MessageInsertExecutor` type exported from `actions/insert-message.ts`.
- Headers: `document.ts`, `livrable.ts`, `message.ts`, `db/schema.ts` (GOOGLE_CONNECTION, PRESENTATION_PROPOSAL), OAuth routes; spine AD-2 note, AD-12, section 4.5.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | blind, edge, gap | Nothing keeps the new modules server-only | medium | patch — `import 'server-only'` in both |
| 2 | blind, edge | Stale ownership comments (OAuth routes, `db/schema.ts` x2, `message.ts` header) | low | patch |
| 3 | blind, edge | Stale comments in `integrations/` (index, oauth, port) | low | defer — the spec forbids touching `integrations/`; comment-only follow-up |
| 4 | blind | Log strings still say `disconnectGoogle` | low | patch |
| 5 | blind | `Executor` type duplicated | low | patch — shared from `actions/insert-message.ts` |
| 6 | blind | Other `'use server'` modules still export server-internal writers (`createLivrableWithSuggestions`, `updateLivrableWithSuggestions`, `seedDemoReferenceDocument`…) | medium | defer — pre-existing (Epic 4), outside A10's scope |
| 7 | edge | `recordProposalDeck` may match 0 rows under a cross-process race | low | rejected — single local server; the in-process dedupe covers clicks |
| 8 | blind | Update helpers take no transaction | low | rejected — no caller needs one; header comment corrected |
| 9 | blind | Duplicate empty-list guard / comment in demo reset | low | rejected — harmless defensive guard |
| 10 | blind | No named return types for the read helpers | low | rejected — inferred types are checked by tsc |
| 11 | gap | No automated check of directives / atomic insert | — | defer — project decision; scratch + `server-only` guard |
| 12 | blind | Spec record empty | low | patch — this section |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors.
- `rm -f db/local.db* && npm run build` -- expected: success.

**Results (2026-10-05):** tsc clean; fresh-db build OK (also with `server-only`). Grep: PRESENTATION_PROPOSAL accessed only in `actions/presentation-proposal.ts`, GOOGLE_CONNECTION only in `actions/google-drive.ts`. Scratch on SQLite with a fake Anthropic endpoint: proposal stored with its reply and shown by `getActiveConversation`, replayed in the next request, creation retry without a second copy, then created, demo reset removes proposals. Browser (production build, fake credentials): "Connecter Google Drive" shown, OAuth start redirects to Google, connected email shown, disconnect deletes the row and brings the button back.

**Manual checks (if no CLI):**
- Scratch: rerun the Story 5.6 / retro scratch flows (proposal stored with reply, history replay, creation retry, demo reset) and a browser pass on the production build (top bar status, disconnect, OAuth start redirect).
