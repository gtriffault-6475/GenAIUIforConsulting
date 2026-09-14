---
name: GenAI4Consulting
description: Interface de travail agentique interne pour les consultants OCTO — prototype exploratoire round 1. Web app desktop autonome (pas de système de composants hérité).
status: final
created: 2026-09-11
updated: 2026-09-11
sources:
  - _bmad-output/planning-artifacts/briefs/brief-GenAI4Consulting-2026-09-10/brief.md
colors:
  background: '#F3F4F8'
  surface: '#FFFFFF'
  border: '#E3E5EC'
  text-primary: '#1C2030'
  text-secondary: '#5A5F72'
  text-muted: '#8A90A3'
  accent: '#3E4C7C'
  accent-foreground: '#FFFFFF'
  ai-accent: '#7C5CFC'
  ai-accent-foreground: '#FFFFFF'
  ai-tint: '#F1EEFC'
  selected-tint: '#EEF0F8'
  avatar-bg: '#DFE2EE'
  success: '#0F7A4D'
typography:
  display:
    fontFamily: 'Space Grotesk'
    fontWeight: '600'
    fontSize: 22px
    lineHeight: '1.3'
  heading:
    fontFamily: 'Space Grotesk'
    fontWeight: '600'
    fontSize: 16px
    lineHeight: '1.3'
  body:
    fontFamily: 'IBM Plex Sans'
    fontWeight: '400'
    fontSize: 13.5px
    lineHeight: '1.5'
  body-strong:
    fontFamily: 'IBM Plex Sans'
    fontWeight: '600'
    fontSize: 13.5px
    lineHeight: '1.5'
  label:
    fontFamily: 'IBM Plex Sans'
    fontWeight: '600'
    fontSize: 11px
    lineHeight: '1.4'
    letterSpacing: 0.06em
  caption:
    fontFamily: 'IBM Plex Sans'
    fontWeight: '400'
    fontSize: 11px
    lineHeight: '1.4'
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  full: 9999px
elevation:
  dropdown: '0 6px 18px rgba(20,22,40,0.12)'
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  gutter: 24px
  panel-padding: 20px
components:
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.accent-foreground}'
    radius: '{rounded.sm}'
  button-ai-primary:
    background: '{colors.ai-accent}'
    foreground: '{colors.ai-accent-foreground}'
    radius: '{rounded.sm}'
  card:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.md}'
  ai-suggestion-card:
    background: '{colors.ai-tint}'
    radius: '{rounded.md}'
    border: 'none'
  nav-row-active:
    background: '{colors.selected-tint}'
    radius: '{rounded.sm}'
---

## Brand & Style

[ASSUMPTION: aucune charte graphique OCTO n'a été fournie pendant la conversation — cette palette et cette typographie sont une proposition neutre professionnelle, à valider ou remplacer par la charte réelle avant tout usage au-delà du groupe de test.]

GenAI4Consulting est un outil de travail, pas un produit à séduire. Le brief est explicite : c'est un prototype exploratoire testé par une poignée de consultants OCTO qui connaissent déjà le contexte. L'expression visuelle suit ce parti pris — sobre, professionnelle, crédible pour un cabinet de conseil tech, sans effet de démonstration. La seule chose que le visuel doit vendre, c'est la confiance : que l'avis de l'IA en marge d'un document mérite d'être pris au sérieux, et que l'outil sait où il se trouve dans l'écosystème OCTO (Octopod, drive, Mattermost).

Un seul geste distinctif porte cette confiance : **le violet est réservé à l'IA.** Tout ce qui vient du modèle — suggestions, skills, éléments "assistés" — porte cette teinte. Le reste de l'interface (navigation, structure, actions de l'utilisateur) reste dans une palette neutre bleu-gris. Ce n'est pas une IA qui décore l'interface ; c'est une IA qu'on peut repérer d'un coup d'œil.

## Colors

- **`background` (`#F3F4F8`)** — fond de page, gris-bleu très clair. Jamais blanc pur : les panneaux blancs s'y détachent.
- **`surface` (`#FFFFFF`)** — barres, panneaux, cartes, éditeur de document.
- **`accent` (`#3E4C7C`, navy)** — couleur structurelle : logo, actions primaires de navigation, avatar, liens. Utilisée pour tout ce que **l'utilisateur** fait ou possède.
- **`ai-accent` (`#7C5CFC`, violet)** — réservée à tout ce qui vient de **l'IA** : icône skills, suggestion proactive, bouton "Accepter" d'une suggestion, icône livrable en cours de travail avec l'IA. Ne jamais l'utiliser pour de la simple décoration.
- **`ai-tint` (`#F1EEFC`)** — fond plein (jamais une bordure gauche colorée) pour signaler visuellement une zone générée ou suggérée par l'IA : la carte de suggestion proactive, le paragraphe qu'une suggestion cible dans l'éditeur.
- **`text-primary` / `text-secondary` / `text-muted`** — trois niveaux de gris-bleu pour la hiérarchie de lecture ; jamais de noir pur.
- **`border` (`#E3E5EC`)** — unique couleur de bordure dans toute l'interface.
- **`success` (`#0F7A4D`)** — exclusivement pour confirmer qu'une suggestion IA a été acceptée. N'est pas un vert générique de validation ailleurs dans l'outil (pas encore d'autre cas d'usage identifié pour ce round 1).

Éviter : dégradés, plus de deux couleurs d'accent (voir aussi Do's and Don'ts).

## Typography

Deux familles, un rôle chacune :

- **Space Grotesk** (600) — le nom du produit dans la barre du haut, les titres de section, le titre d'un document ouvert dans l'éditeur. Réservé aux moments d'orientation : "où suis-je".
- **IBM Plex Sans** — tout le reste : conversation, listes, boutons, libellés. Poids 400 pour le texte courant, 600 pour les libellés et les éléments interactifs qui doivent se distinguer (noms de skills, titres de panneaux).

`{typography.label}` (11px, majuscules, espacé) introduit chaque section de la sidebar ("Conversations", "Skills chargées", "Contexte", "Livrables", "Mattermost") — c'est le seul usage de majuscules dans l'outil.

## Layout & Spacing

Échelle basée sur 4px : `{spacing.1}` à `{spacing.8}`. Grille en trois colonnes sur l'écran principal (sidebar gauche 240px fixe · zone centrale flexible · sidebar droite 300px fixe), verrouillée pour le round 1 — pas de version mobile ni de sidebar rétractable (plateforme cible détaillée dans `EXPERIENCE.md.Responsive & Platform`).

`{spacing.gutter}` (24px) sépare les zones de contenu majeures. `{spacing.panel-padding}` (20px) est le padding interne constant de chaque panneau latéral, pour que l'œil retrouve toujours le même rythme en passant d'un panneau à l'autre.

## Elevation & Depth

Pas d'élévation comme outil de hiérarchie — l'interface reste plate, les bordures (`{colors.border}`) séparent les zones plutôt que des ombres. Seule exception : le menu déroulant du sélecteur de modèle, qui flotte au-dessus du composer avec `{elevation.dropdown}` puisqu'il doit se lire comme temporairement au-dessus du reste.

## Shapes

`{rounded.sm}` (6px) pour les boutons et champs — la taille par défaut de l'outil. `{rounded.md}` (8px) pour les cartes et panneaux qui contiennent d'autres éléments (carte de suggestion, carte de skill). `{rounded.full}` uniquement pour les avatars et badges ronds. Pas de coins vifs (0px) nulle part : l'outil ne cherche pas un ton "dashboard technique" ; il reste feutré.

## Components

- **Bouton primaire (`button-primary`)** — fond `{colors.accent}`, texte blanc. Actions de navigation et d'envoi de message.
- **Bouton primaire IA (`button-ai-primary`)** — fond `{colors.ai-accent}`. Réservé aux actions qui valident ou déclenchent quelque chose venant de l'IA ("Oui, commençons", "Accepter", "Envoyer la demande de retravail"). Ne jamais utiliser cette variante pour une action purement utilisateur.
- **Carte (`card`)** — fond blanc, bordure `{colors.border}`, radius `{rounded.md}`. Le conteneur par défaut pour tout regroupement de contenu (skill, document, panneau Mattermost).
- **Carte de suggestion IA (`ai-suggestion-card`)** — fond `{colors.ai-tint}` plein, jamais de bordure gauche colorée. Utilisée pour la suggestion proactive d'ouverture et pour chaque suggestion ancrée dans l'éditeur.
- **Ligne de navigation active (`nav-row-active`)** — fond `{colors.selected-tint}`, texte en `{typography.body-strong}`. Marque la conversation ou l'étape de workflow sélectionnée.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Réserver `{colors.ai-accent}` à ce qui vient du modèle | Utiliser le violet pour de la décoration ou de la navigation utilisateur |
| Fond plein (`{colors.ai-tint}`) pour signaler une zone IA | Une bordure gauche colorée façon "callout" — lu comme un cliché d'app IA générique |
| Deux familles de police, chacune avec un rôle fixe | Ajouter une troisième police pour "varier" |
| Interface plate, hiérarchie par bordures | Ombres portées comme outil de hiérarchie générale |
| `{typography.display}` réservé aux moments d'orientation | Du texte courant en Space Grotesk |
