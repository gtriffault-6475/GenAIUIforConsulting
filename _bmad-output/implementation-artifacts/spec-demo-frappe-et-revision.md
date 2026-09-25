---
title: "Mode démo : délai de frappe simulé + réponse scriptée pour la révision globale"
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
baseline_commit: '6254d616f548cf22c69c56bfc55a8b56e744e82e'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-mode-demo-scripte.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** le mode démo scripté répond instantanément (moins vivant qu'un vrai appel agent), et `GlobalRevisionField` (révision globale d'un livrable) poste ses instructions via le même `sendMessage`/`sendToAgent`, mais aucune entrée du script (`skills/demoScript.ts`) ne reconnaît un vocabulaire de révision -- un texte tapé là tombe sur le repli générique au lieu de démontrer une vraie mise à jour du document.

**Approche :** (1) `skills/buildRequest.ts`'s branche démo de `sendToAgent` attend un court délai avant de renvoyer sa réponse (pas une animation lettre par lettre -- un simple délai, proportionnel à la longueur du texte, qui laisse l'indicateur "envoi..." déjà existant du composer/du champ de révision visible plus longtemps, sans changement d'UI). (2) Une nouvelle entrée dans `DEMO_CHAT_SCRIPT` (`skills/demoScript.ts`), déclenchée par un vocabulaire de révision ("révision", "revoir", "revoyez", "mettre à jour", "actualiser", "nouvelle version" -- proche du placeholder réel du champ, "Décrivez l'ajustement d'ensemble souhaité…"), avec un `toolCall` dont le contenu diffère du livrable initial (texte remanié, nouvelles suggestions) -- le mécanisme existant d'`executeTool` (déjà : livrable existant -> `updateLivrableWithSuggestions`) produit alors une vraie mise à jour visible, sans changement à ce mécanisme.

## Boundaries & Constraints

**Always :** le délai reste court (perceptible mais jamais frustrant à rejouer plusieurs fois en démo -- de l'ordre de la seconde, jamais plusieurs secondes). Les nouveaux mots-clés de révision ne doivent chevaucher aucun mot-clé existant (`rédige`/`référence`/`expert`/`bonjour`, etc.) pour ne pas perturber le script déjà en place.

**Never :** aucune animation de texte lettre par lettre dans cette spec (hors périmètre, complément possible plus tard). Aucun changement à `executeTool`/`createLivrableWithSuggestions`/`updateLivrableWithSuggestions` -- la nouvelle entrée s'appuie sur leur comportement déjà existant.

## Implementation Notes

Implémenté conformément à l'Intent gelé. `skills/buildRequest.ts` : `demoTypingDelayMs(content)` (`400 + longueur*8`, borné à 1800ms) et `resolveDemoReply(content)` (applique le délai puis renvoie `{ok:true,content}`) ajoutées ; les 4 points de retour "succès" de la branche démo (repli générique, réponse+`toolCall`, retravail de suggestion, suggestion d'étape) convergent désormais vers `resolveDemoReply` -- un échec réel (`executeTool` en échec) reste immédiat, jamais délayé. `skills/demoScript.ts` : nouvelle entrée de révision dans `DEMO_CHAT_SCRIPT`, avec un `toolCall` qui étoffe le livrable (4 blocs au lieu de 3, mention des délais) plutôt que de le dupliquer -- `executeTool`'s détection d'un livrable existant (inchangée) route vers `updateLivrableWithSuggestions`.

`npx tsc --noEmit`/`npx next build --turbopack` propres. Script `tsx` jetable (sauvegarde/restauration `db/local.db`) : 10/10 assertions -- délai mesuré et borné (300-2000ms sur un repli générique et sur la création), livrable créé avec 3 blocs, révision via `requestGlobalRevision` mettant à jour (jamais dupliquant) le même livrable avec 4 blocs mentionnant les délais, anciennes suggestions passées `rejected`, 2 nouvelles `pending`.

**Revue (bmad-review, blind-hunter) -- 1 finding sérieux corrigé, 1 UX corrigé, voir Review Triage Log.** Mots-clés de révision initiaux ("mettre à jour", "actualiser", "revoir", "revu"...) jugés trop courants pour porter un `toolCall` sans risque : contrairement aux entrées références/experts (un faux positif n'y produit qu'une réponse hors sujet, risque déjà accepté par `spec-mode-demo-scripte.md`), un faux positif ici écraserait silencieusement le vrai livrable d'une conversation non ciblée. Corrigé : mots-clés remplacés par des locutions complètes incluant "document"/"réponse" (ex. "revoir le document" au lieu de "revoir"), "revu" retiré entièrement (sous-chaîne trop courte, matchait aussi "revue"). L'Intent gelé ci-dessus cite encore les mots-clés d'origine -- non modifié (convention de ce projet : le texte gelé reste tel qu'approuvé, la correction se documente ici), la liste réellement livrée est dans `skills/demoScript.ts`.

`components/ProactiveSuggestion.tsx` rendait `null` pendant tout le chargement -- avec le nouveau délai (jusqu'à 1.8s en mode démo), ce silence devenait un espace vide qui paraît figé plutôt que vivant, l'effet inverse de celui recherché par cette spec. Corrigé : un texte de statut sobre ("L'agent réfléchit à une proposition…") comble cet instant, en démo comme en usage réel (bénéfice non spécifique à la démo). `components/SuggestionCard.tsx`'s champ de retravail vérifié séparément : ses boutons/textarea passent déjà `disabled={isPending}}` pendant l'attente, un signal visuel suffisant, aucun changement nécessaire là.

Revérifié après ces deux correctifs : 4/4 assertions dédiées (la phrase générique à risque ne déclenche plus rien ; la phrase avec "document" déclenche toujours la révision correctement). `npx tsc --noEmit`/`npx next build --turbopack` propres.

## Review Triage Log

| # | Finding | Verdict | Route | Résolution |
|---|---|---|---|---|
| 1 | blind-hunter : les mots-clés de révision initiaux (verbes seuls : "mettre à jour", "actualiser", "revoir") associés à un `toolCall` risquent un faux positif destructeur sur une conversation hors sujet (ex. projet mission) -- contrairement aux entrées références/experts sans `toolCall`, dont un faux positif ne produit qu'une réponse hors sujet (risque déjà accepté par `spec-mode-demo-scripte.md` finding #9). | **High** | **Patch** | Corrigé : mots-clés remplacés par des locutions complètes ("revoir le document"/"la réponse", etc.), toutes incluant un terme document-spécifique, très improbables hors d'une demande de révision volontaire. Revérifié : la phrase générique à risque ne déclenche plus le `toolCall`. |
| 2 | blind-hunter : le mot-clé "revu" (4 lettres) matche aussi par sous-chaîne à l'intérieur de "revue" ou toute autre inclusion fortuite. | Medium (regroupé avec #1, même cause) | Patch | Résolu par le même correctif -- "revu" retiré entièrement de la liste. |
| 3 | blind-hunter : `spec-demo-frappe-et-revision.md` n'avait ni Implementation Notes ni trace de vérification, contrairement à la convention des specs sœurs de ce projet. | Low | Patch (doc) | Corrigé : Implementation Notes complétées ci-dessus avec le détail de l'implémentation et des deux tours de vérification. |
| 4 | blind-hunter : le commentaire justifiant le délai ("sans changement côté UI") ne vaut que pour `Composer.tsx`/`GlobalRevisionField.tsx` -- `ProactiveSuggestion.tsx` (suggestion d'étape) rend `null` pendant le chargement, aucun indicateur visible à prolonger. | **High** (le délai y produit l'effet inverse de celui recherché) | **Patch** | Corrigé : `ProactiveSuggestion.tsx` affiche désormais un texte de statut pendant le chargement. `SuggestionCard.tsx` (retravail) vérifié séparément : dispose déjà d'un indicateur (`disabled={isPending}`), aucun changement nécessaire. |
| 5 | blind-hunter : le commentaire "aucun chevauchement" ne documentait la vérification que contre l'entrée de création, pas contre la liste complète des mots-clés existants. | Low | Patch (doc) | Résolu au passage : le commentaire réécrit lors du correctif #1/#2 couvre désormais explicitement toutes les entrées existantes. |
| 6 | blind-hunter : la formule du délai n'était pas explicitement vérifiée contre les textes plus courts (`DEMO_STEP_SUGGESTIONS`/`DEMO_REWORK_REPLY`) ni contre les surfaces UI autres que le chat. | Low | Reject (couvert par ailleurs) | La préoccupation réelle sous-jacente était l'absence d'indicateur visuel pendant le délai -- déjà couverte et corrigée par #4 (`ProactiveSuggestion.tsx`) et déjà vérifiée pour `SuggestionCard.tsx`. La formule elle-même (400-1800ms) reste raisonnable pour des textes courts comme longs. |
