---
title: 'Story 1.4: Ajout d''un document hors-drive'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0ee872178094ed632ee3fcf15999d92f5d14bd72'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un consultant reçoit souvent du contexte utile qui n'existe pas sur le drive Octopod (ex. un compte-rendu reçu par email) ; rien ne permet aujourd'hui de l'ajouter au projet, donc l'agent ne peut jamais s'en servir.

**Approach:** Ajouter un bouton "Ajouter un document" dans l'en-tête du panneau Contexte, ouvrant (via l'`OverlayProvider` existant) un petit formulaire texte (nom, dossier optionnel, contenu) soumis à une nouvelle Server Action `addManualDocument` qui insère directement une ligne `source: 'manual'` dans `DOCUMENT` — sans jamais transiter par un port d'intégration, conformément à AD-1.

## Boundaries & Constraints

**Always:** l'ajout écrit directement dans `DOCUMENT` via `actions/document.ts` (déjà le seul fichier autorisé à lire/écrire cette table, AD-2) — jamais via `DriveProvider` ou un adapter, exactement comme le précise l'AD-1 pour ce cas précis ("un document ajouté manuellement n'est pas une donnée Octopod"); le document ajouté a `source: 'manual'` et apparaît immédiatement dans le panneau Contexte, dans le même regroupement par `folderPath` que les documents du drive, sans resynchronisation — realizes FR-4; l'ouverture du formulaire passe par l'`OverlayProvider` existant (AD-8, un seul overlay ouvert à la fois, Échap et clic-extérieur ferment le formulaire comme pour le sélecteur de projet); tous les champs (nom, dossier, contenu) sont du texte simple — round 1 n'a pas de stockage de fichiers réel, cohérent avec `DOCUMENT.content: text NOT NULL`; nom et contenu sont requis, dossier est optionnel.

**Never:** pas de vrai upload de fichier (pas de `<input type="file">`, pas de parsing PDF/DOCX) — round 1 reste texte collé/tapé; pas de distinction visuelle entre documents `drive` et `manual` dans la liste — explicitement hors scope au niveau PRD (FR-4); pas d'édition ni de suppression d'un document existant (drive ou manuel) — cette story n'ajoute que la capacité d'ajout; ne pas toucher `integrations/mock/drive-provider.ts` ni `integrations/ports/drive-provider.ts` — l'ajout manuel ne les concerne pas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ajout réussi, sans dossier | nom + contenu remplis, dossier vide | nouveau document `source: 'manual'` apparaît immédiatement en racine du panneau | N/A |
| Ajout réussi, avec dossier | nom + contenu + dossier remplis | document apparaît groupé sous ce `folderPath`, aux côtés des documents drive du même dossier s'il y en a | N/A |
| Champ requis manquant | nom ou contenu vide, soumission tentée | soumission bloquée côté client, formulaire reste ouvert | message inline, aucun appel réseau |
| Échec de la Server Action | insertion DB échoue | formulaire reste ouvert, saisie conservée | message d'erreur affiché dans l'overlay |

</frozen-after-approval>

## Code Map

- `actions/document.ts` -- ajouter `addManualDocument({ projectId, name, folderPath, content })`, générant un id (`crypto.randomUUID()`) et insérant une ligne `source: 'manual'` -- reste le seul fichier à toucher `DOCUMENT` (AD-2); ne pas modifier `listDocuments`.
- `components/ContextPanel.tsx` -- actuellement un Server Component listant les documents en lecture seule -- devient un client component: conserve le rendu de la liste tel quel, ajoute un bouton déclencheur dans l'en-tête du panneau utilisant `useOverlay()` (`openOverlay`/`closeOverlay`/`isOverlayOpen`/`contentRef`, mêmes noms que `ProjectSelector.tsx`), appelle `router.refresh()` après un ajout réussi (mirrors `ProjectSelector.tsx`'s `handleChoose`).
- Nouveau fichier pour le corps du formulaire (nom à décider en implémentation, ex. `components/AddDocumentForm.tsx`) -- champs nom/dossier/contenu, validation requise côté client, appelle `addManualDocument`, affiche son erreur.
- `app/globals.css` -- aucun style de champ texte n'existe encore (seulement des boutons) -- ajouter un token minimal pour `input`/`textarea` (bordure, `--radius-sm`, typographie `text-body`, espacement), cohérent avec DESIGN.md ("rounded.sm pour les boutons et champs").
- `components/OverlayProvider.tsx`, `components/ProjectSelector.tsx` -- pattern d'overlay existant à reproduire à l'identique -- ne pas modifier.

## Tasks & Acceptance

**Execution:**
- [x] `actions/document.ts` -- ajouter la Server Action `addManualDocument` -- seul point d'écriture autorisé sur `DOCUMENT`, réalise FR-4
- [x] `components/ContextPanel.tsx` -- ajouter le bouton déclencheur + intégration `useOverlay()` + `router.refresh()` après ajout -- réutilise le pattern `ProjectSelector`
- [x] Formulaire d'ajout (`components/AddDocumentForm.tsx`) -- champs nom/dossier/contenu, validation requise, appel à `addManualDocument`, affichage d'erreur -- réalise FR-4
- [x] `app/globals.css` -- tokens minimaux `input`/`textarea` -- premier besoin de champ texte dans l'app

**Acceptance Criteria:**
- Given un projet connecté avec le panneau Contexte visible, when le consultant remplit nom + contenu valides et soumet, then le nouveau document apparaît immédiatement dans le panneau, sans rechargement manuel ni resynchronisation du drive
- Given ce même ajout, when on vérifie son chemin d'écriture, then il passe uniquement par `actions/document.ts` — jamais par `DriveProvider` ni `integrations/mock/*`
- Given le formulaire d'ajout ouvert, when le consultant clique en dehors ou appuie sur Échap, then il se ferme sans ajouter de document
- Given un nom ou un contenu vide, when le consultant tente de soumettre, then la soumission est bloquée avec un message clair, sans appel réseau

## Implementation Notes

Implémenté par un subagent scopé selon Code Map/Tasks. L'orchestrateur a ensuite mené son propre Reviewer Gate indépendant (trois angles de revue en parallèle — angles morts, cas limites, gaps de vérification) plutôt que de faire confiance au rapport d'auto-vérification de l'implémenteur, conformément au processus établi depuis l'incident de la Story 1.2.

**Review Triage Log:**

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | `AddDocumentForm.tsx` ne réinitialisait `submitError` que dans la branche de validation réussie : si une soumission échouait côté serveur puis que l'utilisateur vidait un champ et re-soumettait, l'ancien message d'erreur serveur et le nouveau message de validation s'affichaient simultanément. Trouvé par la revue "cas limites". | Medium | Patch | `AddDocumentForm.tsx` : `setValidationError(null)`/`setSubmitError(null)` déplacés en tête de `handleSubmit`, avant toute validation. |
| 2 | Aucune garde synchrone contre un double-clic rapide sur "Ajouter" — `disabled={isPending}` ne prend effet qu'après le re-rendu, laissant une fenêtre où deux appels à `addManualDocument` (donc deux documents dupliqués) pourraient partir. Trouvé par la revue "cas limites". | Medium | Patch | `AddDocumentForm.tsx` : garde `if (isPending) return;` ajoutée en tête de `handleSubmit`. |
| 3 | Nesting visuel du dropdown "Ajouter un document" à l'intérieur du panneau Contexte : le dropdown étant ancré à la largeur interne (insetted) de l'en-tête plutôt qu'aux bords de la carte externe, la marge/coin arrondi de la carte externe restait visible en cadre autour du dropdown plus étroit. Trouvé indépendamment par les trois revues (framing variable, de "coupure visuelle" à "détail cosmétique"). | Medium (visuel) | Verify + Patch | Reproduit en direct dans le navigateur (confirmé : cadre visible, pas de coupure franche comme initialement décrit par une revue). Corrigé en ancrant le dropdown aux bords de la carte externe (`app/globals.css` : `.context-panel { position: relative }` sur la `<section>` elle-même plutôt que sur l'en-tête interne ; `.add-document-dropdown` étendu avec `left`/`right: calc(-1 * var(--space-panel-padding))`). Revérifié en direct : plus de double cadre. |
| 4 | Race condition : fermer le formulaire (Échap/clic extérieur) pendant qu'une soumission est en cours ne l'annule pas — en cas de succès, le document est quand même ajouté silencieusement ; en cas d'échec, `setSubmitError` s'exécute sur un composant déjà démonté et le message d'erreur n'apparaît jamais. Trouvé indépendamment par les revues "angles morts" et "cas limites". | Medium (latent, fenêtre de timing très courte) | Defer | Logué dans `deferred-work.md` — cause racine architecturale (état de soumission local à `AddDocumentForm`, démonté avec le dropdown) ; fenêtre de déclenchement réelle très étroite (écriture SQLite locale quasi instantanée) ; correction complète nécessite de faire remonter l'état de soumission dans `ContextPanel`, jugé disproportionné pour ce risque à ce stade. |
| 5 | Claim de l'implémenteur ("aucun moyen naturel de déclencher un échec réel de la Server Action") jugée non vérifiée — un `projectId` invalide viole la contrainte FK réelle (`db/client.ts` a `PRAGMA foreign_keys = ON`, `document.projectId` référence `project.id`). Trouvé par la revue "gaps de vérification". | High (gap de vérification, pas un bug) | Verify | Orchestrateur a reproduit l'échec en direct (édition temporaire d'un `projectId` invalide dans `app/page.tsx`, revert immédiat après test) : message "Impossible d'ajouter ce document." affiché, formulaire resté ouvert, valeurs saisies conservées, aucune ligne orpheline en base — comportement conforme à la spec. |
| 6 | Nom de dossier en texte libre, apparié par égalité stricte de chaîne à `groupByFolder` (Story 1.3) — une faute de frappe (`"Comptes rendus"` vs `"Comptes-rendus"`) crée un second groupe indiscernable. Trouvé par la revue "cas limites". | Low (latent) | Defer | Logué dans `deferred-work.md` — pas une régression de cette story, mais la première fois qu'un humain tape un nom de dossier à la main. |
| — | Whitespace-only nom/dossier, active-project-change mid-form, taille de champ non plafonnée, positionnement CSS général du dropdown (hors le point #3) | — | No action | Vérifiés par les trois revues indépendamment — tous corrects tels qu'implémentés ou non-applicables au round 1 ; aucune action requise. |

## Verification

**Commands:**
- `npm run dev` -- serveur démarré sous Node 24 (nvm via `.claude/launch.json`), sans erreur
- `npx next build --turbopack` -- compile proprement (revérifié après les correctifs du Review Triage Log)
- `npx tsc --noEmit` -- aucune erreur de type en mode strict (revérifié après les correctifs)

**Manual checks — tous effectués en direct par l'orchestrateur dans le navigateur :**
- Ajout sans dossier -- document apparaît immédiatement en racine, sans rechargement manuel.
- Ajout avec dossier (`Comptes-rendus`) -- groupé correctement aux côtés du document drive du même dossier.
- Confirmation directe en base (`sqlite3`) que les deux ajouts ont `source = 'manual'` et le `folder_path` attendu.
- Soumission avec champ requis vide -- bloquée côté client, message affiché, zéro appel réseau.
- Échap et clic extérieur -- ferment le formulaire sans ajouter de document (revérifié après les correctifs).
- `projectId` invalide (test artificiel, reverté) -- déclenche le chemin d'échec de la Server Action : message d'erreur affiché, saisie conservée, aucune ligne orpheline -- précédemment non vérifié en direct, maintenant confirmé.
- Double cadre visuel autour du dropdown -- corrigé et revérifié : le dropdown s'aligne désormais exactement sur les bords de la carte Contexte.
