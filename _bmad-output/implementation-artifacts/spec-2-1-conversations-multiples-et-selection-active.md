---
title: 'Story 2.1 : Conversations multiples et sélection active'
type: 'feature'
created: '2026-09-15'
status: 'done'
baseline_commit: '2ba439632034149067f6e984f4712c59692fc5b9'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Un projet n'a aujourd'hui aucune notion de conversation — `app/page.tsx` se contente d'empiler verticalement les panneaux de droite hérités d'Epic 1 (Contexte, Mattermost). Un consultant ne peut ni voir, ni basculer entre, ni consulter l'historique de plusieurs conversations sur un projet.

**Approche :** Introduire les tables `CONVERSATION`/`MESSAGE` et `actions/conversation.ts` (lister, obtenir l'active, sélectionner — sur le modèle d'`actions/project.ts` et de `PROJECT.activeConversationId`/AD-6). Construire la structure à trois colonnes de l'espace de travail dans `app/page.tsx` (gauche : liste des conversations ; centre : historique en lecture seule de la conversation active ; droite : les panneaux d'Epic 1), en réutilisant `.nav-row`/`.nav-row-active` pour la ligne active. Comme aucun provider côté OCTO ne produit de conversations (AD-1 exempte les données internes à l'application) et que la Story 2.2 (création) arrive ensuite, seeder 2 conversations fixtures par projet (chacune avec 2-3 messages fixtures) directement dans `actions/conversation.ts`, dans le même esprit que `SEED_PROJECTS` — sans passer par aucun port, conformément au précédent posé par AD-1 pour les données écrites manuellement.

## Boundaries & Constraints

**Always :** une seule conversation active à la fois (`PROJECT.activeConversationId`, FK nullable, seule source de vérité selon AD-6 — jamais dérivée d'autre chose). Sélectionner une conversation passe par une Server Action (AD-2) ; les composants ne lisent jamais `db/` directement. `CONVERSATION`/`MESSAGE` suivent les conventions de schéma existantes (PK texte via `crypto.randomUUID()`, FK via `.references()`, nouvelle migration Drizzle via `npm run db:generate` — jamais de SQL de migration écrit à la main). Réutiliser `ActionResult<T>` (`actions/types.ts`) et `withLatency` (`integrations/mock/with-latency.ts`) exactement comme Epic 1. Toute nouvelle chaîne visible par l'utilisateur est en français, vouvoiement, sans emoji/point d'exclamation (`CONVENTIONS.md`), placée uniquement dans `components/`/`app/`.

**Never :** pas de bouton/action "Nouvelle conversation" (Story 2.2). Pas de composer/envoi de message (Story 2.5). Pas de panneau Skills dans la colonne de gauche (Story 2.4) — cette story ne met dans la colonne de gauche que la liste des conversations. Pas de renommage/suppression de conversation (hors scope de l'épic entier). Ne pas toucher `epic-1-retro-item-1` (tokens `button-ai-primary`/`ai-suggestion-card`) — rien ici n'en a besoin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plusieurs conversations | Le projet actif a 2+ conversations | Chacune listée séparément dans la colonne de gauche ; l'active porte `nav-row-active` | N/A |
| Premier chargement, zéro conversation | Le projet actif n'en a pas encore (avant seed) | `listConversations` seede 2 conversations fixtures (avec messages fixtures) une seule fois, puis les retourne | N/A |
| Clic sur une conversation | Le consultant clique une ligne non active | `selectConversation` positionne `PROJECT.activeConversationId` ; cette ligne devient active ; la colonne centrale affiche ses messages ordonnés | L'action retourne `{ok:false,error}` en cas d'échec DB ; l'UI garde la sélection précédente, pas de crash |
| Aucun projet actif | `APP_STATE.activeProjectId` est nul | Les colonnes gauche/centre ne sont pas rendues (le garde-fou existant `ProjectSelector` de la Story 1.2 s'applique toujours) | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- ajouter les tables `conversation` (`id`, `projectId` FK, `title`) et `message` (`id`, `conversationId` FK, `role` enum `user\|assistant`, `content`, `model`) selon la "Structural Seed" d'ARCHITECTURE-SPINE ; lancer `npm run db:generate` pour la migration, ne jamais éditer le SQL à la main.
- `actions/conversation.ts` (nouveau) -- calquer la forme d'`actions/project.ts` : `listConversations(projectId): Promise<ActionResult<Conversation[]>>` (seede 2 fixtures + messages au premier appel si le projet a zéro ligne, via un callback synchrone `db.transaction`), `getActiveConversation(projectId): Promise<ActionResult<{conversation, messages}|null>>`, `selectConversation(conversationId): Promise<ActionResult<void>>` (écrit `project.activeConversationId`).
- `actions/types.ts`, `integrations/mock/with-latency.ts` -- réutilisés tels quels, aucun changement.
- `app/page.tsx` -- remplacer le `<div>` empilé actuel par une grille CSS à trois colonnes : gauche (`ConversationList`), centre (`ConversationHistory`), droite (`ContextPanel`/`MattermostPanel` existants, inchangés). Récupérer conversations + conversation active en parallèle du `Promise.all` existant pour documents/Mattermost (pattern du finding C de la rétro Epic 1).
- `components/ConversationList.tsx` (nouveau) -- affiche des lignes `.nav-row`/`.nav-row-active`, une par conversation, `onClick` appelle `selectConversation` (composant client, état minimal, pas besoin d'`OverlayProvider` — hors scope d'AD-8, c'est un élément en flux, pas une surface flottante).
- `components/ConversationHistory.tsx` (nouveau) -- liste ordonnée en lecture seule des messages de la conversation active (pas de composer).
- `app/globals.css` -- ajouter une grille `.workspace-grid` à trois colonnes : gauche `240px` fixe, centre `1fr`, droite `300px` fixe (résout epic-1-retro-item-7 dans le cadre du travail de grille propre à cette story — supersède l'ancien `320px` non réconcilié). Mettre à jour la largeur codée en dur `320` de `components/ContextPanel.tsx`/`components/MattermostPanel.tsx` vers le nouveau token/valeur partagé.

## Tasks & Acceptance

**Execution:**
- [x] `db/schema.ts` -- ajouter les tables `conversation`, `message` -- Structural Seed d'ARCHITECTURE-SPINE
- [x] `npm run db:generate` -- créer la migration -- le changement de schéma l'exige
- [x] `actions/conversation.ts` -- ajouter `listConversations`/`getActiveConversation`/`selectConversation` avec seed de fixtures -- AD-2, AD-6
- [x] `components/ConversationList.tsx` -- nouveau, style de ligne active via `.nav-row-active` -- pattern UX de l'épic
- [x] `components/ConversationHistory.tsx` -- nouveau, rendu en lecture seule des messages -- AC Story 2.1 ("affiche son historique au centre")
- [x] `app/page.tsx` -- câblage de la grille à trois colonnes, fetch parallèle -- pattern du finding C de la rétro
- [x] `app/globals.css` -- `.workspace-grid` + token de largeur partagé pour la colonne de droite, mise à jour de `ContextPanel.tsx`/`MattermostPanel.tsx` -- résout epic-1-retro-item-7 dans le scope

**Acceptance Criteria:**
- Given un projet avec plusieurs conversations existantes, when l'espace de travail s'ouvre, then chaque conversation apparaît séparément dans la liste de la colonne de gauche.
- Given la liste affichée, when un consultant clique une conversation non active, then elle devient active, son historique s'affiche au centre, et une seule ligne est visuellement distinguée (`nav-row-active`) à la fois.

## Implementation Notes

Auto-approuvé (aucun réviseur humain disponible dans cette exécution autonome) — l'auto-revue par rapport au standard READY FOR DEVELOPMENT est passée proprement, aucune Open Question n'est restée en suspens.

**Correction de process :** ce fichier de spec a d'abord été rédigé en anglais par erreur (règle de langue par défaut du skill `bmad-build`), avant que l'orchestrateur ne rattrape l'écart avec l'instruction explicite de l'exécution autonome ("Write all spec/retro documents in French, matching every existing artifact") et ne le traduise intégralement en français une fois l'implémentation terminée, sans changer le sens du contenu gelé. Les stories suivantes de cet épic sont rédigées directement en français.

**Rapport de l'implémenteur :** a suivi le Code Map tel qu'écrit, avec une déviation délibérée et une mitigation de race condition à signaler pour revue.

Les tables `conversation`/`message` de `db/schema.ts` correspondent exactement aux champs du Code Map (pas de `stepKey` — c'est Epic 3, et le commentaire d'en-tête du fichier déconseille déjà de pré-créer des champs de façon spéculative). Le seed de fixtures dans `actions/conversation.ts` (`seedFixturesIfEmpty`) place la vérification "ce projet a-t-il déjà des conversations" *à l'intérieur* du même callback synchrone `db.transaction` que les insertions plutôt qu'avant l'ouverture de la transaction : `app/page.tsx` appelle `listConversations` et `getActiveConversation` en parallèle via `Promise.all`, tous deux passant par ce même helper de seed — une vérification-puis-action séparée par une frontière `await` laisserait les deux appels observer zéro ligne au tout premier chargement et seeder chacun de leur côté, doublant les fixtures. Garder toute la vérification+insertion dans une seule transaction synchrone (aucun `await` à l'intérieur) rend l'opération atomique vis-à-vis de ce process mono-thread, quel que soit l'ordre d'appel. Vérifié directement en base après un premier chargement à froid : exactement 2 lignes `conversation`, 5 lignes `message` (3+2), jamais 4/10.

Le texte des fixtures (deux conversations, cinq messages, français, vouvoiement, sans exclamation/emoji) vit dans `actions/conversation.ts` lui-même, assez générique pour rester plausible avec l'un ou l'autre projet seed (RFP ou mission) d'`integrations/mock/project-provider.ts` — même esprit "pas de nom manifestement factice" que `SEED_DOCUMENTS`.

Résout epic-1-retro-item-7 (finding G : `320` codé en dur vs. `300px` documenté) en retirant entièrement le `width: 320` inline de `ContextPanel.tsx`/`MattermostPanel.tsx` plutôt qu'en codant `300` à sa place — la nouvelle colonne de grille `.workspace-sidebar-right` (pilotée par `--width-sidebar-right: 300px` dans `app/globals.css`) est désormais le seul endroit où vit cette largeur.

**Fixes de l'orchestrateur après le Reviewer Gate** (voir Review Triage Log ci-dessous) : la déviation de l'implémenteur sur la FK `activeConversationId` a été réévaluée et inversée — la contrainte `.references()` a été ajoutée (référence en avant vers `conversation`, résolue paresseusement par le callback de Drizzle, avec annotation de type explicite `AnySQLiteColumn` pour éviter l'inférence de type circulaire de TypeScript), la migration a été régénérée proprement (l'ancienne migration non commitée a été supprimée et régénérée plutôt que superposée), le commentaire trompeur sur le mécanisme anti-double-seed dans `app/page.tsx` a été corrigé pour refléter le vrai mécanisme (transaction synchrone, pas l'ordre du tableau), et une vérification défensive `conversationRow.projectId !== projectId` a été ajoutée dans `getActiveConversation` en profondeur de défense pour la confidentialité des conversations (FR-10).

## Spec Change Log

## Review Triage Log

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | `project.activeConversationId` (`db/schema.ts`) n'avait pas la contrainte FK que le diagramme ER d'ARCHITECTURE-SPINE et AD-6 appellent explicitement ("nullable FK"), contrairement à `conversation.projectId` et `appState.activeProjectId` qui utilisent tous deux `.references()`. Trouvé par la revue adversariale. | Medium | Patch | FK ajoutée (`.references((): AnySQLiteColumn => conversation.id)`, référence en avant paresseuse) ; migration régénérée après suppression de l'ancienne migration non commitée ; `npx tsc --noEmit` et `npx next build --turbopack` revérifiés propres ; contrainte confirmée présente dans `sqlite_master` après un chargement réel. |
| 2 | Commentaire trompeur dans `app/page.tsx` attribuant la garantie anti-double-seed à l'ordre du tableau `Promise.all`, alors que le vrai mécanisme est la synchronicité de `db.transaction` (`node:sqlite` étant un driver synchrone) — confirmé indépendamment par deux revues via lecture du code source de `drizzle-orm`. | Low (nit) | Patch | Commentaire réécrit pour décrire le vrai mécanisme (transaction synchrone sans `await` interne), sans changement de comportement. |
| 3 | `getActiveConversation` ne vérifiait pas que la ligne CONVERSATION résolue via la FK appartient bien au `projectId` demandé — non atteignable aujourd'hui (`selectConversation` ne peut écrire que sa propre paire projet/conversation), mais absence de garde explicite sur un point que l'exigence de confidentialité de l'épic (FR-10) appelle à vérifier explicitement. Trouvé par la revue cas limites. | Low | Patch | Vérification défensive ajoutée : si `conversationRow.projectId !== projectId`, retourne la même erreur que pour une FK manquante plutôt que de risquer d'exposer les données d'un autre projet. |
| 4 | Pas d'`ORDER BY` sur la lecture des conversations et des messages (`actions/conversation.ts`) — ordre actuellement stable seulement parce que le seed de fixtures est le seul insérateur. Trouvé indépendamment par les revues adversariale et cas limites. | Low | Defer | Logué dans `deferred-work.md` — nécessite une colonne d'ordre explicite (les `id` étant des UUID non triables), à traiter quand Story 2.5 commencera à ajouter de vrais messages un par un. |
| 5 | Fenêtre de désynchronisation étroite : si `selectConversation` réussit mais que le `getActiveConversation` suivant (sur `router.refresh()`) échoue indépendamment, la colonne de gauche n'affiche aucune ligne active alors que la DB est correcte. Trouvé par la revue cas limites. | Low | Defer | Logué dans `deferred-work.md` — nécessite un échec intermittent entre deux lectures synchrones consécutives sur la même DB locale, scénario non plausible en round 1. |
| 6 | La matrice I/O de la spec ne décrit pas explicitement le comportement d'affichage quand `getActiveConversation` échoue pour cause de FK manquante (aucune ligne `nav-row-active` visible). Comportement vérifié correct en direct (branche forcée puis revertée), mais non couvert par la matrice telle qu'écrite. Trouvé par la revue gaps de vérification. | Low (doc) | No action | Comportement confirmé correct par test en direct (voir Verification) ; pas un bug, juste une lacune de documentation dans une section gelée — non modifiée pour rester fidèle à l'intention approuvée. |
| — | Seed zéro-conversation, garde "aucun projet actif", forme des données retournées vs. attentes des composants, isolation par projet du seed/de la sélection | — | No action | Vérifiés indépendamment par les trois revues — tous corrects tels qu'implémentés. |

## Design Notes

Le seed de fixtures vit dans `actions/conversation.ts`, pas dans un "provider" mock sous `integrations/mock/`, car la frontière de port d'AD-1 ne concerne que les données sourcées depuis OCTO (Octopod/drive/Mattermost) ; les conversations sont internes à l'application, même précédent qu'`actions/document.ts` écrivant directement les documents ajoutés manuellement (l'exception explicite d'AD-1). `listConversations` ne seede que si le projet a zéro ligne, donc l'opération est idempotente à travers les rechargements de page répétés.

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, revérifié après les correctifs du Review Triage Log
- `npx next build --turbopack` -- compile proprement, revérifié après les correctifs du Review Triage Log

**Manual checks — effectués en direct (implémenteur puis orchestrateur) :**
- Chargement à froid sans projet actif : seul `ProjectSelector` s'affiche, pas de grille d'espace de travail, pas de crash.
- Projet sélectionné : grille `.workspace-grid` à trois colonnes rendue — colonne de gauche liste les deux conversations fixtures (une active par défaut, style `nav-row-active` visible), colonne centrale affiche les messages fixtures de cette conversation dans l'ordre, colonne de droite affiche les panneaux Contexte/Mattermost inchangés à la nouvelle largeur de 300px.
- Clic sur l'autre conversation : `nav-row-active` se déplace (et seulement sur cette ligne), colonne centrale bascule sur ses messages fixtures.
- Rechargement de page : mêmes 2 conversations (pas de doublon), sélection active conservée — confirme la persistance de `PROJECT.activeConversationId` et l'idempotence du seed.
- Vérification directe en base (`node:sqlite`) : exactement 2 lignes `conversation` et 5 lignes `message` par projet, `active_conversation_id` correctement positionné — confirme l'absence de double seed depuis les appels concurrents `Promise.all`.
- Branche "FK manquante" d'`getActiveConversation` forcée en direct (édition temporaire de `PROJECT.activeConversationId` vers un id inexistant via un script direct, puis reverté) : message "La conversation active est introuvable." affiché dans la colonne centrale, aucune ligne `nav-row-active` dans la liste, pas de crash côté serveur ni client — comportement conforme au code, confirme le finding #6 comme non-bug.
- Après le fix de la FK sur `activeConversationId` (finding #1) : migration régénérée depuis une DB locale vide, contrainte confirmée présente dans `sqlite_master.project`, `npm run dev` démarre sans erreur de migration, `GET /` répond 200.

**Left incomplete / risks for review:**
- Aucun test automatisé ne couvre le fix anti-race-condition du seed (`seedFixturesIfEmpty`) — vérifié uniquement par inspection directe de la base après un chargement réel.
- L'ordre des messages/conversations repose sur l'ordre implicite de SQLite (pas d'`ORDER BY`) — logué en deferred-work, à traiter avant que Story 2.5 n'ajoute de vrais messages un par un.
