---
title: "Changement de projet à la volée"
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7f1e151a5f8c5389b40ee8dd6612be6c0e2b7068'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Une fois un projet Octopod actif, rien dans l'UI ne permet d'en choisir un autre -- la seule voie est de supprimer `db/local.db` (déferré depuis la Story 1.2 : "no UI affordance to switch to a different active project once one is selected").

**Approche :** Le nom du projet dans la barre du haut devient un déclencheur qui rouvre le même dropdown `ProjectSelector` déjà utilisé à la sélection initiale (Story 1.2) -- pas un nouveau composant. `selectProject` (`actions/project.ts`) supporte déjà un appel répété (upsert sur `APP_STATE`, jamais un insert conditionnel) : aucun changement serveur nécessaire, seule l'UI manque.

## Boundaries & Constraints

**Always :** `ProjectSelector` reste le seul composant de sélection de projet (Story 1.2) -- étendu par une prop optionnelle plutôt que dupliqué. Le projet actif apparaît dans la liste rouverte, visuellement distingué (`aria-selected`, non cliquable) plutôt qu'exclu -- le consultant doit pouvoir confirmer quel projet est actif sans deviner. Choisir un projet différent déclenche `selectProject` puis `router.refresh()`, exactement le chemin déjà emprunté à la première sélection -- aucune confirmation supplémentaire (aucune autre action de ce projet n'en demande pour un changement de contexte équivalent, ex. changer de conversation).

**Never :** Aucun changement à `actions/project.ts`/`selectProject` (déjà générique). Aucune tentative de préserver un état d'un projet à l'autre (conversation active, brouillon composer) -- chaque panneau se re-dérive déjà de `activeProject.id` au prochain rendu, comme au premier chargement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clic sur le nom du projet actif | Projet actif, autres projets disponibles | Dropdown s'ouvre, liste tous les projets, celui actif visuellement marqué | N/A |
| Choix d'un autre projet dans le dropdown rouvert | Liste chargée | `selectProject` appelé, dropdown se ferme, page rafraîchie sur le nouveau projet (nouvelle conversation active, nouveaux panneaux) | Échec `selectProject` -> message d'erreur affiché dans le dropdown, resté ouvert |
| Clic sur le projet déjà actif dans la liste rouverte | -- | Aucune action (élément non cliquable) | N/A |
| Échec de `listProjects` au moment de rouvrir | Provider indisponible | Même message d'échec que Story 1.2 ("Impossible de charger les projets Octopod"), dropdown reste utilisable pour fermer | N/A |

</frozen-after-approval>

## Code Map

- `components/ProjectSelector.tsx` -- ajoute une prop optionnelle `activeProject: ProjectSummary | null` (défaut `null`, comportement Story 1.2 inchangé). Si fourni : le déclencheur (`button-primary` "Se connecter à un projet Octopod") devient le nom du projet actif dans le style `text-heading` existant du top bar, avec un chevron ; dans la liste, l'entrée dont `p.id === activeProject.id` gagne `aria-selected="true"` et `disabled`, style visuellement atténué au lieu du `nav-row` cliquable normal.
- `app/page.tsx` -- dans la branche "projet actif" (ligne ~164-168), remplace `<span className="text-heading">{activeProject.name}</span>` par `<ProjectSelector projects={projects} activeProject={activeProject} />`. Ajoute `listProjects()` au `Promise.all` existant (ligne ~86-104) -- même raisonnement de parallélisation que les lectures déjà groupées là.
- `app/globals.css` -- nouvelle classe pour le déclencheur variant top-bar (nom + chevron, `text-heading`, pas de fond `button-primary`) ; réutilise `.project-selector`/`.project-selector-dropdown`/`.project-selector-dropdown ul`/`.project-selector-error` tels quels.

## Tasks & Acceptance

**Execution:**
- [x] `components/ProjectSelector.tsx` -- prop `activeProject`, déclencheur variant, marquage de l'entrée active dans la liste
- [x] `app/page.tsx` -- monter `ProjectSelector` dans le top bar quand un projet est actif ; paralléliser `listProjects()`
- [x] `app/globals.css` -- classe du déclencheur variant top-bar

**Acceptance Criteria:**
- Given un projet actif, when je clique sur son nom dans la barre du haut, then le dropdown des projets Octopod s'ouvre avec le projet actif visuellement distingué
- Given ce dropdown ouvert, when je choisis un autre projet, then la page se recharge entièrement sur ce nouveau projet (conversation, panneaux, stepper) sans passer par la suppression de `db/local.db`
- Given le dropdown ouvert sur un autre overlay déjà ouvert ailleurs dans l'app (ex. sélecteur de modèle), when j'ouvre celui-ci, then l'autre se ferme (`OverlayProvider`, comportement déjà garanti par Story 1.2, non ré-implémenté)

## Implementation Notes

Implémenté par un subagent qui, en dehors de son mandat (implémenter et rapporter), a lui-même déclenché les 3 lentilles de revue (blind-hunter, edge-case-hunter, verification-gap) au lieu de laisser l'orchestrateur s'en charger, et a positionné `status: 'in-review'` de son propre chef -- ces deux actions relèvent normalement de l'orchestrateur, jamais du subagent d'implémentation (discipline établie sur ce projet). Les 3 résultats produits ont néanmoins été traités comme des candidats de revue à part entière : chaque finding a été re-vérifié indépendamment par l'orchestrateur directement dans le code (jamais accepté tel quel) avant triage ci-dessous -- la rigueur de vérification n'a pas été compromise, seul le processus de dispatch a dévié.

`.text-heading` sur le nouveau déclencheur top-bar (`className="project-selector-trigger text-heading"`) : confirmé compatible, `.text-heading` ne définit que la typographie (pas de `display`/`background`), donc se combine proprement avec les propriétés de layout de `.project-selector-trigger`.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmé par l'orchestrateur, trouvé indépendamment par les 3 lentilles.** L'entrée active de la liste rouverte utilise `opacity: 0.6; cursor: default` (`.project-selector-option-active`) -- exactement le motif `:disabled` déjà établi partout ailleurs dans ce projet (`.button-primary:disabled`, `.model-selector-trigger:disabled`, etc.), alors que `.nav-row-active` (fond `--color-selected-tint`, texte gras) existe déjà et signifie précisément "élément actuellement sélectionné" (utilisé ailleurs, ex. `ConversationList`). Combiné à l'attribut natif `disabled` sur ce `<button>`, l'élément sort aussi du parcours de tabulation clavier, empêchant probablement l'annonce de `aria-selected="true"` par les lecteurs d'écran -- violant directement le Always de ce spec ("le consultant doit pouvoir confirmer quel projet est actif sans deviner") pour les utilisateurs clavier/lecteur d'écran, même si l'effet visuel fonctionne à la souris. `aria-selected` n'est en outre posé que sur l'entrée active (`undefined` ailleurs plutôt que `false`), incohérent pour un listbox à sélection unique. | Medium | Patch | **Appliqué et re-vérifié par l'orchestrateur.** L'entrée active utilise maintenant `.nav-row-active` (au lieu du look `:disabled`) ; `disabled` natif remplacé par `aria-disabled="true"` + une garde dans `handleChoose` (reste focusable/annoncé) ; `aria-selected` posé en booléen explicite (`true`/`false`) sur chaque option. `npx tsc --noEmit` et `npx next build --turbopack` re-exécutés propres. |
| 2 | Trouvé par la lentille blind-hunter : le nouveau déclencheur top-bar n'a pas de nom accessible distinct du nom du projet -- un lecteur d'écran l'annonce comme un bouton portant juste le nom du projet, sans indiquer qu'il ouvre un sélecteur. | Low | Patch | **Appliqué et re-vérifié par l'orchestrateur.** `aria-label` ajouté au déclencheur (`` `${activeProject.name} — changer de projet` ``) ; le texte visible reste inchangé. |
| 3 | Trouvé par la lentille edge-case-hunter (confiance normale) : `activeProject.name` (lu via `getActiveProject()`) et `p.name` dans la liste rouverte (lu via `listProjects()`, appel concurrent séparé) pourraient diverger si les données Octopod changent entre les deux lectures. | Low | Defer | Non atteignable avec l'adaptateur mock actuel (données statiques, déterministes) -- même catégorie que les entrées déjà différées de ce projet ("revisit quand un vrai `DriveProvider`/provider existe"). Loggé en addendum à `deferred-work.md`. |
| 4 | Trouvé par la lentille edge-case-hunter (auto-déclaré `confidence: low`) : si `listProjects()` réussit mais omet l'id du projet actif, celui-ci s'afficherait comme une option cliquable ordinaire plutôt que distinguée. | Low | Defer | Spéculatif, non atteignable avec l'adaptateur mock actuel (source unique et cohérente pour les deux lectures) -- même famille que le finding #3, loggé ensemble. |
| 5 | Trouvé par la lentille blind-hunter : le déroulement `ok ? data : null` de `listProjectsResult` est écrit une seconde fois dans `app/page.tsx` sans helper partagé. | Low | Reject | Ce fichier applique déjà ce même idiome une ligne à 6 autres résultats (`conversationsResult`, `documentsResult`, `skillsResult`, `livrablesResult`, etc.) sans jamais le factoriser -- cohérent avec la convention déjà en place dans ce fichier précis, pas une duplication nouvellement introduite par ce diff. |
| 6 | Trouvé par la lentille blind-hunter : aucun test automatisé ajouté pour la nouvelle logique conditionnelle de `ProjectSelector`. | False | Reject | Identique au précédent déjà établi dans ce projet (spec-4-4, spec-4-5, spec-fiabilite-revision-suggestions) : aucun framework de test n'existe nulle part dans ce projet, contrainte acceptée et documentée (`ARCHITECTURE-SPINE.md`). |
| 7 | Trouvé par l'orchestrateur en lisant le diff : les commentaires de code introduits référencent "Story 1.6", un numéro de story qui n'existe dans aucun fichier de suivi (`sprint-status.yaml`) -- source de confusion pour un futur lecteur qui chercherait ce numéro. | Low | Patch | **Appliqué par l'orchestrateur.** Commentaires reformulés pour référencer ce spec par son nom de fichier plutôt qu'un numéro de story inventé. |

Verification-gap lens: no formal verification gap found (no test framework anywhere, confirmed pre-existing/systemic; both capabilities traced to their real consumers; `npx tsc --noEmit` re-run clean) — its one "other" observation is folded into finding #1 above (independently corroborating the same root cause as blind-hunter).

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre

**Manual checks (if no CLI):**
- Avec 2 projets fixtures : sélectionner le premier, rouvrir le dropdown depuis le top bar, vérifier que le premier est marqué actif et non cliquable, choisir le second, vérifier que tout le workspace (conversation, stepper, panneaux) reflète bien le second projet après rafraîchissement.
- Revenir au premier projet de la même manière -- vérifier l'aller-retour sans jamais toucher `db/local.db`.
- **Non exercé dans cette session** : le serveur de dev n'a pas pu être lancé (restriction d'environnement -- session non-interactive à l'origine). Vérifié à la place par lecture directe du code patché (comportement du guard `handleChoose`, attributs `aria-*`, classe `.nav-row-active`) plus `tsc`/`build` propres -- pas un test visuel réel dans un navigateur. À vérifier manuellement dans le navigateur avant de considérer le parcours UI définitivement validé.
