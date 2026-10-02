---
title: PRD GenAI4Consulting
created: 2026-09-11
updated: 2026-10-02
status: final
---

# PRD: GenAI4Consulting
*Working title — confirm.*

## 0. Document Purpose

Ce PRD s'adresse au porteur de projet, à l'architecte qui prendra le relais, et aux consultants OCTO qui rejoindront le groupe de test round 1. Il construit sur deux documents déjà finalisés plutôt que de les dupliquer : le [brief produit](../../briefs/brief-GenAI4Consulting-2026-09-10/brief.md) (problème, différenciation, success criteria, scope) et les [spines UX](../../ux-designs/ux-GenAI4Consulting-2026-09-11/) `DESIGN.md`/`EXPERIENCE.md` (identité visuelle, architecture de l'information, patterns de composants, key flows). Le vocabulaire du Glossaire (§3) fait autorité ; les Exigences Fonctionnelles sont numérotées globalement (FR-1 à FR-31) et regroupées par fonctionnalité ; les `[ASSUMPTION]` sont indexées en §9.

## 1. Vision

GenAI4Consulting est une interface de travail agentique interne pour les consultants OCTO, qui se branche sur l'existant du cabinet — Octopod, le drive, Mattermost — plutôt que de le remplacer. Elle combine trois briques dès le round 1 : un espace multi-agents pour dialoguer avec des skills spécialisées, un éditeur assisté par IA qui commente en marge des documents sans jamais retirer la main au consultant, et un orchestrateur de workflow qui guide activement plutôt que de présenter une page blanche.

Le produit répond à un écart réel : moins de la moitié des consultants OCTO utilisent aujourd'hui l'IA de façon structurée, et ce qui fonctionne chez les uns ne profite jamais au reste du cabinet. Pendant ce temps, plusieurs grands cabinets de conseil ont déjà déployé leurs propres plateformes internes — voir §"Why Now" et le brief pour le détail.

Round 1 est un prototype exploratoire, pas un produit à l'échelle de ces plateformes. Les intégrations sont largement simulées : Octopod et Mattermost le sont, mais le drive est un vrai Google Drive depuis le Sprint Change Proposal du 2026-10-02 (voir §4.5). Le groupe de testeurs est petit et déjà identifié, et aucun ROI chiffré n'est attendu. L'objectif est de valider que l'idée tient debout et mérite d'être poussée plus loin. Si c'est le cas, le produit grossira au-delà des deux cas d'usage initiaux, vers une intégration plus profonde à l'écosystème OCTO (brief, §Vision).

## 2. Target User

### 2.1 Jobs To Be Done

- **Fonctionnel** — Retrouver rapidement des références de missions similaires et les bons experts internes, sans dépendre de son seul réseau personnel.
- **Fonctionnel** — Produire un premier jet de livrable (réponse à un appel d'offres, note de mission hors code) plus vite et de meilleure qualité, avec l'IA qui intervient en marge du document plutôt qu'à sa place.
- **Émotionnel** — Se sentir aussi équipé que les consultants des grands cabinets concurrents, en particulier quand un client demande "et vous, comment vous l'utilisez en interne ?"
- **Social** — Bénéficier de ce qu'un collègue a déjà découvert sans avoir à le lui demander en 1:1 — la capitalisation cesse d'être informelle, et le consultant n'a plus à choisir entre repartir de zéro ou bricoler sa propre solution hors du cadre du cabinet.

### 2.2 Non-Users (v1)

- Les consultants OCTO en dehors du petit groupe de testeurs déjà identifié par le porteur de projet (round 1 n'est pas ouvert à un recrutement plus large).
- Les clients d'OCTO — l'outil est strictement interne, aucune surface n'est pensée pour un usage client à ce stade.

### 2.3 Key User Journeys

*Numérotées globalement UJ-1/UJ-2 ; reprennent Flow 1/Flow 2 d'`EXPERIENCE.md`, référence pour le détail visuel. Les termes utilisés ci-dessous sont définis au Glossaire (§3).*

- **UJ-1. Camille répond à un appel d'offres sans repartir de zéro.**
  - **Persona + contexte :** Camille, consultante senior en avant-vente, reçoit un RFP intéressant un lundi matin.
  - **Entrée :** elle crée l'opportunité dans Octopod (nom, drive, canal Mattermost), puis ouvre GenAI4Consulting.
  - **Parcours :** elle connecte le projet Octopod (FR-1, FR-2) ; ajoute un compte-rendu de call achats absent du drive (FR-4) ; accepte la suggestion proactive d'ouverture qui propose de chercher des références similaires (FR-17) ; échange avec l'agent, qui remonte deux missions comparables et leurs consultants.
  - **Climax :** elle ouvre le livrable "Réponse RFP — v1" (FR-19) et trouve trois suggestions déjà ancrées à des paragraphes précis, sans avoir rien demandé (FR-20) — elle en accepte une, en rejette une, en retravaille une (FR-21).
  - **Résolution :** le document progresse avec sa décision sur chaque suggestion tracée dans le panneau (FR-22).
  - **Edge case :** le nom d'expert suggéré n'est pas confirmé en interne — elle rejette et note en Mattermost de vérifier avant l'envoi.

- **UJ-2. Karim affine une note de mission avec des chiffres précis, en régie.**
  - **Persona + contexte :** Karim, consultant en régie chez un client, doit produire une note de synthèse d'audit (livrable hors code) sur un projet déjà suivi dans Octopod.
  - **Entrée :** il connecte le même projet Octopod déjà lié à sa mission (FR-1, FR-2).
  - **Parcours :** il ignore la suggestion proactive (le stepper avant-vente ne s'applique pas de la même façon à ce cas d'usage — voir FR-15 et OQ-3) ; ouvre une conversation pour demander un premier plan à partir des comptes-rendus d'atelier du projet ; crée le livrable depuis la conversation.
  - **Climax :** en relisant le livrable dans l'éditeur (FR-19), il retravaille une suggestion trop générique en précisant "reformule avec les chiffres de l'atelier du 3 septembre" (FR-21) — la carte revient avec une proposition qui cite directement ces chiffres.
  - **Résolution :** le document s'affine section par section sans qu'il rouvre la conversation générale.
  - **Edge case :** si l'atelier cité n'existe pas dans le contexte du projet, la suggestion retravaillée redemande une source plutôt que d'inventer un chiffre.

**FR non illustrées ci-dessus** (couvertes par les journeys mais non citées inline) : FR-3, FR-5, FR-18, FR-24. FR-25 à FR-31 (§4.5, ajoutées par le Sprint Change Proposal du 2026-10-02) prolongent UJ-1 et UJ-2 — le livrable vit dans le dossier Drive du projet — sans être illustrées par une étape de journey.

## 3. Glossary

- **Projet (Octopod)** — Espace de travail existant dans Octopod (opportunité avant-vente ou mission), avec son propre drive partagé et son canal Mattermost dédié. Un consultant se **connecte** à un projet ; il n'en crée pas depuis GenAI4Consulting. Un seul projet est actif à la fois pour un consultant.
- **Round 1** — Le premier tour de test du prototype, auprès d'un petit groupe de consultants déjà identifié. Scope et contraintes définis dans le brief.
- **Espace de travail** — Surface principale de GenAI4Consulting, atteinte après connexion à un projet : conversation, stepper, skills, panneaux Contexte/Livrables/Mattermost.
- **Conversation** — Fil d'échange entre le consultant et l'agent, privé au consultant qui l'a créé. Un projet peut avoir plusieurs conversations.
- **Skill** — Capacité spécialisée que l'agent peut invoquer dans le cadre d'un projet (ex. recherche de références). Chargée par projet ; le mécanisme d'ajout est hors scope UX (voir FR-11).
- **Agent** — L'interlocuteur IA du consultant dans une conversation, qui invoque des skills. Distinct du **modèle IA** (voir ci-dessous) : on ne choisit jamais l'un à la place de l'autre au même endroit.
- **Modèle IA** — Le modèle sous-jacent traitant les messages du composer (ex. Sonnet 5), choisi dans une liste fermée. Ne remplace pas le choix d'un agent ou d'une skill.
- **Suggestion proactive** — Proposition de première action affichée par l'IA à l'ouverture d'un projet ou d'une étape de workflow, distincte d'une **suggestion ancrée**.
- **Stepper de workflow** — Représentation visuelle des étapes du cas d'usage avant-vente (Qualification → Références → Experts → Rédaction), portant l'orchestrateur de workflow.
- **Livrable** — Document hors code produit avec l'aide de l'IA sur un projet (réponse RFP, note de mission), listé dans le panneau Livrables, ouvert dans l'**Éditeur assisté**. Un livrable peut être adossé à une présentation Google Slides du **dossier Drive du projet**, créée par l'app ou importée depuis une présentation existante : c'est un **livrable adossé à Drive**. Le round 1 ne couvre pas les livrables de code.
- **Dossier Drive du projet** — Sous-dossier d'un dossier racine Google Drive commun, portant exactement le nom du projet Octopod et créé au préalable, hors de l'app. Le dossier racine est configuré une seule fois pour toute l'installation.
- **Mode démo** — Bascule visible dans l'app qui remplace les réponses du modèle IA par un script et le drive par des données simulées. Elle permet de présenter le produit sans aucune dépendance externe (ni clé d'API, ni compte Google).
- **Éditeur assisté** — Vue distincte de l'espace de travail où un livrable est ouvert avec un panneau de **suggestions ancrées** et de **révision globale** en marge.
- **Suggestion ancrée** — Suggestion de l'IA rattachée à un paragraphe précis d'un livrable ouvert dans l'Éditeur assisté ; traitable par Accepter / Rejeter / Retravailler.
- **Révision globale** — Demande de retravail d'un livrable ne ciblant pas un paragraphe précis, distincte d'une suggestion ancrée.

## 4. Features

*5 features. La connexion à un projet, prérequis commun aux trois briques du brief (espace multi-agents, orchestrateur de workflow, éditeur assisté), forme une feature à part entière pour porter ses propres FR, intégrations mockées comprises. La 5e feature, livrables et contexte Google Drive (§4.5), a été ajoutée par le Sprint Change Proposal du 2026-10-02.*

### 4.1 Connexion à un projet Octopod

**Description :** Point d'entrée de toute session GenAI4Consulting : le consultant se connecte à un projet Octopod existant plutôt que d'en créer un nouveau dans l'outil. La connexion hérite automatiquement du drive et du canal Mattermost du projet — c'est le mécanisme qui rend concret le différenciateur du brief : le moat n'est pas un modèle d'IA supérieur, il est dans l'intégration à l'existant OCTO et dans le savoir-faire du cabinet qu'on rend accessible (brief, §What Makes This Different). Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-1: Sélection d'un projet

Le consultant peut sélectionner un projet Octopod existant pour l'utiliser dans GenAI4Consulting. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- Le sélecteur de projet est accessible depuis la barre du haut de l'espace de travail à tout moment.
- Sans projet sélectionné, aucune surface de conversation, de skills ou de livrable n'est accessible.
- Un seul projet est actif à la fois ; sélectionner un autre projet remplace entièrement l'espace de travail affiché (conversations, skills, panneaux).

#### FR-2: Héritage automatique du drive et de Mattermost

À la connexion à un projet, le drive et le canal Mattermost associés sont automatiquement rattachés, sans configuration manuelle par le consultant.

**Consequences (testable):**
- Le panneau Contexte et le panneau Mattermost affichent du contenu dès la première ouverture d'un projet connecté, sans étape de configuration intermédiaire — hors la connexion unique du compte Google (FR-25), valable pour tous les projets.
- Si le dossier Drive du projet est introuvable, le panneau Contexte affiche à la place le message prévu par FR-26.

**Out of Scope:**
- Le mécanisme d'authentification réel à Octopod/Mattermost (round 1 mocké — voir FR-6).

#### FR-3: Panneau Contexte

Le panneau Contexte affiche, en lecture seule, les documents et répertoires du dossier Drive du projet connecté (le vrai Google Drive, voir FR-27).

**Consequences (testable):**
- Aucune action d'édition, de suppression ou d'ajout de document n'est disponible depuis ce panneau — un document ajouté par le consultant lui-même passe par FR-4, pas par ce panneau.

#### FR-4: Ajout d'un document hors-drive

Le consultant peut ajouter au projet un document absent du dossier Drive du projet (ex. compte-rendu reçu par email), pour qu'il serve de contexte à l'agent. Realizes UJ-1.

**Consequences (testable):**
- Un document ainsi ajouté est immédiatement disponible comme contexte pour la conversation, sans passer par le dossier Drive du projet.

**Out of Scope:**
- La distinction visuelle entre documents issus du drive et documents ajoutés manuellement dans le panneau Contexte (à trancher en UX si le besoin se confirme).

#### FR-5: Panneau Mattermost

Le panneau Mattermost affiche un aperçu du dernier message du canal lié et un lien pour l'ouvrir dans Mattermost.

**Consequences (testable):**
- Aucun champ de saisie ou d'envoi de message n'existe dans ce panneau — c'est un point d'entrée, jamais un client Mattermost.

#### FR-6: Intégrations simulées, expérience crédible

Pour le round 1, les données issues d'Octopod et de Mattermost sont simulées (mockées) côté système, sans qu'aucune indication visible ("donnée factice", badge de simulation) n'en informe le consultant. Le drive du projet est un vrai Google Drive (§4.5) ; il n'est simulé qu'en mode démo, avec la même exigence de crédibilité. Hors mode démo, l'absence de compte Google connecté est traitée par FR-25 : aucun drive simulé ne prend le relais.

**Consequences (testable):**
- Un testeur externe au projet ne peut pas distinguer, depuis l'interface, une donnée simulée d'une donnée réelle.

**Notes:** Contrainte sourcée directement du brief (§Scope) : "l'expérience doit rester crédible... sans que tout soit branché en réel." Elle reste valable avec un drive réel, puisque Octopod et Mattermost restent simulés. Voir aussi §Cross-Cutting NFRs — Crédibilité du mock.

### 4.2 Espace de travail multi-agents

**Description :** La brique "espace multi-agents" du brief : le consultant y dialogue avec un agent au travers d'une ou plusieurs conversations, avec les skills du projet à disposition. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-7: Conversations multiples par projet

Le consultant peut mener plusieurs conversations distinctes sur un même projet, chacune listée séparément.

**Consequences (testable):**
- La liste de conversations affiche un intitulé distinct par fil.

#### FR-8: Sélection d'une conversation active

Cliquer une conversation dans la liste l'active et affiche son historique au centre de l'espace de travail.

**Consequences (testable):**
- Une seule conversation est active à la fois ; la conversation active est visuellement distinguée dans la liste.

**Out of Scope:**
- Suppression ou renommage d'une conversation (non spécifié pour round 1).

#### FR-9: Création d'une nouvelle conversation

Le consultant peut créer une nouvelle conversation vide, qui devient immédiatement la conversation active.

#### FR-10: Confidentialité de la conversation

Une conversation est privée au consultant qui l'a créée. Seuls les livrables et assets qu'elle produit sont visibles par le reste de l'équipe projet ; le contenu de la conversation elle-même ne l'est jamais.

**Consequences (testable):**
- Aucune interface accessible à un autre membre du projet n'expose le contenu d'une conversation qui n'est pas la sienne.

**Notes:** Voir aussi §Constraints and Guardrails — Privacy.

#### FR-11: Skills du projet

Le consultant peut consulter la liste des skills chargées sur le projet et lancer un point d'entrée pour en attacher une nouvelle.

**Consequences (testable):**
- Quand aucune skill n'est chargée, la liste vide reste accompagnée du point d'entrée "Ajouter une skill" — jamais d'un message d'erreur.

**Out of Scope:**
- Le mécanisme technique d'ajout d'une skill à un projet (à définir en architecture — voir OQ-6).

**Notes:** Voir aussi §Cross-Cutting NFRs — Pas de pile de modale à plus d'un niveau (le point d'entrée d'ajout d'une skill s'ouvre au-dessus de l'écran courant).

#### FR-12: Sélection du modèle IA

Le composer permet de choisir, parmi une liste fermée de modèles IA, celui qui traite le message envoyé.

**Consequences (testable):**
- Le sélecteur de modèle ne propose jamais de choix d'agent ou de skill — ce choix se fait exclusivement via le panneau Skills (FR-11).

**Notes:** Décision explicite de la session, portée par l'anti-pattern rejeté dans `EXPERIENCE.md` : le sélecteur de modèle ne devient jamais un sélecteur d'agent.

#### FR-13: Panneau Livrables

Le panneau Livrables liste les documents en cours de production avec l'IA sur le projet, ainsi que les présentations du dossier Drive du projet (voir FR-28). Cliquer un livrable ouvre l'Éditeur assisté sur ce document (voir §4.4).

**Consequences (testable):**
- Quand aucun livrable n'existe encore, le panneau affiche une invite courte à en créer un depuis la conversation ou un workflow — jamais une zone vide silencieuse. [ASSUMPTION: copie exacte non écrite, héritée d'`EXPERIENCE.md` — à trancher en Finalize.]

### 4.3 Orchestrateur de workflow

**Description :** La brique "orchestrateur de workflow" du brief : un enchaînement d'étapes guidées plutôt qu'une conversation à page blanche — le levier principal du signal de succès "j'ai été guidé" (brief, §Success Criteria). Realizes UJ-1.

**Functional Requirements:**

#### FR-14: Stepper de workflow (avant-vente)

L'espace de travail affiche un stepper à 4 étapes fixes pour le cas d'usage avant-vente : Qualification → Références → Experts → Rédaction. Realizes UJ-1.

**Consequences (testable):**
- Les 4 étapes sont visibles simultanément, avec l'étape active visuellement distincte des étapes passées et à venir.

**Notes:** [ASSUMPTION: ces 4 étapes condensent le scénario en 6 points de l'addendum du brief ; elles n'ont pas été validées explicitement étape par étape avec l'utilisateur — à confirmer avant construction.]

#### FR-15: Workflow du cas d'usage "livrable de mission"

Pour le cas d'usage "livrable de mission", le stepper de workflow avant-vente ne s'applique pas nécessairement.

**Out of Scope:**
- La définition d'un stepper dédié à ce cas d'usage — voir OQ-3. [ASSUMPTION: le brief ne précise aucune étape pour ce cas d'usage ; UJ-2 illustre un usage sans stepper, par simple conversation libre suivie d'un livrable.]

#### FR-16: Navigation du stepper

Cliquer une étape du stepper l'active et met à jour le contexte de la conversation affichée en dessous.

**Consequences (testable):**
- Une étape déjà dépassée affiche un état "terminé" distinct de l'étape active et des étapes à venir.

#### FR-17: Suggestion proactive de démarrage

À l'ouverture d'un projet ou au passage à une nouvelle étape, l'IA peut afficher une suggestion proactive proposant une première action concrète. Realizes UJ-1.

**Consequences (testable):**
- Le consultant peut l'accepter, ce qui avance le stepper à l'étape correspondante, ou la masquer sans faire avancer le stepper.
- Une seule suggestion proactive est visible à la fois.

#### FR-18: Non-réapparition d'une suggestion traitée

Une suggestion proactive masquée ou acceptée ne réapparaît pas spontanément dans la même conversation.

**Consequences (testable):**
- Elle peut réapparaître lors d'un nouveau changement d'étape du stepper ou dans une nouvelle session, mais jamais en boucle dans l'échange en cours.

### 4.4 Éditeur assisté par IA

**Description :** La brique "éditeur assisté" du brief : l'IA commente en marge d'un document, le consultant garde la main sur le livrable final — le cœur de la promesse de différenciation, et la partie du parcours qui porte le "climax" des deux journeys (UJ-1, UJ-2).

**Functional Requirements:**

#### FR-19: Ouverture d'un livrable

Ouvrir un livrable depuis le panneau Livrables (FR-13) affiche son contenu dans une vue Éditeur assisté distincte de l'espace de travail, avec un fil d'Ariane pour y revenir. Realizes UJ-1, UJ-2.

#### FR-20: Suggestions ancrées

L'IA peut proposer des suggestions ancrées à un paragraphe précis du document, affichées dans un panneau dédié en marge. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- Une suggestion ancrée ne modifie jamais le contenu du document tant que le consultant ne l'a pas explicitement traitée (FR-21).
- Une seule suggestion active par paragraphe à la fois.

#### FR-21: Traitement d'une suggestion ancrée

Pour chaque suggestion ancrée, le consultant peut : Accepter (applique la modification au document), Rejeter (l'ignore sans modifier le document), ou Retravailler (précise sa demande, ce qui renvoie une nouvelle proposition en attente). Realizes UJ-1, UJ-2.

**Consequences (testable):**
- Les trois états d'une suggestion (en attente / acceptée / rejetée) se distinguent par autre chose que la seule couleur — icône de validation pour "acceptée", libellé texte pour "rejetée" (plancher d'accessibilité hérité d'`EXPERIENCE.md`).

**Notes:** Voir aussi §Cross-Cutting NFRs — Pas de pile de modale à plus d'un niveau (le champ de retravail s'ouvre au-dessus de l'écran courant, jamais au-dessus d'une autre surface flottante).

#### FR-22: Persistance visuelle des suggestions traitées

Une suggestion traitée (acceptée ou rejetée) reste visible dans le panneau, visuellement atténuée, plutôt que de disparaître immédiatement.

**Consequences (testable):**
- Le consultant peut retrouver, en revenant sur le document, quelles suggestions il a acceptées ou rejetées sans avoir à s'en souvenir.

#### FR-23: Révision globale

Le consultant peut soumettre une demande de révision globale du document, distincte des suggestions ancrées par paragraphe, pour une demande qui ne cible pas un passage précis.

**Notes:** [ASSUMPTION: le comportement exact du retour de cette demande — nouvelle suggestion ancrée, message dans la conversation liée, ou autre — n'est pas spécifié ; voir OQ-4.]

#### FR-24: Contrôle du consultant sur le document final

Le consultant conserve à tout moment la main sur le contenu final du document ; aucune modification proposée par l'IA n'est appliquée sans une action explicite d'acceptation.

**Consequences (testable):**
- Il n'existe aucun mode "auto-application" des suggestions ancrées ou de la révision globale.

**Feature-specific NFRs:**
- Le délai entre l'ouverture d'un livrable et l'affichage des suggestions ancrées existantes doit rester perçu comme immédiat par le consultant (pas de chargement visible qui casse le sentiment de "guidage déjà là" du climax UJ-1). Exception : l'import d'une présentation Drive (FR-29), qui passe par le réseau. La réouverture d'un livrable déjà importé reste soumise à cette exigence.

### 4.5 Livrables et contexte Google Drive

**Description :** Le drive du projet devient un vrai Google Drive. L'app lit le dossier Drive du projet pour alimenter le panneau Contexte. Elle importe les présentations Google Slides existantes comme livrables adossés à Drive, à retravailler avec l'IA dans l'Éditeur assisté, puis réécrit le fichier après validation du consultant. Elle crée aussi de nouvelles présentations depuis la conversation. Ajoutée par le Sprint Change Proposal du 2026-10-02 ; prolonge UJ-1 et UJ-2 sans y être illustrée (voir §2.3).

**Pourquoi :** en pratique, les consultants OCTO produisent leurs livrables, souvent des présentations, dans le dossier Drive du projet. Tant que les livrables ne vivent que dans l'app, l'outil reste une démonstration : le consultant doit recopier le résultat à la main dans le fichier partagé avec l'équipe. Le drive est l'intégration qui rapporte le plus pour le moindre risque (Octopod et Mattermost restent simulés).

**Functional Requirements:**

#### FR-25: Connexion du compte Google

Le consultant connecte son compte Google une seule fois depuis l'app. L'état "connecté / non connecté" est visible, et le consultant peut se déconnecter.

**Consequences (testable):**
- La connexion survit au redémarrage de l'app.
- Hors mode démo, tant qu'aucun compte n'est connecté, les panneaux Contexte et Livrables n'affichent aucun contenu de drive. Ils montrent seulement une invite à connecter Google Drive, à côté des documents ajoutés hors-drive (FR-4) et des livrables déjà ouverts dans l'app.
- En mode démo, le panneau Contexte reste simulé et aucune mention de Google (bouton, invite) n'apparaît. Les fonctions de livrables adossés à Drive (FR-28 à FR-31) sont indisponibles : le panneau Livrables ne montre que les livrables de l'app.

#### FR-26: Dossier Drive du projet

À la sélection d'un projet, l'app retrouve son dossier Drive : le sous-dossier du dossier racine qui porte exactement le nom du projet (voir §3).

**Consequences (testable):**
- Dossier absent ou en double : un message clair l'indique dans les panneaux concernés, et l'app ne crée jamais ce dossier elle-même.
- Dossier racine non configuré : les fonctions Drive sont indisponibles et un message l'indique.

**Notes:** [ASSUMPTION: le nom doit correspondre à l'identique, casse et accents compris ; les projets des testeurs ont déjà un dossier nommé ainsi.]

#### FR-27: Panneau Contexte depuis le vrai Drive

Le panneau Contexte (FR-3) liste en lecture seule les fichiers situés directement dans le dossier Drive du projet. Le consultant choisit explicitement, fichier par fichier, ceux qui servent de contexte à l'agent ; seuls ces fichiers sont lus et envoyés au modèle IA. Seuls les Google Docs, Slides et Sheets peuvent être choisis (contenu exporté en texte) ; les autres fichiers sont listés mais non sélectionnables.

**Consequences (testable):**
- Aucun fichier du Drive n'est envoyé au modèle IA tant que le consultant ne l'a pas choisi comme contexte ; ce choix est visible et réversible dans le panneau.
- Un fichier qui ne peut pas servir de contexte porte une mention l'indiquant.
- Les documents ajoutés hors-drive (FR-4) restent affichés et utilisés comme aujourd'hui.

**Notes:** [ASSUMPTION: les sous-dossiers du dossier Drive du projet ne sont pas parcourus en round 1.]

#### FR-28: Présentations du dossier dans le panneau Livrables

Le panneau Livrables (FR-13) liste aussi les présentations Google Slides du dossier Drive du projet, distinguées des livrables déjà ouverts dans l'app.

**Consequences (testable):**
- Cliquer une présentation déjà importée rouvre son livrable existant ; un simple clic ne la réimporte jamais.

#### FR-29: Import d'une présentation comme livrable

Ouvrir une présentation du dossier l'importe comme livrable adossé à Drive : chaque zone de texte, y compris dans un groupe d'éléments, devient un paragraphe de l'Éditeur assisté, regroupé par diapositive. Le consultant peut ensuite demander des suggestions à l'IA. Importer une présentation puis demander des suggestions vaut choix explicite de l'envoyer au modèle IA (voir §Constraints and Guardrails).

**Consequences (testable):**
- L'import ne modifie jamais le fichier Drive.
- Tableaux, images et notes du présentateur ne sont ni affichés ni modifiables ; ils restent intacts dans le fichier.
- Comme pour tout livrable (§4.4), le texte ne change dans l'app que par des suggestions acceptées. Les suggestions sont générées à la demande du consultant, jamais automatiquement à l'import.
- Sur un livrable adossé à Drive, l'IA ne propose que des suggestions ancrées sur les zones de texte existantes : elle n'ajoute, ne supprime ni ne réordonne aucune diapositive ni zone. Une révision globale (FR-23) y produit donc des suggestions ancrées, jamais un document régénéré.
- "Réimporter" est une action explicite qui remplace le contenu par la version Drive actuelle. Les suggestions dont la zone existe encore sont conservées ; les changements acceptés mais non enregistrés sont perdus, après un avertissement.

#### FR-30: Enregistrement dans Drive

Une action explicite "Enregistrer dans Drive" réécrit dans le fichier le texte des zones modifiées par des suggestions acceptées.

**Consequences (testable):**
- Rien n'est écrit dans Drive sans cette action (prolonge FR-24).
- Si le fichier a été modifié dans Drive depuis l'import, l'enregistrement est refusé avec un message clair proposant de réimporter ; rien n'est écrasé.
- Après un enregistrement réussi, la version enregistrée devient la nouvelle référence : un enregistrement suivant n'est refusé que si le fichier a de nouveau changé dans Drive entre-temps.
- Seul le texte est réécrit ; le consultant est prévenu que la mise en forme interne d'une zone modifiée peut être simplifiée. [ASSUMPTION: cette simplification est acceptable pour un deck client en round 1.]

#### FR-31: Création d'une présentation depuis la conversation

Le consultant peut demander à l'agent de créer une présentation. L'agent propose une suite de diapositives (titre et contenu) ; l'app crée ensuite le fichier Google Slides dans le dossier Drive du projet, qui s'ouvre comme livrable adossé à Drive (FR-29).

**Consequences (testable):**
- Le fichier n'est créé qu'après validation explicite du consultant, depuis la proposition affichée dans la conversation.
- Le fichier porte le titre proposé par l'agent pour la présentation.

**Feature-specific NFRs:**
- Les identifiants et jetons Google ne quittent jamais le poste et ne sont jamais exposés au navigateur.
- Le mode démo ne dépend jamais d'une connexion Google.

## 5. Non-Goals (Explicit)

- Ne construit pas une plateforme à l'échelle des déploiements des grands cabinets cités dans le brief (McKinsey Lilli, Deloitte Sidekick/Zora, Accenture AI Refinery, Bain Sage, PwC ChatPwC, BCG Deckster) — c'est un prototype volontairement léger.
- Ne vise pas de ROI chiffré ni de métrique de productivité mesurée pour ce round.
- Ne connecte pas réellement Octopod ni Mattermost en round 1 (FR-6, voir §6.2) ; le drive, lui, est réellement connecté (§4.5).
- Ne couvre pas les livrables de code — le round 1 porte sur les réponses avant-vente et les livrables de mission hors code uniquement (brief, §The Solution).
- Ne cible pas un profil de consultant en particulier (junior/senior, avant-vente/mission) — horizontal pour tous, sans personnalisation par rôle.
- Ne propose pas de version mobile ou tablette (voir `EXPERIENCE.md.Responsive & Platform` — desktop uniquement, ≥1280px).
- Ne permet jamais de choisir un agent via le sélecteur de modèle IA (FR-12).
- Ne recrute pas de nouveaux testeurs au-delà du petit groupe déjà identifié par le porteur de projet.

## 6. MVP Scope

### 6.1 In Scope

- Les 5 features de §4, sur les deux cas d'usage du brief (réponses avant-vente, livrables de mission hors code).
- Web desktop uniquement, largeur cible ≥1280px.
- Mono-poste : chaque consultant fait tourner sa propre instance de l'app, avec sa propre base locale et au plus un compte Google connecté (choix d'architecture du round 1). Le partage des livrables avec l'équipe projet (FR-10) passe par le dossier Drive du projet (§4.5).
- Intégrations Octopod/Mattermost mockées mais crédibles (FR-6).
- Intégration réelle de Google Drive : livrables adossés à Drive (Google Slides) et panneau Contexte (§4.5).

### 6.2 Out of Scope for MVP

- Intégrations réelles avec Octopod et Mattermost — déférées à une version ultérieure, une fois le round 1 validé. Le drive n'est plus concerné depuis le Sprint Change Proposal du 2026-10-02 (§4.5).
- Livrables adossés à des fichiers Drive d'un autre format que Google Slides (Google Docs, .pptx, .docx). Les livrables propres à l'app (§4.4) ne sont pas concernés.
- Gestion multi-utilisateur des connexions Google : un seul compte connecté par poste, cohérent avec l'architecture mono-poste (§6.1).
- Mécanisme technique d'ajout d'une skill à un projet (OQ-6).
- Méthode de qualification/réponse avant-vente formalisée, si elle n'existe pas déjà chez OCTO (OQ-1).
- Source de données pour les références de missions et les experts OCTO (OQ-2).
- Stepper de workflow dédié au cas d'usage "livrable de mission" (OQ-3).
- Raccourcis clavier au-delà d'Entrée (envoyer) et Échap (fermer/annuler).
- Suppression ou renommage de conversations.

## 7. Success Metrics

**Primary**
- **SM-1** : Complétion du parcours minimal — chaque testeur du groupe round 1 parvient, sans blocage signalé en debrief, à se connecter à un projet, trouver les skills dont il a besoin, et les utiliser. Validates FR-1, FR-11, FR-12.
- **SM-2** : Réaction qualitative alignée avec la citation cible du brief (guidage perçu, gain de vitesse et de qualité perçu), recueillie en entretien avec chaque testeur. Validates FR-17, FR-20, FR-21.
- **SM-3** : Boucle Drive complète — un testeur importe une vraie présentation du dossier Drive de son projet, accepte des suggestions IA et enregistre dans Drive sans blocage. Une modification faite en parallèle dans Google Slides n'est jamais écrasée, et le mode démo fonctionne à l'identique sans compte Google. Validates FR-25 à FR-31.

**Counter-metrics (do not optimize)**
- **SM-C1** : Ne pas optimiser le taux d'acceptation des suggestions ancrées à la hausse pour lui-même — un rejet à bon escient (nom d'expert non vérifié, chiffre halluciné, comme dans les edge cases d'UJ-1 et UJ-2) est un signal de succès du produit, pas un échec à corriger. Counterbalances SM-2.

## 8. Open Questions

1. **OQ-1** — La méthode de qualification/réponse avant-vente (à quoi le stepper FR-14 fait référence) existe-t-elle déjà formalisée chez OCTO, ou est-ce à concevoir dans ce projet ? (brief, §Scope)
2. **OQ-2** — Quelle source de données pour trouver les références de missions et les experts OCTO (FR-11, alimentant les skills) — référentiel existant, annuaire de compétences, à construire ? (brief, §Scope)
3. **OQ-3** — Le cas d'usage "livrable de mission" a-t-il besoin d'un stepper de workflow dédié (FR-15), ou le workflow y reste-t-il volontairement libre comme illustré par UJ-2 ?
4. **OQ-4** — Quel comportement exact pour le retour d'une demande de révision globale (FR-23) — nouvelle suggestion ancrée, message en conversation, autre ?
5. **OQ-5** — Échéance du round 1 de test — aucune n'est définie à ce stade (brief, §Scope).
6. **OQ-6** — Quel mécanisme technique pour ajouter une skill à un projet (FR-11) ? À trancher en architecture.
7. **OQ-7** — Mise en page des présentations créées (FR-31) : modèle de slides OCTO ou mise en page Google par défaut ? À trancher avant la story de création (Epic 5).
8. **OQ-8** — Pour SM-1/SM-2, les testeurs du round 1 utilisent-ils le vrai Drive (compte Google connecté) ou le mode démo ? À trancher avant la session de test ; sans effet sur la construction.

## 9. Assumptions Index

- §1 Vision, §"Why Now" — les chiffres de marché cités dans le brief sont volontairement absents ici (allégés dans le brief lui-même après relecture) ; seule l'existence de plateformes concurrentes est affirmée, pas leur ampleur exacte.
- §4.2, FR-13 ; §4.3, FR-14 ; §4.3, FR-15 ; §4.4, FR-23 ; §4.5, FR-26, FR-27, FR-30 — voir la note `[ASSUMPTION: ...]` inline à chaque FR.
- Hérité d'`EXPERIENCE.md` : palette/typographie par défaut (pas de charte OCTO fournie), vouvoiement non confirmé explicitement, aucun raccourci clavier au-delà d'Entrée/Échap, plancher d'accessibilité proposé par défaut, desktop-only déduit du contexte.

## Why Now

Le brief documente que plusieurs grands cabinets de conseil ont déjà déployé leurs propres plateformes d'agents IA à l'échelle du cabinet — ce n'est plus une hypothèse mais une référence que les clients commencent à connaître (brief, §Executive Summary et addendum §Contexte marché). L'écart qu'OCTO a aujourd'hui (moins de la moitié des consultants utilisent l'IA de façon structurée) n'est donc pas seulement un problème de productivité interne : il devient un problème de crédibilité face aux clients, et un facteur d'attraction/rétention face aux cabinets déjà équipés. Rien dans ce constat n'oblige OCTO à construire à la même échelle — round 1 teste l'idée à un coût très inférieur avant d'investir davantage.

## Constraints and Guardrails

**Données envoyées au modèle IA** — Le contenu d'un fichier du dossier Drive du projet n'est envoyé au modèle IA (API Anthropic) que sur choix explicite du consultant : sélection comme contexte (FR-27), ou import d'une présentation suivi d'une demande de suggestions (FR-29). Le dossier n'est jamais lu ni envoyé automatiquement.

**Confidentialité** — La confidentialité de la conversation (FR-10) est une contrainte dure, pas une préférence : aucune surface du produit, présente ou future, ne doit exposer le contenu d'une conversation à quelqu'un d'autre que son auteur. Seuls les livrables et assets produits sont partagés à l'équipe projet.

## Cross-Cutting NFRs

- **Crédibilité du mock** — Les données simulées (FR-6) doivent se comporter comme des données réelles à l'usage : temps de réponse perçus cohérents, pas de placeholder visible ("lorem ipsum", "TODO"). C'est une exigence de round 1, pas un "nice to have" — le brief la pose comme condition du test.
- **Pas de pile de modale à plus d'un niveau** — Toute nouvelle surface flottante (ajout de skill FR-11, champ de retravail d'une suggestion FR-21) s'ouvre au-dessus de l'écran courant, jamais au-dessus d'une autre surface déjà ouverte (hérité d'`EXPERIENCE.md.Information Architecture`).
- **Performance/échelle** — Aucune cible de performance ou de charge n'est définie pour ce round : le groupe de testeurs est restreint et connu, round 1 n'a pas vocation à être éprouvé à l'échelle.
