---
title: 'Story 3.1 : Stepper de workflow (avant-vente)'
type: 'feature'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b1b120b07499e2a3e92591868949e2f4f4d90696'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-conversations-multiples-et-selection-active.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Une fois connecté à un projet avant-vente, rien ne structure la progression du consultant dans son processus de qualification — les conversations existent (Epic 2) mais rien ne représente "où j'en suis" ni ne permet de naviguer entre des étapes fixes.

**Approche :** Ajouter `CONVERSATION.stepKey` (nullable, unique par `(projectId, stepKey)` quand non nul — AD-6), une fonction pure `domain/workflow.ts` calculant le statut visuel (terminée/active/à venir) de chacune des 4 étapes fixes à partir du `stepKey` de la conversation active, une Server Action `selectStep` qui trouve-ou-crée la conversation de l'étape cliquée et l'active, et un composant `Stepper` affiché au-dessus de la grille de travail.

## Boundaries & Constraints

**Always :** 4 étapes fixes, dans cet ordre : Qualification → Références → Experts → Rédaction (clés `qualification`/`references`/`experts`/`redaction`). Cliquer une étape trouve-ou-crée sa conversation pour le projet actif et l'active (AD-6, même mécanique que `createConversation`/`selectConversation` de la Story 2.1/2.2). Le statut de chaque étape (terminée/active/à venir) est calculé par une fonction pure dans `domain/workflow.ts` à partir de la position ordinale de l'étape par rapport à celle de la conversation active — `domain/` n'importe ni `db/`, ni `integrations/`, ni `actions/`, ni React (AD-5). Le violet (`ai-accent`) n'est jamais utilisé ici — c'est une navigation pilotée par l'utilisateur, pas un élément d'origine IA.

**Never :** cette story ne distingue pas les projets avant-vente des projets mission — le stepper s'affiche sans condition pour tout projet actif ; distinguer les deux types de projet et adapter/masquer le stepper pour le cas mission est la responsabilité explicite de la Story 3.2 (FR-15/OQ-3 du PRD, et AD-6 de `ARCHITECTURE-SPINE.md` note explicitement "pas de modélisation dédiée tant que ce n'est pas tranché" — ce n'est pas un oubli, c'est un séquencement déjà décidé par le découpage `epics.md`). Pas de suggestion proactive (Story 3.3). Ne pas toucher aux 2 conversations fixtures existantes par projet (Story 2.1) — elles gardent `stepKey = null`, un état valide et non ambigu (conversations libres, pas rattachées à une étape). Ne pas toucher `SkillsPanel.tsx`, `LivrablesPanel.tsx`, `ContextPanel.tsx`, `MattermostPanel.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clic sur une étape sans conversation existante | Étape "à venir" ou "terminée" jamais cliquée pour ce projet | Une nouvelle conversation est créée avec ce `stepKey`, devient active, le centre se met à jour | N/A |
| Clic sur une étape déjà visitée | Une conversation avec ce `stepKey` existe déjà pour ce projet | Cette conversation devient active (pas de doublon créé) | N/A |
| Clic sur l'étape déjà active | `stepKey` de l'étape cliquée == celui de la conversation active | Aucun effet (même garde que `ConversationList.handleSelect`) | N/A |
| Échec de `selectStep` | Erreur DB lors du find-or-create | Le stepper ne change pas d'état, message d'erreur affiché | Retour `{ok:false,error}`, pas de crash |

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- ajouter `stepKey: text('step_key')` (nullable) à la table `conversation` existante ; ajouter un index unique partiel sur `(project_id, step_key)` où `step_key IS NOT NULL` via `uniqueIndex(...).on(...).where(sql\`...\`)` de `drizzle-orm/sqlite-core` (pas de précédent dans ce repo pour un index partiel -- syntaxe Drizzle standard, à vérifier dans sa doc/types). `npm run db:generate` ensuite ; pas de piège NOT-NULL-sans-default ici (colonne nullable, pas de backfill).
- `actions/conversation.ts` -- étendre le type `ConversationSummary` (FR-10 : ce n'est pas du contenu, l'ajout est sûr) avec `stepKey: string | null` ; ajouter cette colonne aux `SELECT` de `listConversations` et `getActiveConversation`. Ajouter `selectStep(projectId: string, stepKey: string): Promise<ActionResult<void>>` -- même transaction synchrone find-or-create que `createConversation` (lignes ~326-353) : cherche une ligne `conversation` avec `(projectId, stepKey)`, sinon en crée une (titre = le libellé français de l'étape, ex. "Qualification"), puis met à jour `PROJECT.activeConversationId` -- tout dans un seul `db.transaction` synchrone, même raison que `createConversation`/`seedFixturesIfEmpty` (pas d'`await` entre la vérification et l'écriture).
- `domain/workflow.ts` (nouveau, premier fichier de ce dossier -- actuellement vide, `domain/.gitkeep`) -- constante ordonnée `STEPS: {key: string; label: string}[]` (qualification/références/experts/rédaction) ; fonction pure `computeStepStatuses(activeStepKey: string | null): {key: string; label: string; status: 'done' | 'active' | 'upcoming'}[]` -- une étape avant la position de `activeStepKey` dans `STEPS` est `'done'`, celle qui correspond est `'active'`, les suivantes sont `'upcoming'` ; si `activeStepKey` est `null` ou ne correspond à aucune étape (conversation libre, pas de step), toutes les étapes sont `'upcoming'`.
- `components/Stepper.tsx` (nouveau) -- client component, mêmes `useTransition`/`isPending`/garde de réentrance/`router.refresh()` que `ConversationList.tsx` (`handleSelect`) ; reçoit `projectId` et `steps` (déjà calculés par `domain/workflow.ts`) ; un clic appelle `selectStep(projectId, stepKey)`.
- `app/page.tsx` -- importer `domain/workflow.ts`, calculer `steps = computeStepStatuses(activeConversationResult.ok ? activeConversationResult.data?.conversation.stepKey ?? null : null)`, rendre `<Stepper projectId={activeProject.id} steps={steps} />` entre le `<header className="top-bar">` et `<div className="workspace-grid">`.
- `app/globals.css` -- nouvelles classes `.stepper`/`.stepper-step` (états terminée/active/à venir) réutilisant `--color-accent`/`--color-selected-tint`/`--color-text-muted` (jamais `--color-ai-accent`, réservé à l'IA) -- premier besoin de ces états visuels précis, à créer.

## Tasks & Acceptance

**Execution:**
- [x] `db/schema.ts` + migration -- `conversation.stepKey` nullable + index unique partiel `(project_id, step_key)` -- AD-6
- [x] `actions/conversation.ts` -- `stepKey` sur `ConversationSummary`, `selectStep` -- AD-2, AD-6
- [x] `domain/workflow.ts` -- `STEPS` + `computeStepStatuses` (fonction pure) -- AD-5, réalise FR-16
- [x] `components/Stepper.tsx` -- rendu des 4 étapes + clic -- réalise FR-14/FR-16
- [x] `app/page.tsx` -- calcul des statuts + câblage du `Stepper` au-dessus de la grille -- réalise FR-14
- [x] `app/globals.css` -- styles des 3 états visuels du stepper -- réalise FR-16 (distinction visuelle)

**Acceptance Criteria:**
- Given un projet actif sans conversation d'étape existante, when le consultant clique une étape du stepper, then une conversation est créée pour cette étape et devient active, l'historique du centre se met à jour
- Given une étape déjà visitée, when le consultant la re-clique, then la conversation existante de cette étape redevient active, sans doublon créé
- Given le stepper affiché, when on inspecte son état visuel, then l'étape active est visuellement pleine, les étapes précédentes affichent un état "terminé" distinct, les suivantes restent neutres
- Given les 2 conversations fixtures existantes d'un projet (Story 2.1), when le stepper s'affiche, then elles n'apparaissent dans aucune étape (elles gardent `stepKey = null`) et le stepper affiche son état par défaut (aucune étape "active" tant qu'aucune conversation d'étape n'a été sélectionnée)

## Implementation Notes

Implémenté par un subagent dédié selon le Code Map. `conversation.stepKey` (nullable) et un index unique partiel `(project_id, step_key)` (`db/schema.ts`, migration `db/migrations/20260917132231_clear_eddie_brock/`) ; `domain/workflow.ts` (premier fichier de ce dossier) expose `STEPS`, `StepKey`, `computeStepStatuses` — vérifié sans aucun import (AD-5 respecté). `actions/conversation.ts` ajoute `stepKey` à `ConversationSummary`, aux `SELECT` de `listConversations`/`getActiveConversation`, et `selectStep(projectId, stepKey)` en transaction synchrone find-or-create-puis-active, même forme que `createConversation`. `components/Stepper.tsx` reprend exactement le motif `useTransition`/garde de réentrance/`router.refresh()` de `ConversationList.tsx` (dont la garde de réentrance avait été corrigée pendant la rétrospective de l'Epic 2 — reprise ici correctement dès le départ, pas répétée).

Orchestrateur : Reviewer Gate indépendante à trois lentilles menée sur le diff avant tout commit (voir Review Triage Log). Un correctif a été appliqué suite à cette revue : `selectStep` ne validait pas `stepKey` contre les 4 clés fixes de `STEPS` avant d'écrire en base — un appel direct à cette Server Action avec une valeur arbitraire aurait créé une conversation permanente, jamais rattachable à aucune étape du stepper, et jamais nettoyable depuis l'UI. Corrigé en miroir du garde-fou déjà établi pour `sendMessage`/`MODELS` (Epic 2 retro) : `selectStep` rejette maintenant toute clé hors liste avant tout accès DB.

**Note de correction :** le rapport initial du subagent d'implémentation s'attribuait à tort un correctif sur l'horodatage des messages fixtures (`seedFixturesIfEmpty`'s `fixtureCreatedAt`). La revue "gaps de vérification" a tracé ce code par `git log -S` et confirmé qu'il existait déjà dans le commit de base (`b1b120b`, hérité de la Story 2.5 / rétrospective Epic 2) — ce diff ne le touche pas du tout. Aucune trace de cette fausse attribution n'avait été écrite dans ce fichier ; signalé ici uniquement pour mémoire du processus.

## Review Triage Log

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | `selectStep` n'validait pas `stepKey` contre les 4 clés fixes avant d'écrire en base. Trouvé indépendamment par les trois lentilles. | Medium | Patch | Garde ajoutée (`STEPS.find(...)`, retour `{ok:false, error:'Étape invalide.'}` avant tout accès DB), miroir du garde-fou déjà établi pour `sendMessage`/`MODELS`. Revérifié : `tsc --noEmit` propre. |
| 2 | L'index unique partiel `(project_id, step_key)` n'a été vérifié que par lecture de code et par insertion directe SQL, jamais par une vraie requête concurrente (deux clics simultanés sur la même étape jamais visitée, depuis deux clients). Trouvé par les trois lentilles. | Low (latent, pattern déjà accepté pour `createConversation`/`seedFixturesIfEmpty`) | No action | Le mécanisme (driver `node:sqlite` synchrone, transaction unique sans `await`) est identique à celui déjà en production depuis l'Epic 2 ; même limite de vérification déjà actée dans la rétrospective de l'Epic 2 pour le même motif. |
| 3 | Rapport initial de l'implémenteur s'attribuant à tort le correctif de l'horodatage des messages fixtures, en réalité déjà présent dans le commit de base. | — (erreur de reporting, pas un bug de code) | Verify | Tracé par `git log -S` par la revue gaps de vérification : le code en question existait déjà avant cette story (Story 2.5 / rétrospective Epic 2). Jamais écrit dans ce fichier — corrigé ici pour mémoire. |
| — | Index unique partiel testé en direct (insertion dupliquée réellement rejetée, NULL multiples acceptés), `domain/workflow.ts` vérifié sans aucun import, migration regénérée à l'identique dans un worktree isolé (pas de dérive manuelle), les 4 AC + les 2 conversations fixtures revérifiées en direct par les trois lentilles, comportement ordinal (étape sautée affichée "terminée") confirmé conforme à la lettre de la spec, pas un bug | — | No action | Vérifiés indépendamment par les trois revues — corrects tels qu'implémentés. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre (revérifié après le correctif de validation)
- `npx next build --turbopack` -- build propre (revérifié après le correctif)

**Manual checks — tous effectués en direct, par l'implémenteur puis indépendamment par les trois lentilles de revue :**
- Projets seed chargés, étapes cliquées dans l'ordre et en sautant une étape (Qualification → Experts) -- une conversation créée par étape cliquée, activation correcte, état visuel terminé/actif/à venir conforme (comportement ordinal, une étape sautée s'affiche "terminée" -- comportement voulu, conforme à la lettre de la spec).
- Étape déjà visitée re-cliquée -- même conversation réutilisée, confirmé par requête SQL directe (une seule ligne par `step_key`, aucun doublon).
- Reload après avoir avancé de plusieurs étapes -- stepper correctement redérivé depuis `activeConversation.stepKey`.
- Les 2 conversations fixtures (Story 2.1) gardent `step_key` NULL, jamais rattachées à une étape.
- Index unique partiel testé par insertion SQL directe : rejette un doublon `(project_id, step_key)` non nul, accepte plusieurs lignes `step_key NULL`.
- Migration régénérée à l'identique dans un worktree isolé -- pas de dérive manuelle.
- Après correctif (validation de `stepKey`) : reverifié en direct dans le navigateur, clic sur "Qualification" crée et active la conversation correctement ; `tsc`/`build` repassés propres.
