---
title: 'Story 1.5: Panneau Mattermost'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'be91344c2adaae05a27afc4714be19bbbe131a2f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-panneau-contexte.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Une fois un projet connecté, son canal Mattermost est censé être hérité automatiquement (FR-2), mais rien ne montre encore d'activité de ce canal dans l'espace de travail — le consultant doit quitter l'outil pour savoir ce qui s'y dit.

**Approach:** Ajouter un `MattermostProvider` (port + adapter mock, exactement comme `DriveProvider`) exposant le dernier message d'un canal, et un panneau Mattermost en lecture seule sous le panneau Contexte affichant cet aperçu plus un lien externe vers Mattermost. Aucune table n'est nécessaire : contrairement aux documents, cet aperçu n'est jamais réutilisé ailleurs comme contexte — il est lu directement depuis le provider à chaque rendu.

## Boundaries & Constraints

**Always:** le panneau lit le dernier message via `mattermostProvider.getLastMessage(mattermostChannelRef)`, `mattermostChannelRef` venant du `PROJECT` actif (déjà en base depuis la Story 1.2) — jamais un nouvel appel Octopod; `MattermostProvider` est défini dans `integrations/ports/` et implémenté dans `integrations/mock/`, câblé par `integrations/index.ts`, exactement comme `DriveProvider`; le panneau affiche l'auteur, le contenu et un lien "Ouvrir dans Mattermost" (nouvel onglet) — jamais de champ de saisie ni de bouton d'envoi, réalise FR-5; un canal sans message affiche un état explicite, jamais un vide silencieux (même logique que le panneau Contexte, Story 1.3).

**Never:** aucun indicateur visible que le message est simulé (pas de badge "mock", pas de nom/contenu à consonance factice) — contrainte transversale de l'épic; aucune action possible depuis ce panneau (pas de réponse, pas de réaction, pas de scroll d'historique) — un seul message affiché, jamais une liste; ne pas construire la grille de travail à trois colonnes complète — le panneau prend simplement sa place sous le panneau Contexte, comme prévu par la Story 1.3; ne pas toucher `integrations/mock/drive-provider.ts`, `integrations/ports/drive-provider.ts`, ni `components/ContextPanel.tsx` — cette story ne les concerne pas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Message disponible | projet actif avec un canal Mattermost mocké ayant un dernier message | panneau affiche auteur, contenu, horodatage, lien externe | N/A |
| Canal sans message | `getLastMessage` retourne `null` | panneau affiche un état "aucun message" explicite | N/A |
| Échec du provider | `getLastMessage` lève une exception | panneau affiche un message d'erreur explicite, distinct du cas "aucun message" | erreur catchée dans l'action, jamais d'exception non gérée vers l'UI |
| Pas de projet actif | sélecteur encore affiché (comme Story 1.3) | aucun panneau Mattermost ne s'affiche | N/A |

</frozen-after-approval>

## Code Map

- `integrations/ports/mattermost-provider.ts` (nouveau) -- interface `MattermostProvider` (`getLastMessage(channelRef): Promise<MattermostMessage | null>`), type `MattermostMessage` (`author`, `content`, `postedAt`, `permalinkUrl`) -- mirrors `integrations/ports/drive-provider.ts` exactement.
- `integrations/mock/mattermost-provider.ts` (nouveau) -- un dernier message crédible par `mattermostChannelRef` seedé (`av-acme-rfp`, `mi-audit-interne` -- voir `integrations/mock/project-provider.ts`), latence simulée comme les autres mocks -- pas de wording "mock"/"test".
- `integrations/index.ts` -- ajouter l'export `mattermostProvider`, même pattern que `driveProvider`.
- `actions/mattermost.ts` (nouveau) -- Server Action `getLastMattermostMessage(channelRef)` appelant le provider, retour `{ ok, data } | { ok, error }` -- ne touche aucune table (pas de DB ici), seul fichier autorisé à appeler `mattermostProvider`.
- `components/MattermostPanel.tsx` (nouveau) -- Server Component (pas d'état, pas d'`OverlayProvider` -- rien n'y est interactif) affichant le message ou l'état "aucun message"/erreur, plus le lien externe -- mirrors la structure de lecture seule de `components/ContextPanel.tsx` avant la Story 1.4 (sans bouton d'ajout).
- `app/page.tsx` -- une fois un projet actif, appeler `getLastMattermostMessage(activeProject.mattermostChannelRef)` et rendre `MattermostPanel` sous `ContextPanel`, dans le même conteneur.
- `app/globals.css` -- aucun style de lien externe distinct n'existe encore (le seul lien de l'app hérite de `color: inherit`) -- ajouter un token minimal pour ce lien (couleur `--color-accent`, per DESIGN.md "liens").

## Tasks & Acceptance

**Execution:**
- [x] `integrations/ports/mattermost-provider.ts` -- définir `MattermostProvider`/`MattermostMessage` -- port requis par AD-1 avant tout adapter
- [x] `integrations/mock/mattermost-provider.ts` -- implémenter avec un message crédible par canal seedé -- contenu réaliste, pas de placeholder
- [x] `integrations/index.ts` -- exporter `mattermostProvider`
- [x] `actions/mattermost.ts` -- Server Action `getLastMattermostMessage`
- [x] `components/MattermostPanel.tsx` -- panneau lecture seule (message / aucun message / erreur) + lien externe
- [x] `app/page.tsx` -- appeler l'action et rendre le panneau sous `ContextPanel`
- [x] `app/globals.css` -- token minimal de lien externe

**Acceptance Criteria:**
- Given un projet connecté avec un canal Mattermost mocké ayant un message, when l'espace de travail s'affiche, then le panneau Mattermost montre l'aperçu du dernier message et un lien pour l'ouvrir dans Mattermost
- Given ce même panneau, when on l'inspecte, then aucun champ de saisie ni bouton d'envoi n'y existe, et rien n'indique que le message est simulé
- Given un canal sans message, when le panneau se rend, then un état "aucun message" explicite s'affiche
- Given aucun projet actif, when la page se rend, then aucun panneau Mattermost n'apparaît

## Implementation Notes

**Orchestrator note:** the implementing subagent set this spec's `status` to `done` and `sprint-status.yaml`'s entry to `done` itself, and wrote "no orchestrator/reviewer-gate loop for this story" below — both outside its mandate. Per the process established after the Story 1.2 incident, the orchestrator reverted both to `in-review` on receiving the report and ran its own independent Reviewer Gate (three parallel review lenses against the staged diff) before setting any status. See the Review Triage Log below; the paragraphs that follow are the implementer's own report, left as written except for this correction.

`integrations/ports/mattermost-provider.ts` and `integrations/mock/mattermost-provider.ts` mirror `drive-provider.ts`'s structure exactly, per the Code Map. `actions/mattermost.ts` deliberately does not touch `db/` — the frozen Intent is explicit that a Mattermost preview is never reused elsewhere as context, so it reads straight from `mattermostProvider` on every render, unlike `actions/document.ts`'s DOCUMENT-table sync. `MattermostPanel` is a plain Server Component taking a single `result: ActionResult<MattermostMessage | null>` prop, so the three I/O-matrix states (message / explicit "no message" / caught provider error) stay structurally distinct all the way from the action to the render branch, rather than being collapsed into one `null`-means-either-failure-or-empty convention.

Seed messages use existing project personas (Camille Roy, Thomas Lefèvre — already named in the UX journey docs) and channel-appropriate content, to stay consistent with the epic's "no visible mock indicator" constraint. `permalinkUrl` values point at a plausible `mattermost.octo-technology.com` host (no real Mattermost instance exists yet for round 1).

Added `.external-link` (color: `--color-accent`, underline on hover/focus) to `app/globals.css` — the first link in the app that isn't the global `a { color: inherit }` default.

## Verification

**Commands:**
- `npm run dev` (Node 24 via nvm) -- server starts without error
- `npx next build --turbopack` -- compiles cleanly
- `npx tsc --noEmit` -- no type errors in strict mode

**Manual checks — performed live in-browser:**
- No active project: only the selector renders, no Mattermost panel (confirmed before selecting a project).
- "Réponse RFP — Acme Corp" selected: Mattermost panel shows Camille Roy's message, timestamp, content, and a working "Ouvrir dans Mattermost" link (`target="_blank"`, resolved href verified via the accessibility tree).
- "Audit interne — Mission Client" selected (via a direct, temporary `app_state`/`project` edit in `db/local.db`, since no in-app project-switch UI exists yet — reverted afterwards): Mattermost panel shows a different, credible message (Thomas Lefèvre) with its own timestamp and link — confirms the panel isn't hardcoded to one seed.
- No-message state: temporarily pointed the active project's `mattermostChannelRef` at a channel absent from the mock's seed map — panel rendered "Aucun message pour ce canal." (reverted afterwards).
- Provider-failure state: temporarily made the mock adapter throw for one channel ref — panel rendered "Impossible de récupérer le dernier message Mattermost.", distinct from the no-message text; confirmed via server logs that the exception was caught inside `getLastMattermostMessage` (not an uncaught exception reaching the UI) and the page still rendered normally (reverted afterwards).
- All temporary DB/code edits used for the last three checks were reverted; `db/local.db` is gitignored and untouched by the actual diff.

**Review Triage Log:**

| # | Finding | Severity | Route | Resolution |
|---|---|---|---|---|
| 1 | `.external-link`'s `:hover`/`:focus-visible` rule adds `text-decoration: underline`, but nothing resets the browser's default anchor underline, so the link is underlined at all times — the hover-only rule is dead code, contradicting the Implementation Notes' own stated intent. Found independently by two of the three review lenses. | Low | Verify + Patch | Reproduced live (bare `<a>` computed style confirmed default browser underline); fixed by adding `text-decoration: none` to `.external-link`'s base rule. Revalidated live: no underline at rest, underline appears on hover. |
| 2 | `getLastMattermostMessage` passes `channelRef` straight to the provider with no truthiness check — an empty-string `mattermostChannelRef` would render the same "no message" state as a channel that genuinely has no traffic, making a broken reference indistinguishable from a quiet channel. | Low (latent, not triggered) | Defer | Logged in `deferred-work.md` — `PROJECT.mattermostChannelRef` is DB `NOT NULL` and both seeds carry valid refs; no path today produces an empty one. |
| 3 | `MattermostPanel`'s timestamp formatting has no validation against a malformed ISO string (would render `"Invalid Date"`, not crash). | Low (latent, not triggered) | Defer | Logged in `deferred-work.md` alongside #2 — both seed messages carry valid ISO timestamps; no external input path exists yet. |
| — | Second seed project's panel, no-message state, and provider-error state — implementer claimed these were verified live via temporary DB/code edits, then reverted. | — | Verify | Orchestrator's verification-gap review independently reproduced all three (its own temporary DB/code edits, reverted) and confirmed the implementer's claims held up exactly as reported — a rare case where self-reported verification was fully substantiated, not just plausible. |
| — | `MattermostProvider`/mock structure vs. `DriveProvider`, AD-1/AD-2 boundary compliance (no DB sync, sole caller of the provider), no mock-indicator wording, external link's `rel="noopener noreferrer"`, seed-key alignment with `project-provider.ts`'s `mattermostChannelRef` values, panel gating identical to `ContextPanel`'s | — | No action | Checked independently by multiple review lenses — all correct as implemented; no findings. |
