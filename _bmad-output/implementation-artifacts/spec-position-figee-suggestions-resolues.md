---
title: "Position figée pour les suggestions déjà résolues"
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'b07a5d89a49296ba47cc7a253f975a6750a0e6a4'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-09-21.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** `updateLivrableWithSuggestions` mint un `crypto.randomUUID()` neuf pour chaque bloc à chaque révision globale, même quand son texte ne change pas. Toute suggestion déjà `accepted`/`rejected` (dont l'`anchorRef` pointait vers un ancien id) devient donc irrésolvable après la première révision globale -- son `¶N` dégrade en `¶` nu, même pour un paragraphe jamais concerné par la révision. Finding #3 de la rétrospective Epic 4 (`epic-4-retro-2026-09-21.md`).

**Approche :** Plutôt que de tenter de préserver les ids de blocs entre deux révisions (heuristique de diff texte, ambiguë si deux paragraphes se ressemblent), figer la position au moment même où une suggestion devient `accepted`/`rejected` : nouvelle colonne `SUGGESTION.resolvedPosition` (entier, nullable), calculée une fois via `resolveAnchorPosition` (déjà existant, `domain/suggestion.ts`) au moment de la transition, jamais recalculée ensuite. L'affichage préfère cette valeur figée dès qu'une suggestion est résolue ; la résolution live (`resolveAnchorPosition` contre les blocs courants) reste utilisée uniquement tant qu'elle est `pending`/`revising`.

## Boundaries & Constraints

**Always :** `resolvedPosition` est calculé et persisté dans la même transaction que le passage à `accepted`/`rejected` (`actions/suggestion.ts`), jamais recalculé après coup. Une fois posé, il ne change plus jamais, même si le bloc qu'il décrivait disparaît ou que d'autres blocs sont insérés/supprimés autour de lui. Les suggestions déjà `accepted`/`rejected` en base avant cette migration ont `resolvedPosition: null` -- pas de backfill, elles continuent d'utiliser la résolution live (comportement actuel, non aggravé, non corrigé rétroactivement).

**Never :** Ne modifie jamais `applyAcceptedSuggestion`, ni le mécanisme de régénération des ids de blocs lui-même (Never d'epic-4-context.md : "l'ordre des autres blocs n'affecte jamais la résolution de l'ancre" reste vrai, cette story n'y touche pas). Ne change jamais l'affichage d'une suggestion `pending`/`revising` (reste la résolution live existante). Pas de nouvelle migration destructive -- colonne nullable ajoutée à une table existante, aucun défaut requis (table déjà non vide gérée comme telle).

**Révision après revue (`review_loop_iteration: 1`) :** `updateLivrableWithSuggestions` (`actions/livrable.ts`) transitionne aussi des suggestions `pending`/`revising` vers `rejected` en masse (auto-rejet lors d'une révision globale, Story 4.4) -- un deuxième chemin d'écriture vers `status: 'rejected'`, distinct du clic manuel `rejectSuggestion`, oublié dans le "Never" initial qui excluait cette fonction en bloc. L'Acceptance Criteria de ce spec ("toute suggestion... acceptée ou rejetée") ne distingue pas comment une suggestion devient `rejected` -- ce chemin doit donc, lui aussi, figer `resolvedPosition`, calculé contre les **blocs tels qu'ils étaient avant** que cette même fonction ne les régénère (jamais après, sans quoi la position figée serait déjà fausse). Seul ce point précis de `updateLivrableWithSuggestions` peut être touché ; son mécanisme de régénération des ids et le reste de sa logique restent inchangés (Never ci-dessus toujours en vigueur pour tout le reste de cette fonction).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Acceptation d'une suggestion ancrée | Position résolvable au moment du clic | `resolvedPosition` posé, affiché ensuite quel que soit ce qui arrive au bloc | N/A |
| Rejet d'une suggestion ancrée | Idem | `resolvedPosition` posé au rejet | N/A |
| Révision globale après acceptation/rejet | Blocs régénérés avec de nouveaux ids | Le `¶N` de la suggestion déjà résolue reste affiché tel qu'au moment de la décision, jamais dégradé en `¶` nu | N/A |
| Suggestion déjà `accepted`/`rejected` avant cette migration | `resolvedPosition` NULL (pas de backfill) | Comportement actuel inchangé (résolution live, dégrade en `¶` nu après une révision) | N/A |
| Position non résolvable au moment même de l'acceptation/rejet (cas déjà défensif, non atteignable via le chemin d'écriture actuel) | `anchorRef` déjà invalide | `resolvedPosition` reste `null`, comportement de repli identique à aujourd'hui | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- `suggestion` : ajoute `resolvedPosition: integer('resolved_position')` (nullable, pas de `.notNull()`). `npm run db:generate` pour la migration.
- `domain/suggestion.ts` -- aucun changement à `resolveAnchorPosition` (reste la résolution live pour `pending`/`revising`) ; pas de nouvelle fonction pure nécessaire, le calcul au moment de la transition réutilise `resolveAnchorPosition` telle quelle.
- `actions/suggestion.ts` -- `acceptSuggestion`/`rejectSuggestion` : à l'intérieur de la transaction existante, avant l'`UPDATE` de statut, lit les blocs courants du livrable (déjà lus dans `acceptSuggestion` ; à ajouter dans `rejectSuggestion`, qui ne lit actuellement pas le livrable) et calcule `resolveAnchorPosition(blocks, suggestion.anchorRef)` ; pose `resolvedPosition` dans le même `UPDATE`. `SuggestionSummary` gagne `resolvedPosition: number | null` ; `listSuggestions` sélectionne la nouvelle colonne.
- `components/SuggestionCard.tsx` -- le calcul de `anchorLabel` préfère `suggestion.resolvedPosition` quand `status` est `accepted`/`rejected` et que cette valeur n'est pas `null` ; sinon comportement actuel (résolution live via `resolveAnchorPosition`).
- `actions/livrable.ts` -- `updateLivrableWithSuggestions` : avant l'`UPDATE` de `content` (donc contre les blocs encore anciens), lire les suggestions `anchored` `pending`/`revising` de ce livrable avec leur `anchorRef`, calculer `resolveAnchorPosition` de chacune contre les **anciens** blocs, puis inclure `resolvedPosition` dans le même `UPDATE` en masse qui les passe à `rejected` (une seule ligne `CASE`/`sql` ou une boucle de petits `UPDATE` individuels -- au choix de l'implémenteur, tant que ça reste dans la même transaction).

## Tasks & Acceptance

**Execution:**
- [x] `db/schema.ts` -- colonne `resolvedPosition` nullable sur SUGGESTION, migration générée
- [x] `actions/suggestion.ts` -- `acceptSuggestion`/`rejectSuggestion` posent `resolvedPosition` à la transition ; `SuggestionSummary`/`listSuggestions` l'exposent
- [x] `components/SuggestionCard.tsx` -- préfère `resolvedPosition` pour une suggestion résolue
- [x] `actions/livrable.ts` -- `updateLivrableWithSuggestions` fige aussi `resolvedPosition` pour les suggestions auto-rejetées par une révision globale

**Acceptance Criteria:**
- Given une suggestion ancrée acceptée ou rejetée, when une révision globale régénère ensuite tous les ids de blocs, then son `¶N` reste affiché tel qu'au moment de la décision, jamais un `¶` nu
- Given une suggestion `pending`/`revising`, when j'affiche sa carte, then son ancrage reste résolu en direct comme aujourd'hui (aucune régression)
- Given une suggestion déjà résolue avant cette migration (`resolvedPosition` NULL), when une révision régénère les blocs, then le comportement reste celui d'aujourd'hui (dégradation en `¶` nu) -- pas de correction rétroactive promise

## Implementation Notes

- `db/schema.ts` : `resolvedPosition: integer('resolved_position')` ajoutée à `suggestion`, sans `.notNull()` ni `.default(...)` -- colonne nullable sur une table déjà non vide, migration générée via `npm run db:generate` (`db/migrations/20260923075343_charming_orphan/migration.sql`, un unique `ALTER TABLE suggestion ADD resolved_position integer;`).
- `actions/suggestion.ts` : `acceptSuggestion` calcule `resolveAnchorPosition(blocks, suggestionRow.anchorRef)` sur les blocs lus dans la même transaction (avant application de la suggestion) et pose `resolvedPosition` dans le même `UPDATE` que `status: 'accepted'`. `rejectSuggestion` ne lisait pas le livrable auparavant -- lecture ajoutée à l'intérieur de la même transaction, uniquement quand `anchorRef !== null` (défensif : une suggestion `global`, `anchorRef` nul, n'a pas de position à figer -- non atteignable via `SuggestionCard`, seule appelante aujourd'hui). Un livrable introuvable ou un `content.blocks` malformé est loggé et laisse `resolvedPosition: null` sans bloquer le rejet (même repli que le cas "position non résolvable" de la matrice). `SuggestionSummary` gagne `resolvedPosition: number | null` ; `listSuggestions` sélectionne la colonne.
- `components/SuggestionCard.tsx` : `position` préfère `suggestion.resolvedPosition` quand `isResolved` (accepted/rejected) et que cette valeur n'est pas `null` ; sinon comportement inchangé (résolution live via `resolveAnchorPosition`/`anchorRef`), y compris pour une suggestion déjà résolue avant la migration (`resolvedPosition` NULL, pas de backfill).
- Aucun changement à `applyAcceptedSuggestion`, ni au mécanisme de régénération des ids de blocs (Never respecté).

**Tour 2 (review_loop_iteration 1, correctifs de revue) :**
- `actions/livrable.ts` -- `updateLivrableWithSuggestions` : avant l'`UPDATE` de `content`, lit désormais le `content` encore actuel du livrable (mêmes anciens blocs) et la liste des suggestions `anchored` `pending`/`revising` (`id`, `anchorRef`) qui vont être auto-rejetées. Le bulk `UPDATE ... SET status = 'rejected'` unique est remplacé par une boucle de petits `UPDATE` individuels (un par suggestion à rejeter), chacun posant `status: 'rejected'` et `resolvedPosition: resolveAnchorPosition(oldBlocks, anchorRef)` -- calculé contre les blocs **pré-régénération**, jamais contre le tableau `blocks` fraîchement miné quelques lignes plus bas. Un `content` pré-existant malformé est intercepté par son propre `try/catch` (même geste que `rejectSuggestion`) et dégrade tout le lot à `resolvedPosition: null` sans jamais bloquer la régénération. Le reste de la fonction (génération des ids, insertion des nouvelles suggestions `pending`) est inchangé caractère pour caractère.
- `actions/suggestion.ts` -- `rejectSuggestion` : le `JSON.parse(livrableRow.content)` ajouté au premier tour est maintenant protégé par son propre `try/catch` interne (et non plus seulement par le `try/catch` englobant toute la fonction) -- un contenu malformé ne fait plus échouer toute la transaction (ce qui aurait annulé le rejet lui-même), il dégrade uniquement `resolvedPosition` à `null`, exactement comme le cas déjà documenté "position non résolvable" de la matrice. Le commentaire d'en-tête du fichier (paragraphe Story 4.3) mentionne maintenant explicitement que `rejectSuggestion` lit aussi LIVRABLE (jamais n'écrit son contenu), symétrique au commentaire déjà existant pour `acceptSuggestion`.

## Spec Change Log

**2026-09-23 -- intent_gap trouvé en revue (edge-case-hunter, confiance haute) : le "Never" initial excluait `updateLivrableWithSuggestions` en bloc, oubliant que cette fonction écrit aussi `status: 'rejected'` (auto-rejet de masse lors d'une révision globale, Story 4.4) -- un deuxième chemin vers le même statut que le clic manuel `rejectSuggestion`, non couvert par le correctif initial malgré l'Acceptance Criteria ("toute suggestion... acceptée ou rejetée") qui ne distingue pas comment.** Root cause dans le bloc frozen (le "Never" trop large). **Résolution (validée par Gautier) :** étendre le correctif à ce chemin plutôt que le documenter comme limite différée -- même geste de gel, appliqué avant que cette même fonction ne régénère les blocs. Aucun code déjà écrit n'a besoin d'être annulé (le Code Map initial n'avait jamais touché `updateLivrableWithSuggestions`, donc rien à revenir en arrière) -- ce tour ajoute simplement la tâche manquante. **KEEP :** tout le reste de l'implémentation du premier tour (colonne, `acceptSuggestion`/`rejectSuggestion`, `SuggestionCard.tsx`) reste valable tel quel, confirmé par la revue et par vérification indépendante de l'orchestrateur en base réelle.

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmé par l'orchestrateur, trouvé par la lentille edge-case-hunter (confiance haute).** `updateLivrableWithSuggestions` transitionne aussi des suggestions vers `rejected` (auto-rejet en masse) sans jamais figer `resolvedPosition` -- deuxième chemin vers le même statut que `rejectSuggestion`, non couvert par le correctif initial malgré l'Acceptance Criteria. | High | intent_gap | Voir Spec Change Log -- Boundaries révisées, Code Map/Tasks étendus. Correctif à appliquer dans ce tour. |
| 2 | Trouvé par la lentille edge-case-hunter : le `JSON.parse(livrableRow.content)` ajouté dans `rejectSuggestion` n'est protégé par aucun `try/catch` propre -- un contenu malformé ferait échouer tout le rejet (régression : avant ce spec, `rejectSuggestion` ne touchait jamais LIVRABLE et ne pouvait donc jamais échouer pour cette raison). | Low (non atteignable aujourd'hui -- tout `LIVRABLE.content` est toujours écrit via `JSON.stringify` par ce code) | Patch | À corriger dans ce tour : protéger la lecture/le parsing pour que seul `resolvedPosition` degrade à `null`, jamais le rejet lui-même. |
| 3 | Trouvé par la lentille blind-hunter : le commentaire d'en-tête de `actions/suggestion.ts` (Story 4.3, "MESSAGE... every other read/write of LIVRABLE stays actions/livrable.ts's exclusive concern") n'a pas été mis à jour alors que `rejectSuggestion` lit désormais aussi LIVRABLE. | Low | Patch | À corriger dans ce tour : mentionner que `rejectSuggestion` lit aussi LIVRABLE (jamais n'écrit son contenu). |
| 4 | Trouvé par la lentille blind-hunter : `acceptSuggestion`/`rejectSuggestion`/`reworkSuggestion`/`getLivrable` répètent chacune, quasi à l'identique, le motif "lire le livrable, parser le JSON, vérifier `Array.isArray(blocks)`, logger sinon" -- 4e copie avec ce spec. | Low | Defer | Même famille que la duplication déjà différée à la rétrospective Epic 2 (`epic-2-retro-item-12`) -- un helper partagé (`readLivrableBlocks`) serait la bonne réponse, mais extraire à travers 4 sites dépasse la correction directe attendue d'un patch de revue. Loggé dans `deferred-work.md`. |
| 5 | Trouvé par la lentille blind-hunter : `acceptSuggestion` lit des lignes complètes (`tx.select().from(...)`) alors que le code ajouté dans `rejectSuggestion` lit des projections étroites -- styles différents pour un motif présenté comme "le même geste". | Low | Reject | Cosmétique -- aucune différence de comportement, et harmoniser le style des deux fonctions n'est pas une correction directe justifiée pour ce finding seul. |
| 6 | Trouvé par la lentille verification-gap (disposition déjà déposée : `defer`) : aucune couverture de test automatisée pour le mécanisme de gel (écriture ou affichage). | Defer (déjà proposé par la lentille) | Defer | Identique au précédent déjà établi dans ce projet à chaque story de cette session : aucun framework de test n'existe nulle part, contrainte acceptée et documentée. |
| 7 | Trouvé par la lentille blind-hunter : la limitation permanente pour les suggestions déjà résolues avant cette migration (`resolvedPosition` NULL pour toujours) ne serait tracée nulle part de durable. | False | Reject | Documentée explicitement dans le bloc frozen de ce spec (Always, I/O Matrix, Acceptance Criteria) -- l'endroit le plus durable possible pour une décision de périmètre déjà actée, cohérent avec la pratique de ce projet pour tout compromis accepté. |
| 8 | Trouvé par la lentille blind-hunter : aucun signal UI ne distingue un `¶N` figé (fiable) d'un `¶N` encore résolu en direct (fragile). | Low | Reject | Hors périmètre du "Never" de ce spec ("ne change jamais l'affichage d'une suggestion pending/revising") -- l'objectif était d'arrêter la dégradation, pas d'exposer une métadonnée de fiabilité jamais demandée. |
| 9 | Trouvé par la lentille blind-hunter : `rejectSuggestion`'s gestion d'un contenu livrable malformé reste silencieuse (`console.error` seul, aucun signal utilisateur). | False | Reject | Comportement identique à celui déjà existant dans `acceptSuggestion` pour le même cas -- pas une régression introduite par ce diff, un motif déjà accepté ailleurs dans ce fichier. |
| 10 | Trouvé par la lentille blind-hunter : l'invariant "`applyAcceptedSuggestion` ne réordonne jamais les blocs" (dont dépend la validité de figer `resolvedPosition` contre les blocs pré-édition) n'est affirmé qu'en commentaire, jamais vérifié par le code. | Low | Reject | Philosophie déjà établie dans tout ce projet (nombreux invariants documentés en prose plutôt qu'imposés à l'exécution, ex. AD-9) -- pas un problème propre à ce diff. |
| 11 | Trouvé par la lentille blind-hunter : un processus `next dev` orphelin d'une session précédente verrouillait `db/local.db` pendant la vérification. | N/A | Aucune action | Note opérationnelle sans rapport avec ce diff, déjà contournée par l'implémenteur. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type (re-exécuté après les correctifs du tour 2).
- `npx next build --turbopack` -- build propre (`✓ Compiled successfully`, `✓ Generating static pages using 6 workers (3/3)`). Un serveur `next dev` orphelin d'une session précédente (PID 99970/99971, démarré le 18/09) tenait `db/local.db` verrouillé au premier essai du tour 1 (`database is locked` lors de l'auto-migration au chargement de `db/client.ts`) -- arrêté avant de relancer le build, qui est passé proprement ; aucun verrou au tour 2.
- `git diff --stat` confirme que seuls les fichiers concernés ont changé (`db/schema.ts`, `actions/suggestion.ts`, `actions/livrable.ts`, `components/SuggestionCard.tsx`), plus la migration générée et `deferred-work.md` (finding #4, ajouté par la revue elle-même).

**Manual checks -- tour 1:**
- Script `tsx` jetable exécuté contre `db/local.db` réel (sauvegarde prise après migration/avant données de test, restaurée bit-à-bit après -- `md5` identique confirmé) : livrable fixture à 3 blocs (A/B/C), une suggestion acceptée sur le bloc B (`resolvedPosition` observé = 2), une suggestion rejetée sur le bloc C (`resolvedPosition` observé = 3), une suggestion laissée `pending` sur le bloc A. Appel direct à `updateLivrableWithSuggestions`. Relecture via `listSuggestions` : `resolvedPosition` inchangé (2 et 3) et `status` inchangé (`accepted`/`rejected`) pour les deux suggestions déjà traitées malgré la régénération complète des ids. Toutes les assertions du script (6/6) sont passées.
- `SuggestionCard.tsx` : vérifié par relecture directe du code modifié -- la branche `isResolved && suggestion.resolvedPosition !== null` est bien prioritaire sur la résolution live, et le repli vers `resolveAnchorPosition(blocks, suggestion.anchorRef)` reste intact pour `pending`/`revising` et pour une suggestion résolue dont `resolvedPosition` est `null`.

**Manual checks -- tour 2 (correctifs de revue, `actions/livrable.ts` et `actions/suggestion.ts` uniquement) :**
- Nouveau script `tsx` jetable, même protocole de sauvegarde/restauration (`md5` identique confirmé après coup). Deux scénarios ciblés sur les seuls fichiers modifiés dans ce tour :
  1. Livrable à 3 blocs (A/B/C), une suggestion `pending` ancrée sur B (position 2) et une `revising` ancrée sur C (position 3). Appel direct à `updateLivrableWithSuggestions` (régénère tous les ids) : les deux suggestions passent à `rejected` avec `resolvedPosition` figé à 2 et 3 respectivement. Un **second** appel à `updateLivrableWithSuggestions` sur le même livrable (deuxième régénération complète) confirme que `resolvedPosition` reste à 2, inchangé -- le figement résiste à des régénérations répétées, pas seulement la première.
  2. Livrable dont `content` est une chaîne délibérément invalide (`"this is not valid JSON {{{"`), une suggestion `pending` ancrée dessus. Appel à `rejectSuggestion` : ne lève plus d'exception (avant le correctif, cela aurait fait échouer toute la transaction) ; retourne `{ok: true}` ; la suggestion passe bien à `status: 'rejected'` avec `resolvedPosition: null` (dégradation gracieuse, rejet non bloqué). Un `console.error` attendu est bien émis (log défensif), sans remonter à l'appelant.
  - 11/11 assertions passées. Lignes et livrables de test nettoyés explicitement en plus de la restauration complète de la sauvegarde (`md5` identique confirmé avant et après le script).
- Portée volontairement limitée aux deux fichiers touchés dans ce tour (`actions/livrable.ts`, `actions/suggestion.ts`), conformément à la consigne du coordinateur -- pas de nouvelle passe sur `db/schema.ts`/`components/SuggestionCard.tsx`, déjà couverts et inchangés dans ce tour.
- Comportement `pending` non touché : confirmé par les deux tours de script (une suggestion `pending` résout toujours sa position en direct avant tout traitement).
