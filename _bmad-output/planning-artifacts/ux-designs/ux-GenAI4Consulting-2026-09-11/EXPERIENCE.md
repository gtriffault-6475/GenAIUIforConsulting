---
title: "GenAI4Consulting — Experience"
status: final
created: 2026-09-11
updated: 2026-10-02
sources:
  - _bmad-output/planning-artifacts/briefs/brief-GenAI4Consulting-2026-09-10/brief.md
  - _bmad-output/planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-02.md
---

# GenAI4Consulting — Experience Spine

## Foundation

Web app desktop, écran unique (pas de responsive mobile/tablette pour ce round — voir Responsive & Platform). Pas de système de composants hérité ; `DESIGN.md` est la référence visuelle. Mono-tenant par projet : un consultant travaille dans un projet à la fois, lié à un projet Octopod existant (héritage automatique de l'accès au drive et au canal Mattermost).

**Round 1 : les intégrations Octopod et Mattermost sont simulées, mais l'expérience ne l'expose jamais.** [Décision sourcée du brief — Scope] Aucune interface ne doit indiquer "ceci est une donnée factice" : le testeur doit vivre l'outil comme s'il était branché en vrai, pour que son jugement porte sur l'idée et pas sur l'état d'avancement technique.

**Le drive du projet est un vrai Google Drive** (PRD §4.5, Sprint Change Proposal du 2026-10-02). Le consultant connecte une fois son compte Google ; l'app lit le dossier Drive du projet, importe ses présentations Google Slides comme livrables et réécrit le fichier sur action explicite. Trois situations, sans jamais montrer de donnée simulée hors mode démo :
- **Compte Google connecté** : les panneaux Contexte et Livrables montrent le vrai dossier Drive du projet.
- **Hors mode démo, sans compte connecté** : aucun contenu de drive, seulement une invite à connecter Google Drive.
- **Mode démo** : le panneau Contexte montre un drive simulé ; aucune mention de Google (bouton, invite) n'apparaît, et les livrables Drive n'existent pas.

## Information Architecture

| Surface | Atteinte depuis | Rôle |
|---|---|---|
| Sélection de projet | Premier lancement / sélecteur en haut de l'espace de travail | Se connecter à un projet Octopod existant — hérite du drive et du canal Mattermost |
| Espace de travail | Après sélection d'un projet | Conversation avec les agents, stepper de workflow, skills, accès contexte/livrables/Mattermost |
| Éditeur assisté | Clic sur un livrable (panneau droit de l'espace de travail) | Un document ouvert, avec les suggestions de l'IA ancrées en marge. Pour une présentation importée du Drive : regroupement par diapositive et enregistrement dans Drive |
| Consentement Google | Clic sur "Connecter Google Drive" (barre du haut) | Écran de consentement de Google, hors de l'app ; retour automatique à l'espace de travail une fois accepté |

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
| Panneau Contexte | Sidebar droite | Fichiers présents directement dans le dossier Drive du projet (réel quand Google est connecté, simulé en mode démo), puis les documents ajoutés hors-drive. Lecture seule : aucun fichier n'est modifié depuis ce panneau. Chaque Google Docs, Slides ou Sheets porte une case "Utiliser comme contexte" ; seuls les fichiers cochés sont lus et envoyés à l'agent, et le choix se défait à tout moment. Les autres formats portent la mention "non lisible par l'agent", sans case. Les documents ajoutés hors-drive sont toujours utilisés comme contexte. |
| Panneau Livrables | Sidebar droite | Deux groupes. "En cours" : livrables ouverts dans l'app, adossés à Drive ou non. "Dans le Drive du projet" : présentations Google Slides pas encore importées (groupe absent en mode démo). Icône Slides sur tout élément adossé à Drive. Cliquer un livrable en cours ouvre l'Éditeur assisté ; cliquer une présentation Drive l'importe puis l'ouvre ; une présentation déjà importée n'apparaît qu'une fois, dans "En cours". |
| Panneau Mattermost | Sidebar droite | Aperçu du dernier message du canal lié + lien pour l'ouvrir dans Mattermost. Jamais d'envoi de message depuis ce panneau — c'est un point d'entrée, pas un client Mattermost. |
| Suggestion ancrée | Panneau IA de l'éditeur | Rattachée à un paragraphe précis (repère `¶N`). Trois actions : Accepter (applique et marque la carte comme résolue), Rejeter (marque comme résolue sans appliquer), Retravailler (ouvre un champ pour préciser la demande, renvoie en attente une fois envoyée). Une seule suggestion active par paragraphe à la fois. L'éditeur est sur deux panneaux (≥ 1100px) : le document à gauche, le panneau IA à droite, chacun avec son propre défilement ; en dessous de 1100px, une seule colonne (document, puis panneau IA). Les cartes sont listées dans l'ordre du document (`¶N`), les suggestions sans paragraphe résolu en dernier ; l'en-tête du panneau indique "N en attente". Chaque paragraphe affiche son repère `¶N` dans la marge gauche. Cliquer le `¶N` d'une carte ("Voir le paragraphe ¶N") centre le paragraphe dans le panneau document, le met brièvement en évidence et y place le focus ; cliquer le repère d'un paragraphe visé par une suggestion en attente ou en retravail ("Voir la suggestion pour ¶N") amène sa carte dans le panneau IA, la met en évidence et y place le focus. Une carte en attente ou en retravail montre le texte actuel du paragraphe barré ("Actuel") au-dessus du texte proposé ("Proposé") ; une suggestion globale ou dont le paragraphe n'existe plus montre le texte proposé seul ; une carte acceptée ou rejetée garde son affichage compact. Quand au moins deux suggestions en attente visent un paragraphe encore présent, "Tout accepter" (bouton IA, compact) apparaît à côté de "N en attente" ; une confirmation s'affiche sous l'en-tête ("Accepter les N suggestions en attente ? Leur texte remplace celui des paragraphes.", "Tout accepter" / "Annuler", `Échap` annule), puis le résultat ("N acceptées." ou "N acceptées. M restent à traiter."). Les suggestions en retravail, globales ou dont le paragraphe n'existe plus restent à traiter. Pas d'annulation, pas d'enregistrement automatique dans Drive. |
| Connexion Google | Barre du haut, à droite du sélecteur de projet | Bouton neutre "Connecter Google Drive" qui ouvre le consentement Google. Une fois connecté : l'adresse du compte, et "Se déconnecter" dans un menu (surface flottante, une seule ouverte à la fois). Masquée en mode démo. |
| Conversation d'un livrable Drive | Liste de conversations | Importer ou créer une présentation crée une conversation dédiée, titrée d'après la présentation ; c'est là que vont la révision globale et les demandes de suggestions. Une conversation a au plus un livrable. |
| Diapositives dans l'éditeur | Éditeur assisté (livrable adossé à Slides) | Les paragraphes sont regroupés sous un intitulé "Diapositive N", N étant le rang de la diapositive dans la présentation. Une zone de texte = un paragraphe, avec son repère `¶N` habituel, affiché dans la marge gauche ; la numérotation court d'une diapositive à l'autre et les liens paragraphe ↔ suggestion fonctionnent de la même façon. Titre et actions Drive (Ouvrir dans Google Slides, Réimporter, Enregistrer dans Drive) sont dans l'en-tête, au-dessus des deux panneaux. Le document reste du texte : pas d'aperçu visuel des diapositives. Le texte ne change que par des suggestions acceptées : pas d'édition directe, ni d'ajout ou de suppression de paragraphe. Tableaux, images et notes du présentateur n'apparaissent pas. Les suggestions sont demandées par le consultant, jamais générées à l'import. |
| Enregistrer dans Drive | En-tête de l'Éditeur assisté (livrable adossé à Drive) | Bouton principal neutre (action de l'utilisateur, jamais violet). Désactivé tant qu'aucun paragraphe n'a changé depuis la dernière version Drive. Avant l'écriture, un rappel court : "Seul le texte des zones modifiées est réécrit ; leur mise en forme peut être simplifiée." Ce rappel est demandé une fois par onglet : une fois confirmé, les enregistrements suivants dans cet onglet (sur n'importe quel livrable Drive) s'écrivent directement ; il revient dans un nouvel onglet. Indisponible hors connexion Google. |
| Réimporter | En-tête de l'Éditeur assisté (livrable adossé à Drive) | Action secondaire explicite qui recharge la version Drive. Si des changements acceptés ne sont pas encore enregistrés, un avertissement demande confirmation avant de les perdre. Les suggestions dont la zone existe encore et n'a pas changé dans Drive sont conservées. |
| Proposition de présentation | Conversation | L'agent présente la suite de diapositives proposée (titre + contenu) dans une carte avec "Créer dans Drive" / "Ajuster". Rien n'est créé sans clic sur "Créer dans Drive" ; le fichier porte le titre proposé et s'ouvre ensuite comme livrable. Indisponible hors connexion Google. |
| Révision globale | Bas du panneau IA de l'éditeur (épinglé sous la liste des suggestions, toujours visible) | Champ libre distinct des suggestions ancrées — pour une demande qui ne cible pas un paragraphe précis (ex. "raccourcis l'ensemble"). Sans aucune suggestion, le panneau affiche au-dessus du champ : "Aucune suggestion pour le moment. Demandez une révision ci-dessous." Ne crée pas de nouvelle suggestion ancrée automatiquement ; le résultat revient dans la conversation liée au document. Sur un livrable adossé à Drive, la révision produit des suggestions ancrées, jamais un document régénéré. [ASSUMPTION : le comportement exact de ce retour n'a pas été spécifié pendant la conversation.] |

## State Patterns

| État | Surface | Traitement |
|---|---|---|
| Aucune skill chargée | Panneau Skills | Liste vide + l'invite "Ajouter une skill" reste visible en premier élément, pas de message d'erreur. |
| Aucun livrable | Panneau Livrables | Un texte court invite à en créer un depuis la conversation ou un workflow — pas de case vide silencieuse. [ASSUMPTION : copie exacte non écrite, à trancher en Finalize.] |
| Suggestion proactive masquée | Espace de travail | Ne réapparaît que sur un nouveau changement d'étape de workflow ou une nouvelle session — jamais en boucle dans la même conversation. |
| Suggestion ancrée — en attente / acceptée / rejetée / en retravail | Éditeur assisté | Voir Component Patterns. Une suggestion acceptée ou rejetée s'estompe visuellement (texte en `text-muted`) mais reste visible dans le panneau — pas de disparition immédiate, pour que le consultant garde une trace de ce qu'il a tranché. |
| Intégration Octopod/Mattermost simulée, drive simulé en mode démo | Partout | Aucun indicateur "donnée factice" n'est affiché (voir Foundation) — l'état se comporte comme un état réel normal (chargé, à jour). En mode démo, aucune mention de Google n'apparaît. |
| Google non connecté (hors mode démo) | Panneaux Contexte et Livrables | Aucun contenu de drive ; une invite courte "Connectez Google Drive pour afficher les fichiers du projet." avec le bouton de connexion. Les documents ajoutés hors-drive et les livrables déjà ouverts restent affichés. |
| Dossier racine non configuré | Panneaux Contexte et Livrables | "Google Drive n'est pas configuré pour cette installation." Aucune action Drive proposée. |
| Dossier Drive introuvable / en double | Panneaux Contexte et Livrables | "Aucun dossier « {nom du projet} » dans le Drive racine." ou "Plusieurs dossiers portent le nom « {nom du projet} »." Jamais de création automatique. |
| Connexion Google expirée ou révoquée | Barre du haut, panneaux | L'app revient à l'état "Google non connecté" et propose de se reconnecter, sans message d'erreur technique. |
| Enregistrement — en cours / enregistré / conflit / erreur | Éditeur assisté | Libellé du bouton + message court. Conflit : "Ce fichier a été modifié dans Google Slides depuis l'import. Réimportez-le pour repartir de la dernière version." avec l'action "Réimporter" ; rien n'est écrit. Erreur : "L'enregistrement dans Drive a échoué. Réessayez." Enregistré : le bouton se désactive jusqu'au prochain changement. |
| Livrable Drive hors connexion Google | Éditeur assisté | Le livrable reste consultable et ses suggestions traitables ; "Enregistrer dans Drive" et "Réimporter" sont désactivés avec la mention "Connectez Google Drive pour enregistrer." |

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
- La case "Utiliser comme contexte" est un vrai contrôle de formulaire, avec un libellé qui nomme le fichier ; l'état d'enregistrement dans Drive est annoncé par texte, pas seulement par la couleur du bouton.

[ASSUMPTION : l'accessibilité n'a pas été discutée pendant la conversation — ce plancher est une proposition par défaut pour un outil interne professionnel, à confirmer ou durcir avant tout usage au-delà du groupe de test.]

## Responsive & Platform

Desktop uniquement pour le round 1, largeur cible ≥ 1280px. Pas de comportement mobile ou tablette défini ; si un consultant ouvre l'outil sur un écran plus étroit, aucun repli n'est spécifié pour cette version.

[ASSUMPTION : non discuté explicitement — déduit du contexte (consultants au poste de travail, éditeur + conversation + 3 panneaux affichés simultanément).]

## Inspiration & Anti-patterns

- **Repère de composition connu :** disposition en trois colonnes (navigation + skills à gauche, conversation au centre, contexte projet à droite). Convention déjà familière aux consultants via les outils de chat/productivité qu'ils utilisent par ailleurs (Slack, Notion), choisie pour minimiser l'apprentissage plutôt que pour se différencier visuellement. [ASSUMPTION : rationale déduite, pas discutée explicitement.]
- **Rejeté — chat IA générique sans contexte projet.** Le brief est explicite : "donner ChatGPT/Copilot à tous" ne suffit pas. L'interface n'existe que connectée à un projet Octopod ; il n'y a pas de mode "conversation libre" sans projet.
- **Rejeté — exposer l'état mocké des intégrations.** Contredirait le scope round 1 du brief ("l'expérience doit rester crédible"). D'où l'invite seule, sans contenu simulé, quand Google n'est pas connecté hors mode démo.
- **Rejeté — envoi automatique du dossier Drive à l'IA.** Seuls les fichiers que le consultant coche, ou la présentation qu'il importe pour la retravailler, partent vers le modèle IA.
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

**Prolongement Drive** [ASSUMPTION : prolongement proposé à partir du Sprint Change Proposal du 2026-10-02, pas encore raconté par un consultant — à valider avec le groupe de test] :

8. Le mardi, Camille veut retravailler la présentation de soutenance déjà commencée par l'équipe dans le dossier Drive du projet. Son compte Google est connecté depuis la veille.
9. Dans le panneau Livrables, sous "Dans le Drive du projet", elle clique "Soutenance RFP — v2" : la présentation s'importe et s'ouvre dans l'Éditeur assisté, regroupée par diapositive, avec sa propre conversation dans la liste.
10. Elle coche aussi, dans le panneau Contexte, la grille d'évaluation du client (une Google Sheet) pour que l'agent en tienne compte, puis demande des suggestions via la révision globale : "aligne le discours sur les critères de la grille".
11. **Climax :** des suggestions apparaissent, ancrées aux zones de texte des diapositives 3, 5 et 8. Elle en accepte deux, puis clique "Enregistrer dans Drive" : seules ces deux zones sont réécrites dans le fichier partagé, et le reste du deck de l'équipe est intact.

Échec : entre-temps, un collègue a modifié le titre de la diapositive 5 dans Google Slides. L'enregistrement est refusé avec le message de conflit ; Camille réimporte, retrouve le titre de son collègue, et redemande une suggestion sur cette zone.

### Flow 2 — Livrable de mission (Karim, consultant, en régie chez un client)

1. Karim doit produire une note de synthèse d'audit pour une mission en cours, déjà suivie dans un projet Octopod.
2. Il se connecte au projet — même schéma que Camille : drive et Mattermost déjà en place, rien à reconfigurer.
3. Le stepper de workflow ne s'applique pas de la même façon qu'en avant-vente. [ASSUMPTION : le brief ne précise pas d'étapes pour ce cas d'usage — à définir en PRD/architecture] Karim ignore la suggestion proactive et ouvre directement une conversation pour demander un premier plan de la note à partir des comptes-rendus d'atelier du projet.
4. Il crée le livrable depuis la conversation et l'ouvre dans l'Éditeur assisté pour l'affiner section par section.
5. **Climax :** en relisant, il retravaille une suggestion trop générique en précisant "reformule avec les chiffres de l'atelier du 3 septembre" — la carte se met à jour avec une proposition qui cite directement les bons chiffres, sans qu'il ait eu à rouvrir la conversation générale.

Échec : aucun atelier du 3 septembre n'existe dans le contexte du projet — la suggestion retravaillée revient avec une note demandant de préciser la source, plutôt que d'inventer un chiffre.
