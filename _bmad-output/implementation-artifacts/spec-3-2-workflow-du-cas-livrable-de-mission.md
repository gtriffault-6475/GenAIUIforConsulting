---
title: 'Story 3.2 : Workflow du cas "livrable de mission"'
type: 'feature'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9888c201012b6d33a6bc589c2907eebb54795f65'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-stepper-de-workflow-avant-vente.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Le stepper avant-vente (Story 3.1) s'affiche sans condition pour tout projet actif, y compris les projets mission — pour lesquels il ne s'applique pas (FR-15). Rien dans l'app ne sait aujourd'hui distinguer un projet avant-vente d'un projet mission.

**Approche :** Ajouter `type: 'avant-vente' | 'mission'` à `OctopodProject` (port + mock) et à `PROJECT` — une donnée qui vient d'Octopod comme `octopodProjectRef`/`mattermostChannelRef`, pas un concept inventé localement — persistée par `selectProject` exactement comme les champs existants. Dans `app/page.tsx`, n'afficher le `Stepper` que pour un projet `avant-vente`. La capacité "créer et utiliser une conversation sans étape associée" pour un projet mission est déjà pleinement couverte par le mécanisme existant de la Story 2.2 (`createConversation` pose déjà `stepKey: null`) — rien de nouveau à construire sur ce point (OQ-3 du PRD est ainsi tranché : pas de stepper dédié, une conversation libre suffit, comme illustré par UJ-2 du PRD).

## Boundaries & Constraints

**Always :** `type` vient d'Octopod comme les autres métadonnées de projet — ajouté au port `ProjectProvider`/`OctopodProject` et à son adaptateur mock, jamais un concept purement local ; persisté et rafraîchi par `selectProject` à chaque sélection, exactement comme `octopodProjectRef`/`mattermostChannelRef` (jamais figé sur une valeur de migration périmée). Colonne `PROJECT.type` `NOT NULL` avec un défaut explicite dans le schéma Drizzle (`.default('avant-vente')`) — évite le piège NOT-NULL-sans-défaut déjà rencontré et documenté (Story 2.5, `message.createdAt`). Le projet RFP seed (`proj-acme-rfp`) est `avant-vente`, le projet mission seed (`proj-audit-mission`) est `mission` (cohérent avec leurs `octopodProjectRef` déjà seedés `OCTO-AV-...`/`OCTO-MI-...`). Le `Stepper` (Story 3.1) ne s'affiche que pour `activeProject.type === 'avant-vente'`.

**Never :** pas de stepper dédié au cas mission — OQ-3 est tranché par cette story : aucune modélisation d'étapes pour ce cas, une conversation libre suffit. Ne pas masquer ni modifier "Nouvelle conversation" pour un projet mission — elle reste disponible et fonctionne à l'identique (déjà `stepKey: null` depuis la Story 2.2). Pas de suggestion proactive (Story 3.3). Ne pas toucher la logique interne de `components/Stepper.tsx`/`domain/workflow.ts` au-delà de leur condition d'affichage dans `app/page.tsx` — leur comportement pour un projet avant-vente reste exactement celui de la Story 3.1, sans régression.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Projet type mission actif | `activeProject.type === 'mission'` | Aucun stepper affiché ; "Nouvelle conversation" et le reste de l'espace de travail inchangés | N/A |
| Projet type avant-vente actif | `activeProject.type === 'avant-vente'` | Stepper affiché, comportement identique à la Story 3.1 (aucune régression) | N/A |
| Re-sélection d'un projet déjà en base | Un projet dont le `type` a été seedé lors d'un `selectProject` précédent | `type` rafraîchi depuis Octopod à chaque sélection, jamais une valeur de migration périmée | N/A |

</frozen-after-approval>

## Code Map

- `integrations/ports/project-provider.ts` -- ajouter `type: 'avant-vente' | 'mission'` à `OctopodProject`.
- `integrations/mock/project-provider.ts` -- ajouter `type: 'avant-vente'` à `proj-acme-rfp`, `type: 'mission'` à `proj-audit-mission` dans `SEED_PROJECTS`.
- `db/schema.ts` -- ajouter `type: text('type', { enum: ['avant-vente', 'mission'] }).notNull().default('avant-vente')` à la table `project` existante. `npm run db:generate` ensuite -- le défaut explicite dans le schéma évite le prompt interactif de `drizzle-kit` pour une colonne `NOT NULL` sans défaut sur une table non vide (piège déjà documenté par la Story 2.5).
- `actions/project.ts` -- `selectProject` : `tx.insert(project).values(octopodProject)` porte déjà `type` via le spread (aucun changement nécessaire côté insert) ; ajouter `type: octopodProject.type` à la clause `set` de `onConflictDoUpdate` (lignes ~97-101), même motif que `mattermostChannelRef`.
- `app/page.tsx` -- entourer le rendu de `<Stepper projectId={activeProject.id} steps={steps} />` (posé par la Story 3.1, entre `.top-bar` et `.workspace-grid`) d'une condition `activeProject.type === 'avant-vente'`.

## Tasks & Acceptance

**Execution:**
- [x] `integrations/ports/project-provider.ts` -- `type` sur `OctopodProject` -- FR-15
- [x] `integrations/mock/project-provider.ts` -- `type` seedé sur les deux projets -- crédibilité round 1
- [x] `db/schema.ts` + migration -- `project.type` NOT NULL avec défaut -- évite le piège NOT-NULL-sans-défaut
- [x] `actions/project.ts` -- `type` rafraîchi dans `selectProject` -- cohérence avec `octopodProjectRef`/`mattermostChannelRef`
- [x] `app/page.tsx` -- `Stepper` conditionné à `type === 'avant-vente'` -- réalise l'AC de la Story 3.2

**Acceptance Criteria:**
- Given un projet de type mission, when le consultant ouvre l'espace de travail, then aucun stepper avant-vente ne s'impose
- Given ce même projet mission, when le consultant clique "Nouvelle conversation", then il obtient une conversation libre sans étape associée, comme avant cette story
- Given un projet de type avant-vente, when le consultant ouvre l'espace de travail, then le stepper s'affiche exactement comme en Story 3.1 (aucune régression)

## Implementation Notes

Implémenté selon le Code Map. `OctopodProject` (`integrations/ports/project-provider.ts`) porte désormais `type: 'avant-vente' | 'mission'` ; le mock (`integrations/mock/project-provider.ts`) seed `proj-acme-rfp` en `avant-vente` et `proj-audit-mission` en `mission`, cohérent avec leurs `octopodProjectRef` `OCTO-AV-...`/`OCTO-MI-...` déjà en place. `db/schema.ts` ajoute `project.type` (`NOT NULL`, `.default('avant-vente')`) ; migration `db/migrations/20260917163154_charming_shooting_star/`. `app/page.tsx` entoure `<Stepper .../>` d'une condition `activeProject.type === 'avant-vente'` ; `computeStepStatuses`/`domain/workflow.ts` intouchés au-delà de cette condition, comme prescrit.

**Orchestrateur : Reviewer Gate indépendante à trois lentilles menée sur le diff avant tout commit** (voir Review Triage Log). Un correctif substantiel a été appliqué suite à cette revue — voir finding #1.

## Review Triage Log

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | **Régression confirmée par les trois lentilles, reproduite en direct par l'orchestrateur.** La migration (`ALTER TABLE project ADD type ... DEFAULT 'avant-vente' NOT NULL`) rétro-remplit *toutes* les lignes `project` déjà en base avec `'avant-vente'`, y compris un projet mission déjà actif avant cette story. Comme `selectProject` (seul point de rafraîchissement de `type`) n'est appelable que depuis `ProjectSelector`, lui-même affiché uniquement quand *aucun* projet n'est actif, rien ne rappelle jamais `selectProject` pour un projet déjà actif — le mauvais `type` restait donc figé **de façon permanente**, pas seulement transitoire, contredisant directement le "Always" de la spec ("jamais une valeur de migration périmée"). | High | Patch | `getActiveProject` (`actions/project.ts`) appelle désormais `projectProvider.getProject(...)` et resynchronise la ligne `PROJECT` (même logique que `listDocuments`, "sync puis lecture") à *chaque* lecture du projet actif, pas seulement à la sélection — extrait un helper partagé `syncProjectRow` (paramétré sur `db` ou `tx`) réutilisé par `selectProject` et `getActiveProject`, éliminant au passage la duplication de la clause `onConflictDoUpdate`. Un échec du provider retombe sur la ligne locale existante plutôt que de faire échouer toute la page. Reproduit en direct par l'orchestrateur (migration rejouée sur une base isolée simulant un projet mission déjà actif avant la story) : `type` corrigé dès la première lecture, sans re-sélection ; chemin heureux (les deux projets seed sélectionnés frais) revérifié sans régression. `tsc`/`build` repassés propres. |
| 2 | L'index/contrainte `type` n'a de garantie qu'au niveau TypeScript (l'enum Drizzle), aucune contrainte `CHECK` en base ; une valeur hors des deux littéraux connus échouerait silencieusement fermé (pas de stepper) plutôt que bruyamment. Trouvé par les trois lentilles. | Low (latent, mock n'émet que les 2 valeurs connues) | No action | Échoue dans le sens sûr (pas de stepper affiché par erreur) ; pas de risque réel tant que seul le mock alimente `type`. À revisiter si un vrai provider Octopod est un jour branché. |
| 3 | Une revue (gaps de vérification) a rencontré une erreur "readonly database" et une corruption apparente de `db/local.db` pendant ses propres tests. | — (probable artefact de méthode, pas un bug du diff) | No action | Cause probable : accès concurrent au même fichier SQLite depuis `sqlite3` CLI et le process `next dev` (`journal_mode` non-WAL) pendant les tests de la revue elle-même — chemin de code non touché par ce diff (`actions/conversation.ts`, `selectStep`). La revue l'a elle-même qualifié d'inconclusif et a nettoyé le fichier corrompu. |
| — | Chemins heureux des 2 types de projet, non-régression du stepper avant-vente, persistance de `type`, absence de risque TypeScript strict, cohérence de l'enum entre le port/le mock/le schéma, aucun autre lecteur de `ProjectSummary` affecté | — | No action | Vérifiés indépendamment par les trois revues et revérifiés par l'orchestrateur après le correctif — corrects tels qu'implémentés. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre

**Manual checks — tous effectués en direct :**
- Projet seed mission (`proj-audit-mission`) chargé -- absence de stepper confirmée, "Nouvelle conversation" fonctionne normalement (conversation libre créée et activée).
- Projet seed avant-vente (`proj-acme-rfp`) chargé -- stepper affiché, clic sur "Qualification" active l'étape avec l'état visuel plein attendu, comportement identique à la Story 3.1.
- Vérifié en base (`sqlite3 db/local.db`) : `project.type` = `'mission'` pour `proj-audit-mission`, `'avant-vente'` pour `proj-acme-rfp`, après sélection de chaque projet via l'UI.
- **Scénario de migration sur donnée pré-existante (finding #1), reproduit par l'orchestrateur** : base isolée reconstruite avec le schéma d'avant cette story, une ligne `proj-audit-mission` insérée manuellement et activée (simulant un projet déjà sélectionné avant la Story 3.2), puis la migration `type` rejouée par-dessus -- confirmé que la ligne héritait bien du défaut erroné (`avant-vente`) juste après la migration. Après correctif, chargement de la page corrige `type` dès la première lecture (`getActiveProject`), sans aucune re-sélection -- confirmé en base et visuellement (aucun stepper affiché).
