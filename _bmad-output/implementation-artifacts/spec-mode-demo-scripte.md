---
title: "Mode démo scripté (réponses canned sans clé API)"
type: 'feature'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '6a2c649f900815e11a28dc7e911c6be44bc96af3'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** sans `ANTHROPIC_API_KEY` réelle (l'environnement de démo type), chaque appel agent échoue (`sendToAgent`, `skills/buildRequest.ts`) -- `sendMessage` retourne `assistantFailed:true`, `getStartingSuggestion` échoue silencieusement. Rien de la valeur "travailler avec des agents" n'est démontrable devant un prospect ou un collègue sans connexion réelle.

**Approche :** interception dans `sendToAgent` (AD-11, seul point d'assemblage) : quand le mode démo est actif, au lieu d'appeler l'API Anthropic réelle, renvoyer une réponse scriptée choisie par correspondance de mots-clés contre le tour `user` le plus récent de `history`. Couvre les deux appelants existants sans changer leur signature : `sendMessage` (chat + outil `propose_livrable_content`, dont l'input canned est réellement exécuté par `executeTool` -- le livrable/les suggestions créés sont de vraies lignes DB, seul l'appel API est simulé) et `proposeStartingPoint` (suggestion proactive par étape -- le `stepLabel` voyage déjà dans le texte du prompt synthétique, donc identifiable par mot-clé sans paramètre supplémentaire).

**Décisions (utilisateur, Checkpoint 1) :** (1) détection explicite via une variable d'environnement dédiée (`DEMO_MODE`), jamais automatique sur simple absence de clé ; (2) script complet uniquement pour `proj-acme-rfp`, repli générique pour `proj-audit-mission` ; (3) correspondance par mots-clés avec repli générique, jamais un ordonnancement séquentiel strict.

**Découpage (utilisateur) :** la mise en scène d'un document de référence apparaissant dans le Contexte au moment du déclenchement de l'outil est séparée dans son propre travail futur (`deferred-work.md`) pour garder cette spec dans le budget de tokens cible -- non incluse ici.

## Boundaries & Constraints

**Always :** le mode démo scripté ne doit jamais s'activer silencieusement dans un déploiement réel mal configuré -- une panne de vraie clé API doit rester visible comme une panne, pas se travestir en fonctionnalité. Le contenu scripté reste cohérent avec les fixtures existantes (thème RFP Acme Corp, skills `references`/`rfp-drafting`, ton sobre/vouvoiement, `CONVENTIONS.md`). Le flux outil (`propose_livrable_content`) scripté doit produire de vraies lignes LIVRABLE/SUGGESTION via le même `executeTool`/`createLivrableWithSuggestions` que le flux réel -- jamais un contenu fictif qui contournerait la persistance.

**Never :** aucune apparition de document dans cette spec (découpée, voir ci-dessus). Pas de streaming/effet de frappe dans cette spec (complément déjà proposé séparément, pas demandé ici). Pas de mode démo pour le projet mission (`proj-audit-mission`) au-delà d'un repli générique -- pas de script dédié pour ce projet dans cette spec.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chat scripté, message reconnu | Mode démo actif, message utilisateur correspondant à un déclencheur du script | Réponse canned réaliste renvoyée sans appel API réel ; si le script prévoit un appel outil, `executeTool` s'exécute réellement (vraie ligne LIVRABLE/SUGGESTION créée) | N/A |
| Chat scripté, message non reconnu | Mode démo actif, message hors script | Réponse de repli générique mais plausible, jamais un échec | N/A |
| Suggestion proactive par étape | Mode démo actif, `proposeStartingPoint` appelé avec un `stepLabel` connu | Suggestion canned dans le thème de l'étape | N/A |
| Mode démo inactif | Clé API réelle configurée (ou flag démo désactivé) | Comportement actuel inchangé, vrai appel Anthropic | Un vrai échec (clé invalide, réseau) reste un vrai échec visible |

</frozen-after-approval>

## Code Map

- `skills/demoScript.ts` (nouveau) -- pure, aucun accès `db/` (même convention que `skills/propose_starting_point.ts`/`skills/models.ts`). Exporte :
  - `isDemoModeActive(): boolean` (`process.env.DEMO_MODE === 'true'`) -- un seul point de lecture de cette variable, réutilisé partout où le mode démo doit être vérifié.
  - Un script pour le chat (`sendMessage`) : liste ordonnée de `{ keywords: string[], reply: string, toolCall?: { title, blocks, suggestions } }` -- au moins une entrée dont `toolCall` est renseigné (déclenche `propose_livrable_content`), thème réponse RFP Acme Corp (cohérent avec les skills `references`/`rfp-drafting` déjà chargées sur `proj-acme-rfp`). Une fonction `matchDemoChatEntry(latestUserMessage: string)` -- premier match (sous-chaîne insensible à la casse) sur `keywords`, sinon un repli générique exporté séparément (`DEMO_FALLBACK_REPLY`).
  - Une map `DEMO_STEP_SUGGESTIONS: Record<string, string>` clée par le `stepLabel` exact de `domain/workflow.ts`'s `STEPS` (`"Qualification"`, `"Références"`, `"Experts"`, `"Rédaction"`) et une fonction `matchDemoStepSuggestion(promptText: string)` -- cherche laquelle de ces 4 chaînes apparaît dans le texte du prompt synthétique de `propose_starting_point.ts` (qui contient déjà `Le consultant vient d'ouvrir l'étape "${stepLabel}"`), sinon un repli générique.
  - **(Tour 2, bad_spec)** Une constante `DEMO_REWORK_MARKER = 'retravailler cette suggestion'` (sous-chaîne exacte du prompt synthétique de `skills/rework_suggestion.ts`'s `reworkSuggestionContent` : `"Le consultant demande de retravailler cette suggestion avec les précisions suivantes"`, jamais présente dans le prompt de `proposeStartingPoint`) et `DEMO_REWORK_REPLY` (une reformulation générique plausible -- ce troisième appelant sans `tool`/`executeTool` renvoie uniquement le texte de la suggestion, sans préambule, per son propre prompt).
- `skills/buildRequest.ts` -- `sendToAgent` : tout en haut du corps de la fonction (avant `new Anthropic()`), si `isDemoModeActive()` : ne construit jamais de client Anthropic, ne fait aucun appel réseau. Pour un appel avec `tool`/`executeTool` (le chat) : `matchDemoChatEntry` sur le dernier tour `user` de `history` ; si l'entrée a un `toolCall`, appeler réellement `await executeTool(entry.toolCall)` (même closure que le chemin réel -- vraie transaction DB, AD-2 inchangé) et **(Tour 2)** vérifier `toolResult.ok` : si `false`, renvoyer `{ok:false, error: toolResult.error}` (jamais la réponse canned de succès -- une vraie panne `executeTool`, même rarissime avec une entrée scriptée toujours valide, n'est pas la "absence de clé API" que le mode démo simule, et mérite de rester visible comme `sendMessage`'s chemin réel le fait déjà) ; sinon renvoyer `{ok:true, content: entry.reply}`. Sans `toolCall`, renvoyer directement `{ok:true, content: entry.reply}`. Pour un appel sans `tool` (deux appelants distincts, même forme d'appel) : **(Tour 2, bad_spec)** vérifier d'abord `DEMO_REWORK_MARKER` dans le seul tour de `history` -- si présent, renvoyer `{ok:true, content: DEMO_REWORK_REPLY}` (le 3e appelant réel, `reworkSuggestionContent`, oublié par erreur dans l'Intent d'origine qui affirmait "couvre les deux appelants existants" -- correction, voir Spec Change Log) ; sinon `matchDemoStepSuggestion` (la suggestion proactive, `proposeStartingPoint`). Aucun changement de signature de `sendToAgent` ni d'aucun de ses 3 appelants réels (`sendMessage`, `proposeStartingPoint`, `reworkSuggestionContent`).
- `.env.local.example` (nouveau, à la racine) -- documente `ANTHROPIC_API_KEY` (jamais renseignée, commentaire expliquant son rôle) et `DEMO_MODE` (`true`/absent), referme au passage un item déjà signalé dans `deferred-work.md` (Story 1.1) sur l'absence de ce fichier.

## Tasks & Acceptance

**Execution :**
- [x] `skills/demoScript.ts` -- script complet (chat + tool call + suggestions par étape + repli générique), `isDemoModeActive()`
- [x] `skills/buildRequest.ts` -- interception dans `sendToAgent`, avant toute construction de client Anthropic
- [x] `.env.local.example` -- `ANTHROPIC_API_KEY` + `DEMO_MODE` documentées

**Acceptance Criteria :**
- Given `DEMO_MODE=true` et aucune vraie clé API, when un message reconnu par le script est envoyé sur `proj-acme-rfp`, then une réponse canned s'affiche sans jamais atteindre l'API Anthropic réelle.
- Given `DEMO_MODE=true`, when le message déclenche l'entrée avec `toolCall`, then un vrai LIVRABLE avec de vraies SUGGESTION apparaît dans `LivrablesPanel`.
- Given `DEMO_MODE=true`, when un message hors script est envoyé, then une réponse de repli générique s'affiche -- jamais `assistantFailed:true`.
- Given `DEMO_MODE=true`, when le consultant ouvre une étape du Stepper sur `proj-acme-rfp` (conversation vide), then la suggestion proactive canned de cette étape s'affiche.
- Given `DEMO_MODE` absent ou `false`, when un message est envoyé sans clé API réelle, then le comportement actuel est inchangé (`assistantFailed:true`, échec visible) -- jamais de bascule silencieuse en mode démo.

## Design Notes

Exemples de ton (`CONVENTIONS.md` : vouvoiement, sobre, jamais de point d'exclamation) pour ancrer le script sans l'écrire en entier ici :
- Ouverture générique : "Je vous propose de structurer la réponse autour de trois axes : la maîtrise du domaine réglementaire, nos références sur des missions similaires, et la disponibilité de l'équipe proposée."
- Étape Références (Stepper) : "Je vous propose de rechercher, parmi les missions déjà réalisées par le cabinet, celles pertinentes pour le secteur d'Acme Corp."
- Repli générique : "Je ne suis pas certain de bien cerner votre demande -- pourriez-vous préciser ce que vous souhaitez que je fasse sur ce document ?"

## Implementation Notes

Implémenté conformément au Code Map : `skills/demoScript.ts` (nouveau, pur), interception dans `sendToAgent` avant toute construction de client Anthropic, `.env.local.example` complété. `matchDemoChatEntry` cherche sur le dernier tour `user` de `history` ; `tool`/`executeTool` sont toujours fournis ensemble par `sendMessage`, jamais l'un sans l'autre. L'échec de `executeTool` sur une entrée scriptée (bug dans `demoScript.ts` lui-même, jamais une vraie panne d'agent) est loggé seul, sans jamais transformer la réponse canned en `assistantFailed`.

**Vérification indépendante par l'orchestrateur -- bug trouvé et corrigé.** L'ordre initial du script plaçait l'entrée de salutation ("bonjour"/"bonsoir"/"salut") en premier dans `DEMO_CHAT_SCRIPT`. `matchDemoChatEntry` prend le premier match dans l'ordre du tableau -- un message tout à fait naturel pour un présentateur, "Bonjour, pourriez-vous rédiger une réponse à l'appel d'offres ?", matchait donc la salutation avant d'atteindre l'entrée à `toolCall` (la plus importante du script, celle qui crée le LIVRABLE), empêchant tout le point culminant de la démo de se déclencher sur cette phrase parfaitement plausible. Corrigé en déplaçant l'entrée de salutation en dernière position du tableau -- les entrées plus spécifiques (rédiger/référence/expert) sont désormais toujours vérifiées avant le mot-clé générique. Script `tsx` jetable indépendant confirmant le bug puis sa correction (7/7 assertions après correction, contre 6/7 avant), incluant le cas combiné salutation+déclencheur, le cas déclencheur seul, le repli générique, la suggestion d'étape, et la non-régression du chemin réel (`DEMO_MODE` absent -- toujours `assistantFailed:true` sans clé API, comportement strictement inchangé).

## Verification

**Commands :**
- `npx tsc --noEmit` -- propre
- `npx next build --turbopack` -- propre

**Manual checks :**
- `DEMO_MODE=true npx tsx <script jetable>` contre `db/local.db` réelle (sauvegarde/restauration) : parcourir le script complet (message d'ouverture, message déclenchant l'outil, message hors script, chaque étape du Stepper), vérifier qu'aucun appel `new Anthropic()` n'est atteint (pas d'erreur d'authentification dans les logs, contrairement au comportement actuel sans clé), vérifier le LIVRABLE/SUGGESTION créés.
- Sans `DEMO_MODE` (ou `false`) : confirmer que le comportement actuel (échec visible, `assistantFailed:true`) est strictement inchangé.

## Review Triage Log

`bmad-review` (blind-hunter, edge-case-hunter, verification-gap) lancé sur le diff complet (`skills/buildRequest.ts`, `skills/demoScript.ts`, `.env.local.example`).

| # | Finding | Verdict | Route | Résolution |
|---|---|---|---|---|
| 1 | verification-gap : `skills/rework_suggestion.ts`'s `reworkSuggestionContent` est un 3e appelant réel de `sendToAgent` (ni `tool` ni `executeTool`, un seul tour `history` -- exactement la même forme que `proposeStartingPoint`), jamais mentionné par l'Intent ("couvre les deux appelants existants"). En mode démo, une demande de retravail sur une suggestion recevait la suggestion de démarrage d'étape générique, sans rapport, écrasant le texte réel de la suggestion. | **High** | **bad_spec** | Corrigé : `DEMO_REWORK_MARKER`/`isDemoReworkPrompt`/`DEMO_REWORK_REPLY` ajoutés à `skills/demoScript.ts`, vérifiés avant `matchDemoStepSuggestion` dans `sendToAgent`. Root cause dans l'Intent gelé (nombre d'appelants sous-estimé) -- Code Map amendé (Tour 2), Intent lui-même non modifié (gelé, correction documentée ici plutôt que dans le texte gelé). Revérifié : `reworkSuggestion` produit un texte réel et distinct, jamais la suggestion d'étape générique -- 7/7 assertions. |
| 2 | blind-hunter + edge-case-hunter (convergence) : quand `executeTool(entry.toolCall)` échoue en mode démo, seule une trace `console.error` était écrite -- la réponse canned de succès était renvoyée quand même, affichant "livrable créé" alors qu'aucune ligne n'existe. | Medium | Patch | Corrigé : `toolResult.ok === false` renvoie désormais `{ok:false, error: toolResult.error}` -- une vraie panne interne (pas "absence de clé API") reste visible, comme le chemin réel le fait déjà pour son propre échec d'outil. |
| 3 | blind-hunter : `isDemoModeActive()`'s comparaison stricte `=== 'true'` échoue silencieusement sur `"1"`, `"True"`, ou un espace parasite -- quelqu'un préparant une démo en direct pourrait croire le mode actif et être surpris par un vrai appel API en pleine présentation. | Low | Patch | Corrigé : `.trim().toLowerCase() === 'true'`. |
| 4 | blind-hunter : aucun test automatisé pour `skills/demoScript.ts`, alors que deux bugs réels y ont déjà été trouvés pendant cette seule revue. | -- (pré-vérifié par la lentille elle-même pour la partie verification-gap) | Defer | Même limite déjà acceptée pour tout ce projet (aucune infrastructure de test nulle part). Logué dans `deferred-work.md`. |
| 5 | blind-hunter : `matchDemoChatEntry`/`matchDemoStepSuggestion` ne normalisent ni les accents ni les limites de mot -- un message sans accents ou un mot-clé imbriqué dans un mot sans rapport pourrait retomber sur le repli générique. | Low | Defer | Risque faible en pratique (le présentateur tape son propre script en français, sur son propre clavier). Logué dans `deferred-work.md`. |
| 6 | blind-hunter : suspicion de création de livrable en double si le même message déclencheur est envoyé deux fois. | -- | **Faux** | Vérifié directement par l'orchestrateur : `executeTool` (`actions/message.ts`) cherche déjà un LIVRABLE existant par `conversationId` et le met à jour au lieu d'en créer un second (garde de Story 4.4, inchangée par ce diff, s'applique identiquement en mode démo). |
| 7 | blind-hunter : aucun avertissement si `DEMO_MODE=true` reste actif avec une vraie clé API valide en production. | Low | Defer | Confort de configuration, pas un défaut fonctionnel -- les Boundaries n'exigent que la visibilité d'une clé *manquante*, inchangée. Logué dans `deferred-work.md`. |
| 8 | edge-case-hunter : aucune garde si `tool`/`executeTool` sont fournis l'un sans l'autre. | -- | Reject | Chemin non atteignable aujourd'hui -- tous les appelants réels de `sendToAgent` fournissent les deux ensemble ou aucun des deux, même principe que les autres gardes déjà rejetées cette session pour un état non démontré atteignable. |
| 9 | edge-case-hunter (claim check) : l'Intent gelé mentionne "script complet uniquement pour `proj-acme-rfp`" -- l'implémentation atteint ce résultat sans jamais passer `projectId`, uniquement parce que le vocabulaire des scripts diffère naturellement. Un message du projet mission utilisant "expert"/"référence" recevrait à tort du contenu thématique Acme Corp. | Medium (réel, mais déjà nommé et accepté) | Defer | Compromis déjà explicitement choisi au Checkpoint 1 (pas de changement de signature de `sendToAgent`) -- corriger proprement nécessiterait de passer `projectId`, ce que l'utilisateur a explicitement écarté. Logué dans `deferred-work.md`. |
| 10 | edge-case-hunter (claim check, doublon) : même constat que le finding #2 sur l'échec `executeTool`. | Medium | Patch | Même résolution que #2. |

## Spec Change Log

**Tour 1 -> Tour 2 (finding #1, `bad_spec`).** Root cause dans l'Intent gelé : "Couvre les deux appelants existants" sous-comptait -- `reworkSuggestionContent` (`skills/rework_suggestion.ts`) est un 3e appelant réel de `sendToAgent`, jamais mentionné, partageant exactement la même forme d'appel (ni `tool` ni `executeTool`, un seul tour) que `proposeStartingPoint`. Le texte gelé de l'Intent n'a pas été modifié (convention de ce projet : une correction factuelle découverte en revue se documente ici plutôt que dans le bloc gelé lui-même) -- Code Map amendé pour décrire la distinction par marqueur de prompt (`DEMO_REWORK_MARKER`), vérifiée avant la correspondance par étape. Pas de retour complet à l'implémenteur : correctif appliqué directement par l'orchestrateur (taille contenue -- une constante, une fonction, un branchement dans `sendToAgent`), revérifié indépendamment (7/7 assertions dédiées).

**KEEP :** tout le reste du Tour 1 reste correct et inchangé -- le script chat (thème RFP Acme Corp), la détection `DEMO_MODE` explicite, l'ordre du script (salutation en dernière position, déjà corrigé au Tour 1 par l'orchestrateur avant le premier passage de revue), l'exécution réelle d'`executeTool` pour le `toolCall`.
