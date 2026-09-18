---
title: "Story 4.3 : Traitement d'une suggestion ancrée"
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2af3da4c9e1f65322092a45c5432a7f0b2a6753d'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-generation-des-suggestions-ancrees-a-l-ecriture.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Les suggestions ancrées (Story 4.2) s'affichent mais restent inertes -- rien ne permet au consultant de les traiter, alors que FR-21 exige qu'il garde la main (Accepter/Rejeter/Retravailler).

**Approche :** `components/SuggestionCard.tsx` (nouveau, client) rend chaque suggestion `pending` avec trois actions : Accepter (`actions/suggestion.ts` remplace le texte du bloc ciblé via une fonction pure de `domain/suggestion.ts` et passe la suggestion à `accepted`, en une transaction), Rejeter (passe à `rejected`, document inchangé), Retravailler (ouvre un champ flottant via l'`OverlayProvider` partagé, envoie les précisions à l'agent via `sendToAgent` -- AD-11, sans outil, juste une reformulation -- et revient à `pending` avec le nouveau texte). Une suggestion traitée reste visible, atténuée. `button-ai-primary` (Accepter, Envoyer la demande de retravail) trouve enfin son premier vrai consommateur.

## Boundaries & Constraints

**Always :** Accepter écrit `LIVRABLE.content`+`SUGGESTION.status='accepted'` dans une seule transaction (motif `createLivrableWithSuggestions`) -- seul le `text` du bloc change, jamais son `id` (AD-9). `acceptSuggestion`/`rejectSuggestion` vérifient d'abord que la suggestion est encore `pending` -- pas de double traitement sur double clic. Retravailler passe par `sendToAgent` (AD-11) sans outil (une reformulation, pas une création) : statut `revising` avant l'appel, `pending`+nouveau texte au succès, `pending`+**ancien** texte à l'échec -- jamais bloqué sur `revising`. Champ de retravail = vraie surface flottante `OverlayProvider` (AD-8), un id par suggestion (`rework-${id}`), jamais un `isOpen` local. `button-ai-primary` sur Accepter et Envoyer la demande de retravail seulement. Accepté = icône + "Acceptée" ; rejeté = "Rejetée" sans icône (EXPERIENCE.md) ; les deux `text-muted`, jamais retirés.

**Never :** pas de révision globale ni son champ (Story 4.4). Aucune confirmation sur Rejeter. Jamais de régénération d'id de bloc à l'acceptation. Deux champs de retravail ouverts à la fois (déjà exclu par l'`OverlayProvider`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clic "Accepter" sur suggestion `pending` | Bloc ciblé existe | Texte du bloc remplacé, statut `accepted`, carte atténuée avec icône | Échec DB -> aucun changement, erreur affichée |
| Clic "Rejeter" sur suggestion `pending` | -- | Document inchangé, statut `rejected`, carte atténuée avec libellé | Échec DB -> aucun changement |
| Clic "Retravailler", champ soumis | Instructions non vides | Statut `revising` puis `pending` avec nouveau texte | Échec de l'appel agent -> retour à `pending`, ancien texte conservé, erreur affichée |
| Clic sur une suggestion déjà `accepted`/`rejected` | -- | Aucune action possible (boutons absents) | N/A |

</frozen-after-approval>

## Code Map

- `domain/suggestion.ts` -- ajoute `applyAcceptedSuggestion(blocks, anchorRef, newText): Block[]` (pure, remplace le `text` du bloc dont l'`id === anchorRef`, conserve son `id`).
- `skills/rework_suggestion.ts` (nouveau) -- prompt à partir du texte actuel du bloc, du texte actuel de la suggestion et des instructions du consultant ; appelle `sendToAgent` (AD-11, sans `tool`) ; retourne le texte reformulé.
- `actions/suggestion.ts` -- ajoute `acceptSuggestion(suggestionId)` (lit la suggestion + son livrable, `applyAcceptedSuggestion`, écrit `LIVRABLE.content` + `SUGGESTION.status='accepted'` en une transaction -- même exception documentée qu'`actions/livrable.ts`, en sens inverse), `rejectSuggestion(suggestionId)` (statut `rejected` seul), `reworkSuggestion(suggestionId, instructions)` (statut `revising`, charge les skills du projet propriétaire, appelle `rework_suggestion.ts`, statut `pending`+nouveau texte au succès ou `pending`+ancien texte à l'échec).
- `components/SuggestionCard.tsx` (nouveau, client) -- une carte par suggestion : boutons Accepter/Rejeter/Retravailler si `pending` (garde de réentrance `useRef`, motif `Composer.tsx`/`Stepper.tsx`) ; champ de retravail flottant via `useOverlay()` (id `rework-${id}`) ; rendu atténué + icône/libellé si `accepted`/`rejected` ; désactivé si `revising`. `router.refresh()` après chaque mutation réussie.
- `components/SuggestionsPanel.tsx` -- devient un simple wrapper serveur qui rend un `SuggestionCard` par suggestion (perd sa logique de rendu propre).
- `app/globals.css` -- ajoute `.button-ai-primary` (fond `--color-ai-accent`, premier vrai consommateur, UX-DR4), `.rework-field` (motif `.model-selector-dropdown`/`.skill-add-overlay` : `position:absolute`, `box-shadow: var(--elevation-dropdown)`), et le style muted+icône/libellé pour `accepted`/`rejected`.

## Tasks & Acceptance

**Execution:**
- [x] `domain/suggestion.ts` -- `applyAcceptedSuggestion` -- AD-5, AD-9
- [x] `skills/rework_suggestion.ts` -- reformulation via `sendToAgent` -- AD-11
- [x] `actions/suggestion.ts` -- `acceptSuggestion`/`rejectSuggestion`/`reworkSuggestion` -- FR-21
- [x] `components/SuggestionCard.tsx` -- les trois actions + champ flottant -- FR-21
- [x] `components/SuggestionsPanel.tsx` -- délègue à `SuggestionCard`
- [x] `app/globals.css` -- `.button-ai-primary`, `.rework-field`, styles atténués -- UX-DR4

**Acceptance Criteria:**
- Given une suggestion ancrée en attente, when je clique "Accepter", then la modification s'applique au bloc ciblé et la suggestion passe à "acceptée"
- Given cette même suggestion, when je clique "Rejeter" au lieu, then le document n'est pas modifié et elle passe à "rejetée"
- Given une suggestion en attente, when je clique "Retravailler" puis j'envoie des précisions, then un champ s'ouvre sans s'empiler sur une autre surface, et l'envoi renvoie une nouvelle proposition en attente
- Given une suggestion déjà traitée, when j'ouvre l'Éditeur assisté, then elle reste visible, visuellement atténuée, distincte des autres états par autre chose que la couleur

## Implementation Notes

Implémenté selon le Code Map, via un subagent d'implémentation dédié, sans écart notable.

`domain/suggestion.ts` ajoute `applyAcceptedSuggestion(blocks, anchorRef, newText)` -- fonction pure, remplace le `text` du bloc dont l'`id === anchorRef`, conserve son `id` et tous les autres blocs inchangés (AD-9) ; retourne `blocks` inchangé si aucun bloc ne correspond, plutôt que de lever une exception.

`skills/rework_suggestion.ts` (nouveau) expose `reworkSuggestionContent(...)`, troisième appelant réel de `sendToAgent` (`skills/buildRequest.ts`, AD-11) aux côtés de `sendMessage` et `proposeStartingPoint` -- sans `tool`/`executeTool` (une reformulation texte-à-texte, jamais un second cycle `propose_livrable_content`). Utilise toujours `MODELS[0].id` : le champ de retravail flottant n'a pas de sélecteur de modèle propre.

`actions/suggestion.ts` ajoute `acceptSuggestion`, `rejectSuggestion`, `reworkSuggestion`. `acceptSuggestion`/`rejectSuggestion` vérifient d'abord `status === 'pending'` à l'intérieur d'un même `db.transaction` synchrone (sans `await` dans le callback -- motif établi `createLivrableWithSuggestions`/`selectStep`), garantissant qu'un double clic (même depuis deux onglets/sessions différents, grâce à la connexion `node:sqlite` unique et synchrone) ne peut jamais appliquer la mutation deux fois. `acceptSuggestion` écrit `LIVRABLE.content` et `SUGGESTION.status='accepted'` dans cette même transaction -- exception documentée en sens inverse de celle d'`actions/livrable.ts`. `reworkSuggestion` procède en deux temps : une première transaction courte passe `pending` à `revising` (même garde de réentrance) et capture le texte/l'ancre d'origine ; la suite (hors transaction : lecture du livrable, chargement des skills du projet, appel agent) restaure `pending`+texte d'origine sur tout échec, plutôt que de rester bloquée sur `revising`.

`components/SuggestionCard.tsx` (nouveau, client) rend une carte par suggestion : les trois actions si `pending` (garde de réentrance `busyRef`, motif `Composer.tsx`/`Stepper.tsx`), un message d'attente si `revising` (aucun bouton), un rendu atténué avec icône (acceptée)/libellé seul (rejetée) sinon. Le champ de retravail est une vraie surface `OverlayProvider` (`rework-${id}`), jamais un `isOpen` local -- `contentRef` couvre toute la ligne d'actions (bouton déclencheur inclus), pas seulement le champ, pour éviter qu'un clic sur "Retravailler" pendant que son propre champ est ouvert ne soit classé "à l'extérieur" et ne se referme juste avant que le gestionnaire du bouton ne le rouvre. `button-ai-primary` n'est utilisé que sur Accepter et "Envoyer la demande de retravail" ; Rejeter et le déclencheur Retravailler restent `.button-later`.

`components/SuggestionsPanel.tsx` devient un simple wrapper serveur qui rend un `SuggestionCard` par suggestion, perdant toute logique de rendu propre (déplacée dans le composant client).

`app/globals.css` ajoute `.button-ai-primary` (premier vrai consommateur), `.rework-field`/`.suggestion-rework-wrap` (même forme que `.model-selector-dropdown`/`.skill-add-overlay`), et les styles `text-muted`+icône/libellé pour les états traités.

**Correctif de revue (finding #1, voir Review Triage Log) :** les deux écritures de récupération `db.update(...set pending...)` dans `reworkSuggestion` sont désormais chacune protégées par leur propre try/catch (log seul, jamais de relance), et `handleAccept`/`handleReject`/`handleSubmitRework` dans `SuggestionCard.tsx` ont chacun gagné un bloc `catch` en défense en profondeur, aux côtés du `finally` existant. Revérifié par l'orchestrateur : `tsc --noEmit` et `next build --turbopack` repassés propres après le correctif, code des deux fichiers relu intégralement pour confirmer que le correctif correspond exactement à la demande.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmed by the orchestrator against the code, independently flagged by the adversarial lens.** In `reworkSuggestion`'s (`actions/suggestion.ts`) failure-recovery paths — the `!reworkResult.ok` branch and the outer `catch` — the `db.update(suggestion).set({status:'pending'})...run()` call that is supposed to un-stick the row is itself unprotected. If that specific write throws (e.g. a transient SQLite error right after an already-failed agent call), the exception propagates uncaught out of `reworkSuggestion`, rejecting its promise. `components/SuggestionCard.tsx`'s `handleSubmitRework` (and, less consequentially, `handleAccept`/`handleReject`) awaits the action inside a `try { ... } finally { busyRef.current = false; }` with no `catch`, so the rejection becomes a silent unhandled promise rejection: no `setError`, no `router.refresh()`, and the suggestion is left permanently on `status='revising'` in the DB with no buttons rendered for that state — directly contradicting the spec's Always ("jamais bloqué sur revising"). Requires a real double-failure (the agent call *and* the recovery write both failing) to trigger, so narrow, but the fix is cheap and directly defends the one invariant this story's Boundaries call out by name. | Medium | Patch | **Applied and re-verified by the orchestrator.** Both recovery `db.update(...set pending...)` calls in `reworkSuggestion` are now each wrapped in their own try/catch (log-only, never rethrows), so `reworkSuggestion` always resolves to an `ActionResult`. `handleAccept`, `handleReject`, and `handleSubmitRework` in `SuggestionCard.tsx` each gained a `catch` block (alongside the existing `finally`) that logs and surfaces a generic error via `setError`. `npx tsc --noEmit` and `npx next build --turbopack` both re-run clean after the patch; the two changed files were read in full to confirm the fix matches the request exactly. |
| 2 | **Confirmed by the orchestrator, flagged by the edge-case lens.** `acceptSuggestion` (`actions/suggestion.ts`) never checks whether `applyAcceptedSuggestion` (`domain/suggestion.ts`) actually matched a block before marking the suggestion `accepted` and writing the (possibly unchanged) blocks back to `LIVRABLE.content`. If `anchorRef` doesn't resolve to any current block, Accepter would silently "succeed" — status flips, no error — while the document stays completely unmodified. | Low (currently unreachable) | Defer | Not reachable via this story's own write path: every suggestion `createLivrableWithSuggestions` (Story 4.2) creates anchors to a block from the same transaction, so no `acceptSuggestion` call today can ever see a non-matching `anchorRef`. Becomes reachable once Story 4.4 (révision globale) can regenerate a livrable's blocks. Logged in `deferred-work.md`, to be addressed as part of that story's design. |
| 3 | tsc/build clean (independently re-run by two lenses); `acceptSuggestion`/`rejectSuggestion` atomicity genuinely holds even across two concurrent sessions/tabs (verified against `node:sqlite`'s synchronous single-connection transaction model, not just JS single-threadedness); the rework failure path preserves the original suggestion text (confirmed via a real DB round-trip with no `ANTHROPIC_API_KEY` configured); `OverlayProvider` usage (`rework-${id}`, `contentRef` on the whole actions row) matches the established `Composer.tsx`/`SkillsPanel.tsx` pattern with no self-closing bug; whitespace-only rework instructions are rejected both client- and server-side; tab order and the three-state accessibility floor (text/icon, never color alone) both hold; no prompt-injection/XSS issue in `skills/rework_suggestion.ts`. | — | No action | Independently confirmed by all three review lenses; nothing to patch. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre

**Manual checks (if no CLI):**
- Sans `ANTHROPIC_API_KEY` réelle (comme pour les Stories 3.3/4.1/4.2), le retravail ne peut pas être exercé en conditions réelles bout-en-bout pour le chemin de succès -- risque résiduel disclosé, non bloquant.
- Accepter/Rejeter une suggestion de test (insérée temporairement sur le livrable seed, supprimée après) -- vérifié en direct dans le navigateur par l'implémenteur, puis rejoué indépendamment contre la vraie base SQLite (`db/local.db`, sauvegardée puis restaurée) par le lens de vérification : Accepter remplace le texte du bloc ciblé en conservant son `id`, laisse les autres blocs intacts, passe la suggestion à `accepted`, et un second appel sur la même suggestion renvoie bien "Cette suggestion a déjà été traitée." (garde anti double-traitement confirmée). Rejeter laisse le document strictement inchangé et passe la suggestion à `rejected`.
- Retravailler : soumission testée en conditions réelles (pas de clé API), confirmée par lecture SQLite directe -- l'appel agent échoue, la suggestion revient à `status='pending'` avec son texte d'origine intact (jamais bloquée sur `revising`), le champ reste ouvert avec les instructions tapées et une erreur affichée.
- Ouvrir un champ de retravail puis un autre -- vérifié par lecture de code (`OverlayProvider`, `rework-${id}`) : un seul id peut être ouvert à la fois, ouvrir B ferme A sans perte du texte tapé dans A (son état React survit au démontage du seul `<form>`).
- Index unique partiel `(livrable_id, anchor_ref) WHERE status='pending' AND type='anchored'` -- confirmé toujours présent (`sqlite3 .schema suggestion`).

**Revue indépendante (3 lenses parallèles -- adversarial, edge-case, verification-gap) :** voir Review Triage Log ci-dessus. Un correctif appliqué (finding #1, robustesse de la reprise sur échec de `reworkSuggestion`), un report en `deferred-work.md` (finding #2, cas non atteignable avant la Story 4.4). `tsc --noEmit` et `next build --turbopack` re-vérifiés propres par l'orchestrateur après le correctif. Toute base de données et tout fichier temporaire de test ont été restaurés/supprimés après usage (confirmé par `git status` et comparaison de la base avant/après).
