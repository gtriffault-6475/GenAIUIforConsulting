---
title: "Colonne d'ordre pour garantir l'ordre de chargement des skills (AD-11)"
type: 'bugfix'
created: '2026-09-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
baseline_commit: '7362a7ed2f4e976a2741f4162dbca3aed2417f06'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-16.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** `epic-2-retro-item-14` ("ajouter une colonne d'ordre à `project_skill` pour garantir l'ordre de chargement des skills, AD-11", epic-2-retro-2026-09-16.md). `listProjectSkills`/`listLoadedSkillInstructions` (`actions/skill.ts`) n'appliquent aucun `ORDER BY` explicite et s'appuient sur l'ordre de retour implicite de SQLite. Vérifié en direct sur `db/local.db` : `EXPLAIN QUERY PLAN` montre que SQLite satisfait le `WHERE project_id = ?` via l'index unique `(project_id, skill_key)`, donc les lignes reviennent triées alphabétiquement par `skill_key`, pas par ordre d'insertion -- ce qui inverse déjà silencieusement l'ordre réel pour `proj-audit-mission` aujourd'hui (`mission-scoping` avant `references`, alors que `FIXTURE_PROJECT_SKILLS` insère `references` en premier). Pas un risque théorique futur : un bug déjà présent et reproductible.

**Approche :** Colonne `position` (entier, nullable comme `suggestion.resolvedPosition` -- un `DEFAULT` unique ne peut pas exprimer une valeur distincte par ligne) ajoutée à `project_skill` via migration Drizzle, backfillée par ordre de `rowid` actuel (préserve l'ordre d'insertion réel, celui que `FIXTURE_PROJECT_SKILLS` avait toujours voulu). `seedFixturesIfEmpty` (`actions/skill.ts`, seul point d'écriture, AD-2) fixe désormais `position` explicitement à l'insertion (index dans le tableau de fixtures). Les deux fonctions de lecture ajoutent `.orderBy(asc(projectSkill.position))`.

## Implementation Notes

`db/schema.ts` : `position: integer('position')` ajouté à `projectSkill`, commentaire du header réécrit pour documenter le bug vérifié (query plan réel cité) et pourquoi la colonne reste nullable au niveau schéma (jamais `null` en pratique, seul `seedFixturesIfEmpty` écrit dans cette table).

Migration générée via `npm run db:generate` (`db/migrations/20260923155036_perpetual_martin_li/migration.sql`) : `ALTER TABLE project_skill ADD position integer;` suivi d'un `UPDATE` de backfill par sous-requête corrélée (`COUNT(*) ... WHERE rowid <= rowid` par projet, équivalent vérifié à `ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY rowid)` -- pas utilisable directement dans le `SET` d'un `UPDATE` SQLite).

`actions/skill.ts` : `seedFixturesIfEmpty` fixe `position` via `fixtureSkillKeys.forEach((skillKey, position) => ...)`. `listProjectSkills`/`listLoadedSkillInstructions` ajoutent `.orderBy(asc(projectSkill.position))`. Commentaire de `listLoadedSkillInstructions` sur l'"ordre de chargement" (AD-11) réécrit pour citer la colonne plutôt que l'ordre implicite.

Un serveur `next dev` orphelin (démarré plus tôt dans cette session, avant l'existence de cette migration) bloquait l'application de la migration (`database is locked`) -- arrêté avant de relancer le build.

`npx tsc --noEmit` et `npx next build --turbopack` propres. Script `tsx` jetable confirmant contre `db/local.db` réelle : backfill correct (`references`=0/`rfp-drafting`=1 pour `proj-acme-rfp` ; `references`=0/`mission-scoping`=1 pour `proj-audit-mission`, l'ordre exact que `FIXTURE_PROJECT_SKILLS` avait toujours voulu) et `listProjectSkills`/`listLoadedSkillInstructions` renvoient désormais cet ordre pour les 2 projets fixtures -- 3/3 assertions passées, notamment la régression `proj-audit-mission` qui était inversée avant ce correctif.

Blind-hunter (subagent, contexte libre) a trouvé 8 points -- voir Review Triage Log. Trois erreurs de commentaire réelles corrigées (Tour 1) : référence croisée "above"/"below" inversée vers `suggestion.resolvedPosition`, exemple d'ordre alphabétique énoncé à l'envers (`mission-scoping` précède bien `references`, pas l'inverse), et une phrase alambiquée mélangeant "le mécanisme d'écriture actuel" et "la fonctionnalité différée" -- reformulée en deux clauses distinctes. `tsc --noEmit`/`next build --turbopack` revérifiés propres après ces 3 corrections (commentaires uniquement, aucun changement de comportement).
</frozen-after-approval>

## Review Triage Log

| # | Finding | Verdict | Route | Résolution |
|---|---|---|---|---|
| 1 | `db/schema.ts:170` : référence croisée "like `suggestion.resolvedPosition` above" -- `suggestion` est déclarée plus bas dans le fichier, pas au-dessus. | Low | Patch | Corrigé : "above" -> "below". |
| 2 | `db/schema.ts:168-169` : l'exemple illustrant le bug est énoncé à l'envers -- alphabétiquement `mission-scoping` précède `references` (`m` < `r`), pas l'inverse comme l'écrivait le commentaire. | Low | Patch | Reformulé pour énoncer la comparaison dans le bon sens. |
| 3 | `db/schema.ts:156-158` : la phrase mélange "le mécanisme d'écriture actuel" (`seedFixturesIfEmpty`) et "la fonctionnalité différée" (PRD OQ-6) dans une seule parenthèse alambiquée, lisible comme si `seedFixturesIfEmpty` était la fonctionnalité différée elle-même. | Low | Patch | Scindé en deux phrases distinctes. |
| 4 | Aucune contrainte au niveau schéma ne garantit `position` non-null -- seule la convention dans `seedFixturesIfEmpty` (seul point d'écriture aujourd'hui) l'assure ; une future fonctionnalité "ajouter une skill" (différée, PRD OQ-6) pourrait insérer sans `position`. | Low (aucun chemin d'écriture atteignable aujourd'hui ne le permet) | Defer | Pertinent seulement quand la fonctionnalité "ajouter une skill" sera construite -- logué dans `deferred-work.md`. |
| 5 | Aucune contrainte d'unicité sur `(project_id, position)` -- rien n'empêche aujourd'hui, en théorie, deux lignes du même projet de finir avec la même position. | Low (aucun chemin d'écriture atteignable aujourd'hui ne produit ce cas) | Defer | Même raisonnement que #4 -- pertinent avec la future fonctionnalité "ajouter une skill", pas avant. Logué dans `deferred-work.md`. |
| 6 | Le nouveau `.orderBy(asc(projectSkill.position))` n'a pas d'index dédié -- `EXPLAIN QUERY PLAN` confirmé : `USE TEMP B-TREE FOR ORDER BY`. | Low | Reject | Négligeable à l'échelle réelle de cette table (un catalogue de skills fixe, une poignée de lignes par projet, prototype mono-machine round 1) -- un tri en mémoire de quelques lignes ne coûte rien d'observable. |
| 7 | Le backfill de la migration (sous-requête corrélée `COUNT(*)`) est O(n²) -- ne passerait pas à l'échelle si `project_skill` grossissait significativement. | Low | Reject | Même raisonnement que #6 : la table ne contient aujourd'hui que 4 lignes au total (2 projets fixtures x 2 skills), migration exécutée une seule fois. |
| 8 | Le chemin de récupération de race d'`db/client.ts` (`catch` de la boucle de migration) ne reconnaît que les échecs `already exists` via un regex `CREATE (TABLE\|INDEX\|UNIQUE INDEX)` -- un échec `duplicate column name` (le cas d'une migration `ALTER TABLE ADD COLUMN` concurrente) ne serait jamais reconnu comme tolérable. | -- | **Faux** | Vérifié : cette limitation existe déjà identiquement dans 4 migrations `ALTER TABLE` déjà livrées avant ce spec (`message.created_at`, `conversation.step_key`, `project.type`, `suggestion.resolved_position`) -- ce n'est pas la première migration `ALTER`, contrairement à ce qu'affirmait le finding, et ce spec n'introduit ni n'aggrave un risque déjà présent et déjà accepté depuis plusieurs migrations. |
