---
title: "Story 4.4 : Révision globale"
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '83ef6a552515b12320da736ce2ca30381c0e7b98'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-traitement-d-une-suggestion-ancree.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** FR-23 permet une révision globale d'un livrable, mais rien ne l'implémente -- le consultant ne peut agir que sur une suggestion ancrée à la fois (Story 4.3), jamais demander un ajustement d'ensemble qui ne cible pas un paragraphe précis.

**Approche :** Un champ en bas du panneau IA de l'éditeur (`components/GlobalRevisionField.tsx`, client) poste les instructions comme message utilisateur dans `LIVRABLE.conversationId` (AD-10), jamais une nouvelle conversation, via `sendMessage` (`actions/conversation.ts`). L'agent y répond en ré-invoquant `propose_livrable_content` ; `executeTool` détecte qu'un livrable existe déjà pour cette conversation et appelle une nouvelle `updateLivrableWithSuggestions` (`actions/livrable.ts`, au lieu de `createLivrableWithSuggestions`) qui remplace `LIVRABLE.content` et régénère ses suggestions ancrées -- aucune n'est jamais créée avant que l'agent n'ait traité la demande.

## Boundaries & Constraints

**Always :** La demande est postée comme `MESSAGE` utilisateur dans `LIVRABLE.conversationId`, jamais une nouvelle conversation (AD-10). Si `conversationId` est `null` (livrable fixture, Story 2.6), l'action refuse avec une erreur claire plutôt que de tenter de poster où que ce soit. `executeTool` cherche d'abord un `LIVRABLE` existant pour `conversationId` : s'il en existe un, `updateLivrableWithSuggestions` remplace tout `content.blocks` (nouveaux ids, AD-9 -- jamais réutilisés) et insère les nouvelles `SUGGESTION` ancrées ; sinon, comportement de création inchangé (Story 4.2). Avant d'insérer les nouvelles suggestions, `updateLivrableWithSuggestions` transitionne toute suggestion `pending`+`anchored` déjà existante sur ce livrable vers `rejected` -- son bloc ciblé disparaît avec la régénération (AD-9, ids jamais réutilisés), et cet état/libellé "Rejetée" est déjà supporté par l'UI (Story 4.3) ; ceci ferme aussi préventivement la lacune différée de la Story 4.3 (`acceptSuggestion` ne peut plus jamais rencontrer un `anchorRef` orphelin en pratique). Aucune `SUGGESTION` de type `global` n'est jamais créée par ce mécanisme (AD-10 -- seul un `MESSAGE` est produit ; la colonne existe dans le schéma mais reste inutilisée ici). Le champ est un formulaire simple, jamais une surface `OverlayProvider` (un seul existe, en bas du panneau, rien à empiler par-dessus). Bouton de soumission = `.button-primary`, jamais `.button-ai-primary` (action purement utilisateur). Pas de sélecteur de modèle -- `MODELS[0].id`, même motif que le champ de retravail (Story 4.3).

**Never :** Ne cible jamais un paragraphe précis. Ne crée jamais de suggestion ancrée avant que l'agent n'ait traité la demande. Pas de nouvelle conversation, jamais.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Soumission avec `conversationId` présent | Livrable lié à une conversation | Message posté dans cette conversation, l'agent régénère contenu + suggestions ancrées via le mécanisme de la Story 4.2 | Échec de l'appel agent -> erreur affichée, livrable inchangé |
| Soumission sur un livrable fixture | `conversationId` `null` | Refusé | "Ce livrable n'a pas de conversation d'origine." |
| Instructions vides ou espaces seuls | -- | Aucun appel déclenché | Bloqué côté client, motif `SuggestionCard` |

</frozen-after-approval>

## Code Map

- `actions/livrable.ts` -- ajoute `updateLivrableWithSuggestions(livrableId, proposal)` : même transaction synchrone que `createLivrableWithSuggestions`, remplace `content` par des blocs à nouveaux ids (jamais réutilisés), transitionne toute suggestion `pending`+`anchored` existante vers `rejected`, puis insère les nouvelles `SUGGESTION` `pending`+`anchored`. Ajoute `requestGlobalRevision(livrableId, instructions)` : lit `LIVRABLE.conversationId`, refuse si `null`, sinon appelle `sendMessage(conversationId, instructions, MODELS[0].id)` (`actions/conversation.ts`) et relaie tout `assistantFailed`/erreur.
- `actions/conversation.ts` -- `sendMessage`'s `executeTool` cherche d'abord un `LIVRABLE` existant par `conversationId` avant `createLivrableWithSuggestions` ; si trouvé, appelle `updateLivrableWithSuggestions` à la place et adapte le texte de confirmation (`tool_result`) au cas mise-à-jour.
- `components/GlobalRevisionField.tsx` (nouveau, client) -- formulaire simple (textarea + bouton `.button-primary`), garde de réentrance `busyRef`/`useTransition` (motif `SuggestionCard.tsx`), erreur inline, vide le champ et `router.refresh()` au succès.
- `app/livrables/[id]/page.tsx` -- rend `GlobalRevisionField` sous `SuggestionsPanel`, en bas de la colonne (UX-DR15).

## Tasks & Acceptance

**Execution:**
- [x] `actions/livrable.ts` -- `updateLivrableWithSuggestions`, `requestGlobalRevision` -- FR-23, AD-9, AD-10
- [x] `actions/conversation.ts` -- `executeTool` branche création/mise-à-jour -- AD-10
- [x] `components/GlobalRevisionField.tsx` -- formulaire de révision globale -- FR-23, UX-DR15
- [x] `app/livrables/[id]/page.tsx` -- intègre le champ en bas du panneau -- UX-DR15

**Acceptance Criteria:**
- Given un livrable ouvert avec une conversation d'origine, when je soumets une demande de révision globale, then elle est postée comme message dans cette conversation et l'agent y répond en régénérant le contenu et les suggestions ancrées concernées, via le même mécanisme que la Story 4.2
- Given cette soumission, when l'agent répond, then aucune suggestion ancrée n'a été créée avant qu'il n'ait traité la demande
- Given un livrable sans conversation d'origine, when je soumets une révision globale, then la demande est refusée avec un message clair
- Given des instructions vides ou uniquement des espaces, when je tente de soumettre, then aucun appel n'est déclenché

## Implementation Notes

Implémenté selon le Code Map, sans écart notable.

`actions/livrable.ts` ajoute `updateLivrableWithSuggestions(livrableId, proposal)` -- même forme de transaction synchrone que `createLivrableWithSuggestions` : nouveaux blocs à nouveaux ids (AD-9, jamais réutilisés), remplace `LIVRABLE.content` seul (le `title` n'est volontairement pas touché -- les Boundaries ne mentionnent que `content.blocks`), transitionne d'abord toute suggestion `pending`+`anchored` de ce livrable vers `rejected`, puis insère les nouvelles `SUGGESTION` `pending`+`anchored`. Ajoute `requestGlobalRevision(livrableId, instructions)` : lit `LIVRABLE.conversationId`, refuse avec `"Ce livrable n'a pas de conversation d'origine."` si `null` (et avec `"Ce livrable est introuvable."` si l'id lui-même n'existe pas), sinon délègue intégralement à `sendMessage(conversationId, instructions, MODELS[0].id)` (`actions/conversation.ts`) et relaie son résultat tel quel (succès, `assistantFailed`, ou échec).

Import circulaire assumé entre `actions/livrable.ts` (qui importe `sendMessage` de `actions/conversation.ts`) et `actions/conversation.ts` (qui importe `createLivrableWithSuggestions`/`updateLivrableWithSuggestions` de `actions/livrable.ts`) : les deux fichiers n'exposent que des déclarations de fonction (hoistées), appelées uniquement à l'intérieur d'autres fonctions -- jamais au niveau module -- donc aucun accès à un export non encore initialisé. `next build --turbopack` confirme que le bundler le résout sans avertissement.

`actions/conversation.ts` -- `sendMessage`'s `executeTool` fait d'abord un `SELECT` sur `LIVRABLE` par `conversationId` avant de décider : une ligne trouvée -> `updateLivrableWithSuggestions` (texte de confirmation "a été mis à jour avec N suggestion(s) ancrée(s)"), rien trouvé -> comportement de création inchangé (Story 4.2, texte "a été créé avec...").

`components/GlobalRevisionField.tsx` (nouveau, client) -- formulaire simple (textarea + `.button-primary` "Soumettre"), jamais une surface `OverlayProvider`. Garde de réentrance `busyRef`/`useTransition`, motif `SuggestionCard.tsx`/`Composer.tsx`. Les instructions vides ou espaces seuls ne déclenchent aucun appel (bloqué avant `startTransition`). Au retour de `requestGlobalRevision` : un refus (`ok:false`) garde le texte tapé et affiche l'erreur ; un succès (message posté, que l'agent ait échoué ou non) vide le champ et appelle `router.refresh()`, avec l'erreur de l'agent affichée en plus si `assistantFailed`.

`app/livrables/[id]/page.tsx` -- rend `<GlobalRevisionField livrableId={result.data.id} />` juste sous `<SuggestionsPanel>`, dans la même colonne verticale (UX-DR15).

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmed by the orchestrator against the code, independently found by the blind-hunter and edge-case lenses.** `updateLivrableWithSuggestions` (`actions/livrable.ts`) only transitions suggestions with `status='pending' AND type='anchored'` to `rejected` before swapping in fresh-id blocks — a suggestion mid-rework (`status='revising'`, `actions/suggestion.ts`'s `reworkSuggestion`) is left untouched. When that rework later resolves back to `pending`, it still carries its now-stale `anchorRef` from a block no longer in `content.blocks`; `acceptSuggestion` then silently marks it `accepted` with no actual change (`applyAcceptedSuggestion` no-ops on a non-matching anchor). This directly falsifies this spec's own Always claim that the change "ferme préventivement" Story 4.3's deferred stale-anchor finding. Reachable in ordinary use — no exotic race needed, just clicking "Retravailler" on one suggestion while separately submitting a révision globale on the same page. | Medium | Patch | **Applied and re-verified by the orchestrator.** `updateLivrableWithSuggestions`'s status filter now uses `inArray(suggestion.status, ['pending', 'revising'])` (`inArray` imported from `drizzle-orm`) instead of `eq(suggestion.status, 'pending')` — confirmed by reading the patched code directly. `npx tsc --noEmit` and `npx next build --turbopack` both re-run clean after the patch. |
| 2 | **Confirmed by the orchestrator, independently found by all three lenses.** The update branch's `tool_result` confirmation string (`actions/conversation.ts`'s `executeTool`) reads `` Le livrable "${parsed.data.title}" a été mis à jour... `` even though `updateLivrableWithSuggestions` deliberately never writes `title` back to `LIVRABLE` (only `content`, per this spec's own Boundaries and Implementation Notes). Since the tool schema requires `title` on every call, this is always reachable, not an edge case — the model can be told a rename took effect when the stored title never changed, and may repeat that false claim in its own natural-language reply to the consultant. | Medium | Patch | **Applied and re-verified by the orchestrator.** The update-branch confirmation string no longer echoes `parsed.data.title` — confirmed by reading the patched code directly; the creation branch's string (which does persist `title`) is untouched. `npx tsc --noEmit` and `npx next build --turbopack` both re-run clean after the patch. |
| 3 | **Confirmed by the orchestrator, independently found by the blind-hunter and edge-case lenses.** `executeTool`'s existence check (`SELECT` on `livrable` by `conversationId`) and its create-vs-update branch are not atomic against a second, concurrent `sendMessage` call on the same conversation (e.g. two browser tabs — the composer on `/` and `GlobalRevisionField` on `/livrables/[id]` — submitting near-simultaneously). Both could observe "no existing livrable" and both create one, or one could target a stale read. | Medium (real if it occurs), narrow window | Defer | Pre-existing issue, not introduced by this diff — the same class of race Story 4.2's own review already flagged and deferred ("Nothing prevents `propose_livrable_content` from being called more than once in the same conversation... Revisit before/during Story 4.4"). This story narrows that gap (an existing conversation's second call now updates instead of always creating) but does not close the underlying race, since no unique constraint or transactional read-then-branch protects it. Logged as an update to that deferred entry in `deferred-work.md`. |
| 4 | **Confirmed by the orchestrator, found by the blind-hunter lens.** `GlobalRevisionField` renders unconditionally on every `/livrables/[id]` page, including fixture livrables (Story 2.6) whose `conversationId` is `null` — the only way a consultant discovers it doesn't apply is submitting and getting the inline refusal. | Low | Reject | The frozen Boundaries and I/O matrix explicitly specify this exact behavior — refuse at submission with a clear message — as the intended mechanism; no proactive hiding was ever asked for. Hiding it would require exposing `conversationId` (or a derived flag) on `LivrableDetail`, which the codebase has deliberately kept off that type for the same FR-10-adjacent reason `LivrableSummary` does — more than a direct correction, and out of this story's frozen scope. |
| 5 | Found by the blind-hunter lens: `sprint-status.yaml` shows `4-4-révision-globale: in-progress` while the rest of the diff (spec `status: in-review`, all tasks `[x]`, Verification filled in) reflects a further-along state. | False | Reject | Artifact of when the diff snapshot was taken mid-workflow, before this step's own finalization reconciles `sprint-status.yaml` to the story's true final status — not a defect in the delivered code. |
| 6 | Found by the blind-hunter lens: `sprint-status.yaml`'s `last_updated` moves backward (`21:00` → `18:52`) in the same hunk that advances the story's status forward. | False | Reject | Coincidental clock-reading difference between two edits made earlier the same day on a purely informational field with no programmatic use (confirmed via the diff: no other unrelated change is bundled in that hunk). |
| 7 | Found by the blind-hunter lens: no repeatable regression test is left behind for this story's specific invariants (reject-before-insert ordering, fresh block ids, untouched title). | False | Reject | This entire project has no test framework anywhere (independently confirmed by the verification-gap lens itself), an explicit, project-wide, already-accepted constraint (`ARCHITECTURE-SPINE.md`'s Deferred section: "Tests automatisés, CI — non abordés"), not something one story's diff should unilaterally introduce. |
| 8 | **Confirmed by the orchestrator, found by the verification-gap lens (its main finding).** When `executeTool` already ran and `updateLivrableWithSuggestions` already committed the regeneration, a failure of `sendToAgent`'s *second*, tool-free `messages.create` call (e.g. a transient network/rate-limit blip) is caught by `skills/buildRequest.ts`'s single outer try/catch and reported identically to a failure that never touched the DB at all — `sendMessage` returns `assistantFailed:true` with a generic error, and `GlobalRevisionField` shows that error then immediately calls `router.refresh()`, which then visibly renders the already-regenerated content right next to a message implying the revision failed. This contradicts this spec's own I/O matrix row ("Échec de l'appel agent -> erreur affichée, livrable inchangé"). Reachable via any transient failure on the second of two sequential real API calls, no double-fault required. | Medium | Defer | Root cause is entirely pre-existing, unmodified code (`skills/buildRequest.ts`'s `sendToAgent`, `actions/conversation.ts`'s `sendMessage` — both untouched by this diff, originally Story 4.2's design) — this story only reuses that already-ambiguous contract through a new call site, it does not introduce the ambiguity. A real fix needs `sendToAgent` to distinguish "no mutation attempted" from "mutation succeeded, reply failed" in its return shape, a cross-cutting change to a shared assembly point used by every tool-using caller (`sendMessage`'s own creation path has the identical latent gap) — well beyond this story's scope or a trivial patch. Logged in `deferred-work.md`. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre

**Manual checks (if no CLI):**
- Sans `ANTHROPIC_API_KEY` réelle, vérifié le branchement création/mise-à-jour et le devenir des anciennes suggestions directement en base : insertion temporaire (projet, conversation, livrable avec 2 blocs, une suggestion `pending`+`anchored`, une `accepted`, une `global` `pending`), appel direct de `updateLivrableWithSuggestions` (script `tsx`, aucune dépendance ajoutée au projet), puis suppression -- confirmé via `git status`/`sqlite3 db/local.db ".tables"` que la base et l'arbre de travail sont revenus exactement à leur état d'avant (`db/local.db` restauré depuis une copie prise avant l'essai). Résultats : `content.blocks` remplacé par 2 nouveaux blocs à ids jamais réutilisés, la suggestion `pending`+`anchored` passe à `rejected`, la suggestion déjà `accepted` et la suggestion `global` `pending` restent inchangées, la nouvelle suggestion est insérée `pending`+`anchored` avec le bon `anchorRef` (nouveau bloc, résolu par `blockIndex`).
- Vérifié que la soumission sur un livrable fixture (`conversationId` `null`) est bien refusée avec exactement `"Ce livrable n'a pas de conversation d'origine."` (appel direct de `requestGlobalRevision`) ; un `livrableId` inexistant renvoie `"Ce livrable est introuvable."`.
- Vérifié qu'un appel `requestGlobalRevision` sur un livrable avec une vraie conversation d'origine, sans `ANTHROPIC_API_KEY`, réussit (`ok:true`) avec `assistantFailed:true` -- le message utilisateur est bien posté avant l'échec de l'appel agent, jamais perdu, exactement comme le chemin d'échec de `sendMessage` déjà vérifié en Story 2.5.
- Instructions vides/espaces seuls dans `GlobalRevisionField` : bloqué avant tout appel Server Action (vérifié par lecture de code -- le `return` précoce dans `handleSubmit` précède `startTransition`, comme `Composer.tsx`/`SuggestionCard.tsx`).
- `npx tsc --noEmit` et `npx next build --turbopack` re-exécutés propres après le script de vérification et la restauration de la base.
