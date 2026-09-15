---
title: 'Story 2.3 : Confidentialité de la conversation'
type: 'feature'
created: '2026-09-15'
status: 'done'
baseline_commit: 'af177c4df50cf42145c70f32d9ebb41c17f58a45'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md', '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Depuis la Story 2.1, un projet a plusieurs conversations et une table `MESSAGE` ; rien n'audite ni ne documente explicitement dans le code que le contenu d'une conversation ne doit jamais apparaître ailleurs que dans sa propre vue (`ConversationHistory`) — un risque réel dès que Story 2.6 (panneau Livrables) ou une story d'Epic 3/4 lira des données adjacentes à une conversation.

**Approche :** Auditer chaque surface existante (`ContextPanel`, `MattermostPanel`, `ConversationList`) pour confirmer qu'aucune ne lit `message`/le contenu d'une conversation hors de `ConversationHistory` ; documenter explicitement cette frontière (FR-10) par des commentaires sur `ConversationSummary`/la table `message`, pour qu'une story future ne l'enfreigne pas par inadvertance. Round 1 est mono-poste/mono-utilisateur (pas de notion de session/compte) — voir le "Deferred" d'ARCHITECTURE-SPINE.md — donc aucun mécanisme d'authentification n'est construit ici ; la frontière posée est structurelle (quels champs transitent vers quelle vue), pas une politique d'accès.

## Boundaries & Constraints

**Always :** `ConversationSummary` (le type utilisé partout où une conversation est listée hors de sa propre vue — `ConversationList` aujourd'hui, un futur panneau Livrables demain) ne porte jamais de contenu de message, seulement `id`/`projectId`/`title` ; seule `getActiveConversation` (consommée exclusivement par `ConversationHistory`, la vue propre de la conversation) retourne des messages. Toute future Server Action qui lit `MESSAGE` reste appelée uniquement depuis le rendu de la conversation elle-même.

**Never :** pas de modèle d'auth/utilisateur/session — explicitement hors scope round 1 (ARCHITECTURE-SPINE.md, section Deferred : "FR-9/FR-10 n'ont aucun mécanisme d'application ici, faute de notion d'utilisateur"). Pas de champ `ownerId` sur `CONVERSATION` — différé par l'architecture, pas introduit ici. Ne pas construire le panneau Livrables (Story 2.6) ni la table `LIVRABLE`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Audit ContextPanel | Panneau Contexte rendu avec une conversation active en parallèle | Aucun import ni lecture de `MESSAGE`/`actions/conversation.ts` dans `ContextPanel.tsx` | N/A |
| Audit MattermostPanel | Panneau Mattermost rendu avec une conversation active en parallèle | Aucun import ni lecture de `MESSAGE`/`actions/conversation.ts` dans `MattermostPanel.tsx` | N/A |
| Audit ConversationList | Liste des conversations affichée (colonne gauche) | Chaque ligne n'affiche que `title` (`ConversationSummary`), jamais un extrait de message | N/A |

</frozen-after-approval>

## Code Map

- `actions/conversation.ts` -- ajouter un commentaire explicite au-dessus de `ConversationSummary` (ligne ~13) documentant la frontière FR-10 : ce type ne doit jamais gagner de champ de contenu de message, car il est le seul consommé par toute surface listant des conversations hors de leur propre vue.
- `db/schema.ts` -- ajouter un commentaire équivalent au-dessus de la table `message` (ligne ~72) : documenter que seul `getActiveConversation` (via `ConversationHistory`) doit lire cette table en dehors du code interne à `actions/conversation.ts`.
- `components/ContextPanel.tsx`, `components/MattermostPanel.tsx`, `components/ConversationList.tsx` -- audit de lecture seule (pas de modification attendue si l'audit confirme l'absence de fuite ; sinon, retirer toute lecture de contenu de conversation trouvée).

## Tasks & Acceptance

**Execution:**
- [x] Auditer `components/ContextPanel.tsx` -- confirmer l'absence d'import/lecture de `actions/conversation.ts` ou de contenu de message -- AC Story 2.3
- [x] Auditer `components/MattermostPanel.tsx` -- même vérification -- AC Story 2.3
- [x] Auditer `components/ConversationList.tsx` -- confirmer que seul `title` (via `ConversationSummary`) est affiché, jamais un extrait de message -- AC Story 2.3
- [x] `actions/conversation.ts` -- commentaire de frontière sur `ConversationSummary` -- documente FR-10 pour les stories futures (2.6, Epic 3/4)
- [x] `db/schema.ts` -- commentaire de frontière sur la table `message` -- documente FR-10 pour les stories futures

**Acceptance Criteria:**
- Given une conversation que le consultant a créée, when il consulte le panneau Contexte, le panneau Mattermost, ou la liste des conversations, then aucun contenu de cette conversation (ses messages) n'apparaît ailleurs que dans sa propre vue (`ConversationHistory`).
- Given qu'aucun livrable n'existe encore (Story 2.6 non construite), when on vérifie le code actuel, then rien ne prépare une fuite future de contenu de conversation vers un panneau Livrables (la frontière est documentée dans le code pour la story qui le construira).

## Implementation Notes

Auto-approuvé (aucun réviseur humain disponible dans cette exécution autonome) — l'auto-revue par rapport au standard READY FOR DEVELOPMENT est passée proprement, aucune Open Question n'est restée en suspens.

**Note sur le périmètre de cette story :** contrairement aux Stories 2.1/2.2, celle-ci n'ajoute pas de nouveau comportement utilisateur — round 1 est mono-poste/mono-utilisateur (ARCHITECTURE-SPINE.md, Deferred), donc il n'existe aujourd'hui aucun "autre consultant" contre qui appliquer une politique d'accès. L'AC de la Story 2.3 (`epics.md`) est structurellement déjà satisfaite par l'architecture actuelle (`ConversationSummary` ne porte pas de contenu, aucune surface autre que `ConversationHistory` ne lit `MESSAGE`) ; le travail de cette story est d'auditer que c'est bien le cas et de le documenter explicitement dans le code, pour que ça le reste quand Story 2.6 (Livrables) et les épics suivants ajouteront de nouvelles surfaces.

**Audit exécuté (2026-09-15) :**
- `components/ContextPanel.tsx` — aucun import de `actions/conversation.ts`, aucune lecture de `MESSAGE`/contenu de conversation. N'affiche que des `DocumentSummary` (`actions/document.ts`). Aucune modification nécessaire.
- `components/MattermostPanel.tsx` — Server Component read-only, aucun import de `actions/conversation.ts`, n'affiche qu'un `MattermostMessage` (`integrations/ports/mattermost-provider.ts`). Aucune modification nécessaire.
- `components/ConversationList.tsx` — importe bien `actions/conversation.ts` (attendu : `createConversation`, `selectConversation`, le type `ConversationSummary`), mais n'affiche que `conv.title` ; `ConversationSummary` ne porte que `{id, projectId, title}`, donc aucune fuite de contenu possible par construction. Aucune modification nécessaire.
- Les deux AC de la story sont donc satisfaites structurellement, sans changement de comportement : le travail restant était de documenter la frontière FR-10 dans le code pour les stories futures (2.6, Epic 3/4), fait ci-dessous.

**Changements de code :**
- `actions/conversation.ts` — commentaire de frontière FR-10 ajouté au-dessus de `ConversationSummary` (avant la ligne 13) : ce type est le seul consommé par toute surface listant des conversations hors de leur propre vue, et ne doit donc jamais gagner de champ de contenu.
- `db/schema.ts` — commentaire de frontière FR-10 ajouté au-dessus de la table `message` (avant la ligne 75, ex-ligne ~72) : documente que seule `getActiveConversation` (consommée par `ConversationHistory`) doit lire cette table hors du code interne à `actions/conversation.ts`.

**Vérification :**
- `npx tsc --noEmit` — aucune erreur.
- `npx next build --turbopack` — build propre (`Compiled successfully`, TypeScript et génération de pages statiques passent).
- `grep -rn "actions/conversation" components/ContextPanel.tsx components/MattermostPanel.tsx` — aucune correspondance (exit 1), confirmé.

**Rien d'incomplet ou à risque :** aucun comportement runtime n'a changé (uniquement des commentaires de documentation).

**Fixes de l'orchestrateur après le Reviewer Gate** (voir Review Triage Log ci-dessous) : deux commentaires de frontière FR-10 supplémentaires ajoutés — un sur `MessageSummary` (`actions/conversation.ts`, co-localisé avec le type réellement porteur de contenu, plutôt que seulement sur `ConversationSummary` 15 lignes plus haut) et un dans `app/page.tsx` (au niveau de la colonne de droite, là où `activeConversationResult` reste en scope et où un futur panneau Livrables serait tenté de le réutiliser directement). Ces deux ajouts expliquent l'écart de périmètre relevé par la revue gaps de vérification (elle a comparé le diff réellement présent sur disque, capturé après ces fixes, au rapport de l'implémenteur et au fichier diff figé transmis aux trois revues, capturés avant) — ce n'est pas une erreur de l'implémenteur, seulement un artefact de timing : les fixes de l'orchestrateur sont arrivés pendant que la revue tournait. `npx tsc --noEmit` et `npx next build --turbopack` revérifiés propres après ces deux ajouts.

## Spec Change Log

## Review Triage Log

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | La frontière FR-10 n'est protégée que par des commentaires — aucun test, lint, ni garde-fou de type n'empêcherait une future PR d'élargir `ConversationSummary` avec un champ de contenu. Trouvé par les revues adversariale et cas limites. | Medium | Defer | Logué dans `deferred-work.md` — option la moins chère disponible aujourd'hui : ce dépôt n'a ni suite de tests, ni configuration ESLint, ni CI (confirmé), explicitement hors scope round 1 selon la section Deferred d'ARCHITECTURE-SPINE.md. À revisiter si une infrastructure de test/lint est un jour adoptée. |
| 2 | Le commentaire de frontière était posé sur `ConversationSummary` (le type sûr) mais pas sur `MessageSummary` (le type réellement porteur de contenu, 15 lignes plus bas) — un futur développeur cherchant à lire des messages atterrirait directement sur `MessageSummary` sans forcément remonter au commentaire. Trouvé par la revue cas limites. | Medium | Patch | Commentaire de frontière ajouté directement au-dessus de `MessageSummary` (`actions/conversation.ts`), co-localisé avec le type à risque plutôt que seulement sur le type sûr. |
| 3 | `app/page.tsx`, la racine de composition, n'avait aucun commentaire de frontière alors que `activeConversationResult` (contenu complet, messages inclus) y reste en scope juste à côté de l'endroit où un futur panneau Livrables (Story 2.6) serait ajouté — le chemin de moindre résistance pour un futur développeur pressé serait de réutiliser cette variable déjà en scope plutôt que d'écrire une requête proprement scopée. Trouvé par la revue cas limites. | Medium | Patch | Commentaire de frontière ajouté dans `app/page.tsx`, au niveau de `workspace-sidebar-right`, avertissant explicitement qu'`activeConversationResult` ne doit jamais être transmis à un panneau autre que `ConversationHistory`. |
| 4 | Cases à cocher de la section Tasks & Acceptance laissées non cochées (`[ ]`) malgré un travail complet décrit dans les Implementation Notes. Trouvé par la revue cas limites. | Low | Patch | Cases cochées (`[x]`) pour refléter l'état réel. |
| 5 | Les blocs `catch` d'`actions/conversation.ts` (`console.error('<nom> failed', error)`) n'ont jamais été explicitement audités comme surface de fuite potentielle — aujourd'hui sans risque réel (erreurs SQLite n'échoient pas le contenu des lignes), mais deviendra un vrai risque une fois que Story 2.5 fera transiter de vrais messages utilisateur par ce même fichier. Trouvé par la revue cas limites. | Low | Defer | Logué dans `deferred-work.md` — à revisiter avec Story 2.5. |
| 6 | La revue gaps de vérification a signalé un écart entre le diff figé transmis aux revues (capturé avant les fixes de l'orchestrateur) et l'état réel du dépôt (après ces fixes) — lu à tort comme une déclaration inexacte de l'implémenteur. | — (artefact de timing) | No action | Clarifié ci-dessus dans les Implementation Notes : les deux commentaires supplémentaires viennent des fixes #2/#3 de l'orchestrateur, appliqués pendant que la revue tournait — pas une omission de l'implémenteur. Rapport de l'implémenteur exact au moment où il a été écrit. |
| — | Absence de fuite dans `ContextPanel`/`MattermostPanel`/`ConversationList`, respect d'AD-2, langue des commentaires (anglais, cohérent avec le reste du fichier) | — | No action | Vérifiés indépendamment par les trois revues — corrects tels qu'implémentés. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no type errors
- `npx next build --turbopack` -- expected: clean build
- `grep -rn "actions/conversation" components/ContextPanel.tsx components/MattermostPanel.tsx` -- expected: no match

**Manual checks (if no CLI):**
- Lire `ContextPanel.tsx`/`MattermostPanel.tsx` en entier, confirmer l'absence de toute référence à `MESSAGE`/conversation content.
- Confirmer que `ConversationList.tsx` n'affiche que `conv.title`, jamais `conv.content` ou un message.

**Vérification indépendante de l'orchestrateur (Reviewer Gate) — trois revues parallèles (adversariale, cas limites, gaps de vérification) :**
- Les trois commandes de Verification ci-dessus ré-exécutées indépendamment par la revue gaps de vérification : résultats identiques à ceux de l'implémenteur.
- Lecture complète indépendante de `ContextPanel.tsx`, `MattermostPanel.tsx`, `ConversationList.tsx`, `ConversationHistory.tsx`, `app/page.tsx` par les trois revues — confirme structurellement qu'aucune surface autre que `ConversationHistory` ne reçoit `MessageSummary[]`/contenu de message ; tracé jusqu'au point d'appel (`app/page.tsx`) et confirmé qu'`activeConversationResult` n'est transmis qu'à `ConversationHistory`.
- `grep -rln "from '@/db/schema'"` sur tout le dépôt : seuls `actions/project.ts`, `actions/document.ts`, `actions/conversation.ts` — aucune autre surface ne peut lire `MESSAGE`.
- `npx tsc --noEmit` et `npx next build --turbopack` revérifiés propres après les deux commentaires ajoutés par l'orchestrateur (findings #2, #3).
