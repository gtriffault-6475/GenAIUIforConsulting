---
title: "Story 4.2 : Génération des suggestions ancrées à l'écriture"
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b1a95473a0a2ffc0766f08f86dc83579c94fd7b0'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-ouverture-d-un-livrable.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Aucun mécanisme ne crée jamais de livrable ni de suggestion : `LIVRABLE`/`SUGGESTION` n'ont que des données de fixture, et l'Éditeur assisté (Story 4.1) n'a jamais rien de réel à afficher (FR-20).

**Approche :** L'agent gagne son premier vrai outil `@anthropic-ai/sdk` : `propose_livrable_content`, appelé dans le même tour qu'un message de conversation normal quand le consultant demande de rédiger un document. `skills/buildRequest.ts` (AD-11) exécute le cycle outil complet (le modèle demande l'outil → l'action appelante persiste → un second appel renvoie la réponse finale en langage naturel) ; `actions/livrable.ts` crée en une transaction le `LIVRABLE` et ses `SUGGESTION` (`pending`, `anchored`). L'Éditeur assisté affiche ces suggestions déjà présentes, en lecture seule (Accepter/Rejeter/Retravailler = Story 4.3).

## Boundaries & Constraints

**Always :** outil disponible sur **tout** appel `sendMessage`, jamais conditionné à une skill (comme `propose_starting_point.ts`, hors `SKILL_CATALOG` ; le préfixe `${skillKey}.${toolName}` d'AD-4 ne s'applique qu'à plusieurs outils de même nom, absent ici) — sa `description` seule guide le modèle, jamais de changement à `skills/catalog.ts`. Ids de bloc toujours générés côté serveur (`crypto.randomUUID()`) : l'outil reçoit du texte brut (`blocks: string[]`) et des suggestions par position (`blockIndex`), jamais un id. `LIVRABLE`+`SUGGESTION` dans une seule transaction synchrone (motif `selectStep`/`selectProject`). Le cycle outil reste interne à `sendToAgent` (AD-11) ; le handler ne touche jamais `db` (AD-2), seule `actions/livrable.ts` persiste. `MESSAGE` ne stocke jamais l'échange outil, seulement le message du consultant et la réponse finale.

**Never :** jamais de mise à jour d'un livrable existant ici -- toujours une nouvelle ligne `LIVRABLE`, régénération = Story 4.4. Aucune UI de traitement (Accepter/Rejeter/Retravailler, `button-ai-primary`) -- Story 4.3 ; suggestions affichées empilées sous le contenu, une seule colonne -- le panneau latéral dédié n'a de sens qu'avec ces actions, différé à 4.3. Ne pas modifier `skills/catalog.ts` ni le Stepper. Un seul `tool_use` géré par réponse -- un seul outil existe.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Le consultant demande la rédaction d'un document | Conversation active, l'agent décide d'appeler l'outil | `LIVRABLE`+`SUGGESTION` persistés avant la fin de l'appel ; la conversation affiche seulement la réponse finale en langage naturel | N/A |
| Exécution de l'outil échoue (entrée du modèle malformée) | `parseProposeLivrableContentInput` retourne `{ok:false}` | `tool_result` marqué `is_error`, second appel renvoie quand même une réponse | Aucune ligne `LIVRABLE`/`SUGGESTION` orpheline |
| Ouverture de l'Éditeur assisté sur un livrable avec suggestions déjà persistées | `listSuggestions` retourne des lignes `pending` | Suggestions affichées instantanément (`ai-suggestion-card`), aucun appel agent au chargement | N/A |
| Message de conversation normal, sans intention de livrable | Historique quelconque | Le modèle n'appelle jamais l'outil, comportement inchangé (Story 2.5) | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- ajoute la table `suggestion` (`id`, `livrableId` FK, `type` enum `anchored|global`, `anchorRef` nullable, `text`, `status` enum `pending|accepted|rejected|revising`) + index unique partiel `(livrable_id, anchor_ref) WHERE status='pending' AND type='anchored'` (motif de la Story 3.1). Migration `npm run db:generate`.
- `domain/suggestion.ts` (nouveau) -- `SuggestionStatus` (le seul endroit qui définit cet enum, Consistency Conventions), `resolveAnchorPosition(blocks, anchorRef): number | null` (fonction pure, position 1-based du bloc ciblé pour l'affichage `¶N`).
- `skills/propose_livrable_content.ts` (nouveau) -- `PROPOSE_LIVRABLE_CONTENT_TOOL: Anthropic.Tool` (name, description, `input_schema` JSON Schema : `{title:string, blocks:string[], suggestions:[{blockIndex:number, text:string}]}`) ; `parseProposeLivrableContentInput(input: unknown)` valide la forme, aucune I/O.
- `skills/buildRequest.ts` -- `sendToAgent` gagne des paramètres optionnels `tool?: Anthropic.Tool` et `executeTool?: (input: unknown) => Promise<{ok:true;content:string}|{ok:false;error:string}>`. Si la 1ère réponse contient un bloc `tool_use`, appelle `executeTool`, construit le message `tool_result` (`is_error` si échec), refait un appel avec l'historique étendu, retourne le texte final. Sans `tool`/`executeTool` (cas de `propose_starting_point.ts`), comportement strictement inchangé.
- `actions/livrable.ts` -- ajoute `createLivrableWithSuggestions(projectId, conversationId, proposal: ProposedLivrableContent): Promise<ActionResult<{livrableId:string}>>` -- une transaction : génère un id par bloc, construit `content`, insère `LIVRABLE`, résout chaque `blockIndex` vers l'id du bloc correspondant, insère les `SUGGESTION` (`pending`, `anchored`).
- `actions/suggestion.ts` (nouveau) -- `listSuggestions(livrableId): Promise<ActionResult<SuggestionSummary[]>>` avec `SuggestionSummary = {id, anchorRef, text, status}` -- seul fichier autorisé à lire/écrire `SUGGESTION`, sauf l'insertion couplée dans `createLivrableWithSuggestions` ci-dessus (transaction atomique avec son propre `LIVRABLE`).
- `actions/conversation.ts` -- `sendMessage` construit `executeTool` (parse via `parseProposeLivrableContentInput`, appelle `createLivrableWithSuggestions(projectId, conversationId, ...)`) et passe `{tool: PROPOSE_LIVRABLE_CONTENT_TOOL, executeTool}` à `sendToAgent`.
- `app/livrables/[id]/page.tsx` -- appelle `listSuggestions(id)` en parallèle de `getLivrable(id)` ; rend `SuggestionsPanel` empilé sous la `.card` de contenu existante (une seule colonne -- le panneau latéral dédié attend Story 4.3 et ses actions).
- `components/SuggestionsPanel.tsx` (nouveau) -- Server Component, une `.ai-suggestion-card` par suggestion (`¶${resolveAnchorPosition(...)}` + `text`), lecture seule, aucun bouton (Story 4.3) ; aucune CSS nouvelle -- réutilise `.ai-suggestion-card` (Story 3.3) tel quel.

## Tasks & Acceptance

**Execution:**
- [x] `db/schema.ts` + migration -- table `suggestion` + index unique partiel -- FR-20
- [x] `domain/suggestion.ts` -- `SuggestionStatus` + `resolveAnchorPosition` -- Consistency Conventions, AD-5
- [x] `skills/propose_livrable_content.ts` -- outil + validation d'entrée -- AD-3
- [x] `skills/buildRequest.ts` -- cycle `tool_use` dans `sendToAgent` -- AD-11
- [x] `actions/livrable.ts` -- `createLivrableWithSuggestions` -- AD-2, AD-9
- [x] `actions/suggestion.ts` -- `listSuggestions` -- expose la lecture au Éditeur assisté
- [x] `actions/conversation.ts` -- câble l'outil dans `sendMessage` -- réalise FR-20
- [x] `app/livrables/[id]/page.tsx` + `components/SuggestionsPanel.tsx` -- affichage instantané -- FR-24

**Acceptance Criteria:**
- Given une conversation qui aboutit à la création d'un livrable, when l'agent produit le contenu, then il produit dans le même appel des suggestions ancrées à des blocs précis, persistées avant la fin de l'appel
- Given ce livrable déjà généré, when j'ouvre l'Éditeur assisté, then les suggestions apparaissent instantanément, sans appel IA visible au chargement
- Given une suggestion ancrée affichée, when je regarde son style, then elle utilise `ai-suggestion-card` (fond plein, jamais de bordure colorée) et ne modifie jamais le contenu du livrable

## Implementation Notes

Implémenté directement selon le Code Map, sans subagent dédié.

`db/schema.ts` ajoute la table `suggestion` (`id`, `livrableId` FK vers `livrable`, `type` enum `anchored|global`, `anchorRef` nullable, `text`, `status` enum `pending|accepted|rejected|revising`) et l'index unique partiel `suggestion_livrable_id_anchor_ref_pending_anchored_unique` sur `(livrable_id, anchor_ref) WHERE status = 'pending' and type = 'anchored'`, même motif SQL que l'index partiel de la Story 3.1. Migration générée via `npm run db:generate` (`db/migrations/20260918101753_sturdy_jack_power/migration.sql`), appliquée automatiquement au prochain accès à `db/client.ts` (mécanisme déjà en place, aucune modification).

`domain/suggestion.ts` (nouveau) définit `SuggestionStatus`, `SuggestionType`, et `resolveAnchorPosition(blocks, anchorRef)` -- fonction pure (`findIndex` + 1), retourne `null` si l'ancre ne correspond à aucun bloc (cas non atteignable par le chemin d'écriture de cette story, mais vérifié manuellement en insérant une suggestion à `anchorRef` orpheline -- voir Verification).

`skills/propose_livrable_content.ts` (nouveau) exporte `PROPOSE_LIVRABLE_CONTENT_TOOL` (`Anthropic.Tool`, `input_schema` JSON Schema `{title, blocks, suggestions:[{blockIndex,text}]}`) et `parseProposeLivrableContentInput(input: unknown)` -- validation pure sans I/O : vérifie la présence et le type de chaque champ, et que chaque `blockIndex` est un entier dans les bornes de `blocks`. Retourne `{ok:false,error}` sur toute forme invalide plutôt que de lever une exception.

`skills/buildRequest.ts` -- `sendToAgent` gagne les paramètres optionnels `tool?: Anthropic.Tool` et `executeTool?: (input: unknown) => Promise<ExecuteToolResult>` (type exporté). Un helper `extractText` factorise l'extraction du texte final, partagé entre le chemin sans outil (inchangé) et la fin du cycle outil. Le 1er appel `messages.create` passe `tools:[tool]` seulement si `tool` est fourni. Si `stop_reason !== 'tool_use'`, ou si `tool`/`executeTool` est absent, ou si aucun bloc `tool_use` n'est trouvé dans la réponse (garde défensive) : retour au chemin actuel (`extractText(response)`), strictement inchangé -- c'est exactement le chemin emprunté par `propose_starting_point.ts`, qui ne passe ni l'un ni l'autre paramètre. Sinon : `executeTool(toolUseBlock.input)` est appelé, un message `assistant` reprenant `response.content` du 1er appel puis un message `user` avec un bloc `tool_result` (`tool_use_id`, `content`, `is_error:true` si échec) sont ajoutés à l'historique, et un 2e appel `messages.create` (sans `tools`, pour garantir qu'un seul `tool_use` est jamais géré par réponse) renvoie le texte final via `extractText`.

`actions/livrable.ts` ajoute `createLivrableWithSuggestions(projectId, conversationId, proposal)` : génère un `crypto.randomUUID()` par bloc de `proposal.blocks`, construit `content` JSON, insère la ligne `LIVRABLE`, puis pour chaque suggestion résout `blockIndex` vers l'id du bloc correspondant (tableau généré dans la même fonction, jamais recalculé) et insère la ligne `SUGGESTION` (`type:'anchored'`, `status:'pending'`) -- le tout dans un seul `db.transaction` synchrone, même motif que `selectStep`/`selectProject`. Un `blockIndex` hors bornes (déjà rejeté en amont par `parseProposeLivrableContentInput`, donc défense en profondeur seulement) est journalisé et ignoré plutôt que de faire échouer toute la transaction.

`actions/suggestion.ts` (nouveau) expose `listSuggestions(livrableId): Promise<ActionResult<SuggestionSummary[]>>` -- un `SELECT` simple, sans filtre de statut (les suggestions traitées resteront visibles, atténuées, dès la Story 4.3). Seul fichier autorisé à lire/écrire `SUGGESTION`, à l'exception de l'insertion couplée dans `createLivrableWithSuggestions` ci-dessus (transaction atomique avec son propre `LIVRABLE`, documentée en tête des deux fichiers).

`actions/conversation.ts` -- `sendMessage` construit désormais `executeTool` (parse via `parseProposeLivrableContentInput`, puis `createLivrableWithSuggestions(projectId, conversationId, ...)` sur succès, renvoie un texte de confirmation comme `content` du `tool_result`) et passe systématiquement `{tool: PROPOSE_LIVRABLE_CONTENT_TOOL, executeTool}` à `sendToAgent` -- sur *tout* appel `sendMessage`, jamais conditionné à une skill chargée (Always). Le texte de l'échange outil (le `tool_result`) n'est jamais persisté dans `MESSAGE` : seul `agentResult.content` (la réponse finale en langage naturel du 2e appel) est inséré comme message `assistant`, exactement comme avant cette story.

`app/livrables/[id]/page.tsx` appelle désormais `listSuggestions(id)` en parallèle de `getLivrable(id)` (`Promise.all`) -- une lecture supplémentaire, jamais un appel agent. Un échec de `listSuggestions` est journalisé et dégrade silencieusement vers `[]` plutôt que d'ajouter un second message d'erreur visible sur la page. `SuggestionsPanel` est rendu sous la `.card` de contenu, dans un conteneur `flex-column` commun (une seule colonne, per Never).

`components/SuggestionsPanel.tsx` (nouveau) -- Server Component pur, ne fait aucune lecture propre (tout est déjà résolu par le parent), retourne `null` si `suggestions.length === 0`. Une `.ai-suggestion-card` par suggestion, avec `¶${resolveAnchorPosition(blocks, anchorRef) ?? '' }` (replié en simple `¶` si l'ancre ne résout à rien) suivi du texte -- aucune nouvelle classe CSS, réutilise `.ai-suggestion-card`/`.text-body`/`.text-body-strong` tel quel. Aucun bouton, aucune interaction (Story 4.3).

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmed and empirically reproduced by both the adversarial and verification-gap lenses, independently, against real SQLite.** `parseProposeLivrableContentInput` validates each suggestion's `blockIndex` is an in-range integer, but never checks uniqueness across the `suggestions` array. Two suggestions targeting the same `blockIndex` both resolve to the same block id; the second `SUGGESTION` insert inside `createLivrableWithSuggestions`'s transaction then violates the partial unique index, throws, and rolls back the **entire transaction** — the `LIVRABLE` row and every other, perfectly valid `SUGGESTION` row vanish along with it. The consultant sees only a generic "Impossible de créer ce livrable." with no indication of the real cause, and the model gets no specific enough `tool_result` to retry correctly in the same turn ("un seul tool_use géré par réponse" forbids a second attempt). Verification-gap independently confirmed the transaction *rollback itself* is clean (zero orphan rows either way, via a real forced-failure test) — this is a validation gap, not a data-integrity risk. | High | Patch | `parseProposeLivrableContentInput` rejects duplicate `blockIndex` values across `suggestions` with a specific error, before any transaction is attempted — the same class of fix as the existing in-range check, just extended to uniqueness. |
| 2 | Edge-case lens: nothing prevents the model from calling the tool a second time in the same conversation (e.g. a later message also reads as a drafting request). Each call inserts a brand-new, fully independent `LIVRABLE` row (per this story's own frozen Never — "toujours une nouvelle ligne") with its own independent `SUGGESTION` set. `LivrablesPanel` would show two unrelated-looking cards for what the consultant experiences as "the same document," with no UI cue they share an origin conversation (`LivrableSummary` deliberately omits `conversationId`, FR-10). | Medium | Defer | Real and reachable, but not exercised by round 1's own demonstrated usage narrative (UJ-1/UJ-2 each draft one document per conversation), and any real fix (block a second creation? merge? group by conversation in the UI?) is a product decision this story's frozen intent doesn't settle — not a trivial patch. Logged in `deferred-work.md`; flagged explicitly to the human rather than silently deferred. |
| 3 | Edge-case lens: the tool is offered unconditionally on *every* `sendMessage` call (no keyword pre-filter, no rate limit, no cooldown), so any message the model judges tool-worthy costs a full second sequential, non-streamed `messages.create` round-trip — more than double latency and input tokens versus a normal reply, with no user-facing indication mid-flight that a two-call cycle is in progress. | — (not a code defect) | No action (fix would edit this build's spec) | Confirmed to be exactly what this story's own frozen Boundaries mandate ("outil disponible sur **tout** appel `sendMessage`... sa description seule guide le modèle") — the implementation is faithful to an intentional, already-approved spec decision (Story 3.3 precedent), not a bug introduced by the diff. A cost/latency mitigation (heuristic pre-filter, rate limit) would require renegotiating the frozen intent, which this review does not do. Logged in `deferred-work.md` as a forward-looking architecture note. |
| 4 | Adversarial lens: `executeTool`'s success-path confirmation string (`parsed.data.title`, `parsed.data.suggestions.length`) is built *after* `createLivrableWithSuggestions` already committed — if that string construction ever threw (it structurally cannot today, since `parsed.data` is already fully validated), a successful creation would be reported to the user as a failure. | Low | No action | Not reachable by any current code path (`parsed.data`'s fields are guaranteed-valid by the parser before this line runs) — a hypothetical future-maintenance caution, not a present defect. |
| 5 | Edge-case lens: `resolveAnchorPosition` returning `null` (an anchor that doesn't resolve to any block) renders a bare `¶` with no explanatory text in `SuggestionsPanel`. | Low | No action | Confirmed unreachable via this story's own write path (every suggestion anchors to a block created in the same transaction) — already disclosed as a forward-looking concern for Story 4.4's regeneration in the code's own comments; a real "ancrage introuvable" message is that story's concern, not this one's. |
| 6 | Adversarial lens: `skills/buildRequest.ts` reuses the first API response's raw `content` blocks directly as the second call's request content — safe today (only `TextBlock`/`ToolUseBlock` can ever appear, since no server tools or extended thinking are enabled anywhere in this app), but would silently mishandle a response-only block shape if either were ever turned on. | Low | No action | Not reachable in this app's current or planned (per any spec so far) configuration — logging only, revisit if a future story ever enables server tools or extended thinking. |

## Design Notes

Cycle `tool_use` dans `sendToAgent` (2 appels `messages.create` maximum, jamais de streaming) :
1. 1er appel avec `tools:[tool]` (si fourni). Si `stop_reason !== 'tool_use'` ou pas de `tool`/`executeTool` fourni : chemin actuel inchangé (extraction du texte).
2. Sinon : `executeTool(toolUseBlock.input)` -- ne touche jamais `db` directement (AD-2), retourne `{ok,content|error}`.
3. Construit un message `assistant` reprenant `response.content` du 1er appel, puis un message `user` avec un bloc `tool_result` (`tool_use_id`, `content`, `is_error` si échec).
4. 2e appel `messages.create` avec l'historique étendu de ces deux messages -- sa réponse texte est le résultat final retourné par `sendToAgent`.

`propose_starting_point.ts` ne passe ni `tool` ni `executeTool` : sa branche reste celle du chemin actuel, comportement inchangé.

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre (`ƒ /livrables/[id]` toujours dynamique, aucune nouvelle route)
- `npm run db:generate` -- migration `20260918101753_sturdy_jack_power` générée, appliquée avec succès au démarrage du serveur de dev déjà lancé par l'utilisateur (aucune erreur dans les logs)

**Manual checks -- effectués en direct dans le navigateur (`npm run dev`, serveur déjà lancé par l'utilisateur sur le port 3000) :**
- Sans `ANTHROPIC_API_KEY` réelle dans cet environnement (comme pour les Stories 3.3/4.1), le cycle outil complet (2 appels `messages.create`) ne peut pas être exercé en conditions réelles. Le cycle de `sendToAgent` (`skills/buildRequest.ts`) a été relu ligne à ligne contre le Design Notes : chemin sans `tool`/`executeTool` inchangé, `tools` passé seulement au 1er appel, `tool_result` construit avec `is_error` sur échec, 2e appel sans `tools` (un seul `tool_use` géré par réponse).
- Index unique partiel : testé directement en SQLite (`sqlite3 db/local.db`) sur le livrable seed `961115f0-4557-4551-b2d7-92063d9d998c` (bloc `2d588edf-0b5a-4351-9c02-918ebe64ee41`) -- une 2e ligne `SUGGESTION` `pending`+`anchored` sur le même `(livrable_id, anchor_ref)` est bien rejetée (`UNIQUE constraint failed`) ; une ligne `accepted` sur le même couple s'insère sans problème ; deux lignes `global` (`anchor_ref` NULL) `pending` coexistent sans conflit -- comportement exactement conforme à epic-4-context.md.
- Affichage de `SuggestionsPanel` : 5 lignes `SUGGESTION` de test insérées temporairement sur ce même livrable (une ancrée résolue `¶1`, une ancrée à un `anchor_ref` orphelin pour vérifier le repli `resolveAnchorPosition → null` affichant un simple `¶`, une `accepted` sur le même bloc, deux `global` `pending`). Rendu vérifié dans le navigateur (`/livrables/961115f0-4557-4551-b2d7-92063d9d998c`) : les 5 cartes `.ai-suggestion-card` s'affichent empilées sous le contenu, fond `ai-tint` plein sans bordure colorée, `¶1` résolu correctement pour l'ancre valide, repli `¶` (sans numéro) pour l'ancre orpheline, aucune erreur console. Les 5 lignes de test ont été supprimées après vérification (`DELETE FROM suggestion WHERE id IN (...)`) -- la table `suggestion` est revenue à 0 ligne, confirmé par requête. Rechargement de la page après suppression : `SuggestionsPanel` ne rend plus rien (retour `null`), carte de contenu seule affichée, comme attendu pour un livrable sans suggestion.
- Vérifié que le code de `sendMessage` (`actions/conversation.ts`) passe désormais systématiquement `{tool: PROPOSE_LIVRABLE_CONTENT_TOOL, executeTool}` à `sendToAgent`, sur tout appel, sans condition sur les skills chargées du projet (Always) -- et que `MESSAGE` ne reçoit jamais que `agentResult.content` (la réponse finale), jamais le `tool_result` intermédiaire.
- Non exercé en conditions réelles (nécessiterait `ANTHROPIC_API_KEY`) : qu'un message de conversation normal (sans intention de livrable) n'entraîne jamais d'appel réel à l'outil par le modèle. Le chemin de code garantit ce comportement (l'outil n'est qu'*offert* -- `tools:[tool]` -- jamais forcé ; seule sa `description` guide le modèle, et un modèle qui ne l'utilise pas retombe sur `extractText(response)`, chemin identique à avant cette story), mais l'absence de clé API réelle empêche une vérification de bout en bout du comportement du modèle lui-même. Risque résiduel à vérifier dès qu'une clé réelle sera disponible.

**Correctif de revue (finding #1) :** `parseProposeLivrableContentInput` rejette désormais un `blockIndex` dupliqué entre suggestions (`Set` de suivi, message d'erreur dédié), avant toute tentative de transaction. Revérifié par l'orchestrateur : `tsc --noEmit` et `next build --turbopack` repassés propres ; reproduction indépendante de la fonction (script jetable, supprimé après usage) confirmant les trois cas -- `blockIndex` dupliqué rejeté avec le message attendu, cas valide toujours accepté, cas hors-bornes toujours rejeté. `git status` confirmé sans trace résiduelle du script de vérification.
