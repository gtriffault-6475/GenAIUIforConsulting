---
title: "Mode démo : mocker l'ajout d'une skill à un projet"
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
baseline_commit: '59553d7360b5059de137290d3e00936e7ba7c247'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-toggle-mode-demo-ui.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** "Ajouter une skill" (`SkillsPanel.tsx`) n'affiche qu'un message honnête ("pas encore disponible") -- le vrai mécanisme est explicitement différé (PRD OQ-6). En démo, ça laisse une fonctionnalité visiblement inerte alors que le catalogue (`skills/catalog.ts`) contient une 3e skill (`mission-scoping`) jamais chargée sur le projet RFP Acme.

**Approche :** quand le mode démo est actif, `SkillsPanel` affiche en plus, sous le message existant, les skills du catalogue pas encore chargées sur le projet, cliquables -- un clic insère une vraie ligne `PROJECT_SKILL` (nouvelle Server Action `addProjectSkillDemo`, `actions/skill.ts`, même position-append que `seedFixturesIfEmpty`) puis `router.refresh()`. Hors mode démo, comportement strictement inchangé (le message honnête reste seul). La nouvelle Server Action refuse explicitement si le mode démo n'est pas actif (`actions/demo.ts`'s `getDemoModeActive()`) -- jamais une fonctionnalité activable par accident hors démo, même mécanisme de garde que le reste du mode démo.

## Boundaries & Constraints

**Always :** la ligne `PROJECT_SKILL` insérée est réelle et persistée (comme les livrables/suggestions déjà créés par le script de chat) -- reste chargée même après désactivation du mode démo, assumé (même logique que le reste de cette fonctionnalité). `addProjectSkillDemo` référence `getDemoModeActive()` avant tout écriture, refuse sinon.

**Never :** aucun changement au comportement hors mode démo -- le message "pas encore disponible" reste la seule chose affichée. Aucun changement à `listProjectSkills`/`ProjectSkillSummary` (contrat gelé, Story 2.5).

## Implementation Notes

Implémenté conformément à l'Intent gelé. `actions/skill.ts` : `addProjectSkillDemo(projectId, skillKey)` -- vérifie `getDemoModeActive()`, valide `skillKey` contre `SKILL_CATALOG`, insère dans une transaction (position = max existant + 1, refuse si déjà chargée). `components/SkillsPanel.tsx` : nouvelle prop `demoModeActive`, `availableToAdd` dérivée du catalogue moins les skills déjà chargées, boutons appelant `addProjectSkillDemo` puis `router.refresh()`. `app/page.tsx` : `demoModeActive` (déjà calculé pour `DemoModeToggle`) transmis à `SkillsPanel`. `app/globals.css` : `.skill-add-catalog-entry`.

`npx tsc --noEmit`/`npx next build --turbopack` propres. Script `tsx` jetable (sauvegarde/restauration) : 11/11 assertions -- refus hors mode démo, refus sur clé de catalogue inconnue, ajout réussi avec position correcte, doublon refusé, second ajout à la position suivante, ligne conservée après désactivation du mode démo.

**Revue (bmad-review, blind-hunter) -- voir Review Triage Log.** Deux corrections réelles notables : (1) l'ordre des deux gardes de `addProjectSkillDemo` inversé -- le mode démo est désormais vérifié avant la validité de la clé de catalogue, pour que le refus "pas en mode démo" prime toujours en dehors d'une démo ; (2) `seedFixturesIfEmpty(projectId)` ajouté avant l'insertion (même geste que `listProjectSkills`/`listLoadedSkillInstructions`) -- son absence aurait pu, pour un appel direct sur un projet jamais encore lu, désactiver définitivement le seed de fixtures de ce projet. Corrections UI : le message "pas encore disponible" ne s'affiche plus en même temps que la liste de skills réellement ajoutables (contradiction trouvée par la revue) ; l'overlay se referme désormais au succès (le commentaire du tour 1 l'affirmait déjà à tort) ; le bouton d'ajout porte un verbe d'action explicite ("Ajouter : {nom}").

Revérifié après ces correctifs : 3/3 assertions dédiées (garde réordonnée, `seedFixturesIfEmpty` n'introduit aucune régression). `npx tsc --noEmit`/`npx next build --turbopack` propres.

## Review Triage Log

| # | Finding | Verdict | Route | Résolution |
|---|---|---|---|---|
| 1 | blind-hunter : la validité de `skillKey` contre le catalogue était vérifiée avant la garde du mode démo -- un appel hors démo avec une clé invalide renvoyait "introuvable" plutôt que "pas en mode démo", inversant l'ordre de défense en profondeur voulu par l'Intent. | Medium | Patch | Corrigé : garde du mode démo en premier. |
| 2 | blind-hunter : `addProjectSkillDemo` n'appelait jamais `seedFixturesIfEmpty`, contrairement à `listProjectSkills`/`listLoadedSkillInstructions` -- un appel sur un projet jamais encore lu rendrait la table non-vide avant que les fixtures n'aient jamais été posées, désactivant `seedIfEmpty`'s garde pour toujours sur ce projet. | Medium (non atteignable via l'UI actuelle, qui lit toujours `listProjectSkills` avant de pouvoir afficher le bouton -- mais une Server Action reste un point d'entrée réseau) | Patch | Corrigé : même appel `seedFixturesIfEmpty(projectId)` ajouté, même geste que les deux fonctions sœurs. |
| 3 | blind-hunter : le message "pas encore disponible" restait affiché même quand la liste de skills ajoutables apparaissait juste en dessous -- contredit directement le principe honnête ("jamais un formulaire qui a l'air fonctionnel mais ne fait rien") au moment précis où la fonctionnalité l'est réellement. | **High** (contradiction visible à l'écran) | Patch | Corrigé : le message ne s'affiche plus que lorsque la liste est vide (mode démo inactif, ou actif mais plus rien à ajouter). |
| 4 | blind-hunter : `handleAdd` ne refermait jamais l'overlay au succès, alors que son propre commentaire affirmait "même forme que `ProjectSelector.tsx`'s `handleChoose`", qui le fait. | Low | Patch | Corrigé : `closeOverlay()` ajouté au succès, code aligné sur ce que le commentaire décrivait déjà. |
| 5 | blind-hunter : les boutons de la liste n'affichaient que le nom de la skill, sans verbe indiquant qu'un clic l'ajoute. | Low | Patch | Corrigé : "Ajouter : {nom}". |
| 6 | blind-hunter : les deux nouveaux `style={{display:'flex',...}}` dérogeraient à une convention "toujours une classe CSS dédiée". | -- | **Faux** | Vérifié directement : 58 usages de `style={{...}}` dans ce projet, dont exactement ce même motif (`display:'flex', flexDirection:'column', gap:...`) déjà présent dans `AddDocumentForm.tsx`/`ConversationList.tsx` avant ce diff -- un style de mise en page ponctuelle inline est déjà la convention établie, les classes CSS dédiées servent aux motifs réutilisables (boutons, cartes). |
| 7 | blind-hunter : un échec de `getDemoModeActive()` lui-même renvoyait le même message qu'un "mode démo inactif" normal, sans log distinct -- masque une vraie panne d'infrastructure. | Low | Patch | Corrigé : `console.error` ajouté sur `!demoModeResult.ok` spécifiquement, avant le message générique (le texte utilisateur reste le même -- aucune action possible de son côté dans les deux cas -- mais la cause reste tracée côté serveur). |
| 8 | blind-hunter : aucun indicateur ne distingue une ligne `PROJECT_SKILL` ajoutée en démo d'une ligne "réelle" une fois insérée. | Low | Defer | Même compromis déjà accepté pour chaque autre donnée créée par le mode démo (livrables, suggestions) -- cohérent avec la priorité affichée par l'utilisateur à ce stade (produit avant tout construit pour la démo). Logué dans `deferred-work.md`. |
| 9 | blind-hunter : aucune gestion du focus/retour visuel après le succès, une fois le bouton disparu de la liste suite au `router.refresh()`. | Low | Defer | Même caractéristique que tous les autres flux "succès -> `router.refresh()`" déjà existants dans ce projet (`ProjectSelector`, `Composer`, etc.) -- aucun ne fait de gestion de focus dédiée non plus. Logué dans `deferred-work.md` comme préoccupation transverse, pas spécifique à cette fonctionnalité. |
