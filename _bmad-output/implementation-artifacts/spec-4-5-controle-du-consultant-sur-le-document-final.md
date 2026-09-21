---
title: "Story 4.5 : Contrôle du consultant sur le document final"
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '72bd1339e780259ea36b96546815b419e713759f'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-revision-globale.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** FR-23/FR-24 exigent qu'aucune modification IA (ancrée ou globale) ne s'applique jamais sans acceptation explicite du consultant. Cette garantie transversale, construite au fil des Stories 4.2-4.4, n'a jamais été vérifiée de bout en bout comme un tout.

**Approche :** Audit ciblé des trois chemins d'écriture de `LIVRABLE.content` (création, `acceptSuggestion`, `updateLivrableWithSuggestions`) et des trois transitions de `SUGGESTION` (accepter/rejeter/retravailler) contre cette garantie -- aucun nouvel écran, epic-4-context.md l'a toujours qualifiée de "contrainte transversale vérifiée à travers 4.2, 4.3 et 4.4", jamais d'un nouveau composant.

## Boundaries & Constraints

**Always :** Le contenu d'un livrable ne change que par une action explicite et traçable du consultant -- écrire un document, cliquer Accepter, ou soumettre une révision globale -- jamais par un mécanisme autonome (aucune tâche de fond, minuteur, ou cron n'existe dans ce projet, confirmé par audit du code). Rejeter et Retravailler ne modifient jamais `LIVRABLE.content`. Tant qu'une suggestion ancrée reste `pending` ou `revising`, le texte qu'elle propose vit uniquement dans `SUGGESTION.text`, jamais dans `LIVRABLE.content`.

**Never :** Pas de nouvel écran ni de nouvelle action utilisateur. Pas de mode de configuration "auto-application". Pas de changement de code en réaction au risque de faux positif du tool `propose_livrable_content` (Option A retenue -- statu quo, documentation seule).

**Décision (Open Question résolue) :** Le seul chemin où `LIVRABLE.content` change sans qu'une suggestion distincte ne soit explicitement traitée est l'invocation du tool `propose_livrable_content` lui-même (création initiale ou mise à jour, Story 4.4) -- guidée uniquement par le jugement du modèle, jamais conditionnée à une confirmation du consultant. Depuis la Story 4.4, un faux positif sur un message hors sujet écraserait silencieusement un livrable existant (avant 4.4, un faux positif ne créait qu'un livrable isolé et inoffensif). Statu quo retenu : ce risque, déjà logué comme compromis architectural accepté depuis la Story 4.2 (`deferred-work.md`, angle coût/latence), est documenté sous cet angle plus sévère (écrasement silencieux) dans `deferred-work.md` -- aucun changement de code.

</frozen-after-approval>

## Code Map

- `actions/livrable.ts` -- `createLivrableWithSuggestions`, `updateLivrableWithSuggestions` : les deux seuls chemins qui écrivent `LIVRABLE.content`, tous deux déclenchés depuis `executeTool` (`actions/conversation.ts`), lui-même déclenché uniquement par un `sendMessage` explicite (Composer ou `GlobalRevisionField`).
- `actions/suggestion.ts` -- `acceptSuggestion` (seul chemin qui écrit `LIVRABLE.content` hors création/révision, gardé par un clic explicite), `rejectSuggestion`/`reworkSuggestion` (jamais de `LIVRABLE.content`).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- met à jour l'entrée Story 4.2 sur l'offre inconditionnelle de l'outil avec l'angle écrasement-silencieux ci-dessus.

## Tasks & Acceptance

**Execution:**
- [x] Audit des chemins d'écriture ci-dessus contre les Boundaries -- consigner les résultats dans Implementation Notes
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- documenter le risque sous l'angle écrasement-silencieux (Option A)

**Acceptance Criteria:**
- Given n'importe quelle suggestion ancrée proposée par l'IA, when elle est `pending` ou `revising`, then le contenu du livrable reste inchangé
- Given une suggestion rejetée ou en cours de retravail, when j'inspecte le livrable, then son contenu n'a jamais reflété le texte de cette suggestion
- Given le code de ce projet, when on cherche un mécanisme d'auto-application (tâche de fond, minuteur, mode de configuration), then aucun n'existe

## Implementation Notes

Audit only -- aucun changement de code (le Code Map ne listait déjà que `deferred-work.md` comme fichier modifié). Les trois chemins d'écriture de `LIVRABLE.content` et les trois transitions de `SUGGESTION` ont été relus directement dans le code actuel (baseline `72bd133`) :

- **`createLivrableWithSuggestions` (`actions/livrable.ts`)** -- déclenché uniquement depuis `executeTool` (`actions/conversation.ts`'s `sendMessage`), lui-même appelé depuis exactement deux sites : `components/Composer.tsx` (envoi explicite d'un message) et `actions/livrable.ts`'s `requestGlobalRevision` (soumission explicite de `GlobalRevisionField.tsx`). Grep de tout le projet (`sendMessage(`) confirme qu'aucun autre appelant n'existe. Conforme.
- **`updateLivrableWithSuggestions` (`actions/livrable.ts`)** -- même point d'entrée unique (`executeTool`), branché après un `SELECT` sur `conversationId`. Avant de régénérer `content.blocks`, transitionne vers `rejected` toute suggestion `anchored` encore `pending` **ou** `revising` (`inArray(suggestion.status, ['pending', 'revising'])`, patché lors de la review de la Story 4.4) -- confirmé en lisant le code, aucune régression depuis. Conforme aux Boundaries : le texte d'une suggestion non traitée ne rejoint jamais `content` par ce chemin.
- **`acceptSuggestion` (`actions/suggestion.ts`)** -- vérifie `status !== 'pending'` à l'intérieur de la transaction (avant tout `await`), refuse sinon ; seul chemin qui écrit `LIVRABLE.content` hors création/révision, gardé par un clic explicite (aucun appelant que `SuggestionCard.tsx`, non ré-audité ligne à ligne ici mais son unique action serveur est `acceptSuggestion`). Conforme.
- **`rejectSuggestion` (`actions/suggestion.ts`)** -- ne touche jamais `livrable` : sa transaction ne référence que la table `suggestion` (`tx.update(suggestion)...`), aucun `tx.update(livrable)` nulle part dans la fonction. Conforme.
- **`reworkSuggestion` (`actions/suggestion.ts`)** -- deux phases (`pending`→`revising` puis `revising`→`pending`+nouveau texte ou révert), aucune des deux ne touche `livrable` : la fonction ne fait que lire `livrable.content` (pour construire le contexte envoyé à l'agent) sans jamais l'écrire. Le nouveau texte proposé reste dans `SUGGESTION.text`, toujours `pending` au retour, jamais appliqué au document. Conforme.
- **Mécanisme d'auto-application** -- grep du projet entier (`setInterval`, `setTimeout`, `cron`, `node-cron`, `node-schedule`, `worker_threads`, `BullMQ`, `queue`) hors `node_modules`/`.next` : un seul résultat de code, `integrations/mock/with-latency.ts`'s `setTimeout` qui simule un délai réseau sur un mock et ne mute jamais `LIVRABLE`/`SUGGESTION` -- aucun minuteur, tâche de fond, ou cron réel n'existe. Confirmé. Au-delà des constructs JS, aucun répertoire `.github` n'existe dans ce repo (donc aucun workflow CI/CD planifié) et aucune migration sous `db/migrations/` ne contient `CREATE TRIGGER` (aucun trigger SQL) -- pas de chemin d'auto-application côté CI/CD ou base de données non plus.
- **`requestGlobalRevision` (`actions/livrable.ts`, Story 4.4)** -- ne lit que `livrable.conversationId` et délègue intégralement à `sendMessage` (`actions/conversation.ts`) ; elle n'écrit jamais `SUGGESTION`/`LIVRABLE` elle-même et ne contourne donc pas l'invariant audité -- elle route par le même chemin déjà audité `executeTool` → `updateLivrableWithSuggestions` ci-dessus.

Seul point notable (déjà anticipé par l'Intent/Boundaries, pas une découverte) : le tool `propose_livrable_content` lui-même (`skills/propose_livrable_content.ts`, invoqué par le modèle) reste le seul chemin où `content` change sans qu'une `SUGGESTION` distincte n'ait été explicitement traitée -- guidé uniquement par le jugement du modèle. Depuis la Story 4.4, si ce tool est invoqué à tort sur une conversation qui a déjà un livrable, il écrase silencieusement son `content` (branche `updateLivrableWithSuggestions`) plutôt que de simplement créer un livrable isolé et inoffensif comme avant 4.4. Décision déjà actée dans les Boundaries de ce spec : statu quo (Option A), documenté avec cet angle plus sévère dans `deferred-work.md` (entrée Story 4.2 mise à jour), aucun changement de code.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | Found by the blind-hunter lens (grouped with #10): the Verification section asserts `npx tsc --noEmit` is clean and that specific greps returned specific results, but pastes no actual command output — a reader cannot confirm the claims without re-running everything themselves; the Acceptance Criteria reference a search for autonomous mechanisms with no reproducible detail. | Low | Patch | **Applied and re-verified by the orchestrator.** Verification section now includes the literal output of `npx tsc --noEmit` (empty/clean) and the exact matches of both greps (`sendMessage(` and the cron/timer pattern), independently re-run by the orchestrator and matching the implementer's claims exactly. |
| 2 | Found by the blind-hunter lens: the "no autonomous mechanism" audit greps only JS-level constructs (`setInterval`, `cron`, `BullMQ`, etc.) and never explicitly checks for scheduled CI/CD workflows (`.github/workflows/*.yml`) or DB-level triggers in the Drizzle migrations — the Boundaries claim "confirmé par audit du code" without acknowledging this scope gap. | Low | Patch | **Applied and re-verified by the orchestrator.** Implementation Notes now states `.github/workflows` does not exist in this repo (confirmed: no `.github` directory at all) and no migration under `db/migrations/` contains `CREATE TRIGGER` (confirmed via grep) — independently re-checked by the orchestrator. |
| 3 | Found by the blind-hunter lens: the audit never explicitly states whether Story 4.4's global-revision flow (`requestGlobalRevision`/`GlobalRevisionField.tsx`) touches `SUGGESTION` itself or bypasses it, leaving this story's newest-covered path's relationship to the audited invariant unstated. | Low | Patch | **Applied and re-verified by the orchestrator.** Implementation Notes now states `requestGlobalRevision` (`actions/livrable.ts`) only reads the livrable's `conversationId` and calls `sendMessage`, routing through the exact same already-audited `executeTool` → `updateLivrableWithSuggestions` path — confirmed by reading `requestGlobalRevision`'s body directly (lines 367-399): no direct `SUGGESTION`/`LIVRABLE` write of its own. |
| 4 | Found by the blind-hunter lens: the concurrency claim ("le check `status !== 'pending'` et l'écriture... avant tout `await`, donc pas de double-application possible sur double-clic") only rules out single-event-loop interleaving, not two concurrent DB connections/server instances each opening a transaction independently — stated as settled without naming the transaction isolation level. | False | Reject | Confirmed by the orchestrator against `db/client.ts`: this project uses exactly one `node:sqlite` `DatabaseSync` connection for the entire application, in a single process (explicitly documented there: "Round 1 has no separate deploy/migrate step (single process, single machine)"). There is no second connection or server instance that could race this one — the scenario the finding describes cannot occur in this architecture. |
| 5 | Found by the blind-hunter lens: the same paragraph about `propose_livrable_content`'s silent-overwrite risk is restated three times (Boundaries, Implementation Notes, deferred-work.md) with slightly different wording, creating drift risk. | Low | Reject | Matches this project's established documentation pattern across every prior Epic 4 spec: Boundaries states the decision, Implementation Notes records the audit finding, and `deferred-work.md` is the standalone external tracking log read by a different, later audience — collapsing these to one canonical source is more than a direct/trivial fix and not something a reader would encounter as harmful. |
| 6 | Found by the blind-hunter lens: the spec's Boundaries labels the mitigation "Option A" but the added `deferred-work.md` text never uses that label, weakening traceability between the two documents. | Low | Patch | **Applied and re-verified by the orchestrator.** The `deferred-work.md` entry now parenthetically references "(Option A, spec Story 4.5)" alongside the restated risk — confirmed by reading the file directly. |
| 7 | Found by the blind-hunter lens: `sprint-status.yaml` shows `4-5-...: in-progress` while the spec's own frontmatter is further along (`in-review`) and all tasks are checked `[x]` — three signals disagreeing on the story's actual state. | False | Reject | Identical precedent already logged in spec-4-4's Review Triage Log (finding #5): artifact of the diff snapshot taken mid-workflow, before this step's own finalization reconciles `sprint-status.yaml` to the story's true final status — not a defect in the delivered work. |
| 8 | Found by the blind-hunter lens: the spec's `context:` frontmatter list omits `deferred-work.md`, the one file this story's Code Map says it directly edits. | N/A | Reject | Fix requires editing this build's spec's own frontmatter — out of scope for the review/patch loop per this workflow's own rule ("reject any finding whose fix is to edit this build's spec"). The implementer located and correctly edited the right `deferred-work.md` entry regardless, so no actual bad outcome resulted. |
| 9 | Found by the blind-hunter lens: no automated regression test locks in the FR-23/FR-24 guarantee this story audits, leaving it unprotected against silent regression in future stories. | False | Reject | Identical precedent already logged in spec-4-4's Review Triage Log (finding #7): this entire project has no test framework anywhere (independently confirmed), an explicit, project-wide, already-accepted constraint (`ARCHITECTURE-SPINE.md`'s Deferred section) — not something one story's diff should unilaterally introduce. |
| 10 | Found by the blind-hunter lens (grouped with #1): the Acceptance Criteria are phrased as Given/When/Then but are unfalsifiable as written — no reference to where/how the "no autonomous mechanism" search was performed, so a third party cannot re-run it to confirm the criterion still holds later. | Low | Patch | Same fix as #1 — see above: the Verification section now names the exact grep patterns used and their literal output, making the criterion reproducible. |

Edge-case-hunter lens: zero findings (empty list, explicitly re-checked per its own instructions). Verification-gap lens: clean — no code changed by this story, only documentation/tracking files, so nothing to verify against tests.

## Verification

**Commands:**

`npx tsc --noEmit` -- propre, aucune erreur de type (aucun changement de code dans cette story, uniquement `deferred-work.md` et ce spec) :
```
$ npx tsc --noEmit
(sortie vide, exit code 0)
```

`grep -rn "sendMessage(" --include="*.ts" --include="*.tsx" . --exclude-dir=node_modules --exclude-dir=.next` -- confirme exactement deux appelants de `sendMessage` en plus de sa propre déclaration :
```
components/Composer.tsx:85:        const result = await sendMessage(activeConversationId, trimmedContent, model);
actions/livrable.ts:391:    return await sendMessage(row.conversationId, instructions, MODELS[0].id);
actions/conversation.ts:460:export async function sendMessage(
```

`grep -rn "setInterval\|setTimeout\|cron\|node-cron\|node-schedule\|background\|worker_threads\|BullMQ\|queue" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "\.next/"` -- aucun mécanisme d'auto-application, seulement un mock de latence et deux commentaires :
```
app/livrables/[id]/page.tsx:41:  // same spirit as other silent background-read failures in this app
integrations/mock/with-latency.ts:6:  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
components/ProactiveSuggestion.tsx:107:        // shape elsewhere (no visible error for a background reassertion).
```

`npx next build --turbopack` -- non ré-exécuté : aucun changement de code n'a eu lieu (audit + documentation seule), condition de la ligne ci-dessus non remplie.

**Manual checks (effectués) :**
- Relu `acceptSuggestion`/`rejectSuggestion`/`reworkSuggestion` (`actions/suggestion.ts`) -- confirmé que `rejectSuggestion` ne référence jamais la table `livrable` (aucun `tx.update(livrable)`/`db.update(livrable)` dans la fonction) et que `reworkSuggestion` ne fait que *lire* `livrable.content` (pour construire le contexte envoyé à l'agent), sans jamais l'écrire ; son nouveau texte reste dans `SUGGESTION.text`, statut `pending`, jamais appliqué au document.
- Relu `createLivrableWithSuggestions`/`updateLivrableWithSuggestions` (`actions/livrable.ts`) -- confirmé que les deux sont exportées et appelées uniquement depuis `executeTool` (`actions/conversation.ts`).
- Relu `acceptSuggestion` (`actions/suggestion.ts`) -- confirmé que le check `status !== 'pending'` et l'écriture de `content` se font dans la même transaction synchrone, avant tout `await`, donc pas de double-application possible sur double-clic.
- Vérifié l'absence de `.github` (`ls .github` -> "No such file or directory") et l'absence de tout `CREATE TRIGGER` sous `db/migrations/` (`grep -rni "CREATE TRIGGER" db/` -> aucun résultat) -- pas de CI/CD planifiée ni de trigger SQL comme mécanisme d'auto-application alternatif.
