---
title: Réconciliation PRD ↔ Sprint Change Proposal du 2026-10-02
created: 2026-10-02
input: _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-02.md (§2, §5.1, §5.2, §7)
target: _bmad-output/planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md
---

# Réconciliation PRD ↔ Sprint Change Proposal (2026-10-02)

## Synthèse

L'application au PRD est **globalement fidèle** : FR-6, §5, §6.1, §6.2, les deux entrées du glossaire, §4.5 (FR-25 à FR-31 et ses NFR), OQ-7 et l'amendement §7 sont tous présents, et la numérotation (FR-1 à FR-31, « 5 features ») est à jour. L'amendement §7 est correctement appliqué à FR-6 et FR-25 (aucun drive simulé hors démo sans compte ; aucune mention de Google en démo).

Les écarts restants relèvent surtout de **contradictions internes résiduelles** et de **trous de comportement** que les FR structurées laissent implicites.

**21 écarts** au total : 2 de fidélité, 8 contradictions résiduelles, 11 trous silencieux.

| Gravité | Nombre |
|---|---|
| Haute | 4 |
| Moyenne | 9 |
| Basse | 8 |

## Vérification point par point

| Élément de la proposition | Emplacement PRD | Statut |
|---|---|---|
| FR-6 (§5.1) amendé par §7 | §4.1 FR-6, l.131 | Conforme (version §7 appliquée) |
| §5 Non-Goals | l.362 | Conforme |
| §6.1 ajout de l'intégration Drive ; mock limité à Octopod/Mattermost | l.375-376 | Conforme |
| §6.2 réel différé pour Octopod/Mattermost seulement + 2 lignes hors scope | l.380-382 | Conforme (mais voir C2) |
| Glossaire « Livrable » + « Dossier Drive du projet » | l.70-71 | Conforme |
| FR-25 (+ amendement §7) | l.302-309 | Conforme sur le fond (voir F2) |
| FR-26 | l.311-316 | Conforme |
| FR-27 (FR-4 inchangé) | l.318-324 | Conforme (voir C4) |
| FR-28 | l.326-328 | Conforme (voir G4) |
| FR-29 | l.330-336 | Conforme (voir G6, G8) |
| FR-30 | l.338-345 | Conforme (voir G3, G9) |
| FR-31 | l.347-352 | Conforme (voir G2, G7) |
| NFR de la feature | l.354-356 | Écart de formulation (F1) |
| OQ-7 | l.407 | Conforme |
| Décisions §2 (OAuth compte consultant, client « Interne », un compte par poste, Slides uniquement, dossier au nom exact, Contexte réel, Octopod/Mattermost simulés, démo indépendante de Google) | FR-25, §6.2, glossaire, FR-27, FR-6, NFR | Conformes, sauf OAuth/« Interne » non mentionnés (F2) |

## A. Écarts de fidélité à la proposition

**F1 — NFR plus forte que la source et inexacte (basse).** §4.5, NFR, l.355 : « Les identifiants et jetons Google ne quittent jamais le poste ». La proposition dit seulement « jamais exposés au navigateur ». Or les jetons partent nécessairement vers Google à chaque appel, donc la phrase est fausse au sens strict et n'est pas testable. *Proposition :* revenir à « ne sont jamais exposés au navigateur ni stockés côté client ».

**F2 — La nature de la connexion n'apparaît pas (basse).** FR-25, l.304. La décision §2 (OAuth avec le compte du consultant, client OAuth « Interne », donc limité au domaine Google Workspace d'OCTO) n'apparaît nulle part dans le PRD. Conséquence produit : l'app voit exactement les droits Drive du consultant connecté. Un dossier projet non partagé avec lui sera vu comme « absent » (FR-26). *Proposition :* une phrase dans FR-25 : « avec son propre compte Google OCTO ; l'app n'accède qu'à ce que ce compte peut voir ».

## B. Contradictions résiduelles ailleurs dans le PRD

**C1 — Journeys : FR-25..31 sont à la fois « illustrées par aucune journey » et « Realizes UJ-1, UJ-2 » (haute).** La l.57 dit qu'aucune journey ne les illustre, alors que la description de §4.5 (l.298) dit « Realizes UJ-1, UJ-2 ». Il faut trancher : soit retirer « Realizes » de §4.5, soit ajouter une journey (ou étendre UJ-1/UJ-2) qui importe, retravaille et enregistre une présentation Drive. C'est justement le premier critère de succès de la proposition (§6).

**C2 — §6.2 « Formats de livrable autres que Google Slides » contredit les livrables locaux (haute).** l.381. Lue littéralement, la ligne exclut les livrables locaux (blocs de paragraphes en base). Ce sont pourtant ceux de FR-13 et FR-19 à FR-24, d'UJ-1 (« Réponse RFP — v1 ») et d'UJ-2 (« crée le livrable depuis la conversation »), ainsi que la valeur `source = 'local'` par défaut de l'architecture. L'intention est « formats de **fichier Drive** autres que Google Slides ». *Proposition :* reformuler en « Livrables adossés à un fichier Drive d'un autre format que Google Slides (Google Docs, .pptx, .docx) ; les livrables locaux à l'app restent couverts ».

**C3 — FR-3 parle de « documents et répertoires », FR-27 seulement de « fichiers » (moyenne).** l.107 et l.320. Le traitement des sous-dossiers du dossier projet n'est pas défini : les afficher, les parcourir récursivement, les ignorer ? FR-26 et FR-27 ne le disent pas.

**C4 — FR-4 parle encore du « drive Octopod » (basse).** l.114 et l.117 : « pas présent sur le drive Octopod », « resynchronisation du drive Octopod ». Le drive est désormais le dossier Google Drive du projet, distinct d'Octopod, qui reste simulé. *Proposition :* « dossier Drive du projet ».

**C5 — L'état vide de FR-13 se heurte à FR-25 et FR-28 (moyenne).** l.200. FR-13 prévoit une invite à créer un livrable quand il n'en existe aucun. Sans compte connecté, FR-25 impose une autre invite (connecter Google Drive). Et quand le dossier contient des présentations mais qu'aucun livrable n'est ouvert, le panneau n'est pas vide. La priorité ou la coexistence des invites, et la définition de « vide », ne sont pas précisées.

**C6 — FR-2 (« du contenu dès la première ouverture ») se heurte à FR-26 (basse).** l.100. L'exception ne couvre que la connexion Google. Un dossier absent ou en double (FR-26) donne aussi un panneau Contexte sans contenu, avec un message. *Proposition :* étendre l'exception à FR-26.

**C7 — Aucune métrique de succès ne couvre FR-25..31 (moyenne).** §7, l.390-397. Les critères de succès de la proposition (§6 : import → suggestions acceptées → enregistrement ; aucune modification parallèle écrasée ; démo identique sans Google) ne figurent pas dans les Success Metrics. Aucune SM ne « valide » FR-25 à FR-31.

**C8 — Promesse « suggestions déjà là » contre import à la demande et latence Google (basse).** La NFR de §4.4 (l.294) et le climax d'UJ-1 promettent des suggestions affichées immédiatement. FR-29 (l.332) prévoit au contraire des suggestions demandées après l'import, avec la latence et les quotas Google identifiés comme risque (proposition §4). Le PRD ne dit pas si la NFR « perçu comme immédiat » s'applique aux livrables adossés à Drive. Par ailleurs, la NFR transverse « Performance/échelle : aucune cible » (l.427) ne mentionne pas ce risque.

## C. Trous silencieux (comportements que les FR laissent implicites)

**G1 — « Mode démo » n'est pas défini dans le glossaire (moyenne).** Le terme est désormais structurant (FR-6, FR-25, NFR §4.5) mais absent de §3, qui fait pourtant autorité sur le vocabulaire (§0). On ne sait pas qui l'active ni ce qu'il couvre.

**G2 — Le comportement de FR-28 à FR-31 en mode démo n'est pas défini (haute).** FR-25 dit seulement que « le drive reste simulé ». Restent ouvertes plusieurs questions : le panneau Livrables affiche-t-il des présentations simulées (FR-28) ? Peut-on les « importer », puis « Enregistrer dans Drive » (FR-30) ? FR-31 crée-t-il une présentation simulée, un livrable local, ou est-il indisponible ? C'est le parcours principal à ce stade (proposition §4), et le PRD ne le spécifie pas.

**G3 — Ce qui suit un enregistrement réussi et un réimport n'est pas défini (haute).** FR-30, l.340-345.
- Rien ne dit qu'après un enregistrement réussi, la nouvelle révision devient la référence. Sans cela, le contrôle de conflit refuserait tout second enregistrement, donc la conséquence n'est pas testable de bout en bout.
- Le sort des suggestions (en attente, acceptées, rejetées) et de leur historique (FR-22) après un « réimport » proposé en cas de conflit n'est pas défini. Le consultant perd-il les modifications acceptées et non enregistrées ? Il faut au minimum l'en prévenir.

**G4 — Rouvrir une présentation déjà importée n'est pas défini (moyenne).** FR-28 et FR-29. Si l'on clique de nouveau sur une présentation déjà importée : réimport, doublon de livrable, ou ouverture du livrable existant ? La présentation reste-t-elle listée dans le groupe « Drive » après import ? « Distinguées des livrables déjà ouverts » ne suffit pas à le dire.

**G5 — Les livrables Drive après déconnexion ou sans compte ne sont pas définis (moyenne).** FR-25. Rien ne dit ce que deviennent les livrables déjà importés si le consultant se déconnecte, ou si la connexion expire ou est révoquée. Restent-ils ouverts, en lecture seule ? « Enregistrer dans Drive » est-il désactivé ? L'amendement §7 les affiche (« livrables déjà ouverts dans l'app ») sans dire ce qu'on peut en faire.

**G6 — Le contenu non textuel des diapositives n'est pas défini (moyenne).** FR-29, l.332. « Chaque zone de texte devient un paragraphe », mais rien n'est dit sur les tableaux, les formes groupées, les notes de l'orateur, les zones vides ni les images. Sont-ils ignorés, préservés, signalés ? Une affirmation comme « le reste de la diapositive n'est jamais modifié » suffirait.

**G7 — Préconditions et voie « Ajuster » de FR-31 (basse).** l.347-352. Le PRD ne dit rien du cas où le dossier projet est absent ou en double (FR-26), ni du cas sans compte connecté. La possibilité d'ajuster la proposition avant création (« Ajuster », proposition §5.4) n'est pas mentionnée non plus. Elle découle de « validation explicite » mais n'est pas testable telle quelle.

**G8 — La révision globale (FR-23) sur un livrable adossé à Drive n'est pas définie (moyenne).** FR-29 limite l'IA à des suggestions ancrées, sans ajout, suppression ni réordonnancement. Or FR-23 permet une révision globale « ne ciblant pas un passage précis ». Est-elle désactivée, ou contrainte à des suggestions ancrées sur les zones existantes ? Le point recoupe OQ-4.

**G9 — Les échecs d'écriture hors conflit ne sont pas couverts (basse).** FR-30. Seul le conflit de révision est couvert. Il manque les cas d'erreur réseau, de quota, de droits insuffisants (fichier en lecture seule pour ce compte) et de fichier supprimé ou déplacé. L'UX prévoit un état « en erreur », mais aucune conséquence du PRD n'en parle. Le fichier supprimé vaut aussi pour l'import.

**G10 — La fraîcheur des listes Drive n'est pas définie (basse).** FR-27 et FR-28. Rien ne dit quand la liste du dossier est relue : à la sélection du projet, à l'ouverture du panneau, sur action ? Un fichier ajouté dans Drive pendant la session doit-il apparaître ?

**G11 — La confidentialité du contenu Drive n'est pas traitée (basse).** La section « Constraints and Guardrails » (l.419-421) ne traite que la confidentialité des conversations. Or FR-27 envoie désormais au modèle IA le texte de documents clients réels, et FR-30 et FR-31 écrivent dans un Drive partagé à l'équipe. Il manque au minimum une hypothèse (`[ASSUMPTION]`, §9) sur l'acceptabilité de l'envoi de documents Drive à l'API Claude.

## Recommandations prioritaires

1. Trancher C1 (journeys) et ajouter une SM pour §4.5 (C7). Le plus simple est d'étendre UJ-1 à une présentation Drive importée puis enregistrée.
2. Reformuler la ligne §6.2 sur les formats (C2).
3. Définir le mode démo au glossaire (G1) et son comportement pour FR-28 à FR-31 (G2).
4. Compléter FR-30 : la révision de référence est mise à jour après succès, et le sort des suggestions au réimport est défini (G3).
5. Ajouter à FR-28 et FR-29 la règle de réouverture d'une présentation déjà importée (G4) et la règle « hors zones de texte, rien n'est modifié » (G6).
