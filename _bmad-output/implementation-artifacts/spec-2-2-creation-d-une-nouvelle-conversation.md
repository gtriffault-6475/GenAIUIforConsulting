---
title: 'Story 2.2 : Création d''une nouvelle conversation'
type: 'feature'
created: '2026-09-15'
status: 'done'
baseline_commit: '436e4abc8d61e396b961d76590ff098376012bf4'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-conversations-multiples-et-selection-active.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Un consultant ne peut aujourd'hui choisir qu'entre les conversations déjà existantes (fixtures seedées par la Story 2.1) — rien ne permet de démarrer un nouvel échange vide sans mélanger les sujets dans une conversation existante.

**Approche :** Ajouter `createConversation(projectId)` à `actions/conversation.ts` (insère une ligne `CONVERSATION` vide avec un titre par défaut, positionne `PROJECT.activeConversationId` sur cette nouvelle conversation, dans le même style `db.transaction` synchrone que `seedFixturesIfEmpty`) et une entrée "Nouvelle conversation" en tête de `components/ConversationList.tsx`, au-dessus de la liste, qui l'appelle et rafraîchit la page — même schéma `useTransition`/`router.refresh()` que `handleSelect`.

## Boundaries & Constraints

**Always :** la nouvelle conversation est créée sans message et devient immédiatement la conversation active (AD-6 : `PROJECT.activeConversationId` reste la seule source de vérité). Mutation exclusivement via `actions/conversation.ts` (AD-2). Le titre par défaut est une chaîne française fixe ("Nouvelle conversation"), vouvoiement non applicable ici (pas de phrase adressée à l'utilisateur), sans emoji/exclamation. L'entrée "Nouvelle conversation" réutilise le style `.nav-row` existant plutôt que d'introduire un nouveau composant de bouton.

**Never :** pas de renommage de conversation (hors scope de l'épic). Pas de limite au nombre de conversations créables. Ne pas toucher `seedFixturesIfEmpty` ni les fixtures de la Story 2.1. Pas de confirmation/dialogue avant création — un clic crée directement, conformément à l'AC ("Given je clique 'Nouvelle conversation', Then un fil vide est créé et devient immédiatement actif", aucune étape intermédiaire décrite).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création réussie | Projet actif avec 0+ conversations existantes | Nouvelle conversation vide créée, devient immédiatement active, apparaît dans la liste | N/A |
| Échec de la Server Action | Insertion DB échoue | La liste et la sélection active restent inchangées | Message d'erreur affiché sous la liste (même pattern que `handleSelect`) |
| Clics multiples rapides | Double-clic sur "Nouvelle conversation" | Une seule conversation créée, pas de doublon | Bouton désactivé pendant `isPending` (mirrors `handleSelect`'s `disabled={isPending}`) |

</frozen-after-approval>

## Code Map

- `actions/conversation.ts` -- ajouter `createConversation(projectId: string): Promise<ActionResult<ConversationSummary>>` : insère une ligne `conversation` (titre par défaut `'Nouvelle conversation'`), positionne `project.activeConversationId` sur son id, dans un `db.transaction` synchrone (même style que `seedFixturesIfEmpty:98-139`) pour rester atomique.
- `components/ConversationList.tsx` -- ajouter une entrée/bouton "Nouvelle conversation" au-dessus de la `<ul>` (ligne ~56), `onClick` appelle `createConversation(projectId)` dans le même `startTransition` + `router.refresh()` que `handleSelect` (lignes 27-41) ; nécessite de passer `projectId` en prop depuis `app/page.tsx` (actuellement non transmis, seuls `conversations`/`activeConversationId` le sont).
- `app/page.tsx` -- passer `activeProject.id` en prop `projectId` à `ConversationList`.

## Tasks & Acceptance

**Execution:**
- [x] `actions/conversation.ts` -- ajouter `createConversation` -- AD-2, AD-6
- [x] `app/page.tsx` -- transmettre `projectId` à `ConversationList` -- nécessaire pour l'appel de création
- [x] `components/ConversationList.tsx` -- entrée "Nouvelle conversation", câblage `createConversation` -- AC Story 2.2

**Acceptance Criteria:**
- Given un projet connecté, when le consultant clique "Nouvelle conversation", then un fil vide est créé et devient immédiatement la conversation active (ligne `nav-row-active` sur la nouvelle entrée, colonne centrale vide).
- Given la création échoue côté serveur, when l'erreur revient, then la sélection active précédente reste affichée et un message d'erreur apparaît, sans conversation fantôme dans la liste.

## Implementation Notes

**Note de l'orchestrateur :** le subagent d'implémentation a positionné le `status` de cette spec à `review` et l'entrée `sprint-status.yaml` correspondante à `review` lui-même — hors de son mandat (même écart que documenté dans `spec-1-5-panneau-mattermost.md`). L'orchestrateur a corrigé le `status` en `in-review` à la réception du rapport et mène maintenant son propre Reviewer Gate indépendant (trois angles de revue en parallèle) avant de fixer un statut final, conformément au processus établi depuis l'incident de la Story 1.2.

Auto-approuvé (aucun réviseur humain disponible dans cette exécution autonome) — l'auto-revue par rapport au standard READY FOR DEVELOPMENT est passée proprement, aucune Open Question n'est restée en suspens.

**Rapport de l'implémenteur :** suit le Code Map sans déviation.

`createConversation` (`actions/conversation.ts`) insère la ligne `CONVERSATION` (titre fixe `'Nouvelle conversation'`, sans `MESSAGE`) et positionne `PROJECT.activeConversationId` dans le même `db.transaction` synchrone que `seedFixturesIfEmpty`, pour la même raison que documentée sur ce helper : pas de frontière `await` entre l'insertion et la mise à jour de l'id actif, donc aucun lecteur concurrent ne peut observer l'un sans l'autre.

`components/ConversationList.tsx` réutilise l'`isPending` existant (`useTransition`) partagé entre `handleSelect` et le nouveau `handleCreate` : le bouton "Nouvelle conversation" est donc désactivé pendant n'importe quelle transition en cours (sélection ou création), ce qui couvre le scénario "clics multiples rapides" de la matrice sans état `isPending` séparé. Le bouton reste `.nav-row` (pas de nouveau composant), placé au-dessus de la `<ul>`, toujours visible (y compris liste vide ou en échec de chargement) puisque la spec ne prévoit aucune condition pour le masquer.

`app/page.tsx` transmet `projectId={activeProject.id}` à `ConversationList` ; aucun autre appelant du composant n'existe.

**Fix de l'orchestrateur après le Reviewer Gate** (voir Review Triage Log ci-dessous) : ajout d'une garde synchrone `if (isPending) return;` en tête de `handleCreate` (`components/ConversationList.tsx`), identique dans l'esprit au correctif déjà posé sur `AddDocumentForm.tsx` en Story 1.4 (finding #2) — ferme la fenêtre entre l'appel à `startTransition` et le commit React qui désactive réellement le bouton dans le DOM, avant qu'un second déclenchement (répétition clavier, technologie d'assistance) ne puisse créer une seconde conversation fantôme.

## Spec Change Log

## Review Triage Log

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | `handleCreate` (`ConversationList.tsx`) n'avait aucune garde synchrone de ré-entrée, contrairement à `handleSelect` (garde par valeur identique). `disabled={isPending}` ne prend effet qu'après le commit React — un second déclenchement avant ce commit (répétition clavier, technologie d'assistance, contention du thread principal) créerait une seconde conversation vide fantôme, jamais sélectionnée (dernière écriture de `activeConversationId` gagne). Trouvé par la revue cas limites. | Medium | Patch | Garde `if (isPending) return;` ajoutée en tête de `handleCreate`, même pattern que le correctif de la Story 1.4 (finding #2 de son propre Review Triage Log). `npx tsc --noEmit` et `npx next build --turbopack` revérifiés propres après le patch. |
| 2 | `seedFixturesIfEmpty` ne distingue pas "déjà seedé" de "une vraie conversation existe déjà" — un appel direct à `createConversation` sur un projet jamais seedé supprimerait silencieusement le seed de fixtures de la Story 2.1 pour ce projet. Trouvé par la revue cas limites. | Low | Defer | Logué dans `deferred-work.md` — non atteignable via l'UI livrée (`app/page.tsx` seede toujours avant qu'un rendu n'expose le bouton "Nouvelle conversation") ; atteignable seulement via un script ou un futur appel direct à l'action, hors scope de cette story. |
| 3 | La revue gaps de vérification a démontré en direct (test réel, DB revertée) que l'échec de `createConversation` sur un `projectId` inexistant est correctement intercepté par le `try/catch` (contrainte FK `PRAGMA foreign_keys = ON` déclenchée), sans ligne orpheline ni corruption — allant plus loin que la vérification par lecture de code de l'implémenteur. | — (confirmation) | No action | Comportement confirmé correct par test en direct indépendant ; aucune action requise. |
| — | Absence d'`ORDER BY` sur `listConversations` (pré-existant, Story 2.1), partage de `isPending` entre sélection et création, forme des données retournées, respect d'AD-2/AD-6, absence de style `.nav-row:disabled` dédié (pré-existant) | — | No action | Vérifiés indépendamment par les trois revues — pré-existants ou corrects tels qu'implémentés, aucune action requise dans le cadre de cette story. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre (`✓ Compiled successfully`, route `/` en `ƒ` dynamique comme attendu)

**Manual checks — effectués en direct :**
- Le pane Browser n'est pas disponible dans cette exécution autonome (dispatch, sans utilisateur présent pour approuver `preview_start`/navigation) ; vérification faite en appelant directement les Server Actions réelles (`actions/project.ts`, `actions/conversation.ts`) contre `db/local.db` via un script bundlé par `esbuild` (résolution de l'alias `@/*` via `tsconfig.json`), plutôt qu'au clic dans le navigateur.
- `listProjects` → `selectProject('proj-acme-rfp')` → `listConversations` : 2 conversations fixtures (Story 2.1) présentes avant création.
- `createConversation('proj-acme-rfp')` : nouvelle ligne créée (`title: 'Nouvelle conversation'`), 0 message associé, `PROJECT.activeConversationId` pointe immédiatement sur cette nouvelle conversation (vérifié par lecture directe de `project.active_conversation_id` en base). `listConversations` après création : 3 lignes (avant+1, pas de doublon).
- Persistance simulant un rechargement de page : nouvel appel indépendant à `getActiveConversation('proj-acme-rfp')` retourne bien la conversation nouvellement créée comme active, avec 0 message (colonne centrale vide attendue).
- Chemin d'échec de la Server Action (insertion DB en échec) non exercé en conditions réelles (nécessiterait de casser la DB pendant l'appel) ; couvert par inspection de code : `createConversation` est enveloppé dans le même `try/catch` que les autres actions du fichier et retourne `{ok:false,error}` sans lever d'exception, `ConversationList.tsx` affiche `error` sous la liste sans modifier `conversations`/`activeConversationId` (pas de mise à jour optimiste), donc pas de conversation fantôme ni de changement de sélection avant `router.refresh()`.

**Vérification indépendante de l'orchestrateur (Reviewer Gate) :**
- Chemin d'échec de `createConversation` déclenché réellement (`projectId` inexistant, violation de la contrainte FK `PRAGMA foreign_keys = ON`) par la revue gaps de vérification, DB sauvegardée puis restaurée — confirme `{ok:false,error}` sans ligne orpheline, comble la lacune notée ci-dessus par l'implémenteur.
- `npx tsc --noEmit` et `npx next build --turbopack` revérifiés indépendamment, propres, avant et après le fix de la garde `isPending` (finding #1).
- `preview_start`/navigateur confirmé indisponible dans cette session (même refus structurel rencontré indépendamment par l'implémenteur et par la revue gaps de vérification) — limite d'environnement réelle, pas un raccourci de l'implémenteur.

**Left incomplete / risks for review:**
- Pas de vérification au clic dans un vrai navigateur (bloqué par l'environnement d'exécution autonome, pas par le code) — le rendu du bouton et l'expérience clic-désactivation n'ont été vérifiés que par lecture de code, confirmés cohérents par les trois revues.
