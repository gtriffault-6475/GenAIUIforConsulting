---
title: "Fond ai-tint sur le paragraphe ciblé par une suggestion ancrée"
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'bf4b276a296dc27e282e531f37ee082b21ce2eea'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-09-21.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** `epic-4-context.md` (ligne 44) exige : "Le paragraphe ciblé dans le document utilise aussi le fond `ai-tint` pour se signaler comme zone IA." Jamais implémenté depuis la Story 4.2 -- `app/livrables/[id]/page.tsx` rend chaque bloc en `<p className="text-body">` nu, sans lien visuel avec la carte de suggestion qui le cible. Finding #4 de la rétrospective Epic 4 (`epic-4-retro-2026-09-21.md`).

**Approche :** `app/livrables/[id]/page.tsx` a déjà `blocks` et `suggestions` en scope au même niveau (lus en parallèle). Calculer l'ensemble des `anchorRef` ciblés par une suggestion ancrée encore active (`status` `pending` ou `revising` -- pas `accepted`/`rejected`, déjà réglées, pas de raison de rester signalées "zone IA") et appliquer une classe `ai-tint` supplémentaire au `<p>` du bloc correspondant. Nouvelle classe CSS dans `app/globals.css`, réutilisant `--color-ai-tint` (déjà défini, Epic 1) avec un padding/radius adaptés à un paragraphe simple plutôt qu'à une carte complète.

</frozen-after-approval>

## Implementation Notes

Implémenté directement (route `oneshot`) : `app/livrables/[id]/page.tsx` calcule `activeAnchorRefs` (Set des `anchorRef` non-null dont le statut est `pending` ou `revising`) juste après avoir résolu `suggestions`, et applique conditionnellement la classe `ai-tint-block` (nouvelle, `app/globals.css`) au `<p>` du bloc correspondant. `accepted`/`rejected` exclus délibérément -- une suggestion réglée n'a plus de raison de signaler le paragraphe comme "zone IA active", cohérent avec le fait que sa propre carte s'estompe déjà (epic-4-context.md).

`npx tsc --noEmit` et `npx next build --turbopack` : propres. Le serveur de dev n'a pas pu être lancé dans cette session (restriction d'environnement, session non-interactive à l'origine) -- pas de vérification visuelle réelle dans un navigateur, uniquement lecture de code.

**Revue (Blind Hunter, prescrite par la route `oneshot`) et corrections appliquées :** 3 findings réels sur 6, patchés dans ce même tour --
- Désalignement visuel : `.ai-tint-block` avait un padding horizontal sans compensation, décalant le texte par rapport aux paragraphes voisins non teintés. Corrigé par une marge négative égale au padding.
- Aucune signalisation non-visuelle du fond `ai-tint`. Corrigé par un `<span className="sr-only">` (nouvelle classe, premier usage dans ce projet) annexé au texte du paragraphe -- jamais un `aria-label` sur le `<p>` lui-même, qui aurait remplacé son propre texte comme nom accessible au lieu de s'y ajouter (erreur initiale corrigée avant commit).
- `activeAnchorRefs` utilise `anchorRef !== null` comme proxy de "suggestion ancrée" plutôt que `type === 'anchored'` explicitement -- différé (`deferred-work.md`) : non atteignable aujourd'hui (aucune suggestion `global` n'est jamais créée), et un correctif propre étendrait `SuggestionSummary` (type partagé par plusieurs composants), plus qu'une correction directe pour cette route `oneshot`.

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | `activeAnchorRefs` traite `anchorRef !== null` comme un proxy de "suggestion ancrée" plutôt que de vérifier `type === 'anchored'` -- convention non appliquée par une contrainte SQL. | Low (non atteignable aujourd'hui) | Defer | Voir `deferred-work.md` -- aucune suggestion `type: 'global'` n'existe nulle part dans ce projet ; un vrai correctif étendrait `SuggestionSummary`, plus qu'une correction directe pour une route `oneshot`. |
| 2 | `.ai-tint-block` ajoute un padding horizontal sans compensation, désalignant le texte par rapport aux paragraphes `.text-body` voisins. | Low | Patch | **Appliqué.** Marge négative (`calc(-1 * var(--space-3))`) compense le padding -- le texte garde son alignement, seul le fond s'étend. |
| 3 | Le fond `ai-tint` est un signal purement visuel, sans contrepartie pour les lecteurs d'écran. | Low | Patch | **Appliqué.** `<span className="sr-only">` annexé au texte du paragraphe (jamais `aria-label` sur le `<p>`, qui aurait supprimé son texte réel du rendu accessible). |
| 4 | Aucun moyen de savoir quelle carte de suggestion correspond à quel paragraphe teinté quand plusieurs sont actifs simultanément. | Low | Reject | Limitation préexistante du système de suggestions (le seul repère est déjà `¶N` dans `SuggestionCard.tsx`, jamais un lien structurel) -- pas aggravée par ce diff, hors périmètre d'un ajout de fond visuel. |
| 5 | Aucune vérification visuelle réelle dans un navigateur pour ce changement. | N/A | Déjà divulgué | Limitation d'environnement déjà notée dans Implementation Notes -- pas un nouveau finding. |
| 6 | Le commentaire CSS référence `spec-ai-tint-paragraphe-cible.md`, non tracké au moment de la revue. | False | Reject | Sans objet une fois ce fichier committé avec le reste du diff (même pratique que tous les specs précédents de cette session). |
