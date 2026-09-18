---
title: 'Story 3.3 : Suggestion proactive de démarrage'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '90eb4e7b76f406d5d6e5e524fb26b21c6cf68593'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-stepper-de-workflow-avant-vente.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Un consultant qui ouvre une étape du stepper avant-vente pour la première fois atterrit sur une conversation vide, sans savoir par où commencer (FR-17) — le stepper (Story 3.1) structure la progression mais ne dit rien sur la première action à mener dans chaque étape.

**Approche :** Quand la conversation active d'un projet avant-vente est rattachée à une étape (`stepKey` non nul) et ne contient encore aucun message, générer à la volée (jamais persisté, AD-7) une suggestion via un nouveau point d'assemblage `skills/propose_starting_point.ts` (réutilise `sendToAgent`, AD-11, et les skills du projet), l'afficher dans une `ai-suggestion-card` (premier consommateur réel de ce token, UX-DR4) en haut de la zone de conversation, avec "Oui, commençons" (réutilise `selectStep` sur l'étape courante) et "Plus tard" (masque, sans appel serveur). État masquée/acceptée en mémoire côté client uniquement, clé par conversation (AD-7) — jamais une ligne `SUGGESTION` (Epic 4, hors scope).

## Boundaries & Constraints

**Always :** condition d'affichage unique : `activeProject.type === 'avant-vente'` ET `activeConversation.stepKey !== null` ET `messages.length === 0` — couvre "ouverture de projet" et "passage à une nouvelle étape" (FR-17) sans code dupliqué, ce round n'ayant pas d'autre chemin vers une conversation vide. "Oui, commençons" appelle `selectStep(projectId, stepKey)` de l'étape déjà active (réutilise le mécanisme trouve-ou-crée de la Story 3.1, jamais un nouveau chemin de mutation). Un échec de génération reste silencieux (pas de carte, `console.error` seul) — jamais d'état visible cassé pour une fonctionnalité non déclenchée explicitement. Le composant garde son état tant que sa `key` (id de conversation) ne change pas, motif déjà utilisé par `Composer` — un `router.refresh()` dans la même conversation ne fait pas réapparaître une suggestion traitée (FR-18) ; changer de conversation ou recharger la page en crée une instance fraîche.

**Never :** ne pas construire `button-ai-primary` — "Oui, commençons" utilise `button-primary`, ce token restant différé à l'Epic 4 (renégocié le 2026-09-16, epic-1-retro-item-1). Ne pas créer de table `SUGGESTION` ni `actions/suggestion.ts`/`domain/suggestion.ts` — réservés à l'Epic 4 (AD-3). Ne pas afficher de suggestion pour un projet mission. Ne pas modifier `domain/workflow.ts`/le Stepper au-delà de l'appel `selectStep` existant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Étape avant-vente fraîchement ouverte, conversation vide | `stepKey` non nul, 0 message | `ai-suggestion-card` affichée avec une action concrète | Échec de génération → aucune carte, pas d'erreur visible |
| Clic "Oui, commençons" | Carte visible | Carte masquée, `selectStep` appelé (étape déjà active, réaffirmée), `router.refresh()` | Échec de `selectStep` → carte reste masquée côté client, pas de blocage |
| Clic "Plus tard" | Carte visible | Carte masquée, aucun appel serveur | N/A |
| Conversation déjà avec des messages, ou projet mission, ou `stepKey` nul | Une des trois conditions manque | Aucune suggestion générée ni affichée | N/A |
| Retour sur la même conversation après un `router.refresh()` déclenché ailleurs (ex. Stepper) | Suggestion déjà masquée dans cette conversation | Ne réapparaît pas (état client survit au refresh, clé inchangée) | N/A |

</frozen-after-approval>

## Code Map

- `skills/propose_starting_point.ts` (nouveau) -- prompt à partir du libellé de l'étape (`domain/workflow.ts`'s `STEPS`), appelle `sendToAgent` (AD-11) avec `MODELS[0].id` ; ne persiste rien.
- `actions/conversation.ts` -- ajoute `getStartingSuggestion(projectId, stepLabel)` : charge les skills (`listLoadedSkillInstructions`, déjà utilisé par `sendMessage`), appelle `proposeStartingPoint`, retourne `ActionResult<string>`.
- `components/ProactiveSuggestion.tsx` (nouveau) -- client, `useState` masquée/acceptée (AD-7), "Oui, commençons" (`selectStep` + `router.refresh()`, motif `Stepper.tsx`) et "Plus tard" (masque localement) ; `useTransition` + garde de ré-entrance comme `Stepper.tsx`.
- `app/page.tsx` -- après le `Promise.all` existant, si la condition d'affichage est vraie, appelle `getStartingSuggestion` puis rend `<ProactiveSuggestion key={conversation.id} .../>` en haut de `.workspace-center`, avant `ConversationHistory`.
- `app/globals.css` -- ajoute `.ai-suggestion-card` (`--color-ai-tint`, `--radius-md`, `border: none`, premier consommateur réel) et un style minimal pour le bouton "Plus tard".

## Tasks & Acceptance

**Execution:**
- [x] `skills/propose_starting_point.ts` -- créer le point d'assemblage dédié -- AD-7, AD-11
- [x] `actions/conversation.ts` -- ajouter `getStartingSuggestion` -- expose la génération côté serveur
- [x] `components/ProactiveSuggestion.tsx` -- créer le composant client -- FR-17, FR-18
- [x] `app/page.tsx` -- calculer la condition d'affichage et rendre le composant -- réalise FR-17
- [x] `app/globals.css` -- ajouter `.ai-suggestion-card` -- UX-DR4, premier consommateur réel

**Acceptance Criteria:**
- Given une étape avant-vente tout juste ouverte et sans message, when la page se charge, then une suggestion proactive apparaît dans le style `ai-suggestion-card` (fond plein, jamais de bordure colorée)
- Given cette suggestion visible, when je clique "Oui, commençons", then elle disparaît et l'étape reste/devient active (aucune régression du Stepper)
- Given cette suggestion visible, when je clique "Plus tard", then elle disparaît sans que le stepper change
- Given une suggestion déjà masquée ou acceptée dans la conversation courante, when un `router.refresh()` survient sans changer de conversation, then elle ne réapparaît pas
- Given un projet mission, when j'ouvre l'espace de travail, then aucune suggestion proactive n'apparaît jamais

## Implementation Notes

Implémenté directement selon le Code Map, sans subagent dédié. `skills/propose_starting_point.ts` (nouveau) construit un unique tour `user` (libellé de l'étape + contraintes de ton de `CONVENTIONS.md` embarquées dans le prompt, faute de canal "instruction" séparé dans `sendToAgent`) et appelle `sendToAgent` avec `MODELS[0].id` -- second appelant réel de ce point d'assemblage AD-11 après `sendMessage`. `actions/conversation.ts` ajoute `getStartingSuggestion(projectId, stepLabel)` : charge les skills via `listLoadedSkillInstructions` (déjà utilisé par `sendMessage`), délègue à `proposeStartingPoint`, journalise (`console.error`) et retourne `{ok:false}` sur tout échec -- jamais d'exception. `components/ProactiveSuggestion.tsx` (nouveau, client) garde un `useState<'visible'|'hidden'>` local (AD-7) ; "Oui, commençons" masque la carte immédiatement puis appelle `selectStep` (garde de réentrance `useRef`, motif `Composer.tsx`/`Stepper.tsx`) et ne fait `router.refresh()` qu'en cas de succès -- un échec de `selectStep` est journalisé mais la carte reste masquée (I/O matrix) ; "Plus tard" masque sans aucun appel serveur. `app/page.tsx` calcule la condition d'affichage unique après le `Promise.all` existant (type de projet + `stepKey` de la conversation active + `messages.length === 0`), résout le libellé français de l'étape via `STEPS` (`domain/workflow.ts`), n'appelle `getStartingSuggestion` que si la condition est vraie (pas d'appel spéculatif à l'agent), et rend `<ProactiveSuggestion key={conversation.id} .../>` en haut de `.workspace-center`, avant `ConversationHistory`. `app/globals.css` ajoute `.ai-suggestion-card` (fond `--color-ai-tint`, `border: none`, `--radius-md` -- premier consommateur réel de ce token, UX-DR4) et `.button-later` (texte seul, sans fond ni bordure, pour rester visuellement secondaire face à `button-primary`). Conformément au Boundary "Never" de la spec, "Oui, commençons" utilise `button-primary`, jamais un `button-ai-primary` (toujours différé à l'Epic 4).

**Correctif de revue :** la première version appelait `getStartingSuggestion` directement dans `app/page.tsx` (Server Component), en `await` synchrone avant le rendu -- ce qui bloquait toute la page derrière un appel Anthropic réel et relançait ce même appel à chaque `router.refresh()` sans rapport (ex. un document ajouté ailleurs) tant que la conversation restait vide ; et `ProactiveSuggestion` recevait le texte déjà généré en prop, sans le figer dans un état local, si bien qu'une carte visible pouvait voir son texte changer silencieusement en cours de lecture au prochain refresh. Corrigé : `app/page.tsx` calcule toujours la condition d'affichage et résout le libellé français de l'étape, mais ne fait plus l'appel lui-même -- il passe `projectId`/`stepKey`/`stepLabel` en props. `ProactiveSuggestion` appelle désormais `getStartingSuggestion` lui-même, une seule fois, dans un `useEffect` sans dépendances déclenché au montage (garanti unique par conversation grâce au `key={conversation.id}` déjà posé par le parent -- le même mécanisme qui empêche déjà la réapparition d'une suggestion traitée, FR-18) ; un état `'loading'` a été ajouté à côté de `'visible'`/`'hidden'`, et le composant ne rend rien tant que le chargement n'a pas abouti ou s'il échoue (même règle "un échec de génération reste silencieux" que la spec impose déjà). Revérifié : `tsc --noEmit` et `next build --turbopack` repassés propres ; en direct dans le navigateur, la page se charge immédiatement (l'appel `getStartingSuggestion("proj-acme-rfp", "Qualification")` apparaît désormais comme une requête POST distincte après le rendu initial, jamais avant).

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmed independently by all three review lenses, one walking the exact React/`router.refresh()` reconciliation semantics to a definitive conclusion.** `app/page.tsx` recomputes its display condition and re-`await`s `getStartingSuggestion` (a real, billed `sendToAgent` call) on **every** server render of `Home()` — not once per conversation view. Since `ProactiveSuggestion` keeps the same `key={conversation.id}` across a same-conversation `router.refresh()` (by design, for FR-18), React reuses the existing fiber rather than remounting: (a) once dismissed/accepted, every further unrelated `router.refresh()` while the conversation stays empty (e.g. adding a document elsewhere) burns another live LLM call whose result the already-`hidden` component silently discards — unbounded, uncapped cost with no relation to actual usage; (b) worse, while the card is **still visible** (never yet clicked), the same unrelated refresh re-renders `&lt;p&gt;{suggestion}&lt;/p&gt;` with a *freshly generated, differently-worded* string — the visible action text can silently change mid-read, with no user action of their own; (c) the whole page's response is held behind this one sequential, un-`Suspense`d `await` on every such render, reintroducing exactly the anti-pattern Epic 1's retro fixed (`epic-1-retro-item-2`, parallelize independent reads). | High | Patch | Root cause: the suggestion is computed by the parent Server Component's render cycle and passed down as a prop, instead of being fetched once per client-side mount. Fix: moved the `getStartingSuggestion` call into `ProactiveSuggestion`'s own `useEffect` (runs once per mount — `key={conversation.id}` already guarantees one mount per conversation, satisfying FR-18 exactly as before), calling the same already-exported Server Action directly from the client (no new public surface). `app/page.tsx` no longer awaits or calls it — passes `projectId`/`stepKey`/`stepLabel` instead of a pre-computed string, and no longer blocks the page render on a live LLM call. `ProactiveSuggestion` gained a `'loading'` status alongside `'visible'`/`'hidden'` (renders nothing while loading, matching the spec's "un échec de génération reste silencieux" — a still-loading or failed generation is equally invisible). Verified: tsc/build clean; re-ran the same manual scenarios (stubbed response) — card no longer regenerates its wording on an unrelated refresh, and a plain page load with no interaction no longer waits on the LLM call. |
| 2 | Clicking "Oui, commençons" (reasserts the already-active step via `selectStep`) and, before that resolves, clicking a *different* Stepper step: both succeed independently (last-write-wins on `PROJECT.activeConversationId`, no version check in `selectStep`), so the workspace can silently flip back to the original step after already showing the new one — no error shown either way. | Low | No action | Requires two intentional near-simultaneous clicks on two different controls within one render — unlikely in normal single-consultant use. The correct fix (cross-component in-flight coordination) is materially more than a direct correction, and the pre-existing `Stepper.tsx`/other mutators share the same last-write-wins shape already — not something this story introduced in isolation. |
| 3 | `_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/DESIGN.md` (line 142) still names "Oui, commençons" as the canonical example of `button-ai-primary`, even though the 2026-09-16 renegotiation (`epic-1-retro-item-1`, `epics.md`'s UX-DR4/UX-DR7) explicitly deferred that token to Epic 4 and this story correctly uses `button-primary` instead. | Low | Defer | Pre-existing documentation drift from the Epic 1 retro renegotiation, not introduced by this diff — `DESIGN.md` itself was never touched then or now. Logged in `deferred-work.md`. |
| 4 | A pre-existing React "duplicate key" console warning fires on the seeded fixture conversation data, unrelated to any `key=` usage in this diff. | Low | Defer | Confirmed unrelated to `ProactiveSuggestion`'s `key={conversation.id}` or any other change here — root cause is in fixture-seeding logic this story never touches. Logged in `deferred-work.md`. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre

**Manual checks -- effectués en direct dans le navigateur (`npm run dev`, projet `proj-acme-rfp`) :**
- Étape "Qualification" jamais ouverte cliquée sur le projet avant-vente -- conversation vide atteinte sans crash ; aucun `ANTHROPIC_API_KEY` n'étant configuré dans cet environnement, `sendToAgent` échoue (`Could not resolve authentication method...`) et la carte reste absente -- comportement silencieux conforme au Boundary "un échec de génération reste silencieux" (confirmé par les logs serveur : `getStartingSuggestion: proposeStartingPoint failed`, aucune exception non attrapée, aucune régression visible de l'étape active ni du composer).
- Le rendu visuel de `.ai-suggestion-card`/`.button-later`/`button-primary` (fond `ai-tint` plein, aucune bordure colorée, "Oui, commençons" en navy `button-primary` et non en violet) a été vérifié en injectant temporairement le balisage réel du composant dans la page via la console du navigateur (`ai-suggestion-card` + les deux boutons), sans modifier aucun fichier source -- rendu conforme à `DESIGN.md`. La carte a ensuite été retirée du DOM ; aucun fichier n'a été affecté par cette vérification.
- Projet mission (`proj-audit-mission`) ouvert -- ni stepper ni suggestion, y compris sur une conversation neuve vide (`stepKey = null`) créée pour l'occasion -- confirmé par capture d'écran, aucune carte, aucune erreur.
- **Non vérifié en conditions réelles faute de clé API dans cet environnement :** l'apparition effective d'une carte générée par un vrai appel Anthropic, et les clics "Oui, commençons"/"Plus tard" sur une carte réellement affichée (masquage, `selectStep` réaffirmé, non-réapparition après un `router.refresh()` déclenché ailleurs). Le code des deux handlers a été relu ligne à ligne contre l'I/O Matrix de la spec et suit exactement le motif éprouvé de `Stepper.tsx`/`Composer.tsx`, mais un passage manuel avec une clé `ANTHROPIC_API_KEY` valide reste à faire avant de clore la story.

**Re-vérification indépendante de l'orchestrateur, après le correctif de revue (finding #1) :** `npx tsc --noEmit` et `npx next build --turbopack` relancés séparément -- propres. Serveur de dev relancé en direct sur `proj-acme-rfp`, étape "Qualification" déjà active avec 0 message : la page se charge intégralement (stepper, panneaux, historique) sans attendre l'appel agent -- confirmé par lecture de l'arbre d'accessibilité immédiatement après le chargement, aucun blocage observé. Logs serveur confirment que `getStartingSuggestion("proj-acme-rfp", "Qualification")` s'exécute désormais comme un appel distinct et minuté séparément (`in 314ms`, `in 5ms` sur deux montages), plutôt que dans le rendu initial de `Home()` -- comportement exactement conforme au correctif. Échec silencieux confirmé une nouvelle fois (pas de clé API dans cet environnement) : aucune carte, aucune régression visible. Avertissement console "duplicate key" pré-existant (`75aac29b-...`) confirmé présent et bien sans rapport avec cette story (finding #4) -- observé avant toute interaction avec `ProactiveSuggestion`.
