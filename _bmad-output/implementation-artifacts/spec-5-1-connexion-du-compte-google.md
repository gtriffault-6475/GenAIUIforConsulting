---
title: "Story 5.1 : Connexion du compte Google"
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a211b85910fe50010af6a5c461a5f6e6e640f936'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md', '{project-root}/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** l'Epic 5 branche le vrai Google Drive, mais l'app n'a aucun moyen de se connecter à un compte Google ni de savoir dans quel mode drive elle se trouve. Toutes les autres stories de l'epic en dépendent.

**Approche :** connexion OAuth "authorization code" côté serveur (AD-12) via deux route handlers `app/api/google/oauth/start` et `.../callback` et `google-auth-library` 11.x ; refresh token stocké dans une nouvelle table singleton `GOOGLE_CONNECTION` ; état de connexion et déconnexion dans la barre du haut ; une fonction unique `resolveDriveMode` dans `actions/` (ordre `demo` > `unconfigured` > `disconnected` > `connected`, AD-1) passée à une fabrique `createDriveProvider(mode)` dans `integrations/index.ts`, qui remplace la constante `driveProvider`.

**Décisions (Checkpoint 1) :** (1) entre 5.1 et 5.2, les panneaux Contexte et Livrables restent inchangés dans tous les modes : la fabrique renvoie encore l'adaptateur simulé quel que soit le mode, la Story 5.2 changera ce câblage ; 5.1 ne change visiblement que la barre du haut. (2) Hors démo et `unconfigured`, la barre du haut montre "Connecter Google Drive" désactivé, avec l'information "Google Drive n'est pas configuré pour cette installation." (accessible au clavier et aux lecteurs d'écran, pas seulement au survol).

## Boundaries & Constraints

**Always :** scopes `https://www.googleapis.com/auth/drive`, `openid`, `email` ; `access_type=offline` + `prompt=consent` pour obtenir un refresh token. `state` aléatoire en cookie httpOnly (`SameSite=Lax`, ~10 min), vérifié au callback. Le callback n'écrit que via `actions/google-connection.ts` (seule exception AD-2) ; le refresh token n'est jamais renvoyé au navigateur ni loggé. `unconfigured` = au moins une des variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` absente. Déconnexion : révocation du jeton chez Google en best effort (un échec est loggé, la ligne locale est supprimée quand même). Migration Drizzle générée (`npm run db:generate`), appliquée par `db/client.ts`. `.env.local.example` et README documentent les 3 variables et le redirect URI `http://localhost:3000/api/google/oauth/callback`. Erreurs : `ActionResult` + message français, détail brut loggé côté serveur seulement.

**Never :** pas d'adaptateur Google ni de lecture du Drive (Story 5.2). Pas de changement du mode démo ni des panneaux Contexte/Livrables (Décision 1). `skills/buildRequest.ts` non touché (sa migration est à la Story 5.2). Aucun appel Google quand le mode démo est actif.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion | hors démo, configuré, aucun compte, clic "Connecter Google Drive" | consentement Google ; retour sur `/` ; barre du haut = adresse du compte | N/A |
| Persistance | compte connecté, redémarrage du serveur | barre du haut affiche toujours l'adresse | N/A |
| Déconnexion | menu du compte → "Se déconnecter" | ligne supprimée, révocation tentée ; bouton "Connecter Google Drive" revient | révocation échouée → loggée, déconnexion locale quand même |
| State invalide | callback avec `state` absent/différent du cookie | aucune écriture ; retour sur `/` | message court "La connexion à Google a échoué. Réessayez." |
| Consentement refusé | callback avec `error=access_denied` | aucune écriture ; retour sur `/` | même message |
| Pas de refresh token | échange réussi sans `refresh_token` | aucune écriture | même message, cause loggée |
| Non configuré | hors démo, une variable Google absente | bouton désactivé + information "Google Drive n'est pas configuré pour cette installation." ; route `start` redirige vers `/` sans appeler Google | N/A |
| Mode démo | démo actif | aucun bouton ni mention de Google ; routes OAuth redirigent vers `/` sans appeler Google | N/A |
| Mode | combinaisons démo / variables / ligne | `resolveDriveMode` renvoie le premier cas vrai dans l'ordre `demo` > `unconfigured` > `disconnected` > `connected` | lecture DB en échec → `disconnected`, loggé |

</frozen-after-approval>

## Code Map

- `app/page.tsx:185-188` -- `<header className="top-bar">` avec `ProjectSelector` et `DemoModeToggle` ; ajouter le composant de connexion Google ; `getDemoModeActive()` déjà lu ligne ~120.
- `integrations/index.ts` -- exporte aujourd'hui des constantes ; `driveProvider` devient `createDriveProvider(mode)` ; `projectProvider`/`mattermostProvider` inchangés.
- `actions/document.ts:8,60` -- seul consommateur de `driveProvider.listDocuments` ; passe par `resolveDriveMode` + fabrique, comportement inchangé.
- `actions/demo.ts` -- `getDemoModeActive()` à réutiliser dans `resolveDriveMode`.
- `db/schema.ts:49` -- `appState` (modèle de table singleton à imiter pour `GOOGLE_CONNECTION`).
- `db/client.ts` -- applique les migrations de `db/migrations/*/migration.sql` au démarrage.
- `components/ProjectSelector.tsx`, `components/OverlayProvider.tsx` -- modèle de menu déroulant de la barre du haut (AD-8).
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` -- conventions des route handlers de Next 16 (lire avant d'écrire, AGENTS.md).

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- ajouter `google-auth-library` 11.1.0 (version exacte).
- [x] `db/schema.ts` + migration générée -- table `google_connection` (`id` singleton, `refreshToken`, `accountEmail`, `connectedAt`).
- [x] `actions/google-connection.ts` -- `getGoogleAccount()` (email seul, jamais le jeton), `saveGoogleConnection(...)`, `disconnectGoogle()`.
- [x] `actions/drive-mode.ts` -- `resolveDriveMode()` ; `integrations/index.ts` -- `createDriveProvider(mode)` ; `actions/document.ts` -- utilise les deux.
- [x] `app/api/google/oauth/start/route.ts`, `app/api/google/oauth/callback/route.ts` -- flux OAuth.
- [x] `components/GoogleConnection.tsx` + `app/page.tsx` + `app/globals.css` -- barre du haut (bouton neutre, menu compte via `OverlayProvider`).
- [x] `.env.local.example`, `README.md` -- variables et mise en place Google Cloud.

**Acceptance Criteria:**
- Given le parcours de connexion complet, then le refresh token n'apparaît dans aucune réponse HTTP, aucun prop de composant client, aucun log.
- Given une autre surface flottante ouverte, when on ouvre le menu du compte, then la précédente se ferme (AD-8).

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur
- `npx next build --turbopack` -- expected: build OK

**Manual checks (if no CLI):**
- Sans projet Google Cloud disponible : `resolveDriveMode` et les refus des routes (démo, `unconfigured`, `state` invalide) se vérifient sans Google ; le parcours de consentement réel attend les identifiants du porteur de projet.

## Implementation Notes

Implémenté par sous-agent. `google-auth-library` 11.1.0 ; table `google_connection` (migration `20261002102608_foamy_silverclaw`) ; `integrations/google/oauth.ts` (URL d'autorisation, échange du code, email lu dans l'ID token vérifié, révocation par POST avec le jeton dans le corps — `revokeToken` de la bibliothèque met le jeton dans l'URL) ; `integrations/index.ts` expose `createDriveProvider(mode)` (adaptateur simulé dans tous les modes, Décision 1) et `googleOAuth` ; `actions/drive-mode.ts`, `actions/google-connection.ts` ; routes `start`/`callback` + `state-cookie.ts` (cookie httpOnly limité à `/api/google/oauth`, comparaison en temps constant) ; `components/GoogleConnection.tsx` (bouton `aria-disabled` + phrase visible liée par `aria-describedby` quand non configuré ; menu compte via `OverlayProvider`) ; `.env.local.example`, README.

Vérifié (sous-agent, `next start -p 3100`) : tsc et build OK ; démo → routes redirigent sans Google et aucune mention de Google ; non configuré → bouton désactivé + phrase ; configuré avec de fausses valeurs → redirection vers `accounts.google.com` avec les bons paramètres et le cookie ; callback `state` faux/absent ou `access_denied` → échec sans écriture ; ligne factice → email affiché, aucun jeton dans le HTML ; menu compte ferme le sélecteur de projet (AD-8) ; déconnexion → ligne supprimée malgré le refus de révocation de Google. Non vérifié : le vrai consentement Google (pas de projet Google Cloud), le repli `disconnected` sur lecture DB en échec. La base locale partagée a reçu la migration ; mode démo remis à 1, table vide (vérifié par l'orchestrateur).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence / resolution |
|---|---|---|---|---|---|
| 1 | blind-hunter, edge-case, verification-gap | `saveGoogleConnection`, exporté d'un module `'use server'`, est une Server Action publique : n'importe quel client peut enregistrer un refresh token arbitraire sans passer par le `state`. | medium | patch | Vérifié (et doc Next 16 `data-security.md` : une Server Action est joignable par POST direct). Remplacé par `completeGoogleConnection(code)` + `beginGoogleConnection(state)` ; l'upsert n'est plus exporté ; les routes n'importent plus que `actions/`. |
| 2 | blind-hunter, edge-case | Flag démo illisible → `disconnected` → les routes OAuth appellent quand même Google. | medium | patch | Vérifié (les routes ne refusaient que `demo`/`unconfigured`). Les actions de connexion refusent sauf démo lisible et inactif + configuré ; la matrice "lecture en échec → `disconnected`" est conservée. |
| 3 | blind-hunter, edge-case | Ouvrir l'app sur `127.0.0.1` ou un autre port pose le cookie `state` sur un autre hôte que le redirect URI fixe → échec silencieux. | low | patch | Vérifié ; redirection vers l'origine du redirect URI + mention dans le README. |
| 4 | blind-hunter | Refresh token (scope `drive`) stocké en clair dans `db/local.db`, non signalé. | low | patch | Stockage décidé par AD-12 ; ajout d'une phrase d'avertissement au README. |
| 5 | blind-hunter | Le paramètre `error` du callback est loggé tel quel (injection de log). | low | patch | Vérifié ; loggé seulement s'il correspond à `^[a-z_]{1,64}$`. |
| 6 | blind-hunter, edge-case | Reconnexion ou échec d'enregistrement après échange : l'ancien jeton / le nouveau jeton n'est pas révoqué chez Google. | low | reject | Cas rares (reconnexion, échec SQLite) ; la correction ajoute une lecture et une révocation de plus. |
| 7 | blind-hunter | Un jeton révoqué côté Google laisse l'app "connectée". | — | false | Traité par la Story 5.2 : `token_revoked` → suppression de `GOOGLE_CONNECTION` (AD-1) ; aucun appel Drive en 5.1. |
| 8 | blind-hunter | Pas de contrôle `email_verified` ni du domaine `hd`. | low | reject | Le client OAuth "Interne" restreint déjà aux comptes de l'organisation (AD-12). |
| 9 | blind-hunter, edge-case | Deux connexions lancées en parallèle : la seconde écrase le cookie `state`, la première échoue. | low | reject | Comportement accepté ; message d'échec générique, il suffit de recommencer. |
| 10 | blind-hunter | Lectures dupliquées du flag démo et de la connexion dans `app/page.tsx` (incohérence possible mode/email). | low | reject | Le composant gère déjà l'incohérence (`!accountEmail`) ; optimisation sans défaut observé. |
| 11 | edge-case | `getToken`/`verifyIdToken` sans délai d'expiration. | low | reject | Blocage rare côté Google ; ajouter un délai change la configuration du client pour un cas non observé. |
| 12 | edge-case, blind-hunter | Message d'échec persistant en mode non connecté ; `replaceState` perd d'autres paramètres ; menu compte hors écran sur petit écran ; focus après déconnexion. | low | reject | Négligeables (page sans autres paramètres, desktop ≥1280px, gestion du focus identique aux autres flux `router.refresh()` de l'app). |
| 13 | edge-case | `disconnectGoogle` en mode `unconfigured` tente une révocation chez Google. | low | reject | Cas où les variables ont été retirées après connexion ; la révocation n'utilise pas le secret client et reste best effort. |
| 14 | verification-gap (x4), blind-hunter | Aucun test automatisé : priorité des modes et repli, upsert de reconnexion, branches d'échec de l'échange, contrôle du `state`. | medium | defer | Pas de lanceur de tests dans le dépôt (déjà différé) ; vérifications manuelles à rejouer listées dans `deferred-work.md`. |

Après correctifs de revue : `tsc` et build OK (sous-agent, puis orchestrateur). Vérifié par l'orchestrateur sur le serveur de dev en mode démo : `/api/google/oauth/start` et `/callback` → 307 vers `/` sans appel Google (le callback efface le cookie `state`), page sans aucune mention de Google. Vérifié par le sous-agent : origine différente → redirection vers `http://localhost:3000/api/google/oauth/start` sans cookie ; `error` non conforme loggé `<invalid>`. `actions/google-connection.ts` n'exporte plus aucune action acceptant un jeton brut ; les routes n'importent plus `@/integrations`.
