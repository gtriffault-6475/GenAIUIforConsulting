# Addendum — GenAI4Consulting

Contenu détaillé issu de la conversation, trop spécifique pour le brief mais utile pour le PRD / l'architecture.

## Scénario type détaillé (avant-vente)

1. Le consultant reçoit un RFP intéressant d'un client.
2. Il crée l'opportunité dans **Octopod** (outil interne OCTO existant, fonctionne déjà bien) : nom de l'opportunité, drive partagé organisé (RFP, docs de travail, réponse), canal Mattermost dédié.
3. Dans l'outil GenAI4Consulting, il **se connecte** à ce projet Octopod — héritage automatique de l'accès au drive et au canal Mattermost.
4. Il ajoute d'autres documents non présents sur le drive (ex. CR d'un call achats, note de synthèse client).
5. Il lance un **workflow** (via une ou plusieurs skills) suivant une méthode de réponse : qualification (peut/veut-on répondre ?), cohérence avec les compétences OCTO...
6. Il travaille en interaction avec les skills et agents pour : trouver des références OCTO similaires, identifier les bons experts OCTO, créer une première version de la réponse.

Le même schéma (connexion à un espace de travail existant → ajout de documents → workflow → collaboration avec les agents) s'applique au second cas d'usage : livrables de mission hors code.

## Points ouverts (à trancher en PRD / architecture)

- La méthode de qualification/réponse (étape 5) existe-t-elle déjà formalisée chez OCTO, ou est-ce à concevoir dans ce projet ?
- Quelle source de données pour trouver des références de missions et des experts OCTO (étape 6) — référentiel existant, annuaire de compétences, à construire ?
- Échéance du round 1 de test — non définie à ce stade.

## Contexte marché (recherche du 2026-09-10)

Recherche web légère menée pour cadrer "pourquoi maintenant" et éviter de fabriquer un moat technique. Chiffres à re-vérifier avant tout usage externe (interne au brief uniquement pour l'instant) :

- **McKinsey (Lilli)** : couvre 40 000+ consultants, ~20 000 agents IA, 72 % des 45 000 employés utilisent l'outil interne unique, 30 % de temps gagné sur recherche/synthèse. Scanne 100 000+ documents internes en quelques secondes. — [How AI Is Reshaping Consulting in 2026](https://whitehat-seo.co.uk/blog/ai-impact-on-consulting)
- **Deloitte (Sidekick / Zora AI)** : 75 000 postes (zone EMEA).
- **Accenture (AI Refinery)** : 85 000+ professionnels IA & data.
- **Bain (Sage)** : Microsoft Copilot pour 13 000 personnes + 19 000+ GPTs personnalisés.
- **PwC (ChatPwC)** : 200 000 postes — le plus grand déploiement GenAI d'entreprise du secteur.
- **BCG (Deckster)** : automatise la mise en forme PowerPoint. Une étude Harvard Business School sur des consultants BCG montre 12,2 % de tâches en plus, 25,1 % plus vite, qualité supérieure de 40 %+ avec assistance IA vs groupe de contrôle.
- Tendance sectorielle générale : gains de productivité de 30-60 % dans les fonctions de connaissance considérés comme la nouvelle base attendue pour les cabinets "AI-enabled" — [Q1 2026 Consulting Trends](https://premium.f1gmat.com/consulting/trends/2026/Q1), [2026 Consulting's AI Revolution Update](https://futureofconsulting.ai/ai-leadership/2026-consultings-ai-revolution-update/)
- Sur les plateformes d'orchestration multi-agents en entreprise en général : le marché évolue vers des systèmes unifiés combinant édition de documents, automatisation de workflow et orchestration multi-agents — cohérent avec les trois briques envisagées ici, mais à une tout autre échelle d'investissement. — [10 Best AI Agent Orchestration Platforms 2026](https://coworker.ai/blog/ai-agent-orchestration-platform), [Agentic AI in 2026](https://www.fracto.ie/blog-posts/agentic-ai-enterprise-workflows-orchestration-2026)

Lecture pour ce projet : l'idée n'est pas originale au sens "personne n'y a pensé" — c'est déjà la norme chez les plus grands cabinets. L'angle OCTO n'est pas de rivaliser en échelle, mais de rattraper un écart réel avec un prototype léger, intégré à ses outils existants (Octopod/drive/Mattermost), sans le budget ni l'ambition d'une plateforme façon Lilli/ChatPwC.

## Contexte de session

Ce brief reprend une session cloud antérieure (2026-09-10) dont le travail (installation de BMAD, premiers échanges de découverte) a été commité localement dans ce conteneur cloud mais n'a pas pu être poussé sur GitHub (app GitHub Claude non installée/autorisée pour l'org). Le contenu a été reconstitué à partir d'une synthèse fournie par l'utilisateur plutôt que refait depuis zéro.
