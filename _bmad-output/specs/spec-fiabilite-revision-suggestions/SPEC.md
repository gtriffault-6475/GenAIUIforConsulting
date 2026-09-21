---
id: SPEC-fiabilite-revision-suggestions
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Fiabilité de la révision globale et de la concurrence des suggestions

## Why

Mandat : la rétrospective de l'Epic 4 (`bmad-review`, 3 lentilles indépendantes sur le diff complet) a trouvé deux défauts réels à la frontière entre les stories 4.3 et 4.4, qu'aucune revue par story n'avait vus, qui violent tous deux la garantie transversale FR-23/FR-24 que Story 4.5 avait pourtant explicitement auditée et certifiée "Conforme" — cet audit avait un angle mort méthodologique : chaque fonction mutante (`executeTool`, `acceptSuggestion`, `rejectSuggestion`, `reworkSuggestion`, `requestGlobalRevision`) a été vérifiée isolément, jamais les écritures concurrentes entre elles sur les mêmes lignes `SUGGESTION`/`LIVRABLE`. Pain concrète pour le consultant : un clic sur "Accepter" peut afficher "Acceptée" sans qu'aucun changement réel n'ait eu lieu sur le document (faux succès), et toute révision globale régénère le document entier sans jamais montrer au modèle son contenu réel actuel, avec un risque de fabrication ou de perte silencieuse de paragraphes non concernés par la demande.

## Capabilities

- **CAP-1**
  - **intent:** Quand un consultant soumet une révision globale, la régénération du contenu par l'agent s'appuie sur le contenu réel actuel du livrable, jamais sur le seul souvenir non vérifié du modèle d'un tour de conversation antérieur.
  - **success:** Sur un livrable de plusieurs paragraphes dont un seul est concerné par la demande de révision, les autres paragraphes du document régénéré correspondent au texte réel pré-révision (identiques, ou une reformulation volontaire du modèle informée par ce texte réel) — jamais un contenu fabriqué ou silencieusement perdu que le modèle n'a jamais vu.

- **CAP-2**
  - **intent:** Le retravail d'une suggestion (« Retravailler ») ne peut jamais ressusciter silencieusement une suggestion déjà résolue par une révision globale concurrente.
  - **success:** Étant donné une suggestion passée à `revising` par « Retravailler », quand une révision globale la fait passer à `rejected` (et régénère les ids de blocs) avant que l'appel agent du retravail ne revienne, alors la suggestion reste `rejected` — la fin du retravail, succès ou échec, est un no-op sur cette ligne, jamais une écriture silencieuse vers `pending` avec une ancre obsolète.

## Constraints

- Réutiliser le motif transactionnel garde-puis-écriture déjà en place dans `acceptSuggestion`/`rejectSuggestion` (`actions/suggestion.ts`) — un `UPDATE` conditionné par le statut courant à l'intérieur d'une transaction — plutôt qu'introduire une nouvelle primitive de concurrence.
- Ne pas ajouter de nouvelle confirmation ni de nouvelle surface UI pour la révision globale : Story 4.5 a déjà retenu Option A (statu quo côté UX) pour cette classe de risque, et l'Epic 4 exclut tout nouvel écran pour ce type de correctif. C'est un correctif de fiabilité, pas une refonte UX.
- L'appel au modèle reste dans le cycle d'outil existant, au seul point d'assemblage `skills/buildRequest.ts` (AD-11) — pas de second appel parallèle, jamais de streaming.
- Aucun framework de test n'existe dans ce projet (contrainte acceptée, documentée dans `ARCHITECTURE-SPINE.md`) — la vérification reste manuelle/scriptée (DB), même discipline que toutes les stories précédentes.

## Non-goals

- Ne corrige pas la course déjà différée du livrable dupliqué par `conversationId` (`deferred-work.md`, Story 4.2 finding #2 / Story 4.4 finding #3).
- Ne traite pas les 2 findings MEDIUM de la même rétrospective (régénération d'id de bloc sur toute révision globale ; fond `ai-tint` jamais appliqué au paragraphe ciblé) — action items séparés déjà logués dans `sprint-status.yaml`.
- N'ajoute pas de tests automatisés.
- Ne redessine pas l'UX de la révision globale pour ajouter une étape de revue granulaire par paragraphe.

## Success signal

Les deux nouveaux scénarios (fidélité de la révision globale ; course retravail-vs-régénération concurrente) passent une vérification manuelle DB/script du même type que celle déjà utilisée dans ce projet, et une nouvelle passe `bmad-review` sur le diff ne retrouve plus aucun des deux findings HIGH originaux (Epic 4 retro, `epic-4-retro-2026-09-21.md`) comme atteignables.

## Assumptions

- Les 2 items HIGH sont traités ensemble dans un seul spec car ils partagent la même racine (écriture concurrente non gardée sur les mêmes lignes `SUGGESTION`/`LIVRABLE`) et touchent des fonctions voisines (`actions/livrable.ts`, `actions/suggestion.ts`, `actions/conversation.ts`) plutôt que deux specs séparés.
