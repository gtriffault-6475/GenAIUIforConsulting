---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - prds/prd-GenAI4Consulting-2026-09-11/prd.md
  - architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
  - ux-designs/ux-GenAI4Consulting-2026-09-11/DESIGN.md
  - ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md
  - ../specs/spec-genai4consulting/SPEC.md
---

# GenAI4Consulting - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for GenAI4Consulting, decomposing the requirements from the PRD, UX Design (DESIGN.md/EXPERIENCE.md), and Architecture Spine into implementable stories. `SPEC.md` (CAP-1..CAP-4) is used as a naming/grouping reference for epics — its 4 capabilities already align with the PRD's 4 features.

## Requirements Inventory

### Functional Requirements

FR-1: Le consultant peut sélectionner un projet Octopod existant pour l'utiliser dans GenAI4Consulting ; un seul projet actif à la fois.
FR-2: À la connexion, le drive et le canal Mattermost du projet sont automatiquement rattachés, sans configuration manuelle.
FR-3: Le panneau Contexte affiche, en lecture seule, les documents/répertoires du drive du projet connecté.
FR-4: Le consultant peut ajouter au projet un document hors-drive (ex. reçu par email) pour qu'il serve de contexte à l'agent.
FR-5: Le panneau Mattermost affiche un aperçu du dernier message du canal lié + un lien pour l'ouvrir dans Mattermost (jamais d'envoi).
FR-6: Les données Octopod/drive/Mattermost sont simulées pour le round 1, sans aucun indicateur visible de donnée factice.
FR-7: Le consultant peut mener plusieurs conversations distinctes sur un même projet, chacune listée séparément.
FR-8: Cliquer une conversation dans la liste l'active et affiche son historique ; une seule conversation active à la fois.
FR-9: Le consultant peut créer une nouvelle conversation vide, qui devient immédiatement active.
FR-10: Une conversation est privée à son auteur ; seuls les livrables/assets produits sont visibles par le reste de l'équipe projet.
FR-11: Le consultant peut consulter la liste des skills chargées sur le projet et lancer un point d'entrée pour en attacher une nouvelle.
FR-12: Le composer permet de choisir, parmi une liste fermée de modèles IA, celui qui traite le message envoyé (jamais un choix d'agent).
FR-13: Le panneau Livrables liste les documents en cours de production avec l'IA ; cliquer un livrable ouvre l'Éditeur assisté.
FR-14: L'espace de travail affiche un stepper à 4 étapes fixes pour l'avant-vente (Qualification → Références → Experts → Rédaction).
FR-15: Pour le cas d'usage "livrable de mission", le stepper avant-vente ne s'applique pas nécessairement (pas de stepper dédié défini ce round).
FR-16: Cliquer une étape du stepper l'active et met à jour le contexte de la conversation affichée en dessous.
FR-17: À l'ouverture d'un projet ou d'une étape, l'IA peut afficher une suggestion proactive d'une première action concrète (acceptable ou masquable).
FR-18: Une suggestion proactive masquée/acceptée ne réapparaît pas spontanément dans la même conversation (peut réapparaître sur changement d'étape ou nouvelle session).
FR-19: Ouvrir un livrable affiche son contenu dans une vue Éditeur assisté distincte, avec un fil d'Ariane pour revenir.
FR-20: L'IA peut proposer des suggestions ancrées à un paragraphe précis d'un document, affichées dans un panneau dédié.
FR-21: Pour chaque suggestion ancrée, le consultant peut Accepter, Rejeter, ou Retravailler (renvoie une nouvelle proposition en attente).
FR-22: Une suggestion traitée (acceptée/rejetée) reste visible, visuellement atténuée, plutôt que de disparaître.
FR-23: Le consultant peut soumettre une demande de révision globale d'un livrable, distincte des suggestions ancrées par paragraphe.
FR-24: Le consultant garde à tout moment la main sur le document final ; aucune modification IA n'est appliquée sans acceptation explicite.

### NonFunctional Requirements

NFR1: Crédibilité du mock — les données simulées doivent se comporter comme des données réelles à l'usage (temps de réponse cohérents, aucun placeholder visible type "lorem ipsum"/"TODO").
NFR2: Pas de pile de surface flottante à plus d'un niveau — toute nouvelle modale/dropdown s'ouvre au-dessus de l'écran courant, jamais au-dessus d'une autre déjà ouverte.
NFR3: Aucune cible de performance/charge formelle pour ce round (groupe de testeurs restreint et connu).
NFR4: Confidentialité de la conversation — contrainte dure : aucune surface, présente ou future, n'expose le contenu d'une conversation à quelqu'un d'autre que son auteur.
NFR5: Immédiateté perçue de l'Éditeur assisté — l'affichage des suggestions ancrées existantes à l'ouverture d'un livrable doit être perçu comme instantané (pas d'attente d'appel IA visible).

### Additional Requirements

- **Pas de starter/template greenfield nommé** dans l'Architecture — scaffolding standard Next.js (`create-next-app`, App Router) à faire en premier lieu de l'Epic 1, Story 1.
- Stack pinnée : Next.js 16.x (App Router, Turbopack), React 19.x, TypeScript 5.7.x, Drizzle ORM + `node:sqlite` (pas de dépendance native à compiler), @anthropic-ai/sdk 0.124.x+ (Messages API + tool use — pas le Claude Agent SDK), Node.js 24 LTS.
- Paradigme : monolithe Next.js en couches (`app/` → `actions/` → `domain/`) avec frontière Ports & Adapters (AD-1) sur les intégrations Octopod/drive/Mattermost — round 1 n'implémente que `integrations/mock/*`.
- AD-2 : mutation exclusivement par Server Actions (`actions/`) ; aucun composant n'importe `db/` ou `integrations/` directement.
- AD-3 : les suggestions ancrées sont générées par l'agent au moment de l'écriture (création/modification d'un livrable), jamais recalculées à l'ouverture de l'éditeur.
- AD-4 : une skill est une constante de code dans `skills/catalog.ts` (pas une table à contenu libre) ; noms d'outils namespacés par `skillKey` ; `project_skill` unique sur `(projectId, skillKey)`.
- AD-5 : `domain/` ne dépend d'aucune I/O (pas de `db/`, `integrations/`, `actions/`, React) — toute transition d'état y est une fonction pure.
- AD-6 : `CONVERSATION.stepKey` rattache une conversation à une étape fixe ; `PROJECT.activeConversationId` est la seule source de vérité sur la conversation affichée (jamais dérivée d'un champ d'étape).
- AD-7 : l'état masquée/acceptée d'une suggestion proactive vit côté client uniquement (jamais persisté en base).
- AD-8 : un unique `OverlayProvider` centralise l'ouverture/fermeture de toute surface flottante.
- AD-9 : `LIVRABLE.content` est une liste de blocs `{id, text}` à identifiant stable ; `SUGGESTION.anchorRef` référence un id de bloc, jamais une position.
- AD-10 : une révision globale est postée comme message dans la conversation d'origine du livrable (`LIVRABLE.conversationId`), traitée par le même outil qu'AD-3.
- AD-11 : un point d'assemblage unique (`skills/buildRequest.ts`) construit chaque appel Messages API (system prompt = instructions des skills chargées, historique = messages de la conversation active, modèle = choix du composer).
- Modèle de données (ERD complet) : `PROJECT`, `CONVERSATION`, `MESSAGE`, `DOCUMENT`, `PROJECT_SKILL`, `LIVRABLE`, `SUGGESTION`, `APP_STATE` — voir ARCHITECTURE-SPINE.md pour les champs exacts.
- Index unique partiel SQLite `(livrableId, anchorRef) WHERE status='pending' AND type='anchored'` — une seule suggestion ancrée en attente par paragraphe.
- Déploiement : mono-poste, mono-utilisateur, serveur Next.js local (`localhost`) — pas d'auth, pas d'infrastructure à provisionner pour ce round.
- Différé explicitement (hors scope des epics round 1) : adaptateurs réels Octopod/drive/Mattermost, mécanisme d'ajout dynamique d'une skill, méthode de qualification avant-vente formalisée, source de données références/experts OCTO, workflow dédié au cas "livrable de mission", tests automatisés/CI, multi-utilisateur/authentification.

### UX Design Requirements

UX-DR1: Implémenter la palette de couleurs `DESIGN.md` (background, surface, border, text-primary/secondary/muted, accent navy `#3E4C7C`, ai-accent violet `#7C5CFC`, ai-tint, selected-tint, avatar-bg, success) comme tokens partagés.
UX-DR2: Implémenter les deux familles typographiques — Space Grotesk (moments d'orientation : nom produit, titres, titre de document) et IBM Plex Sans (tout le reste, poids 400/600) — avec les tailles/poids du token `typography`.
UX-DR3: Implémenter l'échelle d'espacement base 4px et la grille 3 colonnes verrouillée (sidebar gauche 240px fixe, centre flexible, sidebar droite 300px fixe) — pas de sidebar rétractable ce round.
UX-DR4: Implémenter les 5 composants de tokens `DESIGN.md.Components` : `button-primary`, `button-ai-primary`, `card`, `ai-suggestion-card`, `nav-row-active`, avec leurs couleurs/radius exacts.
UX-DR5: Règle transversale — le violet (`ai-accent`) est réservé à tout ce qui vient de l'IA, jamais décoratif ; une zone IA se signale par un fond plein (`ai-tint`), jamais une bordure gauche colorée.
UX-DR6: Composant Stepper de workflow — 4 étapes fixes (Qualification → Références → Experts → Rédaction) ; clic = étape active + changement du contexte de conversation ; états visuels distincts passé (check) / actif (plein) / à venir (neutre).
UX-DR7: Composant Suggestion proactive — une seule visible à la fois ; "Oui, commençons" (accepte, avance le stepper) / "Plus tard" (masque sans avancer) ; état géré côté client uniquement, jamais persisté (AD-7).
UX-DR8: Composant Panneau Skills — liste des skills chargées + point d'entrée "Ajouter une skill" ; état vide affiche toujours ce point d'entrée, jamais un message d'erreur.
UX-DR9: Composant Liste de conversations — plusieurs conversations par projet ; clic = active (état `nav-row-active`) ; "Nouvelle conversation" crée et active un fil vide immédiatement ; pas de suppression/renommage ce round.
UX-DR10: Composant Composer — champ de saisie + sélecteur de modèle IA (liste fermée : Sonnet 5 / Opus 5 / Haiku 4.5) + envoi ; le sélecteur de modèle ne propose jamais un choix d'agent/skill.
UX-DR11: Composant Panneau Contexte — documents/répertoires du drive, lecture seule, aucune action d'édition/suppression/ajout depuis ce panneau.
UX-DR12: Composant Panneau Livrables — liste des documents en cours ; état vide = invite courte à en créer un, jamais une zone vide silencieuse.
UX-DR13: Composant Panneau Mattermost — aperçu du dernier message + lien externe ; jamais de champ de saisie/envoi.
UX-DR14: Composant Suggestion ancrée (éditeur) — rattachée à un repère de paragraphe (`¶N`) ; actions Accepter/Rejeter/Retravailler ; une seule suggestion active par paragraphe ; les 3 états se distinguent par autre chose que la couleur (icône check / libellé texte).
UX-DR15: Composant Révision globale (éditeur) — champ libre distinct des suggestions ancrées, ne crée jamais de suggestion ancrée automatiquement ; le retour atterrit dans la conversation liée au livrable.
UX-DR16: Microcopy — vouvoiement, registre professionnel sobre ; jamais d'emoji, de point d'exclamation, ou de familiarité (respecter le tableau Do/Don't d'`EXPERIENCE.md` pour les libellés cités : "Suggestion de départ", "Écrivez à l'IA…", "Acceptée"/"Rejetée").
UX-DR17: Plancher d'accessibilité — ordre de tabulation = ordre de lecture ; `Échap` ferme systématiquement le dernier élément flottant ouvert ; les 3 états de suggestion se distinguent par autre chose que la couleur.
UX-DR18: Primitives d'interaction — `Entrée` envoie le message dans le composer ; `Échap` ferme un menu déroulant ou annule un retravail en cours ; un clic en dehors d'un menu déroulant le referme.
UX-DR19: Desktop uniquement, largeur cible ≥1280px ; aucun repli mobile/tablette spécifié pour ce round.
UX-DR20: Fil d'Ariane pour revenir de l'Éditeur assisté vers l'Espace de travail ; jamais de pile de plus d'un niveau de surface flottante/modale (NFR2).
UX-DR21: Respecter les 3 patterns explicitement rejetés : pas de mode "conversation libre" sans projet connecté ; jamais d'indicateur visible de donnée mockée ; le sélecteur de modèle ne devient jamais un sélecteur d'agent.

### FR Coverage Map

FR-1: Epic 1 - Sélection d'un projet Octopod
FR-2: Epic 1 - Héritage automatique du drive et de Mattermost
FR-3: Epic 1 - Panneau Contexte (lecture seule)
FR-4: Epic 1 - Ajout d'un document hors-drive
FR-5: Epic 1 - Panneau Mattermost (aperçu + lien)
FR-6: Epic 1 - Intégrations simulées, expérience crédible
FR-7: Epic 2 - Conversations multiples par projet
FR-8: Epic 2 - Sélection d'une conversation active
FR-9: Epic 2 - Création d'une nouvelle conversation
FR-10: Epic 2 - Confidentialité de la conversation
FR-11: Epic 2 - Skills du projet
FR-12: Epic 2 - Sélection du modèle IA
FR-13: Epic 2 - Panneau Livrables
FR-14: Epic 3 - Stepper de workflow (avant-vente)
FR-15: Epic 3 - Workflow du cas "livrable de mission" (pas de stepper dédié)
FR-16: Epic 3 - Navigation du stepper
FR-17: Epic 3 - Suggestion proactive de démarrage
FR-18: Epic 3 - Non-réapparition d'une suggestion traitée
FR-19: Epic 4 - Ouverture d'un livrable
FR-20: Epic 4 - Suggestions ancrées
FR-21: Epic 4 - Traitement d'une suggestion ancrée
FR-22: Epic 4 - Persistance visuelle des suggestions traitées
FR-23: Epic 4 - Révision globale
FR-24: Epic 4 - Contrôle du consultant sur le document final

## Epic List

### Epic 1: Connexion à un projet Octopod
Le consultant sélectionne un projet Octopod existant et voit immédiatement son contexte hérité (drive, Mattermost) — mocké mais crédible.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

### Epic 2: Espace multi-agents
Le consultant dialogue avec l'agent dans une ou plusieurs conversations privées liées au projet, avec les skills disponibles et un choix de modèle IA.
**FRs covered:** FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13

### Epic 3: Orchestrateur de workflow
Le consultant est guidé activement (stepper à 4 étapes + suggestion proactive) plutôt que face à une conversation vide, pour le cas d'usage avant-vente.
**FRs covered:** FR-14, FR-15, FR-16, FR-17, FR-18

### Epic 4: Éditeur assisté par IA
Le consultant ouvre un livrable et travaille avec des suggestions IA ancrées à des paragraphes précis — accepter/rejeter/retravailler — sans jamais perdre la main sur le document final.
**FRs covered:** FR-19, FR-20, FR-21, FR-22, FR-23, FR-24

## Epic 1: Connexion à un projet Octopod

Le consultant sélectionne un projet Octopod existant et voit immédiatement son contexte hérité (drive, Mattermost) — mocké mais crédible.

### Story 1.1: Scaffolding du projet et fondations partagées

As a développeur solo,
I want une base Next.js conforme à la stack, aux tokens de design et aux conventions transversales de la spine,
So that je peux construire les fonctionnalités suivantes sur des fondations correctes, sans les redécouvrir à chaque epic.

**Acceptance Criteria:**

**Given** un dossier de projet vide
**When** je lance le scaffolding (Next.js 16 App Router, TypeScript 5.7.x)
**Then** l'arborescence `app/ · actions/ · domain/ · skills/ · integrations/{ports,mock}/ · db/` existe
**And** `npm run dev` démarre sans erreur sur un seul process
**And** Drizzle + `node:sqlite` sont configurés (aucune dépendance native à compiler)

**Given** ce scaffolding
**When** je mets en place les fondations visuelles et transversales
**Then** les tokens de couleur, typographie (Space Grotesk / IBM Plex Sans) et espacement de `DESIGN.md` sont disponibles comme variables partagées
**And** les 5 composants de tokens (`button-primary`, `button-ai-primary`, `card`, `ai-suggestion-card`, `nav-row-active`) sont implémentés
**And** la grille cible desktop ≥1280px (pas de repli mobile/tablette)
**And** un `OverlayProvider` unique gère l'ouverture/fermeture des surfaces flottantes : `Échap` ferme systématiquement le dernier élément flottant ouvert, et ouvrir une surface ferme automatiquement la précédente
**And** l'ordre de tabulation suit l'ordre de lecture sur chaque écran
**And** les conventions de microcopy (vouvoiement, registre professionnel sobre, jamais d'emoji ni de point d'exclamation) sont documentées pour guider les libellés des stories suivantes

### Story 1.2: Sélection d'un projet Octopod

As a consultant,
I want sélectionner un projet Octopod existant depuis un sélecteur,
So that je peux commencer à travailler dans son contexte sans configuration.

**Acceptance Criteria:**

**Given** une liste de projets Octopod mockés disponibles (`ProjectProvider` mock, AD-1)
**When** je choisis un projet dans le sélecteur
**Then** il devient le projet actif (`APP_STATE.activeProjectId`)
**And** le drive et le canal Mattermost associés sont rattachés automatiquement, sans étape de configuration

**Given** qu'aucun projet n'est sélectionné
**When** j'accède à l'espace de travail
**Then** aucune surface de conversation, de skills ou de livrable n'est accessible
**And** il n'existe aucun mode "conversation libre" sans projet connecté

### Story 1.3: Panneau Contexte

As a consultant,
I want voir les documents et répertoires du drive de mon projet connecté,
So that j'ai accès au contexte existant sans rien configurer.

**Acceptance Criteria:**

**Given** un projet connecté avec des documents mockés côté `DriveProvider`
**When** j'ouvre l'espace de travail
**Then** le panneau Contexte affiche ces documents en lecture seule
**And** aucune action d'édition, suppression ou ajout n'est disponible depuis ce panneau
**And** rien dans l'interface n'indique qu'il s'agit de données simulées

### Story 1.4: Ajout d'un document hors-drive

As a consultant,
I want ajouter au projet un document qui n'est pas sur le drive Octopod,
So that je peux fournir du contexte supplémentaire à l'agent (ex. un compte-rendu reçu par email).

**Acceptance Criteria:**

**Given** un projet connecté
**When** j'ajoute un document manuellement
**Then** il est immédiatement disponible comme contexte pour la conversation
**And** l'ajout passe directement par `actions/document.ts` sans transiter par un port d'intégration

### Story 1.5: Panneau Mattermost

As a consultant,
I want voir le dernier message du canal Mattermost lié à mon projet,
So that je reste informé sans quitter l'outil.

**Acceptance Criteria:**

**Given** un projet connecté avec un canal Mattermost mocké
**When** j'ouvre l'espace de travail
**Then** le panneau Mattermost affiche l'aperçu du dernier message et un lien pour l'ouvrir dans Mattermost
**And** aucun champ de saisie ou d'envoi n'existe dans ce panneau

## Epic 2: Espace multi-agents

Le consultant dialogue avec l'agent dans une ou plusieurs conversations privées liées au projet, avec les skills disponibles et un choix de modèle IA.

### Story 2.1: Conversations multiples et sélection active

As a consultant,
I want mener plusieurs conversations distinctes sur un même projet,
So that je peux organiser mes échanges par sujet ou par étape.

**Acceptance Criteria:**

**Given** un projet connecté avec plusieurs conversations existantes
**When** j'ouvre l'espace de travail
**Then** chaque conversation apparaît séparément dans la liste
**And** cliquer une conversation l'active et affiche son historique au centre
**And** une seule conversation est active à la fois, visuellement distinguée des autres

### Story 2.2: Création d'une nouvelle conversation

As a consultant,
I want créer une nouvelle conversation vide,
So that je peux démarrer un nouvel échange sans mélanger les sujets.

**Acceptance Criteria:**

**Given** un projet connecté
**When** je clique "Nouvelle conversation"
**Then** un fil vide est créé et devient immédiatement la conversation active

### Story 2.3: Confidentialité de la conversation

As a consultant,
I want que mes conversations restent privées,
So that je peux échanger librement sans exposer mon raisonnement.

**Acceptance Criteria:**

**Given** une conversation que j'ai créée
**When** je consulte n'importe quelle autre surface du produit (panneaux, Mattermost, livrables)
**Then** le contenu de cette conversation n'apparaît nulle part ailleurs que dans sa propre vue
**And** seuls les livrables et assets qu'elle produit sont visibles ailleurs

### Story 2.4: Panneau Skills

As a consultant,
I want consulter les skills chargées sur mon projet,
So that je sais quelles capacités spécialisées sont à ma disposition.

**Acceptance Criteria:**

**Given** un projet connecté
**When** j'ouvre le panneau Skills
**Then** je vois la liste des skills chargées (catalogue défini en code)
**And** le point d'entrée "Ajouter une skill" reste visible même si la liste est vide, jamais un message d'erreur
**And** ce point d'entrée s'ouvre via l'`OverlayProvider` partagé, sans empiler une autre surface déjà ouverte

### Story 2.5: Sélection du modèle et envoi d'un message

As a consultant,
I want choisir le modèle IA et envoyer un message à l'agent,
So that je peux dialoguer avec l'IA en gardant le contrôle du modèle utilisé.

**Acceptance Criteria:**

**Given** une conversation active
**When** j'ouvre le sélecteur de modèle dans le composer
**Then** je choisis parmi une liste fermée de modèles IA, sans jamais voir d'option d'agent ou de skill
**And** `Entrée` dans le champ de saisie envoie le message

**Given** un message envoyé
**When** l'agent traite ma demande
**Then** l'appel assemble le prompt système à partir des skills chargées, l'historique de la conversation active, et le modèle choisi
**And** la réponse de l'agent apparaît dans la conversation

### Story 2.6: Panneau Livrables

As a consultant,
I want voir les livrables en cours de production sur mon projet,
So that je peux reprendre un document déjà entamé.

**Acceptance Criteria:**

**Given** un projet avec des livrables existants
**When** j'ouvre le panneau Livrables
**Then** je vois la liste des documents en cours

**Given** aucun livrable n'existe encore
**When** j'ouvre le panneau
**Then** une invite courte propose d'en créer un — jamais une zone vide silencieuse

**Note :** la navigation vers l'Éditeur assisté au clic sur un livrable (FR-13) est livrée par la Story 4.1, qui construit cette vue de destination.

## Epic 3: Orchestrateur de workflow

Le consultant est guidé activement (stepper à 4 étapes + suggestion proactive) plutôt que face à une conversation vide, pour le cas d'usage avant-vente.

### Story 3.1: Stepper de workflow (avant-vente)

As a consultant en avant-vente,
I want voir un stepper à 4 étapes fixes et naviguer entre elles,
So that je sais où j'en suis dans ma réponse et je peux revenir à une étape précédente.

**Acceptance Criteria:**

**Given** un projet en contexte avant-vente
**When** j'ouvre l'espace de travail
**Then** le stepper affiche les 4 étapes (Qualification → Références → Experts → Rédaction) simultanément
**And** l'étape active est pleine, les étapes passées affichent un check, les suivantes restent neutres

**When** je clique une étape
**Then** elle devient active et la conversation affichée correspond à cette étape
**And** une conversation liée à cette étape est créée si elle n'existe pas encore

### Story 3.2: Workflow du cas "livrable de mission"

As a consultant en régie,
I want travailler sans stepper imposé sur mes livrables de mission,
So that je garde une conversation libre adaptée à mon contexte, sans étapes qui ne s'appliquent pas.

**Acceptance Criteria:**

**Given** un projet de type mission
**When** j'ouvre l'espace de travail
**Then** aucun stepper avant-vente ne s'impose
**And** je peux créer et utiliser une conversation sans étape associée

### Story 3.3: Suggestion proactive de démarrage

As a consultant,
I want recevoir une suggestion de première action à l'ouverture d'un projet ou d'une étape,
So that je ne me retrouve jamais face à une conversation vide sans savoir par où commencer.

**Acceptance Criteria:**

**Given** l'ouverture d'un projet ou le passage à une nouvelle étape avec une conversation vide
**When** j'arrive sur cette conversation
**Then** une suggestion proactive apparaît, proposant une action concrète, présentée dans le style visuel réservé au contenu généré par l'IA (fond plein, jamais une bordure colorée)

**When** je clique "Oui, commençons"
**Then** elle est acceptée et le stepper avance à l'étape correspondante

**When** je clique "Plus tard"
**Then** elle est masquée sans faire avancer le stepper
**And** une seule suggestion proactive est visible à la fois

**Given** une suggestion déjà masquée ou acceptée dans la conversation courante
**When** je continue d'interagir dans cette même conversation
**Then** elle ne réapparaît pas spontanément
**And** elle peut réapparaître sur un changement d'étape ou un rechargement de page (état géré côté client uniquement, jamais persisté)

## Epic 4: Éditeur assisté par IA

Le consultant ouvre un livrable et travaille avec des suggestions IA ancrées à des paragraphes précis — accepter/rejeter/retravailler — sans jamais perdre la main sur le document final.

### Story 4.1: Ouverture d'un livrable

As a consultant,
I want ouvrir un livrable depuis le panneau Livrables,
So that je peux le consulter et le retravailler dans une vue dédiée.

**Acceptance Criteria:**

**Given** un livrable existant
**When** je clique dessus dans le panneau Livrables
**Then** je suis amené dans l'Éditeur assisté affichant son contenu
**And** un fil d'Ariane me permet de revenir à l'espace de travail

### Story 4.2: Génération des suggestions ancrées à l'écriture

As a consultant,
I want que l'IA propose des suggestions ancrées dès la création ou modification d'un livrable,
So that je trouve un travail d'analyse déjà fait à l'ouverture, sans attendre.

**Acceptance Criteria:**

**Given** une conversation qui aboutit à la création ou modification d'un livrable
**When** l'agent produit le contenu
**Then** il produit dans le même appel des suggestions ancrées à des blocs précis (identifiant stable) du document, persistées avant la fin de l'appel

**Given** ce livrable déjà généré
**When** j'ouvre l'Éditeur assisté
**Then** les suggestions apparaissent instantanément, sans appel IA visible au chargement
**And** une suggestion ancrée ne modifie jamais le contenu tant qu'elle n'est pas traitée
**And** les suggestions sont présentées dans le style visuel réservé au contenu IA (fond plein, jamais une bordure colorée)

### Story 4.3: Traitement d'une suggestion ancrée

As a consultant,
I want accepter, rejeter ou retravailler chaque suggestion ancrée,
So that je garde le contrôle final sur le document tout en profitant de l'aide de l'IA.

**Acceptance Criteria:**

**Given** une suggestion ancrée en attente
**When** je clique "Accepter"
**Then** la modification s'applique au bloc ciblé et la suggestion passe à l'état "acceptée"

**When** je clique "Rejeter"
**Then** le document n'est pas modifié et la suggestion passe à "rejetée"

**When** je clique "Retravailler"
**Then** un champ s'ouvre via l'`OverlayProvider` partagé pour préciser ma demande, sans s'empiler sur une autre surface déjà ouverte
**And** l'envoi renvoie une nouvelle proposition en attente

**And** une suggestion traitée reste visible dans le panneau, visuellement atténuée, plutôt que de disparaître
**And** les 3 états (en attente / acceptée / rejetée) se distinguent par autre chose que la seule couleur (icône de validation, libellé texte)

### Story 4.4: Révision globale

As a consultant,
I want demander une révision globale d'un livrable qui ne cible pas un paragraphe précis,
So that je peux demander un ajustement d'ensemble sans cibler chaque paragraphe un par un.

**Acceptance Criteria:**

**Given** un livrable ouvert dans l'Éditeur assisté
**When** je soumets une demande de révision globale
**Then** elle est postée comme message dans la conversation d'origine du livrable
**And** l'agent y répond en régénérant le contenu et les suggestions ancrées concernées, via le même mécanisme que la Story 4.2
**And** elle ne crée jamais de suggestion ancrée automatiquement avant que l'agent n'ait traité la demande

### Story 4.5: Contrôle du consultant sur le document final

As a consultant,
I want garder la main sur le contenu final à tout moment,
So that je ne subis jamais une modification de l'IA sans l'avoir explicitement acceptée.

**Acceptance Criteria:**

**Given** n'importe quelle suggestion (ancrée ou globale) proposée par l'IA
**When** elle n'a pas encore été traitée
**Then** le contenu du livrable reste inchangé
**And** il n'existe aucun mode d'auto-application des suggestions
