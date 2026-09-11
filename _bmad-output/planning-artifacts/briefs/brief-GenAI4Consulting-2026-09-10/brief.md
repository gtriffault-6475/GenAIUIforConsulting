---
title: "Product Brief: GenAI4Consulting"
status: draft
created: 2026-09-10
updated: 2026-09-10
---

# Product Brief: GenAI4Consulting

## Executive Summary

Chez OCTO, moins de la moitié des consultants utilisent aujourd'hui l'IA de façon structurée — avec des skills, des agents et une réutilisation d'un projet à l'autre. Ceux qui le font progressent individuellement ; le cabinet, lui, ne capitalise pas collectivement dessus. Pendant ce temps, l'écart se creuse au niveau du marché : les grands cabinets de conseil ont déjà déployé des plateformes d'agents IA à l'échelle du cabinet [ASSUMPTION: chiffres tirés de sources publiques récentes, à vérifier avant tout usage externe] :

- **McKinsey (Lilli)** — 40 000+ consultants, ~20 000 agents IA, 30 % de temps gagné sur la recherche et la synthèse.
- **Deloitte (Sidekick/Zora)** — 75 000 postes.
- **Accenture (AI Refinery)** — 85 000+ professionnels IA & data.
- **PwC (ChatPwC)** — 200 000 postes, le plus grand déploiement GenAI d'entreprise du secteur.

Ce n'est plus une hypothèse : c'est déjà la référence que les clients commencent à connaître.

GenAI4Consulting est un **prototype exploratoire**, pas un projet à l'échelle de ces plateformes. L'idée : une interface de travail agentique qui se branche sur l'existant OCTO — Octopod, le drive, Mattermost — plutôt que de le remplacer. Dès le round 1, elle combine trois briques : un espace multi-agents, un éditeur assisté par IA et un orchestrateur de workflow. Elle est testée sur deux cas d'usage qui suivent le même schéma : les réponses avant-vente aux appels d'offres et les livrables de mission hors code.

L'objectif du round 1 n'est pas de prouver un ROI chiffré, mais de valider — auprès d'un petit groupe de consultants OCTO déjà identifiés — que l'idée tient debout et mérite d'être poussée plus loin.

## The Problem

Aujourd'hui, moins de la moitié des consultants OCTO utilisent réellement l'IA avec des skills et des agents, et réutilisent ce qui a été produit d'un projet à l'autre. Les outils sont disparates — certains consultants n'en utilisent aucun — ce qui empêche tout partage : de skills, de workflows, de documents. Il n'y a pas de capitalisation collective sur ce qui fonctionne : un consultant qui a peaufiné un bon prompt ou une bonne méthode ne la transmet pas structurellement à un collègue qui recommence de zéro.

Cette situation, si elle n'est pas traitée, a trois conséquences concrètes :

- **Crédibilité compétitive.** OCTO vend du conseil tech et IA à ses clients, mais n'est pas exemplaire dans son propre usage de l'IA en interne — un décalage embarrassant face à un client qui demande "et vous, comment vous l'utilisez ?", d'autant plus visible que les grands cabinets communiquent déjà largement sur leurs propres plateformes internes (voir Executive Summary).
- **Attraction et rétention.** Les consultants les plus juniors ou les plus demandés attendent des outils IA-natifs. Sans eux, le risque est soit un départ vers un cabinet mieux équipé, soit du "shadow IT" — chacun bricole sa propre solution hors du cadre du cabinet, ce qui aggrave encore la fragmentation.
- **Écart qui se creuse.** Les quelques consultants déjà avancés prennent une avance individuelle en vitesse et en qualité, mais cette avance reste personnelle : elle ne profite pas au reste du cabinet, et l'écart entre "ceux qui savent" et "ceux qui ne savent pas" continue de s'élargir au lieu de se refermer.

## The Solution

Une interface de travail agentique qui se branche sur l'existant OCTO plutôt que de le remplacer, combinant trois briques dès le round 1 :

1. **Espace multi-agents** — un ou plusieurs agents spécialisés avec qui le consultant interagit.
2. **Éditeur assisté par IA** — l'IA intervient en marge d'un document ; le consultant garde la main sur le livrable final.
3. **Orchestrateur de workflow** — enchaînement d'étapes automatisées (recherche, structuration, rédaction, relecture) avec le consultant en supervision.

Deux cas d'usage suivent le même schéma : le consultant se connecte à un espace de travail existant (un projet Octopod, avec son drive et son canal Mattermost déjà en place), ajoute les documents qui manquent, puis travaille avec les skills et agents pour avancer plus vite et mieux — que ce soit pour répondre à un appel d'offres ou produire un livrable de mission.

## What Makes This Different

Le raisonnement "il suffit de donner à chacun un accès ChatGPT Enterprise ou Copilot et de former tout le monde" ne suffit pas, pour deux raisons assumées comme le cœur de la différenciation :

- **OCTO a des façons de faire spécifiques** — méthodes, référentiels, savoir-faire de mission — qu'un outil IA générique ne connaît pas et ne peut pas rendre accessibles tout seul.
- **L'efficacité vient de l'accès facile et de l'intégration**, pas d'un modèle d'IA supérieur en soi. Se connecter à un espace de travail déjà organisé (Octopod, drive, Mattermost) plutôt que de repartir d'une page blanche est ce qui fait gagner du temps.

Le moat n'est donc pas technologique — il est dans l'intégration à l'existant OCTO et dans le savoir-faire du cabinet qu'on rend accessible. C'est aussi, assumément, un projet à échelle volontairement réduite : contrairement aux plateformes des grands cabinets citées plus haut, il s'agit d'un prototype léger, avec des intégrations largement simulées, pensé pour tester une idée avant d'investir davantage.

## Who This Serves

Horizontalement, tous les consultants OCTO — pas un profil particulier identifié à ce stade (junior vs senior, avant-vente vs mission). Le round 1 est testé auprès d'un petit groupe de consultants déjà connus du porteur de projet, pas à recruter.

## Success Criteria

Le round 1 est réussi si un testeur peut, sans blocage : 1) se connecter à un projet, 2) trouver facilement les skills et agents dont il a besoin, 3) les utiliser efficacement.

Au-delà de ce socle fonctionnel, le signal de succès recherché est qualitatif — une réaction du type :

> "C'est incroyable, tout ce dont j'avais besoin était à portée de main, j'ai trouvé exactement ce dont j'avais besoin très facilement — j'ai même été guidé pour ça — et ensuite les IA m'ont vraiment aidé à aller plus vite et à faire mieux."

Pas de ROI chiffré attendu à ce stade : le porteur de projet sait explicitement qu'il n'est pas garanti de tout connecter "en vrai" pour ce round 1.

## Scope

**Dans le round 1 :**
- Les trois briques (multi-agents, éditeur assisté, orchestrateur de workflow) toutes présentes.
- Les deux cas d'usage : réponses avant-vente et livrables de mission hors code.
- Intégrations avec Octopod, le drive et Mattermost largement mockées/simulées — l'expérience doit rester crédible, sans que tout soit branché en réel.

**Hors round 1 (points ouverts, à traiter en PRD/architecture) :**
- Formaliser (ou concevoir) la méthode de qualification/réponse avant-vente.
- Définir la source de données pour les références de missions et les experts OCTO.
- Fixer une échéance — aucune n'est définie à ce stade.

Le détail complet du scénario avant-vente est décrit dans l'addendum.

## Vision

Si le round 1 valide l'idée, le projet a vocation à grossir au-delà de ces deux cas d'usage initiaux — vers plus de cas d'usage, une intégration plus profonde à l'écosystème d'outils OCTO, et potentiellement une offre présentée aux clients eux-mêmes [ASSUMPTION: cette dernière piste (offre client) reste à confirmer et à cadrer — elle a été évoquée sans être approfondie]. Le calendrier et l'ampleur de cette croissance ne sont pas encore définis.
