---
title: "Bouton bascule pour le mode démo (remplace DEMO_MODE)"
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'd6977aa4382970926feb1974aa0c74c4ab86971b'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-mode-demo-scripte.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** le mode démo scripté (`spec-mode-demo-scripte.md`) se déclenche via une variable d'environnement (`DEMO_MODE`), qui demande d'éditer `.env.local` et de relancer le serveur -- peu pratique pour un produit qui, à ce stade, sert avant tout à faire des démos. La garde-fou initiale (une variable oubliée masquant silencieusement une vraie panne en production) est jugée moins prioritaire que la commodité, à condition que l'état actif soit impossible à manquer visuellement.

**Approche :** l'état du mode démo devient une colonne persistée sur `APP_STATE` (le singleton déjà utilisé pour `activeProjectId`, AD-6) plutôt qu'une variable d'environnement -- lu et écrit via une nouvelle Server Action dans `actions/demo.ts` (déjà le fichier des outils démo-only, même rationale AD-2 que `resetAvantVenteWorkflow`). Un bouton bascule dans le top bar (à côté de `ProjectSelector`) active/désactive l'état. Quand actif : un bandeau plein-largeur en haut de l'écran ("MODE DÉMO"), plus une bordure de couleur distincte autour de toute l'interface -- posés dans `app/layout.tsx` (englobe toutes les pages) pour qu'aucun écran ne puisse être confondu avec une session réelle. `.env.local`'s `DEMO_MODE` est retiré une fois ce mécanisme en place ; `skills/buildRequest.ts`'s `sendToAgent` lit désormais ce nouvel état -- signature inchangée, mais le point de lecture passe d'un accès `process.env` (infra déjà lu directement dans ce même fichier, pour la clé API) à une lecture `db` équivalente, narrow et documentée, plutôt que de faire remonter un nouveau paramètre à travers les 3 chemins d'appel et leurs 2 couches (`actions/*` -> `skills/*`).

## Boundaries & Constraints

**Always :** l'état du mode démo est un singleton global (comme `activeProjectId`), pas par projet ni par session utilisateur -- ce produit n'a qu'un seul projet actif à la fois de toute façon (AD-6). Le bandeau et la bordure doivent être visibles sur toutes les pages (`/` et `/livrables/[id]`), pas seulement l'accueil. Basculer l'état prend effet immédiatement sur le prochain appel agent, sans étape de rechargement/confirmation supplémentaire (même contrat que `selectProject`).

**Never :** aucune régression du contenu scripté lui-même (`skills/demoScript.ts` reste inchangé dans son contenu -- seul le point de lecture de l'activation change). Le toggle ne doit jamais dépendre d'un état client seul (`useState`/`localStorage`) puisque `sendToAgent` (Server Action) doit pouvoir le lire -- persistance serveur obligatoire.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Activation | Clic sur le bouton bascule, mode démo actuellement inactif | `APP_STATE.demoModeActive` passe à `true` ; bandeau + bordure apparaissent sur la page actuelle après rafraîchissement | Échec d'écriture -> message d'erreur inline, état visuel inchangé |
| Désactivation | Clic sur le bouton bascule, mode démo actuellement actif | `APP_STATE.demoModeActive` passe à `false` ; bandeau + bordure disparaissent ; `sendToAgent` repasse sur le vrai appel Anthropic au prochain message | N/A |
| Appel agent pendant que le mode est actif | N'importe lequel des 3 appelants de `sendToAgent` | Comportement scripté inchangé (`spec-mode-demo-scripte.md`) | N/A |

</frozen-after-approval>

## Code Map

- `db/schema.ts:49-52` -- `appState` : ajouter `demoModeActive: integer('demo_mode_active', { mode: 'boolean' })` (nullable, même motif que `assistantFailed`/`position` -- un seul singleton existant, `NULL` = inactif par défaut, aucun backfill nécessaire). Migration via `npm run db:generate`.
- `actions/demo.ts` -- nouvelles fonctions exportées : `getDemoModeActive(): Promise<ActionResult<boolean>>` (lit `appState.demoModeActive ?? false`) et `setDemoModeActive(active: boolean): Promise<ActionResult<void>>` (écrit la colonne). Étendre le commentaire d'en-tête AD-2 existant de ce fichier pour couvrir cette nouvelle écriture sur `APP_STATE` (déjà lu ici pour `resetAvantVenteWorkflow`'s garde, jamais écrit avant ce spec).
- `skills/demoScript.ts` -- retirer `isDemoModeActive()` (lisait `process.env.DEMO_MODE`) : le contenu du script (`DEMO_CHAT_SCRIPT`, `DEMO_STEP_SUGGESTIONS`, etc.) reste inchangé, seule cette fonction disparaît d'ici.
- `skills/buildRequest.ts` -- `sendToAgent` : remplacer l'appel à `isDemoModeActive()` par une lecture directe de `appState.demoModeActive` via `db` (import `appState`, `APP_STATE_ID`, `eq` depuis `drizzle-orm`/`@/db/schema`/`@/db/client`) -- exception de lecture documentée, même esprit que la lecture déjà faite ici de `process.env['ANTHROPIC_API_KEY']` (une préoccupation d'infrastructure/assemblage, pas une logique métier `skills/`). Signature de `sendToAgent` inchangée.
- `.env.local.example` -- retirer le bloc `DEMO_MODE`.
- `components/DemoModeToggle.tsx` (nouveau, client component) -- bouton dans le top bar, à côté de `ProjectSelector` (même fichier `app/page.tsx`, même `<header className="top-bar">`). Affiche l'état courant (`active: boolean` en prop, lu server-side dans `app/page.tsx` via `getDemoModeActive`), au clic appelle `setDemoModeActive(!active)` puis `router.refresh()` -- même motif `useTransition`/erreur inline que `ProjectSelector.tsx`.
- `app/layout.tsx` -- devient un Server Component asynchrone, lit `getDemoModeActive()` une fois, applique une classe conditionnelle (ex. `demo-mode-active`) sur `<body>` pour la bordure de couleur (CSS dans `app/globals.css`, nouveau token de couleur distinct de `--color-ai-accent` pour ne pas se confondre avec le tinting IA existant), et rend un bandeau plein-largeur ("Mode démo actif") au-dessus de `{children}` quand actif.
- `app/page.tsx` -- ajoute `getDemoModeActive()` au `Promise.all` existant, passe le résultat à `DemoModeToggle` dans le top bar.

## Tasks & Acceptance

**Execution :**
- [x] `db/schema.ts` -- colonne `demoModeActive`, migration
- [x] `actions/demo.ts` -- `getDemoModeActive`/`setDemoModeActive`
- [x] `skills/demoScript.ts` -- retrait de `isDemoModeActive()`
- [x] `skills/buildRequest.ts` -- lecture directe `db` au lieu de `process.env.DEMO_MODE`
- [x] `.env.local.example` -- retrait du bloc `DEMO_MODE`
- [x] `components/DemoModeToggle.tsx` -- bouton bascule
- [x] `app/layout.tsx` -- bandeau + classe de bordure conditionnelle
- [x] `app/page.tsx` -- lecture de l'état, câblage du bouton

**Acceptance Criteria :**
- Given le mode démo est inactif, when le consultant clique sur le bouton bascule, then `sendToAgent` (les 3 appelants) utilise le script canned dès le message suivant, sans variable d'environnement ni redémarrage du serveur.
- Given le mode démo est actif, when n'importe quelle page de l'app est affichée (`/` ou `/livrables/[id]`), then le bandeau et la bordure de couleur sont visibles.
- Given le mode démo est désactivé, when un message est envoyé sans vraie clé API, then le comportement réel (échec visible, `assistantFailed:true`) est inchangé.
- Given `DEMO_MODE` n'existe plus dans `.env.local.example`, when un développeur consulte ce fichier, then seul `ANTHROPIC_API_KEY` y figure.

## Implementation Notes

Implémenté conformément au Code Map. `db/schema.ts` : `appState.demoModeActive` (nullable, `NULL` = inactif, pas de backfill), migration générée via `npm run db:generate` (`db/migrations/20260925083331_milky_elektra`). `actions/demo.ts` : `getDemoModeActive`/`setDemoModeActive` ajoutées à côté de `resetAvantVenteWorkflow`, même upsert singleton que `actions/project.ts`'s `selectProject` (`onConflictDoUpdate` ne touche que `demoModeActive`, jamais `activeProjectId`, et réciproquement). `skills/demoScript.ts` : `isDemoModeActive()` retirée, le fichier reste pur/`db`-free. `skills/buildRequest.ts` : nouvelle fonction locale (non exportée) `isDemoModeActive()` qui lit `appState.demoModeActive` via `db`/`eq`/`APP_STATE_ID` -- même point d'appel dans `sendToAgent` (`if (await isDemoModeActive())`, tout en haut du corps, avant `new Anthropic()`), signature de `sendToAgent` inchangée. `.env.local.example` : bloc `DEMO_MODE` retiré, seul `ANTHROPIC_API_KEY` documenté. `components/DemoModeToggle.tsx` (nouveau, client) : même forme `useTransition`/erreur inline que `ProjectSelector.tsx`, appelle `setDemoModeActive(!active)` puis `router.refresh()`. `app/layout.tsx` : devenu un Server Component asynchrone, lit `getDemoModeActive()` une fois, applique `demo-mode-active` sur `<body>` et rend le bandeau ("Mode démo actif") au-dessus de `{children}` -- une lecture échouée dégrade silencieusement vers "inactif" (déjà logguée dans `getDemoModeActive`), jamais un crash du shell. `app/page.tsx` : `getDemoModeActive()` ajouté au `Promise.all` existant (lecture indépendante de celle de `layout.tsx`, pas de cache request-scope partagé dans ce projet), `DemoModeToggle` monté dans `<header className="top-bar">` à côté de `ProjectSelector`. `app/globals.css` : nouveaux tokens `--color-demo-accent`/`--color-demo-accent-foreground` (distincts de `--color-ai-accent`/`--color-accent`), `.button-toggle`/`.button-toggle-active`, `.demo-mode-banner`, `body.demo-mode-active` (bordure 4px), `gap` ajouté à `.top-bar` pour le second élément.

## Verification

**Commands :**
- `npx tsc --noEmit` -- propre.
- `npx next build --turbopack` -- propre (un premier essai a échoué avec `database is locked` : une course connue et déjà documentée dans `db/client.ts` entre les 6 workers de build appliquant la même migration fraîchement générée en parallèle sur `db/local.db` -- non liée à ce diff ; un second essai, la migration étant déjà marquée appliquée, a réussi sans erreur).

**Manual checks :**
- Script `tsx` jetable (sauvegarde/restauration de `db/local.db`), 12/12 assertions : état par défaut (`getDemoModeActive()` -> `false` sur une ligne `APP_STATE` existante avec la colonne à `NULL`) ; `setDemoModeActive(true)` puis relecture -> `true` ; `sendToAgent` avec `tool`/`executeTool` sur un message déclencheur -> réponse canned + `executeTool` réellement invoqué une fois ; même forme d'appel sur un message hors script -> repli générique, `executeTool` jamais invoqué ; forme `proposeStartingPoint` (marqueur d'étape "Références" dans `history[0]`) -> suggestion canned de cette étape précise, distincte du repli générique et de la réponse de retravail ; forme `reworkSuggestionContent` (`DEMO_REWORK_MARKER` dans `history[0]`) -> `DEMO_REWORK_REPLY`, jamais la suggestion d'étape générique ; `setDemoModeActive(false)` puis relecture -> `false` ; `sendToAgent` (mode inactif, aucune `ANTHROPIC_API_KEY` réelle en local) -> tente réellement le chemin `new Anthropic()`, échoue visiblement (`ok:false`, erreur "Could not resolve authentication method"), `executeTool` jamais invoqué -- confirme qu'une vraie panne de clé reste visible, jamais masquée par le mode démo. `db/local.db` restaurée à son état d'avant script (`demoModeActive: null`) après coup.
- Vérification visuelle dans le navigateur (Browser pane) : **non exécutée** -- cette implémentation tourne dans une session non interactive (agent en tâche de fond) où le démarrage d'un serveur de développement (`preview_start`) est bloqué faute d'un humain disponible pour l'approuver ("Dev servers can't be started from unattended sessions"). Le bouton bascule, le bandeau et la bordure n'ont donc été vérifiés que par lecture de code/CSS et par la vérification fonctionnelle ci-dessus (`sendToAgent`/`getDemoModeActive`/`setDemoModeActive`), jamais par un rendu réel dans un navigateur -- **à confirmer visuellement avant de considérer cette story prête pour revue finale.**

**Vérification indépendante par l'orchestrateur.** Diff relu intégralement, correspond au Code Map. Même limite constatée : `preview_start` également bloqué dans cette session ("Dev servers can't be started from unattended sessions") -- la vérification visuelle reste à faire côté utilisateur. Script `tsx` jetable indépendant (sauvegarde/restauration) : 9/9 assertions confirmant la bascule immédiate dans les deux sens sans redémarrage (`getDemoModeActive`/`setDemoModeActive`, `sendMessage`/`getStartingSuggestion` en mode actif, retour au chemin réel `assistantFailed:true` en mode inactif). `npx tsc --noEmit`/`npx next build --turbopack` propres.

## Review Triage Log

`bmad-review` (blind-hunter, edge-case-hunter, verification-gap) lancé sur le diff complet.

| # | Finding | Verdict | Route | Résolution |
|---|---|---|---|---|
| 1 | blind-hunter + edge-case-hunter (convergence) : le nouveau `isDemoModeActive()` local de `skills/buildRequest.ts` est appelé hors de tout `try/catch` dans `sendToAgent` -- une erreur DB transitoire y échapperait comme exception non gérée, contredisant le commentaire d'en-tête de la fonction qui promet `{ok:false,error}` dans tous les cas. | Medium (mitigé aujourd'hui par le `try/catch` propre de chacun des 3 appelants réels, mais un contrat rompu et fragile) | Patch | Corrigé : `isDemoModeActive()` a désormais son propre `try/catch`, dégrade vers `false` (chemin réel) sur échec, comme `getDemoModeActive`/`app/layout.tsx` ailleurs dans ce spec. |
| 2 | blind-hunter : la logique de lecture (`appState.demoModeActive ?? false`) existe en double -- `actions/demo.ts`'s `getDemoModeActive` (exportée) et une copie non exportée dans `skills/buildRequest.ts`. | Low | Reject | Déjà un choix délibéré et documenté du Code Map : éviter une dépendance à rebours `skills/` -> `actions/` (un fichier `'use server'`), même esprit que la lecture de `process.env['ANTHROPIC_API_KEY']` déjà isolée dans ce même fichier. |
| 3 | blind-hunter : le texte du bandeau dans l'Intent gelé ("MODE DÉMO") diverge du texte livré ("Mode démo actif"), sans renégociation enregistrée. | Low | Patch | Corrigé : texte exact de l'Intent gelé restauré. |
| 4 | blind-hunter : vérification visuelle jamais faite (session non interactive). | -- | -- | Déjà transparent dans la section Verification du tour 1 -- confirmé à nouveau par l'orchestrateur (même blocage `preview_start`), reste à faire côté utilisateur. |
| 5 | blind-hunter : la migration (`db/migrations/20260925083331_milky_elektra`) était absente du diff soumis à la revue (fichier non suivi, oubli d'un `git add -N`). | -- | -- | Process, pas un défaut de code -- fichier vérifié directement par l'orchestrateur, correct (`ALTER TABLE app_state ADD demo_mode_active integer;`, même motif que toutes les migrations précédentes de ce projet). |
| 6 | blind-hunter : `.demo-mode-toggle-error` n'a ni `max-width` ni retour à la ligne -- un message plus long déborderait du viewport. | Low | Patch | Corrigé : `max-width` bornée à l'écran, `word-wrap`, fond/ombre pour ne jamais se fondre dans le contenu dessous. |
| 7 | blind-hunter : le bouton bascule affiche l'état courant plutôt que l'action, seul indice visuel = couleur. | Low | Defer | Choix de design sans convention établie dans ce projet pour l'instant. Logué dans `deferred-work.md`. |
| 8 | blind-hunter : l'erreur de lecture de `getDemoModeActive` n'est jamais affichée à l'utilisateur (seule l'erreur d'écriture l'est). | -- | Reject | Comportement délibéré, cohérent avec toutes les autres lectures dégradées de ce projet (ex. `app/page.tsx`'s `steps`) -- ne jamais faire planter la coquille de l'app pour une lecture en arrière-plan. |
| 9 | edge-case-hunter (doublon) : même constat que #1. | Medium | Patch | Même résolution que #1. |
| 10 | edge-case-hunter : `app/layout.tsx` et `app/page.tsx` lisent chacun indépendamment `getDemoModeActive()` -- pourraient en théorie désaccorder au sein d'un même rendu. | Low | Defer | Course extrêmement étroite, non atteignable en pratique dans cette appli mono-processus/mono-utilisateur sur SQLite local. Logué dans `deferred-work.md`. |
| 11 | verification-gap : `app/livrables/[id]/page.tsx` n'a pas `force-dynamic` -- son propre commentaire affirmait à tort que le segment dynamique `[id]` suffisait à éviter le Full Route Cache de Next. Vérifié faux par lecture directe de la documentation Next fournie (`node_modules/next/dist/docs`) : `params` n'est pas une "Request-time API", et `router.refresh()` "does not invalidate the server-side cache". En production (`next build`/`next start`, jamais visible en `next dev`), le bandeau/la bordure du mode démo pourraient rester figés sur cette page après un changement d'état ailleurs. | **High** (exigence explicite des Boundaries de ce spec : "visibles sur toutes les pages") | **Patch** | Corrigé : `export const dynamic = 'force-dynamic'` ajouté, commentaire existant (faux) corrigé. Implication plus large (les mêmes conditions affectaient potentiellement déjà les données du livrable/des suggestions après un `router.refresh()`, indépendamment du mode démo) loguée séparément dans `deferred-work.md` -- hors périmètre de ce spec au-delà du correctif nécessaire ici. |
