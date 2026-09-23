---
title: "Nettoyage du livrable orphelin et garde de projet actif sur le reset avant-vente"
type: 'bugfix'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '9db82b6d29d42915e70ca757e1b5f75dc8a96dd2'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-09-23.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Findings #1 (partiel, Option A validée) et #2 de la rétrospective de suivi Epic 4 (`epic-4-retro-2026-09-23.md`). Réinitialiser une avant-vente laisse les `SUGGESTION` du livrable orphelin pleinement actionnables (accepter/rejeter/retravailler sur un document censé être remis à zéro), et ne vérifie jamais que le projet ciblé est toujours le projet actif -- devenu atteignable depuis l'ajout du changement de projet à la volée.

**Approche :** `resetAvantVenteWorkflow` (`actions/demo.ts`) gagne, dans la même transaction : (1) une vérification `APP_STATE.activeProjectId === projectId`, refuse sinon ; (2) la suppression des `SUGGESTION` de tout livrable de ce projet (jamais le livrable lui-même, jamais son `title`/`content` -- seul son `conversationId` reste mis à `null` comme avant). Un commentaire de traçabilité est aussi ajouté dans `app/livrables/[id]/page.tsx` documentant la dépendance implicite d'`activeAnchorRefs` envers la garde de `reworkSuggestion`/la transition de `updateLivrableWithSuggestions` (finding #5 du même passage de rétrospective, purement documentaire).

</frozen-after-approval>

## Implementation Notes

Implémenté directement (route `oneshot`) :
- `actions/demo.ts` -- ajout de la garde `appState.activeProjectId === projectId` (lecture intra-transaction, même motif que la garde de type déjà en place) ; ajout de la suppression des `SUGGESTION` référençant les livrables du projet, avant que `conversationId` ne soit mis à `null` sur ces mêmes livrables. En-tête du fichier mis à jour pour refléter que SUGGESTION est désormais aussi écrit (supprimé) par cette action.
- `app/livrables/[id]/page.tsx` -- commentaire de traçabilité ajouté au-dessus d'`activeAnchorRefs`, aucun changement de comportement.

`npx tsc --noEmit` et `npx next build --turbopack` : propres.

Vérification indépendante contre `db/local.db` réelle (sauvegardée avant, restaurée après) : un livrable créé via une vraie conversation avec une suggestion `pending`, projet activé explicitement, reset -> `{ok:true}`, suggestion supprimée (`listSuggestions` renvoie `[]`), livrable intact (`title`/`content` inchangés, `conversationId` à `null`). Projet ensuite désactivé (bascule vers `proj-audit-mission` via `selectProject`), nouveau reset sur `proj-acme-rfp` -> `{ok:false, error:"Ce projet n'est plus le projet actif."}`, correctement refusé.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | Trouvé par la lentille blind-hunter : le commentaire d'en-tête d'`actions/suggestion.ts` (AD-2) ne mentionnait pas `actions/demo.ts` comme deuxième exception autorisée à écrire dans SUGGESTION. | Low | Patch | **Appliqué.** Commentaire étendu pour citer `resetAvantVenteWorkflow` comme exception démo. |
| 2 | Trouvé par la lentille blind-hunter : le commentaire d'en-tête de `DemoResetAvantVente.tsx` affirmait encore que l'action "ne touche jamais les suggestions", et le texte de `window.confirm()` vu par le consultant n'énumérait ni "suggestions" ni "livrables" -- sous-estimant la portée réelle de la première action destructive de l'app. | Low | Patch | **Appliqué.** Commentaire et texte de confirmation mis à jour pour mentionner explicitement les suggestions. |
| 3 | Trouvé par la lentille blind-hunter : le message d'erreur "Ce projet n'est plus le projet actif" est trompeur si aucun projet n'a jamais été actif (`appState` sans ligne) -- "n'est plus" implique qu'il l'a été. | Low | Patch | **Appliqué.** Reformulé en "n'est pas (ou plus) le projet actif". |
| 4 | Trouvé par la lentille blind-hunter : la vérification manuelle initiale ne couvrait qu'une suggestion `pending` sur un seul livrable, alors que le code supprime sans filtre de statut et pour tous les livrables du projet. | Low (le code lui-même n'a jamais filtré par statut -- gap de rigueur dans la vérification, pas dans le code) | Patch (vérification renforcée) | **Appliqué et vérifié par l'orchestrateur.** Script étendu : suggestions `accepted`/`rejected`/`pending` sur 2 livrables distincts du même projet -- toutes supprimées, les deux livrables intacts. |
| 5 | Trouvé par la lentille blind-hunter : un onglet déjà ouvert sur `/livrables/[id]` d'un livrable du projet réinitialisé garde ses cartes de suggestions affichées jusqu'à un rafraîchissement ou un clic en échec. | Low | Reject | Comportement identique à toute autre mutation serveur de cette app (aucune synchronisation réactive entre onglets nulle part, modèle RSC standard) -- pas une régression propre à ce diff. |
| 6 | Trouvé par la lentille blind-hunter : aucun test automatisé pour les deux nouveaux comportements. | False | Reject | Identique au précédent déjà établi dans ce projet à chaque story de cette session : aucun framework de test n'existe nulle part, contrainte acceptée et documentée. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre
- `npx next build --turbopack` -- propre

**Manual checks:**
- Script jetable contre `db/local.db` réelle (sauvegardée/restaurée) : reset réussi (projet actif) avec suppression de suggestions `accepted`/`rejected`/`pending` sur 2 livrables distincts, tous deux intacts ; reset refusé sur un projet devenu non-actif (bascule via `selectProject`).
