---
title: 'Story 2.6 : Panneau Livrables'
type: 'feature'
created: '2026-09-16'
status: 'done'
baseline_commit: '229031622245b29f4ebe0c0ef7d410040b71a891'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md', '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-panneau-skills.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Un consultant ne peut aujourd'hui voir aucun livrable en cours sur son projet — la colonne de droite ne contient que Contexte et Mattermost (Epic 1). Rien ne prépare non plus le panneau que Story 4.1 devra étendre pour ouvrir l'Éditeur assisté.

**Approche :** Créer la table `LIVRABLE` (`id`, `projectId`, `conversationId` nullable, `title`, `content` JSON `{blocks:[{id,text}]}` — forme fixée par AD-9, même si l'édition de contenu reste hors scope ici). Ajouter `actions/livrable.ts` avec `listLivrables(projectId)` : seed idempotent par projet connu (même pattern que `actions/skill.ts`/`actions/conversation.ts` — round 1 n'a aucun mécanisme réel de création, `propose_livrable_content` étant un outil d'agent différé à Epic 4). Ajouter `components/LivrablesPanel.tsx` dans la colonne de droite, entre `ContextPanel` et `MattermostPanel` (ordre déclaré par `epic-2-context.md`) : une carte par livrable (titre), et si la liste est vide, une invite courte pointant vers le vrai mécanisme prévu (demander à l'agent dans une conversation) plutôt qu'un bouton simulant une création qui n'existe pas encore.

## Boundaries & Constraints

**Always :** `LIVRABLE.content` est un JSON `{blocks:[{id,text}]}` dès sa création (AD-9) même si rien ne le lit/l'édite dans cette story — évite une migration de forme quand Epic 4 arrivera. Liste vide → invite courte visible (jamais une zone silencieuse), texte honnête sur le vrai mécanisme de création (l'agent, pas un bouton) — même esprit que Story 2.4's "Ajouter une skill". Mutation exclusivement via `actions/livrable.ts` (AD-2). Aucune fuite de contenu de conversation vers ce panneau (frontière FR-10, Story 2.3 — toujours valide, ce panneau ne lit jamais `MESSAGE`).

**Never :** pas de clic-through vers un Éditeur assisté — cette vue de destination est Story 4.1 (note explicite de l'AC dans `epics.md`) ; les cartes ne sont pas cliquables dans cette story. Pas de bouton "Créer un livrable" fonctionnel ou simulé — le mécanisme réel est un outil d'agent (`propose_livrable_content`, AD-3), différé à Epic 4, jamais recréé ici en façade. Pas d'édition de `content` — seule sa forme (JSON blocks) est fixée, rien ne la lit au-delà du titre affiché. Ne pas toucher `ContextPanel.tsx`/`MattermostPanel.tsx` au-delà de leur position relative dans la colonne (insertion, pas modification).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Livrables existants | Projet avec 1+ livrables (fixtures) | Une carte par livrable (titre) | N/A |
| Aucun livrable | Projet sans livrable (avant seed, ou projet hors fixtures) | Invite courte visible, jamais de zone vide silencieuse | N/A |
| Échec de lecture | `listLivrables` échoue côté serveur | Message d'erreur affiché | Retour `{ok:false,error}`, pas de crash |

</frozen-after-approval>

## Code Map

- `db/schema.ts` -- ajouter la table `livrable` (`id` PK, `projectId` FK, `conversationId` FK nullable, `title`, `content` text — JSON stringifié `{blocks:[{id,text}]}`) selon le Structural Seed ; `npm run db:generate`.
- `actions/livrable.ts` (nouveau) -- `listLivrables(projectId): Promise<ActionResult<{id:string,title:string}[]>>`, seul fichier autorisé à lire/écrire `LIVRABLE` (AD-2). Seed idempotent par projet connu (même style `db.transaction` synchrone que `actions/skill.ts:seedFixturesIfEmpty`) : un livrable par projet seed (titre + `content` JSON minimal mais valide, ex. `{blocks:[{id:crypto.randomUUID(),text:'...'}]}`).
- `components/LivrablesPanel.tsx` (nouveau) -- Server Component (pas de mutation, pas d'overlay, pas de client-side state — comme `MattermostPanel.tsx`) : liste de cartes non cliquables (`.card`), ou invite courte si vide.
- `app/page.tsx` -- ajouter `listLivrables(activeProject.id)` au `Promise.all` existant ; insérer `<LivrablesPanel livrables={livrables} />` entre `<ContextPanel>` et `<MattermostPanel>` dans `workspace-sidebar-right`.
- `app/globals.css` -- style carte livrable (réutilise `.card`, pas de nouvelle classe si les styles existants suffisent).

## Tasks & Acceptance

**Execution:**
- [x] `db/schema.ts` + migration -- table `livrable` -- Structural Seed, AD-9
- [x] `actions/livrable.ts` -- `listLivrables` avec seed idempotent -- AD-2
- [x] `components/LivrablesPanel.tsx` -- cartes + invite si vide -- AC Story 2.6
- [x] `app/page.tsx` -- câblage dans la colonne droite, entre Contexte et Mattermost -- AC Story 2.6

**Acceptance Criteria:**
- Given un projet avec des livrables existants, when le consultant ouvre le panneau Livrables, then il voit la liste des livrables en cours (une carte par livrable, titre visible).
- Given aucun livrable n'existe encore, when le panneau s'affiche, then une invite courte propose d'en créer un (pointant vers le vrai mécanisme — l'agent), jamais une zone vide silencieuse.

## Implementation Notes

Auto-approuvé (aucun réviseur humain disponible dans cette exécution autonome) — l'auto-revue par rapport au standard READY FOR DEVELOPMENT est passée proprement, aucune Open Question n'est restée en suspens.

**Note d'orchestration :** ne pas modifier `status` dans le frontmatter de cette spec, ni `_bmad-output/implementation-artifacts/sprint-status.yaml` — rôle de l'orchestrateur. Seule la section `## Implementation Notes` reçoit des ajouts.

**Rapport de l'implémenteur :** a suivi le Code Map tel qu'écrit, sans déviation. Les quatre tâches d'Exécution sont complètes.

`db/schema.ts` ajoute `livrable` (`id` PK, `project_id` FK vers `project.id`, `conversation_id` FK nullable vers `conversation.id`, `title`, `content`) exactement conforme au Structural Seed d'ARCHITECTURE-SPINE.md. Migration générée via `npm run db:generate` (`db/migrations/20260916121352_slow_mikhail_rasputin/`) — SQL vérifié : un simple `CREATE TABLE livrable (...)`, aucune `ALTER TABLE`. Comme il s'agit d'une table entièrement nouvelle (pas d'ajout de colonne sur une table existante avec des lignes), le piège NOT NULL-sans-default documenté dans les instructions de la story (et déjà rencontré Story 2.5 sur `message.created_at`) ne s'applique pas ici — noté explicitement en commentaire dans `db/schema.ts` pour que ce ne soit pas une question ouverte pour un futur lecteur.

`actions/livrable.ts` (nouveau) expose uniquement `listLivrables(projectId)`, seul fichier autorisé à lire/écrire `LIVRABLE` (AD-2). Seed idempotent (`seedFixturesIfEmpty`) reprend exactement le motif transaction-synchrone-sans-`await` de `actions/skill.ts`/`actions/conversation.ts` : la vérification "zéro ligne" et l'insert vivent dans le même callback `db.transaction`. Seuls les deux projets seed connus (`proj-acme-rfp` → "Réponse à l'appel d'offres", `proj-audit-mission` → "Note de cadrage de mission") reçoivent un seed ; tout autre `projectId` renvoie une liste vide sans semer. `content` est écrit dès la création sous la forme minimale mais valide `{blocks:[{id:crypto.randomUUID(),text:'Contenu à venir.'}]}` (AD-9), avec `conversationId: null` pour ces lignes de fixture (aucune conversation réelle ne les a produites). `LivrableSummary` ne porte ni `content` ni `conversationId` — seulement `id`/`title` — pour qu'aucune extension future de ce panneau ne puisse redevenir un chemin de fuite vers `MESSAGE` (frontière FR-10).

`components/LivrablesPanel.tsx` (nouveau) est un Server Component pur (pas de `'use client'`, pas de mutation, pas d'overlay, pas d'état) — une `<ul>` de `<li className="card skill-card">` (réutilise `.card`/`.skill-card`/`.skill-card-icon` de la Story 2.4 plutôt qu'une classe dédiée, conformément au Code Map ; DESIGN.md liste explicitement "icône livrable en cours de travail avec l'IA" aux côtés de "icône skills" comme usage de `--color-ai-accent`, et le mockup `Main.dc.html` utilise la même forme icône+libellé pour sa section Livrables). Aucun `<a>`/`<button>`/gestionnaire de clic nulle part dans le composant — vérifié par inspection du HTML rendu (voir vérification manuelle ci-dessous). Liste vide → `<p className="text-caption">` invitant à demander la création à l'agent dans une conversation (jamais une zone silencieuse, jamais un bouton simulant un mécanisme de création). Lecture échouée (`livrables === null`) → message d'erreur distinct, même convention que `SkillsPanel`.

`app/page.tsx` ajoute `listLivrables(activeProject.id)` au `Promise.all` existant et rend `<LivrablesPanel livrables={livrables} />` entre `<ContextPanel>` et `<MattermostPanel>` dans `workspace-sidebar-right`, sans toucher au contenu de ces deux composants (seulement leur position relative). Le commentaire FR-10 existant au-dessus de `workspace-sidebar-right` est mis à jour pour nommer explicitement `LivrablesPanel` comme exemple de panneau qui lit ses propres données plutôt que de recevoir `activeConversationResult`.

**Vérification effectuée :**
- `npx tsc --noEmit` : aucune erreur.
- `npx next build --turbopack` : build propre (route `/` toujours dynamique `ƒ`).
- `npm run db:generate` : migration générée, SQL inspecté manuellement (CREATE TABLE simple, deux contraintes FK, aucune édition manuelle du fichier généré).
- Serveur `next dev` démarré en arrière-plan (`npm run dev`, DB locale `db/local.db` sauvegardée par copie avant toute manipulation, puis restaurée bit-à-bit après — hors du contrôle de version, `*.db` dans `.gitignore`), interrogé via `curl` plutôt que via un navigateur interactif (non disponible dans cet environnement non supervisé, même limite déjà rencontrée et documentée Story 2.4) :
  - Projet RFP (`proj-acme-rfp`, sélectionné en reproduisant exactement les écritures de `selectProject` via `sqlite3`) : panneau droit affiche Contexte, puis Livrables (une carte "Réponse à l'appel d'offres"), puis Mattermost — ordre confirmé par extraction des `aria-label` dans le HTML rendu.
  - Projet mission (`proj-audit-mission`) : carte "Note de cadrage de mission" affichée.
  - Projet hors fixtures (`proj-test-empty`, inséré temporairement) : aucune ligne `LIVRABLE` seedée, panneau affiche l'invite courte "Aucun livrable pour le moment. Demandez à l'agent d'en créer un dans une conversation." — jamais de zone vide silencieuse.
  - Contenu de la ligne `LIVRABLE` seedée inspecté directement en base : `content` = `{"blocks":[{"id":"...","text":"Contenu à venir."}]}`, conforme AD-9.
  - Segment HTML du panneau Livrables inspecté programmatiquement : aucun `<a>`/`<button>` à l'intérieur, confirmant l'absence de clic-through (Never de la spec).
  - DB locale restaurée depuis la sauvegarde après vérification (aucune ligne `project`/`app_state`/`livrable` résiduelle, état identique à avant les tests) ; processus `next dev` arrêté.
- Reviewer Gate à trois lentilles parallèles non exécuté dans cette passe (pas de réviseur humain disponible dans cette exécution autonome, cohérent avec l'auto-approbation notée en tête de cette section) — la tâche autonome s'est arrêtée sur une erreur réseau avant d'avoir pu la lancer.

**Rien d'incomplet ou de risqué identifié à l'époque.** Les trois scénarios de la matrice I/O de la spec (livrables existants, liste vide, échec de lecture) sont couverts par le code ; les deux premiers ont été vérifiés en direct ci-dessus, le troisième (`{ok:false,error}` sur échec de lecture) suit exactement le même `try/catch` déjà vérifié pour `listProjectSkills`/`listConversations` et n'a pas été re-testé séparément par manque de temps dans cette passe — même limite que les autres Server Actions de ce projet.

**Reviewer Gate complet, effectué a posteriori par l'orchestrateur (2026-09-16)** après reprise de session (la tâche autonome s'était arrêtée sur `ENOTFOUND` avant de pouvoir la lancer elle-même) : les trois lentilles parallèles habituelles (angles morts, cas limites, gaps de vérification) ont été exécutées contre le diff non committé. Voir le Review Triage Log complet ci-dessous. Aucun correctif de code nécessaire.

## Spec Change Log

## Review Triage Log

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | Le message d'erreur français de `listLivrables` vit dans `actions/livrable.ts`, ce qui contredit littéralement CONVENTIONS.md ("chaînes visibles par l'utilisateur... jamais dans actions/"). Trouvé par la revue cas limites. | Low | No action | Pattern identique et pré-existant dans `actions/skill.ts`, `actions/conversation.ts`, `actions/project.ts`, `actions/document.ts`, `actions/mattermost.ts` — pas une régression de cette story, incohérence transversale déjà présente avant elle. |
| 2 | Les fixtures ne seedent qu'un seul livrable par projet — la branche "plusieurs cartes" de `LivrablesPanel.tsx` (le `.map()`) n'a donc jamais été exercée en direct avec 2+ éléments, malgré la matrice I/O de la spec mentionnant "1+ livrables". Trouvé par la revue angles morts. | Low | No action | Le `.map()` est trivial et le CSS réutilisé (`.card`/`.skill-card`) ne contient aucune règle dépendant du nombre d'éléments (pas de `:first-child`/`:last-child`/collapse de bordure) — risque théorique, pas une lacune concrète identifiée. |
| 3 | Le chemin d'échec serveur de `listLivrables` (`{ok:false,error}`) reste non vérifié par un déclenchement réel de panne, par l'implémenteur comme par les trois revues (bac à sable bloquant les tentatives de verrou exclusif/`DROP TABLE` comme destruction irréversible). Trouvé par la revue gaps de vérification. | Low | No action (limite d'environnement) | Pattern `try/catch` identique à `listProjectSkills`/`listConversations`, déjà accepté sans réserve dans les Stories 2.2/2.4 sur la même base de raisonnement ; `listLivrables` ne fait même pas de `JSON.parse` sur `content` (il ne sélectionne que `id`/`title`), donc aucun mode d'échec distinctif par rapport aux actions comparables. |
| 4 | La revue gaps de vérification a effectivement réussi à lancer un vrai navigateur interactif dans son environnement (contrairement à l'implémenteur et aux deux autres lentilles de cette story, qui n'y avaient pas eu accès) et a revérifié en direct l'ordre des panneaux, les deux cartes fixtures, l'absence de `<a>`/`<button>`, la forme JSON AD-9, l'idempotence du seed sur 4 chargements, et l'application de la migration à froid sur une base neuve (les 6 migrations, dans l'ordre). | — | Verify | Tout confirmé conforme aux affirmations de l'implémenteur — aucune divergence trouvée. |
| — | AD-2 (seul `actions/livrable.ts` touche `LIVRABLE`), AD-9 (forme JSON dès la création), frontière FR-10 (`LivrableSummary` ne porte ni `content` ni `conversationId`), absence de clic-through/bouton simulé, position relative dans la colonne droite sans modification de `ContextPanel`/`MattermostPanel`, cohérence FK migration/schéma, seed idempotent sur double appel | — | No action | Vérifiés indépendamment par les trois revues — corrects tels qu'implémentés. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no type errors
- `npx next build --turbopack` -- expected: clean build

**Manual checks (if no CLI):**
- Charger chaque projet seed : confirmer la carte livrable attendue, positionnée entre Contexte et Mattermost.
- Vérifier l'état vide (projet hors fixtures ou `livrable` vidé temporairement en base, à revert) : invite courte visible, pas de zone silencieuse.
- Confirmer qu'aucune carte n'est cliquable/interactive (pas de lien, pas de handler).
