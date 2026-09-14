---
id: SPEC-genai4consulting
companions:
  - ../../planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md
  - ../../planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/DESIGN.md
  - ../../planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md
  - ../../planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/briefs/brief-GenAI4Consulting-2026-09-10/brief.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# GenAI4Consulting — Round 1

## Why

Moins de la moitié des consultants OCTO utilisent aujourd'hui l'IA de façon structurée, et ce qui fonctionne chez les uns ne profite jamais au reste du cabinet — une capitalisation qui reste individuelle plutôt que collective (pain à résoudre). GenAI4Consulting existe pour combler cet écart : une interface de travail agentique qui se branche sur l'existant OCTO (Octopod, drive, Mattermost) plutôt que de le remplacer (vision à réaliser). C'est pertinent maintenant parce que plusieurs grands cabinets de conseil concurrents ont déjà déployé leurs propres plateformes d'agents IA internes — l'écart n'est plus seulement de productivité, il devient un enjeu de crédibilité et d'attraction/rétention. Round 1 est un prototype exploratoire testé par un petit groupe de consultants déjà identifié, pas un produit à l'échelle de ces plateformes.

## Capabilities

- **CAP-1 — Connexion à un projet Octopod**
  - **intent:** Le consultant connecte GenAI4Consulting à un projet Octopod existant, héritant automatiquement de son drive et de son canal Mattermost.
  - **success:** Ouvrir un projet affiche son contenu (documents, dernier message Mattermost) sans configuration manuelle, avec des intégrations mockées mais crédibles — aucun indicateur de donnée factice.

- **CAP-2 — Espace multi-agents**
  - **intent:** Le consultant mène plusieurs conversations privées avec un agent sur un projet, avec les skills du projet à disposition et un choix de modèle IA.
  - **success:** Un testeur crée, retrouve et bascule entre plusieurs conversations d'un même projet ; chacune reste privée à son auteur hors des livrables et assets qu'elle produit.

- **CAP-3 — Orchestrateur de workflow (avant-vente)**
  - **intent:** Le système guide le consultant à travers un stepper à 4 étapes fixes (Qualification → Références → Experts → Rédaction) et une suggestion proactive de première action.
  - **success:** Un testeur avant-vente voit une suggestion concrète à l'ouverture d'un projet ou d'une étape, et peut naviguer les 4 étapes sans jamais se retrouver face à une conversation vide.

- **CAP-4 — Éditeur assisté par IA**
  - **intent:** L'IA propose des suggestions ancrées à des paragraphes précis d'un livrable, que le consultant accepte, rejette ou retravaille, sans jamais perdre la main sur le document final.
  - **success:** En ouvrant un livrable, des suggestions déjà générées apparaissent instantanément (aucun appel IA au chargement) ; chaque suggestion traitée reste visible et tracée dans le panneau.

## Constraints

- Round 1 doit tourner mono-poste, mono-utilisateur, avec une installation très simple — pas de service externe à faire tourner, pas de compilation native.
- Les intégrations Octopod, drive et Mattermost sont mockées mais ne s'affichent jamais comme telles à l'utilisateur.
- Une conversation est privée à son auteur ; seuls les livrables et assets qu'elle produit sont partagés à l'équipe projet.
- Le sélecteur de modèle IA ne devient jamais un sélecteur d'agent ou de skill.
- Aucun ROI chiffré ni délai n'est attendu pour ce round.

## Non-goals

- Intégrations réelles Octopod/drive/Mattermost (différées à une version ultérieure).
- Version mobile ou tablette (desktop uniquement, ≥1280px).
- Multi-utilisateur et authentification.
- Mécanisme d'ajout dynamique d'une skill — round 1 fixe un catalogue défini en code.
- Livrables de code — round 1 couvre les réponses avant-vente et les livrables de mission hors code uniquement.
- Recrutement de nouveaux testeurs au-delà du petit groupe déjà identifié.

## Success signal

En debrief, chaque testeur du petit groupe round 1 exprime spontanément une réaction alignée avec : *"tout ce dont j'avais besoin était à portée de main, j'ai été guidé, et les IA m'ont aidé à aller plus vite et à faire mieux."* Pas de métrique chiffrée attendue — le signal est qualitatif.

## Assumptions

- Les 4 étapes du stepper avant-vente (Qualification/Références/Experts/Rédaction) condensent le scénario en 6 points de l'addendum du brief ; elles n'ont pas été validées étape par étape avec l'utilisateur.

## Open Questions

- La méthode de qualification/réponse avant-vente existe-t-elle déjà formalisée chez OCTO, ou est-ce à concevoir dans ce projet ?
- Quelle source de données pour les références de missions et les experts OCTO alimentant les skills ?
- Le cas d'usage "livrable de mission" a-t-il besoin d'un workflow/stepper dédié, ou reste-t-il volontairement libre ?
- Quel mécanisme technique pour ajouter dynamiquement une skill à un projet, au-delà du catalogue fixé en code pour round 1 ?
