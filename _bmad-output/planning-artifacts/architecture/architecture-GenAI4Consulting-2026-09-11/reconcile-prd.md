---
title: Reconciliation — PRD (24 FR) vs ARCHITECTURE-SPINE
created: 2026-09-14
status: draft
sources:
  - _bmad-output/planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
---

# Reconciliation — PRD vs Architecture Spine

Method: for each FR, check whether the spine's data model (Structural Seed), module boundaries (AD-1..AD-5), or Deferred list give it a place to live, without demanding the spine restate the FR. Findings are grouped: **gaps** (something has nowhere to live, or is silently contradicted) and **confirmed non-gaps** (explicitly requested checks that turned out fine, recorded so the check isn't silently skipped).

## Gaps

### G1 — FR-10 (confidentialité de conversation) has no ownership hook, and its "team visibility" half has no mechanism

FR-10 is a two-part invariant: (a) conversation content is *never* visible to anyone but its author, and (b) livrables/assets it produces *are* visible to "le reste de l'équipe projet." The Constraints & Guardrails section calls (a) a hard constraint, present and future.

The spine's `CONVERSATION` entity has no `ownerId`/`createdBy`/`userId` field, and there is no `USER`/`CONSULTANT` entity anywhere in the Structural Seed. The Deferred list explicitly defers "Auth, multi-utilisateur" and states round 1 is "mono-poste, mono-utilisateur." That decision isn't wrong, but it isn't reconciled with FR-10 either way:

- If round 1 truly means *one isolated instance per tester* (each consultant runs their own local app/DB), then part (a) is satisfied for free — there's no "other" user in that instance to leak to — but that should be stated as the reconciling assumption, because as written FR-10 reads as a same-instance access-control rule ("Aucune interface accessible à un autre membre du projet n'expose...") that this architecture cannot actually enforce (nothing checks "who is asking").
- Part (b) — livrables becoming visible to "le reste de l'équipe projet" — has no mechanism at all in the spine: no export/publish action, no shared backend, no field on `LIVRABLE` indicating team visibility. Under a mono-user/mono-poste deployment there is no "team" the running app can show anything to. This half of FR-10 is silently unaddressed rather than deferred on purpose (it isn't in the Deferred list).

**Recommendation:** add one sentence to the spine (Deferred or a new AD) stating explicitly how round 1's mono-user/mono-poste shape satisfies FR-10(a), and either move FR-10(b) into Deferred explicitly or note it's out of round-1 scope because "team" has no referent in a single-instance deployment.

### G2 — FR-3 "documents et répertoires" vs a flat `DOCUMENT` table

FR-3 specifies the Panneau Contexte shows "les documents **et répertoires** issus du drive" — directories, not just files. The `DOCUMENT` entity in the Structural Seed is flat: `id, projectId, name, source, content` — no `parentId`/`folderId`, no discriminator for folder vs. file. There's no way to represent or query a drive tree with this schema.

This may be intentional simplification (mock drive = flat list, "répertoires" is PRD phrasing carried over without a literal folder feature) but the spine doesn't say so — it's silent on the word "répertoires" entirely, and AD-1's mock adapter (`integrations/mock/*`) would need *some* shape to return if a folder tree is expected. As written, an implementer following the spine's schema literally cannot render a directory structure, and the spine gives no explicit ruling that this is deliberately out of scope for round 1.

**Recommendation:** either add `parentId` (nullable) + a `kind: 'file' | 'folder'` discriminator to `DOCUMENT`, or add an explicit note that "répertoires" is flattened to a single-level file list for round 1's mock.

### G3 — FR-17/FR-18 (proactive suggestion state) is a single scalar per conversation, but the FR describes per-step recurrence

`CONVERSATION.proactiveSuggestionState` is one column: `shown | dismissed | accepted`. FR-17 triggers a proactive suggestion "à l'ouverture d'un projet **ou au passage à une nouvelle étape**" of the stepper; FR-18 requires that a dismissed/accepted suggestion "ne réapparaît pas spontanément dans la même conversation" but explicitly **can** reappear "lors d'un nouveau changement d'étape du stepper."

A single scalar on `CONVERSATION` cannot represent "dismissed for step Qualification, but a fresh one is now legitimately showing for step Références" independently of history. Two failure modes follow directly from the schema as specified:

- If the field is overwritten on every step change, revisiting an earlier step (nothing in FR-16 forbids clicking backward in the stepper) loses the record that its suggestion was already dismissed there, so the same suggestion could resurface in the same conversation — violating FR-18's core guarantee.
- If instead an implementer reads the single field defensively (never re-show once *any* suggestion was dismissed), FR-17/18's "can reappear on step change" allowance for genuinely new steps breaks.

The Capability→Architecture Map assigns FR-14..18 to `domain/workflow.ts` (governed by AD-5), but AD-5 only requires transitions to be pure functions — it doesn't resolve what state those functions operate over. The schema, as the only concrete artifact given, under-specifies the state needed.

**Recommendation:** key `proactiveSuggestionState` by `(conversationId, stepKey)` — either a small join/history table, or fold it into whatever emits the suggestion per step — rather than one column on `CONVERSATION`.

### G4 — Cross-cutting "no modal stacked more than one level deep" is asserted twice in prose, never given an architectural mechanism

The NFR is real and specific ("jamais au-dessus d'une autre surface déjà ouverte"), and the spine correctly cites it inline in FR-11's and FR-21's notes. But unlike every other cross-cutting concern in this document (Ports & Adapters → AD-1, mutation path → AD-2, suggestion generation timing → AD-3, skill storage → AD-4, domain purity → AD-5), this one has no AD of its own and no structural hook (no single global overlay/modal-stack slot, no rule about how `app/`/`components/` may open floating surfaces). It is architecturally unenforced: nothing in AD-1..AD-5 or the file layout stops a future feature from opening the skill-add modal (FR-11) while a suggestion's retravail field (FR-21) is already open, since the two live in unrelated action clusters (`conversation.ts` skills vs. `livrable.ts` suggestions) with no shared state.

**Recommendation:** either add a lightweight AD-6 ("one global overlay slot; a floating surface can only open when none is already open") or explicitly note in Consistency Conventions which component/hook owns overlay state, so the invariant has an actual enforcement point rather than living only as a repeated comment.

### G5 (minor) — FR-20 "une seule suggestion active par paragraphe" is an unencoded business rule

FR-20's consequence — only one *pending* anchored suggestion per paragraph at a time — has no home: no unique constraint implied on `SUGGESTION(livrableId, anchorRef)` for `status = 'pending'`, and no domain rule mentioned alongside `domain/suggestion.ts`'s described responsibilities (which are framed around status *transitions*, not paragraph-level exclusivity). It's a small gap relative to G1-G4, but worth a one-line rule in `domain/suggestion.ts`'s description or a DB-level partial unique index.

## Confirmed non-gaps (explicitly checked, no action needed)

- **FR-4 (ajout d'un document hors-drive):** fully covered — `DOCUMENT.source: 'drive' | 'manual'` lets a manually-added document sit in the same table/panel as drive documents, which is exactly what FR-4's Out of Scope note ("distinction visuelle... dans le panneau Contexte") implies should be possible later. No gap.
- **FR-13 (empty livrables panel state):** correctly left out of the spine. The empty-invite copy/behavior is a pure UI/empty-state concern once `LIVRABLE` returns zero rows for a project — no data-model or module-boundary hook is needed, and the spine rightly doesn't try to encode it.
- **FR-21 (three suggestion states distinguishable by more than color):** correctly out of the spine's scope, and the data model already gives the UI what it needs — `SUGGESTION.status` is a discrete enum (`pending | accepted | rejected | revising`), so icon/label differentiation is a component-level decision (DESIGN.md territory) with no missing data-model hook.
- **FR-22 (persistance visuelle, atténuée):** supported implicitly — treated suggestions (`accepted`/`rejected`) are never deleted, only re-statused, so the row persists for the UI to render dimmed. No gap.
- **FR-16 (stepper "terminé" state):** a single `PROJECT.activeStepKey` scalar is sufficient — since the 4 steps are a fixed, ordered sequence (FR-14), "terminé / actif / à venir" can be derived by comparing array position to `activeStepKey` in `domain/workflow.ts`. No separate per-step status field is needed.

## Summary Table

| FR | Area | Status |
| --- | --- | --- |
| FR-3 | Panneau Contexte (documents+répertoires) | Gap — G2 |
| FR-4 | Ajout document hors-drive | OK |
| FR-10 | Confidentialité conversation | Gap — G1 |
| FR-13 | Panneau Livrables vide | OK |
| FR-16 | Navigation stepper | OK |
| FR-17/18 | Suggestion proactive + non-réapparition | Gap — G3 |
| FR-20 | Suggestions ancrées (une par paragraphe) | Minor gap — G5 |
| FR-21 | États distinguables autrement que par couleur | OK |
| FR-22 | Persistance visuelle | OK |
| Cross-cutting NFR | Pas de pile de modale >1 niveau | Gap — G4 |

All other FRs (FR-1, FR-2, FR-5 through FR-9, FR-11, FR-12, FR-14, FR-15, FR-19, FR-23, FR-24) have a clear, unambiguous home in the data model, an AD, or the Deferred list, and were not found to be silently contradicted.
