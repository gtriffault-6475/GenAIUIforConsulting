---
title: "GenAI4Consulting — Experience"
status: final
created: 2026-09-11
updated: 2026-09-11
sources:
  - _bmad-output/planning-artifacts/briefs/brief-GenAI4Consulting-2026-09-10/brief.md
---

# GenAI4Consulting — Experience Spine

## Foundation

Web app desktop, écran unique (pas de responsive mobile/tablette pour ce round — voir Responsive & Platform). Pas de système de composants hérité ; `DESIGN.md` est la référence visuelle. Mono-tenant par projet : un consultant travaille dans un projet à la fois, lié à un projet Octopod existant (héritage automatique de l'accès au drive et au canal Mattermost).

**Round 1 : les intégrations Octopod / drive / Mattermost sont largement simulées, mais l'expérience ne l'expose jamais.** [Décision sourcée du brief — Scope] Aucune interface ne doit indiquer "ceci est une donnée factice" : le testeur doit vivre l'outil comme s'il était branché en vrai, pour que son jugement porte sur l'idée et pas sur l'état d'avancement technique.

## Information Architecture

| Surface | Atteinte depuis | Rôle |
|---|---|---|
| Sélection de projet | Premier lancement / sélecteur en haut de l'espace de travail | Se connecter à un projet Octopod existant — hérite du drive et du canal Mattermost |
| Espace de travail | Après sélection d'un projet | Conversation avec les agents, stepper de workflow, skills, accès contexte/livrables/Mattermost |
| Éditeur assisté | Clic sur un livrable (panneau droit de l'espace de travail) | Un document ouvert, avec les suggestions de l'IA ancrées en marge |

Pas de pile de modales à plus d'un niveau. Retour à l'espace de travail depuis l'éditeur par le fil d'Ariane en haut.

→ Référence de composition : `imports/Main.dc.html`, `imports/Editor.dc.html` (maquette cliquable, [publiée ici](https://claude.ai/code/artifact/51898919-f054-4fc9-aac7-029bdf2685cf)). Le spine gagne en cas de conflit.

## Voice and Tone

Microcopy. La posture de marque vit dans `DESIGN.md.Brand & Style`.

| Do | Don't |
|---|---|
| "Je propose de commencer par..." | "🚀 Prêt à booster votre productivité ?" |
| "Suggestion de départ" | "Astuce IA du jour !" |
| "Écrivez à l'IA…" | "Posez-moi votre question !" |
| "Acceptée" / "Rejetée" (sobre, sans icône festive) | "Suggestion validée avec succès ✓" |
| Vouvoiement, registre professionnel, phrases courtes | Familiarité, emoji, points d'exclamation |

[ASSUMPTION : le vouvoiement et le registre neutre suivent le ton déjà écrit dans la maquette — non discuté explicitement, à confirmer.]

## Component Patterns

Comportemental. Les specs visuelles vivent dans `DESIGN.md.Components`.

| Composant | Usage | Règles comportementales |
|---|---|---|
| Stepper de workflow | Haut de l'espace de travail | 4 étapes fixes pour le round 1 (Qualification → Références → Experts → Rédaction). Cliquer une étape la rend active et change le contexte de la conversation en dessous. Une étape passée affiche un check ; l'étape active est pleine, les suivantes neutres. |
| Suggestion proactive | Haut de la zone de conversation, à l'ouverture d'un projet ou d'une étape | Une seule à la fois. "Oui, commençons" l'accepte et avance le stepper à l'étape correspondante ; "Plus tard" la masque sans avancer. Comportement de réapparition : voir State Patterns. |
| Panneau Skills | Sidebar gauche | Liste des skills chargées dans le projet. "Ajouter une skill" ouvre un point d'entrée pour en attacher une nouvelle (le mécanisme d'ajout reste à définir en architecture — hors scope UX). |
| Liste de conversations | Sidebar gauche | Plusieurs conversations peuvent coexister sur un même projet (ex. un sujet par étape ou par question). Cliquer une conversation la rend active (`nav-row-active`) et remplace le contenu du centre. "Nouvelle conversation" crée un fil vide et l'active immédiatement. Pas de suppression ni de renommage spécifiés pour ce round 1. |
| Conversation | Centre de l'espace de travail | Historique de la conversation active, privée au consultant — voir la section Foundation du brief source : seuls les livrables et assets produits sont partagés à l'équipe, jamais la conversation elle-même. |
| Composer | Bas de l'espace de travail | Zone de saisie + sélecteur de modèle IA (liste fermée, ex. Sonnet 5 / Opus 5 / Haiku 4.5) + envoi. Le sélecteur de modèle ne propose jamais de choix d'agent — un agent/skill se choisit via le panneau Skills, pas ici. |
| Panneau Contexte | Sidebar droite | Documents et répertoires issus du drive du projet Octopod. Lecture seule dans ce panneau — ajouter un document se fait ailleurs (mécanisme hors scope UX round 1). |
| Panneau Livrables | Sidebar droite | Documents en cours de production avec l'IA. Cliquer un livrable ouvre l'Éditeur assisté sur ce document. |
| Panneau Mattermost | Sidebar droite | Aperçu du dernier message du canal lié + lien pour l'ouvrir dans Mattermost. Jamais d'envoi de message depuis ce panneau — c'est un point d'entrée, pas un client Mattermost. |
| Suggestion ancrée | Panneau IA de l'éditeur | Rattachée à un paragraphe précis (repère `¶N`). Trois actions : Accepter (applique et marque la carte comme résolue), Rejeter (marque comme résolue sans appliquer), Retravailler (ouvre un champ pour préciser la demande, renvoie en attente une fois envoyée). Une seule suggestion active par paragraphe à la fois. |
| Révision globale | Bas du panneau IA de l'éditeur | Champ libre distinct des suggestions ancrées — pour une demande qui ne cible pas un paragraphe précis (ex. "raccourcis l'ensemble"). Ne crée pas de nouvelle suggestion ancrée automatiquement ; le résultat revient dans la conversation liée au document. [ASSUMPTION : le comportement exact de ce retour n'a pas été spécifié pendant la conversation.] |

## State Patterns

| État | Surface | Traitement |
|---|---|---|
| Aucune skill chargée | Panneau Skills | Liste vide + l'invite "Ajouter une skill" reste visible en premier élément, pas de message d'erreur. |
| Aucun livrable | Panneau Livrables | Un texte court invite à en créer un depuis la conversation ou un workflow — pas de case vide silencieuse. [ASSUMPTION : copie exacte non écrite, à trancher en Finalize.] |
| Suggestion proactive masquée | Espace de travail | Ne réapparaît que sur un nouveau changement d'étape de workflow ou une nouvelle session — jamais en boucle dans la même conversation. |
| Suggestion ancrée — en attente / acceptée / rejetée / en retravail | Éditeur assisté | Voir Component Patterns. Une suggestion acceptée ou rejetée s'estompe visuellement (texte en `text-muted`) mais reste visible dans le panneau — pas de disparition immédiate, pour que le consultant garde une trace de ce qu'il a tranché. |
| Intégration Octopod/drive/Mattermost simulée | Partout | Aucun indicateur "donnée factice" n'est affiché (voir Foundation) — l'état se comporte comme un état réel normal (chargé, à jour). |

## Interaction Primitives

Souris en premier plan ; pas d'exigence "clavier d'abord" identifiée pendant la conversation.

- `Entrée` dans le composer envoie le message.
- `Échap` ferme le menu du sélecteur de modèle ou annule un "Retravailler" en cours.
- Clic en dehors d'un menu déroulant le referme.

[ASSUMPTION : aucun raccourci clavier spécifique n'a été demandé — ce round 1 n'en propose pas au-delà des primitives ci-dessus. À revisiter si le groupe de test le réclame.]

## Accessibility Floor

Comportemental. Le contraste visuel vit dans `DESIGN.md.Colors`.

- Ordre de tabulation suit l'ordre de lecture sur chaque écran.
- `Échap` ferme systématiquement le dernier élément flottant ouvert (menu, champ de retravail).
- Les trois états d'une suggestion (acceptée/rejetée/en attente) se distinguent par autre chose que la seule couleur (icône check pour acceptée, libellé texte pour rejetée).

[ASSUMPTION : l'accessibilité n'a pas été discutée pendant la conversation — ce plancher est une proposition par défaut pour un outil interne professionnel, à confirmer ou durcir avant tout usage au-delà du groupe de test.]

## Responsive & Platform

Desktop uniquement pour le round 1, largeur cible ≥ 1280px. Pas de comportement mobile ou tablette défini ; si un consultant ouvre l'outil sur un écran plus étroit, aucun repli n'est spécifié pour cette version.

[ASSUMPTION : non discuté explicitement — déduit du contexte (consultants au poste de travail, éditeur + conversation + 3 panneaux affichés simultanément).]

## Inspiration & Anti-patterns

- **Repère de composition connu :** disposition en trois colonnes (navigation + skills à gauche, conversation au centre, contexte projet à droite). Convention déjà familière aux consultants via les outils de chat/productivité qu'ils utilisent par ailleurs (Slack, Notion), choisie pour minimiser l'apprentissage plutôt que pour se différencier visuellement. [ASSUMPTION : rationale déduite, pas discutée explicitement.]
- **Rejeté — chat IA générique sans contexte projet.** Le brief est explicite : "donner ChatGPT/Copilot à tous" ne suffit pas. L'interface n'existe que connectée à un projet Octopod ; il n'y a pas de mode "conversation libre" sans projet.
- **Rejeté — exposer l'état mocké des intégrations.** Contredirait le scope round 1 du brief ("l'expérience doit rester crédible").
- **Rejeté — sélecteur de modèle faisant aussi office de sélecteur d'agent.** Décision explicite de la session : les deux choix restent séparés (modèle dans le composer, agents/skills dans la sidebar gauche).

## Key Flows

### Flow 1 — Réponse avant-vente (Camille, consultante senior, lundi matin)

1. Camille reçoit un RFP intéressant d'un client et crée l'opportunité dans Octopod : nom, drive partagé, canal Mattermost dédié.
2. Dans GenAI4Consulting, elle sélectionne ce projet Octopod — le drive et le canal Mattermost s'attachent automatiquement, visibles dans les panneaux de droite.
3. Elle ajoute un compte-rendu de call achats, absent du drive, que le client lui a envoyé par email.
4. L'espace de travail s'ouvre sur une suggestion proactive : "Je propose de commencer par identifier les missions OCTO déjà réalisées pour un client similaire." Elle clique "Oui, commençons" — le stepper avance à l'étape Références.
5. Elle échange avec l'agent, qui lui remonte deux missions similaires dans le secteur financier avec les consultants impliqués.
6. Elle ouvre le livrable "Réponse RFP — v1" depuis le panneau Livrables : elle arrive dans l'Éditeur assisté.
7. **Climax :** trois suggestions l'attendent déjà, ancrées sur des paragraphes précis — un chiffre à ajouter, une phrase redondante à couper, un nom d'expert à vérifier. Elle n'a rien eu à demander : l'IA avait déjà annoté le document en fonction de la conversation qu'elle venait d'avoir. Elle accepte la première, rejette la deuxième, et demande à retravailler la troisième d'un clic.

Échec : le nom d'expert proposé (Julien M.) n'est pas confirmé en interne — elle rejette la suggestion et note en Mattermost de vérifier sa disponibilité avant l'envoi.

### Flow 2 — Livrable de mission (Karim, consultant, en régie chez un client)

1. Karim doit produire une note de synthèse d'audit pour une mission en cours, déjà suivie dans un projet Octopod.
2. Il se connecte au projet — même schéma que Camille : drive et Mattermost déjà en place, rien à reconfigurer.
3. Le stepper de workflow ne s'applique pas de la même façon qu'en avant-vente. [ASSUMPTION : le brief ne précise pas d'étapes pour ce cas d'usage — à définir en PRD/architecture] Karim ignore la suggestion proactive et ouvre directement une conversation pour demander un premier plan de la note à partir des comptes-rendus d'atelier du projet.
4. Il crée le livrable depuis la conversation et l'ouvre dans l'Éditeur assisté pour l'affiner section par section.
5. **Climax :** en relisant, il retravaille une suggestion trop générique en précisant "reformule avec les chiffres de l'atelier du 3 septembre" — la carte se met à jour avec une proposition qui cite directement les bons chiffres, sans qu'il ait eu à rouvrir la conversation générale.

Échec : aucun atelier du 3 septembre n'existe dans le contexte du projet — la suggestion retravaillée revient avec une note demandant de préciser la source, plutôt que d'inventer un chiffre.
