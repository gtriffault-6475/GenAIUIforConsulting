---
title: "Fiabilité de la révision globale et de la concurrence des suggestions"
type: 'bugfix'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '381eb4980c037fddd272a650e92f37a0cde15154'
context: ['{project-root}/_bmad-output/specs/spec-fiabilite-revision-suggestions/SPEC.md', '{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-09-21.md', '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** L'audit FR-23/FR-24 de la Story 4.5 a vérifié chaque fonction mutante (`executeTool`, `acceptSuggestion`, `rejectSuggestion`, `reworkSuggestion`, `requestGlobalRevision`) isolément, jamais leurs écritures concurrentes sur les mêmes lignes `SUGGESTION`/`LIVRABLE`. La rétrospective de l'Epic 4 (`bmad-review`) y a trouvé 2 défauts HIGH : (1) toute révision globale régénère le document sans jamais montrer au modèle son contenu réel actuel ; (2) `reworkSuggestion` peut ressusciter en `pending`, avec une ancre morte, une suggestion qu'une révision globale concurrente vient de passer à `rejected` -- un faux "Acceptée" ensuite possible.

**Approche :** (1) `sendMessage` (`actions/conversation.ts`) lit le `livrable.content` existant pour la conversation avant d'appeler `sendToAgent`, et l'ajoute comme entrée synthétique de `loadedSkills` (même mécanisme d'assemblage du system prompt, AD-11, zéro changement à `skills/buildRequest.ts`) -- seulement quand un livrable existe déjà. (2) Les 3 écritures finales de `reworkSuggestion` (`actions/suggestion.ts`) qui remettent la suggestion à `pending` sont conditionnées à `status = 'revising'`, même motif garde-puis-écriture qu'`acceptSuggestion`/`rejectSuggestion`.

## Boundaries & Constraints

**Always :** Le contenu synthétique de contexte n'est ajouté à `loadedSkills` que si un `LIVRABLE` existe déjà pour cette conversation (jamais sur la toute première création). Les 3 écritures de `reworkSuggestion` vers `pending` (succès, échec agent, erreur inattendue) n'ont d'effet que si la suggestion est encore `revising` au moment de l'écriture -- sinon no-op silencieux, jamais bloqué, jamais d'erreur levée (Always déjà en vigueur : "jamais bloqué sur revising"). Le texte de contexte injecté est en lecture seule pour le modèle -- ne redevient jamais un objet persistable.

**Never :** Aucune nouvelle confirmation ni surface UI pour la révision globale (Option A de Story 4.5 maintenue). Aucun changement à la signature de `sendToAgent`/`skills/buildRequest.ts`. Aucun changement au comportement d'`acceptSuggestion`/`rejectSuggestion` (déjà correctement gardés). Ne traite pas la course déjà différée du livrable dupliqué par `conversationId` (hors périmètre, `deferred-work.md`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Révision globale sur un livrable existant | `LIVRABLE` avec N paragraphes, révision ne concernant qu'un seul | Le contenu actuel est injecté avant l'appel agent ; les paragraphes non concernés reviennent inchangés (ou reformulation volontaire informée du texte réel) | Échec de lecture du livrable existant -> comportement identique à aujourd'hui (pas de régression) |
| Première création de livrable (aucun existant) | Conversation sans `LIVRABLE` | Aucune injection de contexte -- comportement strictement inchangé | N/A |
| Retravail en cours, révision globale concurrente le rejette | Suggestion `revising`, puis `rejected` par une révision globale avant la fin de l'appel agent | La fin du retravail (succès ou échec) est un no-op sur cette ligne -- reste `rejected` | N/A |
| Retravail en cours, aucune interférence | Suggestion `revising`, aucune autre écriture concurrente | Comportement inchangé : `pending`+nouveau texte (succès) ou `pending`+ancien texte (échec) | Erreur affichée comme aujourd'hui |

</frozen-after-approval>

## Code Map

- `actions/conversation.ts` -- `sendMessage`, immédiatement avant son appel à `sendToAgent` : ajouter une lecture `SELECT content FROM livrable WHERE conversationId = ?` et, si trouvé, pousser une entrée `{skillKey: '__current_livrable_context', instructions: <contenu formaté>}` dans le tableau `loadedSkills` passé à `sendToAgent`. Ne touche pas `executeTool` ni `skills/buildRequest.ts`. **[Implémenté]** Fait exactement ainsi (`effectiveLoadedSkills`), avec repli silencieux (logué) sur absence/malformation.
- `actions/suggestion.ts` -- `reworkSuggestion` : les 3 `db.update(suggestion).set({status:'pending', ...})` (lignes ~343-346, ~360-363, ~377-380) gagnent `and(eq(suggestion.id, suggestionId), eq(suggestion.status, 'revising'))` à la place de `eq(suggestion.id, suggestionId)` seul dans leur `.where()`. Ajouter `and` à l'import `drizzle-orm` existant (ligne 3, actuellement `import { eq } from 'drizzle-orm'`).
- `actions/livrable.ts` -- `updateLivrableWithSuggestions` : aucun changement (son `inArray(['pending','revising'])` reste correct pour le cas qu'il gère déjà).

## Tasks & Acceptance

**Execution:**
- [x] `actions/conversation.ts` -- injecter le contenu actuel du livrable existant dans `loadedSkills` avant l'appel `sendToAgent` -- CAP-1
- [x] `actions/suggestion.ts` -- garder les 3 écritures finales de `reworkSuggestion` par `status = 'revising'` -- CAP-2
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- clôturer l'entrée réouverte (Story 4.3/Epic 4 retro) une fois le correctif vérifié

**Acceptance Criteria:**
- Given un livrable existant avec plusieurs paragraphes, when une révision globale ne concerne qu'un seul, then les autres paragraphes reviennent inchangés dans le document régénéré (vérifié en lisant le contenu du prompt système envoyé)
- Given une suggestion `revising`, when une révision globale concurrente la passe à `rejected` avant la fin de l'appel agent, then l'issue de `reworkSuggestion` ne modifie plus cette ligne (reste `rejected`)
- Given le chemin nominal (aucune concurrence, première création), when on exécute le flux existant, then aucune régression de comportement (mêmes résultats qu'avant ce correctif)

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmed by the orchestrator, found independently by 2 of 3 lenses (blind-hunter, edge-case-hunter).** `reworkSuggestion`'s three guarded write-backs (`AND status = 'revising'`) correctly no-op when a concurrent global revision already moved the row to `rejected` (CAP-2's actual goal — never resurrect), but none of the three checks whether the guard actually matched: the success branch always returns `{ok:true}` even when its own `UPDATE` matched zero rows (silently discarding the consultant's freshly reformulated text with no explanation), and the two failure/revert branches keep their pre-fix comment/behavior ("suggestion is already back to pending... keep the field open so the consultant can retry") which is now false in the raced case — `SuggestionCard.tsx`'s failure path doesn't `router.refresh()`, so the UI can show a stale, misleading state until something else triggers a refresh. Verified: `drizzle-orm`'s `.run()` on `node-sqlite` returns `{changes, lastInsertRowid}`, `changes: 0` on a guard miss (confirmed with a throwaway script against the real driver). The underlying data integrity holds in all cases (never resurrected as `pending`, matching this spec's own AC) — this is a false-success/stale-UI-feedback gap, not a data-corruption one. | Medium | Patch | **Applied and re-verified by the orchestrator.** All 3 guarded writes in `reworkSuggestion` now check `.run().changes`; a guard miss returns `{ok:false, error: 'Cette suggestion a été traitée entre-temps.'}` (success branch) or is `console.error`-logged with an accurate outcome (revert branches) instead of silently claiming success/an inaccurate retry-eligible state. `SuggestionCard.tsx` unaffected — its existing error-display path already renders whatever message the action returns. `npx tsc --noEmit` and `npx next build --turbopack` re-run clean. |
| 2 | Found by the blind-hunter lens: the context-injection block only serializes `block.text`, allegedly dropping other per-block metadata (formatting, type, `ai-tint` flags). | False | Reject | Confirmed by the orchestrator: `{id: string; text: string}` is the *entire* block shape everywhere in this codebase (`actions/livrable.ts`, `actions/suggestion.ts`, `domain/suggestion.ts` — grepped every occurrence). There is no additional metadata to lose; `block.text` is the complete content. |
| 3 | Found by the blind-hunter lens: the new context injection runs on *every* `sendMessage` call once any livrable exists for the conversation (not only on an actual global-revision turn), adding the full serialized document to the prompt every time, with a real token-cost/latency impact for larger livrables never discussed anywhere in the spec. | Low | Defer | Faithful to this spec's own frozen Always ("ajouté... si un LIVRABLE existe déjà... jamais sur la toute première création" — no narrower gating specified), and necessary given `propose_livrable_content` is *already* unconditionally offered on every `sendMessage` call regardless of intent (Story 4.2/4.5, `deferred-work.md`) — the model could invoke it on any turn, so the context must be available on any turn. Same category of already-accepted cost tradeoff as that existing entry. Logged as an addendum there rather than a new entry. |
| 4 | Found by the blind-hunter lens (independently, edge-case-hunter finding #2): the new `SELECT` on `livrable.conversationId` has no `LIMIT`/ordering, so it is non-deterministic if the already-known duplicate-livrable-per-conversation race (Story 4.2/4.4, `deferred-work.md`) ever produces two rows for one conversation. | Low | Reject (out of scope) | This spec's own frozen Non-goals explicitly excludes fixing that race ("Ne corrige pas la course déjà différée du livrable dupliqué par `conversationId`"). Real, but already tracked under the existing deferred entries; this diff only adds a second read site subject to the same pre-existing condition, it does not introduce the race itself. |
| 5 | Found by the edge-case-hunter lens: content is read once for context injection, then a long agent round-trip elapses before `executeTool` overwrites `livrable.content` wholesale — any write landing on that same livrable during the round-trip (an accept/reject, another revision) is silently discarded by the eventual overwrite. | Medium (real if it occurs), pre-existing | Defer | Confirmed pre-existing: `updateLivrableWithSuggestions`'s unconditional wholesale `content` overwrite (`actions/livrable.ts:295-298`) is unchanged by this diff — this spec only adds an earlier *read*, it does not change when or how the final write happens or make this race any more or less likely than it already was on `main`. Same family as the already-deferred concurrent-`sendMessage` race (Story 4.4 finding #3, `deferred-work.md`). Logged as an addendum there. |
| 6 | Found by the blind-hunter lens: this spec's own Code Map cites approximate pre-implementation line numbers ("~510-524", "avant l'appel... à la ligne 602") that no longer match the patched file. | Low | Patch | **Applied by the orchestrator.** Code Map updated to describe the actual insertion point (immediately before the `sendToAgent` call inside `sendMessage`) without brittle line numbers, matching how other specs in this project describe already-implemented Code Map entries. |
| 7 | Found by the blind-hunter lens: `status: 'in-review'` in this file's own frontmatter contradicts its Tasks (`[x]`) and Verification sections already narrating completion. | False | Reject | Identical precedent already logged in `spec-4-4-revision-globale.md`'s Review Triage Log (finding #5) and `spec-4-5-...md`'s (finding #7): artifact of the diff snapshot taken mid-workflow, reconciled at finalization — not a defect in the delivered work. |
| 8 | Found by the blind-hunter lens: CAP-2 was backed by a described, executed concurrency race test; CAP-1 (context injection) only has a *prescription* of how to verify it, no narrated actual run. | N/A | No action needed | The orchestrator independently verified CAP-1's actual code by direct reading (`actions/conversation.ts`'s injection block, traced against `skills/buildRequest.ts`'s system-prompt assembly) rather than re-trusting the implementer's report — confirmed correct: injects only when an existing livrable is found, no injection on first creation, malformed content falls back to no injection without throwing. |
| 9 | Found by the blind-hunter lens: the same problem narrative is restated near-verbatim across `spec-fiabilite-revision-suggestions.md`, `.memlog.md`, and `SPEC.md`. | Low | Reject | Matches this project's established documentation pattern (see identical finding #5 in `spec-4-5-...md`'s own Review Triage Log): each file serves a different audience (frozen intent, append-only decision log, canonical cross-skill contract) — collapsing them is more than a trivial fix and not something a reader encounters as harmful. |
| 10 | Found by the blind-hunter lens: `deferred-work.md`'s new `summary_reopened_2026-09-21` key doesn't match the naming pattern of the adjacent `original_resolution_2026-09-18` key. | Low | Reject | Cosmetic, pre-existing loose convention in this file (no schema is parsed against these keys programmatically) — not introduced or worsened meaningfully by this diff. |

Verification-gap lens: no formal verification gap found (confirmed no test files/framework exist, traced both capabilities to their real consumers, `npx tsc --noEmit` re-run clean) — its one "other" observation is finding #1 above (independently corroborating the same root cause as blind-hunter/edge-case-hunter).

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre

**Manual checks (if no CLI):**
- Sans `ANTHROPIC_API_KEY` réelle (limitation déjà documentée et acceptée depuis l'Epic 2), le contenu réellement envoyé au modèle ne peut pas être vérifié via un vrai appel -- vérifier à la place, par lecture de code et/ou un script `tsx` jetable, que `loadedSkills` contient bien l'entrée de contexte quand un livrable existe, et n'en contient aucune sinon.
- Insertion temporaire en base (projet, conversation, livrable, une suggestion `revising`) ; appel direct de `updateLivrableWithSuggestions` puis de la suite de `reworkSuggestion` (succès et échec) sur cette même suggestion -- confirmer qu'elle reste `rejected` dans les deux cas ; nettoyage après coup.
- Confirmer par lecture directe qu'`acceptSuggestion`/`rejectSuggestion` restent inchangés.
