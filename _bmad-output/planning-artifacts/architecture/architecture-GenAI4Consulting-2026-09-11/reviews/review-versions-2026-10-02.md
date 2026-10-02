# Revue — Versions et réalité technique (mise à jour Google Drive du 2026-10-02)

**Cible :** `ARCHITECTURE-SPINE.md` (updated 2026-10-02), en particulier AD-1, AD-9, AD-12, AD-13 et la table Stack.
**Méthode :** `npm view` sur le registre (2026-10-02), lecture de `package.json` / `node_modules`, documentation officielle Google (developers.google.com, support.google.com/cloud) consultée ce jour. Rien n'est affirmé de mémoire ; ce qui n'a pas pu être confirmé est signalé comme tel.

---

## Verdict

**Globalement vérifié, avec un défaut de conception réel à corriger avant la story d'enregistrement.** Les trois paquets Google ajoutés existent, sont aux versions annoncées et cohérents entre eux ; les capacités Slides citées existent. Mais la doc officielle du `revisionId` Slides contient une restriction que la spine ignore (validité garantie 24 h seulement), ce qui fragilise le mécanisme central d'AD-13 tel qu'il est écrit. Deux autres points d'API (export des Sheets, création dans un dossier) ne sont pas faux dans la spine mais en masquent des contraintes que l'implémenteur découvrira sinon à la story 5.x.

| Gravité | Constat |
| --- | --- |
| **Élevée** | `revisionId` garanti valide 24 h seulement — `driveRevisionId` persisté indéfiniment (AD-13) |
| Moyenne | Export texte : Sheets ne supporte pas `text/plain` (CSV, première feuille seulement) ; plafond 10 Mo |
| Moyenne | Client OAuth « Interne » : exemption confirmée mais sous conditions (projet GCP de l'organisation Workspace OCTO, approbation admin possible) |
| Faible | `createPresentation` : l'API Slides ne sait pas créer dans un dossier — passer par Drive |
| Faible | Drizzle « current » ambigu : le projet tourne sur `1.0.0-rc.4` (pré-release), la `latest` stable `0.45.3` n'a pas de driver `node-sqlite` |
| Info | Dossiers sur un Drive partagé, `deleteText` sur zone vide, changelog google-auth-library 11 — non confirmés |

---

## 1. Paquets Google ajoutés le 2026-10-02 — CONFIRMÉS

| Spine | Registre npm (2026-10-02) | Installé ? |
| --- | --- | --- |
| `@googleapis/drive` 26.x | `26.0.1` (modifié 2026-09-24), `engines.node >=22.0.0`, dépend de `googleapis-common ^9.0.0` | Non (pas encore dans `package.json`) |
| `@googleapis/slides` 10.x | `10.0.1` (2026-09-24), `engines.node >=22.0.0`, `googleapis-common ^9.0.0` | Non |
| `google-auth-library` 11.x | `11.1.0` (2026-09-16), `engines.node >=22` ; 11.0.0 publié le 2026-07-30 | Non |

- **Cohérence transitive vérifiée :** `googleapis-common@9.1.0` dépend de `google-auth-library ^11.0.0` → épingler `google-auth-library` 11.x en direct ne crée pas de double installation ni de conflit de types `OAuth2Client`. Bon choix.
- Node 24 (local : `v24.21.0`) satisfait `>=22`.
- Le choix d'écarter `googleapis` (méta-paquet, `182.0.0`) est confirmé par le memlog (taille) et reste valable.
- **Non confirmé :** les notes de rupture de `google-auth-library` 11.0.0. Le `CHANGELOG.md` du dépôt GitHub `google-auth-library-nodejs` s'arrête à 10.5.0 et le tarball 11.1.0 n'en contient pas (le paquet a probablement migré vers un monorepo). Conséquence : les exemples de code OAuth issus de tutoriels (v9/v10) peuvent ne plus compiler. À vérifier contre les types installés à la story 5.1, pas contre la mémoire du modèle.

## 2. Google Slides API (AD-9, AD-13)

### 2.1 `objectId` des formes dans un groupe — CONFIRMÉ
Référence `presentations.pages` : `PageElement` porte un `objectId` ; un `Group` est un `PageElement` dont `children` est une collection de `PageElement` (« minimum size of a group is 2 »). Chaque zone de texte d'un groupe a donc son propre `objectId`, ce qui fonde AD-9. Les groupes peuvent être imbriqués : le parcours à l'import doit être récursif (détail d'implémentation, pas d'erreur de spine). Les notes du présentateur sont dans un `notesPage` séparé, ce qui rend la règle « notes ignorées » naturelle.

### 2.2 `revisionId` — EXISTE, MAIS RESTRICTION IGNORÉE PAR LA SPINE (élevée)
La ressource `Presentation` expose `revisionId` (output only, visible aux éditeurs). La doc officielle précise :
- « only guaranteed to be valid for 24 hours after it has been returned and cannot be shared across users » ;
- chaîne opaque, non séquentielle ;
- un identifiant différent n'implique pas forcément une modification du contenu (changement de format interne possible).

AD-13 stocke `LIVRABLE.driveRevisionId` à l'import et l'envoie comme `requiredRevisionId` à l'enregistrement, sans borne de temps. Un consultant qui importe un lundi, accepte des suggestions et enregistre le mercredi peut se voir refuser l'enregistrement (400) **sans qu'aucune modification n'ait eu lieu dans Slides**, ou — puisque la garantie est levée — dans un comportement non spécifié. Le message FR-30 (« le fichier a été modifié dans Drive… réimportez ») serait alors faux, et réimporter fait perdre les acceptations non enregistrées (FR-29).

Ce que la spine doit décider (au choix, à trancher par l'architecte) :
- traiter le 400 comme « référence expirée ou fichier modifié » et le dire tel quel ; et/ou
- relire la présentation juste avant l'enregistrement : si le texte des zones lues est identique au texte de référence stocké à l'import, rafraîchir `driveRevisionId` puis écrire ; sinon refuser (contrôle de concurrence fondé sur le contenu, `requiredRevisionId` ne servant plus qu'à fermer la fenêtre relire→écrire) ;
- dans tous les cas, documenter la limite 24 h dans AD-13.

Le mémo « (400 si mismatch, vérifié doc) » du memlog est exact mais incomplet : la vérification a porté sur `writeControl`, pas sur la sémantique de `revisionId`.

### 2.3 `presentations.batchUpdate` + `writeControl.requiredRevisionId` — CONFIRMÉ
Doc `presentations/batchUpdate` : si `requiredRevisionId` ne correspond plus à la révision courante, la requête échoue en **400** et rien n'est appliqué (batch atomique). La réponse renvoie `writeControl.requiredRevisionId` = révision *après* application → la règle « après succès, le nouveau `revisionId` devient `driveRevisionId` » est réalisable directement depuis la réponse, sans relecture. (Sous réserve du point 2.2.)

### 2.4 `deleteText` / `insertText` — CONFIRMÉS, une réserve
- `DeleteTextRequest { objectId, cellLocation?, textRange }` avec `textRange.type = ALL` ; `InsertTextRequest { objectId, cellLocation?, insertionIndex, text }`. Aucune restriction documentée pour une forme située dans un groupe : la cible est l'`objectId` de la forme elle-même.
- Le guide « Editing and styling text » décrit exactement le motif `deleteText` puis `insertText` à l'index 0 pour remplacer un texte, et précise qu'un saut de ligne final implicite ne peut pas être supprimé.
- **Non confirmé :** le comportement de `deleteText` (type `ALL`) sur une zone **vide**. Des erreurs « object has no text » sont rapportées par des utilisateurs sans que la doc officielle le documente. Recommandation d'implémentation : ne pas émettre `deleteText` si le texte lu à l'import est vide.
- FR-30 a déjà intégré la conséquence « mise en forme simplifiée » : un `insertText` hérite du style au point d'insertion, les styles par segment sont perdus. Cohérent.

### 2.5 `createPresentation` dans le dossier du projet (faible)
Doc Slides « Create and manage presentations » : *pas d'option pour créer une présentation directement dans un dossier Drive via l'API Slides*. Il faut soit `files.create` (Drive) avec `mimeType = application/vnd.google-apps.presentation` et `parents = [dossier projet]`, soit créer puis déplacer avec `files.update`. La spine n'affirme rien de faux (le port s'appelle `createPresentation(projectName, …)`), mais la Stack dit « Google Drive + Slides API » : l'implémenteur doit savoir que la création passe par Drive puis `batchUpdate` Slides pour le contenu. Une ligne dans AD-13 ou une note de story suffit.

## 3. Drive API — export texte (AD-1 `exportText`, FR-27) — PARTIELLEMENT CONFIRMÉ (moyenne)

Doc « Export MIME types for Google Workspace documents » :
- Google Docs → `text/plain` ✔ (aussi `text/markdown`)
- Google Slides → `text/plain` ✔
- Google Sheets → **pas de `text/plain`**. `text/csv` (et TSV) exporte **la première feuille seulement**.

Doc `files.export` : **contenu exporté limité à 10 Mo**.

Conséquences non écrites dans la spine : `exportText(fileId)` doit choisir le type MIME selon le type de fichier (CSV pour Sheets) ; un classeur multi-feuilles n'envoie à l'agent que sa première feuille, en silence, ce qui contredit l'esprit de FR-27 (« contenu exporté en texte ») ; un export > 10 Mo échoue. Soit accepter et documenter la limite « première feuille » (et l'afficher dans le panneau, comme la troncature d'AD-11), soit lire les Sheets via l'API Sheets (nouvelle dépendance, nouveau scope déjà couvert par `drive`). À trancher avant la story 5.2.

## 4. Scope OAuth `https://www.googleapis.com/auth/drive` et client « Interne » (AD-12) — CONFIRMÉ SOUS CONDITIONS (moyenne)

- Doc Drive « Choose Google Drive API scopes » : `auth/drive` est **restreint** ; hors exception, il exige la vérification d'app *restricted scope* et, si les données sont stockées/transmises par un serveur, une évaluation de sécurité. Google recommande `drive.file` (non sensible). L'argument du memlog pour écarter `drive.file` (impossible de retrouver un dossier par son nom et de lister des fichiers non ouverts par l'app, FR-26/27) est correct.
- Aide Google Cloud « Exceptions to verification requirements » : une app **à usage interne** est exemptée (pas d'écran « app non vérifiée », pas de plafond de 100 utilisateurs) **si** : utilisée uniquement par les membres de l'organisation **Google Workspace / Cloud Identity**, projet GCP **détenu par cette organisation**, écran de consentement configuré « Interne » ; l'app « peut nécessiter l'approbation d'un administrateur de l'organisation ».

L'affirmation de la spine est donc juste mais conditionnelle, et ces conditions ne sont écrites nulle part :
1. Le client OAuth doit être créé dans un projet GCP rattaché à l'organisation Workspace OCTO. Un projet créé depuis un compte personnel (ex. `@gmail.com`) ne peut pas avoir le type « Interne » ; il serait « Externe » en mode test (utilisateurs de test listés, refresh tokens expirant après 7 jours — politique Google connue, non revérifiée dans cette revue) — incompatible avec « La connexion survit au redémarrage » (FR-25) sur la durée.
2. Les testeurs et le dossier racine doivent être dans le même domaine Workspace.
3. Un administrateur Workspace OCTO peut bloquer l'accès des apps aux scopes restreints (contrôles d'accès aux API) : l'approbation admin est une dépendance externe à lever avant la story 5.1.

Recommandation : ajouter ces trois préconditions à AD-12 (ou en Deferred/risque), pas comme simple « Interne ».

## 5. Lignes Stack préexistantes vs `package.json`

| Spine | Installé (`package.json`) | Registre `latest` (2026-10-02) | Verdict |
| --- | --- | --- | --- |
| Next.js 16.x | `16.3.5` | `16.3.8` | OK |
| React 19.x | `19.2.8` | `19.3.0` | OK (patch/minor en retard, sans incidence) |
| TypeScript 5.7.x (pas TS 7) | `5.7.3` | `7.0.2` ; dernière 5.x = `5.9.3` | OK et justifié. Note : 5.8/5.9 existent ; la contrainte réelle est « pas 7 », « 5.7.x » est plus strict que nécessaire. |
| Drizzle ORM + `node:sqlite` — « current » | `drizzle-orm` / `drizzle-kit` `1.0.0-rc.4` | `latest` = `0.45.3` ; tag `rc` = `1.0.0-rc.4` | **Ambigu (faible).** Le tarball `0.45.3` ne contient aucun driver `node-sqlite` ; le projet dépend donc d'une **pré-release** 1.0 (rc.4, 2026-06-27). « current » laisserait un `npm i drizzle-orm@latest` installer 0.45.3 et casser `db/client.ts`. Écrire « 1.0.0-rc.x (seule ligne avec driver `node-sqlite`) ». |
| @anthropic-ai/sdk 0.124.x+ | `0.126.0` | `0.131.0` | OK (le plancher est respecté) |
| Node.js 24 LTS | `engines >=24`, local `v24.21.0` | — | OK. Node 24 est en LTS active ; Node 26 deviendra LTS fin octobre 2026, sans effet ici. |
| @googleapis/drive 26.x, slides 10.x, google-auth-library 11.x | absents | voir §1 | OK (à installer en story 5.1) |

## 6. Risques non confirmés à garder en vue

- **Drive partagé :** si le dossier racine OCTO est dans un Drive partagé, `files.list` exige `supportsAllDrives=true` et `includeItemsFromAllDrives=true` (et `files.create`/`update` `supportsAllDrives`) ; la doc Slides le signale aussi pour la création. La spine ne dit pas où vit `GOOGLE_DRIVE_ROOT_FOLDER_ID`. À vérifier avec le vrai dossier avant la story 5.2.
- **Unicité de dossier par nom (FR-26) :** recherche via `files.list` avec `q = name = '…' and '<racine>' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false` — faisable avec le scope `drive` ; échappement des apostrophes dans le nom nécessaire. Non testé.
- **Quotas :** non vérifiés (Slides/Drive par minute et par utilisateur) — sans enjeu pour un poste unique.

---

## Sources consultées

- npm registry (`npm view`, 2026-10-02) : `@googleapis/drive`, `@googleapis/slides`, `google-auth-library`, `googleapis`, `googleapis-common`, `@anthropic-ai/sdk`, `next`, `react`, `typescript`, `drizzle-orm`, `drizzle-kit` ; tarball `drizzle-orm@0.45.3`.
- https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations (revisionId)
- https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate (writeControl)
- https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages (PageElement, Group)
- https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request (DeleteText/InsertText)
- https://developers.google.com/workspace/slides/api/guides/styling (remplacement de texte)
- https://developers.google.com/workspace/slides/api/guides/presentations (création dans un dossier)
- https://developers.google.com/workspace/drive/api/guides/ref-export-formats
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export (10 Mo)
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth (scope restreint)
- https://support.google.com/cloud/answer/13464323 (exception usage interne)
