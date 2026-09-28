---
title: "Mode démo : popup de catalogue de skills OCTO (navigation, recherche, ajout)"
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6fc7ae73f8cc6206711b7e7f18fd17b3ffb88aa3'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-demo-ajout-skill.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** en mode démo, "Ajouter une skill" (`SkillsPanel.tsx`) n'ouvre qu'un petit menu déroulant de boutons "Ajouter : {nom}" -- rien ne montre l'idée d'un **catalogue OCTO partagé** qu'on parcourt et dans lequel on cherche, pourtant au cœur du brief (capitalisation collective des skills).

**Approche :** en mode démo, remplacer ce menu par une popup modale centrée "Catalogue de skills OCTO" : champ de recherche, navigation par catégorie, cartes (nom, catégorie, description) avec bouton "Ajouter" réutilisant tel quel `addProjectSkillDemo`. Nouveau champ `category` sur `Skill` (AD-4) pour les 3 skills existantes.

**Décisions (Checkpoint 1) :** hors mode démo, comportement strictement inchangé -- le message "pas encore disponible" reste seul, la popup n'existe qu'en démo. L'enrichissement du catalogue (10 skills de plus) est découpé et différé (`deferred-work.md`) : la popup est livrée avec les 3 skills actuelles, ses catégories sont dérivées du catalogue pour absorber les futures entrées sans changement.

## Boundaries & Constraints

**Always :** la popup est une surface de l'`OverlayProvider` (AD-8, id `'add-skill'` conservé) -- Échap et clic hors du panneau la ferment. L'ajout passe exclusivement par `addProjectSkillDemo` (AD-2). Les skills déjà chargées restent listées, marquées "Déjà chargée" (bouton désactivé). Recherche côté client, insensible à la casse et aux accents, sur nom + description + catégorie. Microcopie en français ; `--color-ai-accent` réservé à l'icône skill (DESIGN.md).

**Never :** aucun changement hors mode démo, de schéma DB, ni de `ProjectSkillSummary`/`listProjectSkills`/`addProjectSkillDemo`. Pas de nouvelles skills au catalogue (différé). Pas de vue détail, notation ou création de skill. Aucune dépendance npm.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouverture | démo actif, clic "Ajouter une skill" | popup centrée, fond assombri, focus dans la recherche, catégorie "Toutes" | N/A |
| Recherche | saisie "redaction" | skills dont nom/description/catégorie contient "rédaction" (accents ignorés) | aucune → "Aucune skill ne correspond à « … »." |
| Navigation | clic sur une catégorie | liste filtrée, combinée à la recherche en cours | N/A |
| Ajout | "Ajouter" sur une skill non chargée | popup fermée, `router.refresh()`, skill visible dans "Skills chargées" | `ok: false` → message `role="alert"`, popup reste ouverte |
| Déjà chargée | skill dans `skills` | badge "Déjà chargée", bouton désactivé | N/A |
| Lecture échouée | `skills === null` | aucun "Ajouter" actif (état inconnu) | message du panneau inchangé |
| Hors démo | démo inactif, clic | message "pas encore disponible" actuel, pas de popup | N/A |

</frozen-after-approval>

## Code Map

- `components/SkillsPanel.tsx` -- trigger + menu actuel (l.101-180) ; garder le trigger, `handleAdd` (l.68-84), la branche hors démo et le rendu des skills chargées ; en démo, remplacer le menu par la popup.
- `components/OverlayProvider.tsx` -- `openOverlay`/`closeOverlay`/`contentRef` ; Échap et clic extérieur déjà gérés, ne pas modifier.
- `skills/catalog.ts` -- `Skill` + `SKILL_CATALOG` (3 entrées) ; seuls consommateurs : `actions/skill.ts` (lecture par clé) et `SkillsPanel.tsx`.
- `app/globals.css` -- `.skill-add-overlay`/`.skill-add-catalog-entry` (l.~425-460) ; réutiliser `.card`, `--space-*`, `--radius-*`, `--elevation-dropdown`.

## Tasks & Acceptance

**Execution:**
- [x] `skills/catalog.ts` -- ajouter `category: string` à `Skill` ; `references` → "Capitalisation", `rfp-drafting` → "Avant-vente", `mission-scoping` → "Cadrage de mission".
- [x] `components/SkillCatalogDialog.tsx` (nouveau, client) -- popup : titre, recherche, catégories dérivées du catalogue avec compteur (+ "Toutes"), cartes, état vide, erreur ; props `skills`, `isPending`, `error`, `onAdd`, `onClose`, `contentRef`.
- [x] `components/SkillsPanel.tsx` -- en démo et overlay ouvert, rendre `SkillCatalogDialog` ; supprimer l'ancien menu démo ; retour du focus sur le trigger à la fermeture.
- [x] `app/globals.css` -- fond assombri, panneau (~720px, max 80vh, liste scrollable), catégories, cartes ; supprimer `.skill-add-catalog-entry` devenue morte.

**Acceptance Criteria:**
- Given la popup ouverte, when Échap ou clic sur le fond, then elle se ferme et le focus revient sur "Ajouter une skill".
- Given une autre surface flottante ouverte, when on ouvre la popup, then la précédente se ferme (AD-8).
- Given la popup ouverte, then `role="dialog"`, `aria-modal="true"`, `aria-labelledby` sur le titre, et Tab reste piégé à l'intérieur.

## Design Notes

Modale plutôt que menu ancré : recherche + catégories + cartes ne tiennent pas dans la sidebar. L'ancien menu évitait `role="dialog"` faute de piège de focus ; cette popup implémente piège et retour du focus, le rôle devient légitime. Le fond assombri est hors de `contentRef` : un clic dessus ferme via le handler existant de l'`OverlayProvider`.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npx next build --turbopack` -- expected: build OK

**Manual checks (if no CLI):**
- En démo sur le projet RFP Acme : ouvrir la popup, chercher "cadrage", filtrer par catégorie, ajouter `mission-scoping`, vérifier qu'elle apparaît dans "Skills chargées" et est "Déjà chargée" à la réouverture. Hors démo : message inchangé.

## Implementation Notes

- `skills/catalog.ts` : `category` ajouté (Capitalisation / Avant-vente / Cadrage de mission).
- `components/SkillCatalogDialog.tsx` (nouveau) : portail sur `document.body`, fond assombri hors `contentRef` (le clic ferme via le handler de l'`OverlayProvider`), panneau `role="dialog"`/`aria-modal`/`aria-labelledby`, piège de Tab (Tab/Maj+Tab bouclent dans le panneau), focus initial sur la recherche, recherche normalisée NFD sans diacritiques sur nom + description + catégorie, catégories dérivées du catalogue (ordre d'apparition) avec compteur combiné à la recherche, "Toutes" en tête, état vide "Aucune skill ne correspond à « … ».", badge "Déjà chargée" + bouton désactivé, boutons tous désactivés si `skills === null` ou `isPending`, erreur `role="alert"`. Bouton "Fermer" ajouté dans l'en-tête.
- `onPointerDown` du fond : `preventDefault()` (sans stopper la propagation) -- sans lui, le mousedown de compatibilité rendait immédiatement le focus au `<body>` juste après que `SkillsPanel` l'avait replacé sur le trigger (constaté en navigateur).
- `components/SkillsPanel.tsx` : en démo, rend la popup ; hors démo, overlay "pas encore disponible" inchangé (le `contentRef` n'est posé sur le wrapper du trigger que hors démo). Retour du focus sur le trigger à chaque transition ouvert→fermé de la popup démo. `aria-haspopup="dialog"` sur le trigger en démo uniquement. `availableToAdd` et l'import `SKILL_CATALOG` supprimés.
- `app/globals.css` : `.skill-add-catalog-entry` supprimée, classes `.skill-catalog-*` ajoutées (720px max, 80vh max, liste scrollable, empilement sous 640px).

Vérification : `npx tsc --noEmit` et `npx next build --turbopack` propres. Navigateur (dev server, démo actif, RFP Acme) : ouverture centrée + focus recherche ; "redaction" → Rédaction de réponse RFP ; "zzz" → état vide ; "cadrage" → Note de cadrage (compteurs 1/0/0/1) ; filtre Capitalisation ; piège Tab dans les deux sens ; Échap, clic sur le fond et "Fermer" ferment avec focus sur "Ajouter une skill" ; ouverture pendant que le sélecteur de projet est ouvert → ce dernier se ferme (AD-8) ; hors démo → message inchangé, pas de popup (démo réactivé ensuite). **Non vérifié en navigateur** : l'ajout réel -- les 3 skills étaient déjà chargées sur RFP Acme (toutes "Déjà chargée"), `handleAdd`/`addProjectSkillDemo` inchangés.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence / resolution |
|---|---|---|---|---|---|
| 1 | blind-hunter, edge-case (x3) | Focus trap is a panel `onKeyDown`: once focus lands on `<body>` (click on panel text, or the clicked "Ajouter" becoming `disabled` while pending), Tab escapes into the page behind the modal; the `!contains(active)` recovery branch can never run. | medium | patch | Verified: a keydown whose target is `<body>` never reaches the panel handler, so the AC "Tab reste piégé" fails in those cases. Fix: trap on a `document` keydown listener. |
| 2 | blind-hunter, edge-case (x2) | Modal overflow: under 640px the list has no `min-height: 0` and the panel no `overflow`, so content spills past 80vh; the categories column has no scroll if categories grow. | low | patch | Verified in `app/globals.css`; direct CSS correction. |
| 3 | blind-hunter, edge-case | `skills === null`: every "Ajouter" is disabled with no reason shown in the dialog; the panel's error caption sits behind the backdrop. | low | patch | Verified; one-line caption in the dialog. |
| 4 | blind-hunter | Disabled "Déjà chargée" button keeps `aria-label="Ajouter {name}"`, no reason given to screen readers. | low | patch | Verified; direct label correction. |
| 5 | blind-hunter | Accent-stripping regex written with literal invisible combining characters. | low | patch | Verified (bytes are U+0300–U+036F, correct but invisible); replace with `̀-ͯ` escapes. |
| 6 | blind-hunter | Backdrop colour hard-coded `rgba(...)` instead of a `:root` token. | low | patch | Verified; every other colour in the file is a token. |
| 7 | blind-hunter, edge-case | No body scroll lock / `inert` on the background while the modal is open. | low | reject | Real but unlikely to be met in a demo (wheel over backdrop only); fix adds a new effect and state restoration — rejected per the low-severity rule. |
| 8 | blind-hunter | No progress indicator while an add is pending. | low | reject | Same as every other "action -> `router.refresh()`" flow in the app; fix adds branches; not required by the spec. |
| 9 | blind-hunter | Focus return after a backdrop click relies on `pointerdown` `preventDefault` behaviour that may differ across browsers. | maybe-false | reject | Worked in the tested browser; would settle with a Safari/Firefox check; worst case is `low` (focus on `<body>`). |
| 10 | blind-hunter | `category: string` allows a typo to create a duplicate category. | low | reject | The fix changes a spec decision (`category: string`, derived list) — rejected per rule. |
| 11 | blind-hunter, verification-gap (x2) | No automated tests for search/normalize, enablement rule, focus trap. | medium | defer | Pre-existing: the repo has no test harness (tests explicitly deferred in ARCHITECTURE-SPINE), and the spec forbids new npm dependencies. |
| 12 | blind-hunter | Diff omits the spec and `deferred-work.md`; a JSX comment mixes French and English. | — | false | The spec is deliberately withheld from this layer; French comments are already the norm across this codebase (e.g. "Tour 2" comments in `SkillsPanel.tsx`/`actions/skill.ts`). |
| 13 | verification-gap | The spec's manual add check was never run. | — | false | Run by the orchestrator after implementation (DB backed up and restored): on "Audit interne", adding "Rédaction de réponse RFP" closed the dialog, the skill appeared in "Skills chargées", focus returned to the trigger, and on reopen all 3 cards showed "Déjà chargée" with disabled buttons. |
| 14 | edge-case | Escape in the search field closes the whole dialog instead of clearing the query. | low | reject | Matches the spec's AC ("Échap ... ferme"); a clear-first behaviour would add a branch against stated intent. |
