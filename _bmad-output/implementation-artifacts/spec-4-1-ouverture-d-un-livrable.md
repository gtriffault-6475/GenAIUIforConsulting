---
title: "Story 4.1 : Ouverture d'un livrable"
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1c674d9d359cd73e1b8039c849fa63972ec9b0f3'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md', '{project-root}/CONVENTIONS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** `LivrablesPanel` (Story 2.6) rend délibérément ses cartes non cliquables — "le clic-vers l'Éditeur assisté est le sujet de la Story 4.1" — donc aucun livrable n'est consultable aujourd'hui (FR-19).

**Approche :** Introduire la première route de l'app (`app/livrables/[id]/page.tsx`), une nouvelle Server Action `getLivrable(id)` qui lit une ligne `LIVRABLE` et parse son `content` JSON, et rendre chaque carte de `LivrablesPanel` comme un `<Link>` vers cette route. La vue affiche le titre, le contenu (blocs en lecture seule) et un fil d'Ariane vers `/`. Aucune suggestion, aucune édition : cette story construit uniquement le point d'entrée que les Stories 4.2-4.5 peupleront.

## Boundaries & Constraints

**Always :** `getLivrable` retourne `ActionResult<LivrableDetail | null>` — `null` signifie "id introuvable", distinct d'un échec de lecture (`{ok:false}`), même convention que `getActiveConversation`/`getActiveProject` pour ne jamais confondre les deux. Le lookup se fait par id seul, sans filtrer par projet actif : ce round est mono-projet-actif (`APP_STATE` singleton) et l'id est un UUID opaque non devinable — inutile d'ajouter un filtre que rien dans l'epic-4-context n'exige ("Ouvrir l'Éditeur assisté ne fait qu'un `SELECT`"). Chaque bloc de `content.blocks` est rendu dans l'ordre du tableau, avec `block.id` comme clé React (jamais le texte) — ce même `id` sera la cible des ancrages de suggestions dès la Story 4.2, donc jamais régénéré ici. Le fil d'Ariane reste visible même si le livrable est introuvable, pour toujours pouvoir revenir à l'espace de travail.

**Never :** ne rien construire de la Story 4.2 (génération de suggestions, appel agent) ni 4.3 (panneau de suggestions, Accepter/Rejeter/Retravailler) ni 4.4 (champ de révision globale) — cette story n'affiche que le contenu existant, jamais une suggestion. Pas de `<textarea>`/`contentEditable` sur le contenu : lecture seule, aucune mutation de `LIVRABLE.content` dans cette story. Ne pas utiliser `notFound()`/`error.tsx` de Next.js pour l'id introuvable — rester cohérent avec la convention `ActionResult` déjà en place partout ailleurs dans l'app (message inline, jamais une frontière d'erreur du framework).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Livrable existant | `id` valide dans `LIVRABLE` | Titre + blocs de contenu affichés, fil d'Ariane présent | N/A |
| Id inexistant (URL directe invalide) | `id` sans ligne correspondante | Message "livrable introuvable" affiché, fil d'Ariane toujours présent | Pas d'exception, pas de page 404 Next |
| Échec de lecture DB | `getLivrable` retourne `{ok:false}` | Message d'erreur générique affiché, fil d'Ariane toujours présent | Distinct du cas "introuvable" |
| Clic sur une carte du panneau Livrables | Livrable existant dans la liste | Navigation vers `/livrables/[id]` | N/A |

</frozen-after-approval>

## Code Map

- `actions/livrable.ts` -- ajoute `type LivrableDetail = { id: string; title: string; blocks: { id: string; text: string }[] }` et `getLivrable(id): Promise<ActionResult<LivrableDetail | null>>` -- lit la ligne, `JSON.parse(row.content)`, retourne `{ok:true, data:null}` si aucune ligne.
- `app/livrables/[id]/page.tsx` (nouveau) -- Server Component, `params: Promise<{id:string}>` (cette version de Next résout `params` en Promise -- voir `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`), appelle `getLivrable`, rend le fil d'Ariane (`<Link href="/">`), le titre (`text-heading`) et les blocs (`text-body`).
- `components/LivrablesPanel.tsx` -- remplace le `<li>` non-interactif par un `<Link href={\`/livrables/${item.id}\`}>` enveloppant le même contenu de carte (icône + titre), sans changer son style.
- `app/globals.css` -- ajoute `.breadcrumb-link` (même traitement visuel que `.external-link` -- couleur accent, pas de soulignement par défaut, souligné au survol/focus) pour le lien de retour ; réutilise `.top-bar` tel quel pour l'en-tête de la nouvelle route.

## Tasks & Acceptance

**Execution:**
- [x] `actions/livrable.ts` -- ajouter `getLivrable` -- FR-19
- [x] `app/livrables/[id]/page.tsx` -- créer la route Éditeur assisté -- FR-19
- [x] `components/LivrablesPanel.tsx` -- rendre les cartes cliquables -- FR-19, débloque le point noté dans son propre commentaire (Story 2.6)
- [x] `app/globals.css` -- ajouter `.breadcrumb-link` -- fil d'Ariane

**Acceptance Criteria:**
- Given un livrable existant, when je clique dessus dans le panneau Livrables, then je suis amené dans l'Éditeur assisté affichant son contenu
- Given cette vue, when je regarde en haut de l'écran, then un fil d'Ariane me permet de revenir à l'espace de travail
- Given un id de livrable qui n'existe pas (accès direct par URL), when la page se charge, then un message clair s'affiche au lieu d'un crash, et le fil d'Ariane reste utilisable

## Implementation Notes

Implémenté directement selon le Code Map, sans subagent dédié. `actions/livrable.ts` ajoute `LivrableDetail` (`{id, title, blocks}`) et `getLivrable(id)` : un `SELECT` par `id` seul (pas de filtre projet, per Boundaries), `JSON.parse(row.content)` pour extraire `blocks`, `{ok:true, data:null}` si aucune ligne, `{ok:false}` journalisé (`console.error`) sur toute exception -- même trois-branches que `getActiveConversation`/`getActiveProject`. `app/livrables/[id]/page.tsx` (nouveau) est un Server Component async, `params: Promise<{id:string}>` (confirmé contre `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`), qui `await`-e `params` puis appelle `getLivrable`. Le fil d'Ariane (`<Link href="/" className="breadcrumb-link">`) est rendu dans un `<header className="top-bar">` en dehors de tout branchement conditionnel, pour rester visible dans les trois états (contenu affiché / introuvable / échec de lecture). Le corps distingue explicitement `!result.ok` (message d'erreur générique, `result.error`) de `result.data === null` (message "Livrable introuvable.") -- jamais `notFound()`/`error.tsx` de Next. Le contenu existant est rendu dans une `.card` (`text-heading` pour le titre, un `<p className="text-body">` par bloc, keyed sur `block.id` -- jamais régénéré, jamais le texte comme clé) : aucun `<textarea>`/`contentEditable`, lecture seule stricte. `components/LivrablesPanel.tsx` : le `<li>` conserve sa sémantique de liste ; le `<Link href={\`/livrables/${item.id}\`}>` interne porte désormais les classes `card skill-card` (donc tout le layout icône+titre existant) plus un `style={{textDecoration:'none'}}` inline pour annuler le soulignement par défaut du navigateur (la couleur reste héritée via la règle globale `a { color: inherit }`) -- aucune nouvelle classe CSS introduite pour la carte elle-même, conformément au Code Map. `app/globals.css` ajoute `.breadcrumb-link`, calqué à l'identique sur `.external-link` (couleur `--color-accent`, pas de soulignement par défaut, souligné au survol/focus) -- une classe distincte plutôt qu'une réutilisation directe de `.external-link` puisque ce lien est une navigation interne et non externe, mais sans aucune différence de traitement visuel. `.top-bar` est réutilisé tel quel, sans modification.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Resolution |
|---|---|---|---|---|
| 1 | **Confirmed independently by both the adversarial and edge-case lenses.** `getLivrable` (`actions/livrable.ts`) does `JSON.parse(row.content) as {blocks:{id,text}[]}` — a type assertion, not a runtime check. `LIVRABLE.content` is a bare `text` column with no shape constraint (`db/schema.ts`). If a row's content parses as valid JSON but the wrong shape (e.g. `{}`), `content.blocks` becomes `undefined`, no exception fires inside `getLivrable`'s `try`, and `{ok:true, data:{...,blocks:undefined}}` is returned. The crash then happens one layer up, uncaught: `app/livrables/[id]/page.tsx`'s `result.data.blocks.map(...)` throws on `undefined`, hitting Next's raw framework error page — exactly the "exception non attrapée remontant à l'UI" the app-wide `ActionResult` convention and this story's own "no `error.tsx`" Never exist to prevent. Dormant today (the only writer, `seedFixturesIfEmpty`, always produces the correct shape — the verification-gap lens corrupted a row's `content` live and confirmed the *malformed-JSON* case is already caught correctly; this finding is specifically about JSON that parses but has the wrong shape), but Story 4.2 introduces a second writer (`propose_livrable_content`, LLM-driven) with no such guarantee. | Medium | Patch | Add a runtime shape check (`Array.isArray(content?.blocks)`) in `getLivrable` before returning success; treat a malformed shape the same as a read failure (`{ok:false}`) rather than trusting the assertion. |
| 2 | Edge-case lens: a livrable whose `content.blocks` is a valid-but-empty array (`[]`) renders the `.card` with only the title and zero paragraphs — no crash, but no "aucun contenu" message either, reading as a broken/empty box rather than an intentional state. Not reachable today (both fixtures always seed exactly one block) but will be once Story 4.2's agent-generated content lands. | Low | Patch | Add a short inline message (matching the "introuvable"/error message style) when `blocks.length === 0`, alongside finding #1's fix. |
| 3 | Edge-case lens investigated in depth whether viewing a *different* project's livrable via a direct/bookmarked URL (the lookup has no project filter, per this story's own Boundaries) could make the `/` breadcrumb land the consultant on the wrong project. | False | — | Traced precisely: `getLivrable` never touches `appState`/`project`, so viewing any livrable can never change `APP_STATE.activeProjectId`; the breadcrumb (`href="/"`) always re-reads whatever was *already* globally active. Additionally confirmed unreachable today regardless: no project-switching UI exists once a project is active (`ProjectSelector` only renders when none is active), so a user can never even see another project's livrable card to click. |
| 4 | Edge-case lens: if project-switching is ever built, a user landing on a foreign project's livrable via a stale link would see no on-page cue of which project it belongs to. | Low | No action | Explicitly out of this story's scope by its own Boundaries (no project filter, no project-context requirement) and contingent on a feature (project switching) that doesn't exist yet — nothing to fix against current, reachable behavior. |

## Verification

**Commands:**
- `npx tsc --noEmit` -- propre, aucune erreur de type
- `npx next build --turbopack` -- build propre (`○ /livrables/[id]` apparaît comme route dynamique `ƒ` dans la sortie)

**Manual checks -- effectués en direct dans le navigateur (`npm run dev`, serveur déjà lancé par l'utilisateur sur le port 3000) :**
- Projet `proj-acme-rfp` : clic sur la carte "Réponse à l'appel d'offres" dans le panneau Livrables -- navigation vers `/livrables/961115f0-4557-4551-b2d7-92063d9d998c`, titre et bloc de contenu fixture ("Contenu à venir.") affichés dans la carte, fil d'Ariane "← Espace de travail" visible en haut.
- Clic sur le fil d'Ariane depuis cette vue -- retour confirmé à `/` (espace de travail du même projet, stepper/panneaux intacts).
- Navigation directe vers `/livrables/id-inexistant` -- message "Livrable introuvable." affiché, fil d'Ariane toujours présent et cliquable, aucune page d'erreur Next, aucune exception dans les logs serveur.
- Console navigateur vérifiée après ces trois passages : aucune erreur liée à cette story. Un avertissement pré-existant "duplicate key" (`75aac29b-...`, un id de conversation) est présent mais documenté comme sans rapport dans `spec-3-3-suggestion-proactive-de-demarrage.md` (finding #4) -- confirmé de nouveau ici, absent de toute nouvelle source introduite par cette story.
- Non testé : le second projet seed (`proj-audit-mission`, livrable "Note de cadrage de mission") -- le code de lecture est identique quel que soit l'id (`getLivrable` ne filtre pas par projet), donc ce chemin n'a rien de spécifique à ce livrable, mais n'a pas été cliqué explicitement dans cette session.

**Correctifs de revue (findings #1 et #2) :** `getLivrable` valide désormais `Array.isArray(content?.blocks)` après le `JSON.parse` et retourne `{ok:false, error:'Impossible de récupérer ce livrable.'}` (journalisé via `console.error`) si la forme ne tient pas, au lieu de laisser passer un `blocks: undefined` comme un succès (finding #1). `app/livrables/[id]/page.tsx` affiche désormais un message inline ("Ce livrable ne contient aucun contenu pour le moment.", même style que "Livrable introuvable.") quand `blocks.length === 0`, plutôt qu'une carte avec le seul titre (finding #2). Revérifié : `tsc --noEmit` et `next build --turbopack` repassés propres. Vérification manuelle en direct : une ligne `LIVRABLE` temporaire avec `content = '{}'` renvoie bien "Impossible de récupérer ce livrable." (au lieu de crasher sur `.map` d'un `undefined`) ; une ligne temporaire avec `content = '{"blocks":[]}'` affiche bien le titre suivi du nouveau message vide. Les deux lignes de test ont été supprimées après vérification -- la base ne contient de nouveau que les deux livrables seed d'origine.

**Re-vérification indépendante de l'orchestrateur :** `npx tsc --noEmit` et `npx next build --turbopack` relancés séparément -- propres (`/livrables/[id]` confirmé `ƒ` dynamique). Lecture directe du code des deux correctifs (`actions/livrable.ts`, `app/livrables/[id]/page.tsx`) -- conforme aux findings du Review Triage Log.
