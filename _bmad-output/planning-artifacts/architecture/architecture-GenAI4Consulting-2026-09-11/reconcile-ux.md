---
title: "Reconcile — EXPERIENCE.md vs ARCHITECTURE-SPINE.md"
status: draft
created: 2026-09-14
sources:
  - _bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-GenAI4Consulting-2026-09-11/ARCHITECTURE-SPINE.md
---

# Reconcile — UX Experience vs Architecture Spine

Scope: check whether ARCHITECTURE-SPINE.md's ERD (Structural Seed) and module boundaries (AD-1..AD-5) are consistent with the locked behavioral rules in EXPERIENCE.md's **Component Patterns** and **State Patterns** tables. Three angles requested: (a) state described in EXPERIENCE.md with no ERD field to hold it, (b) behavior implying a mutation path AD-2 (Server-Actions-only mutation) doesn't cleanly support, (c) the "Révision globale" row (PRD's open `[ASSUMPTION]`) vs the spine's `SUGGESTION.type='global'` handling.

## Method

Read both documents in full. Walked every row of Component Patterns and State Patterns, matched each behavioral claim against a concrete ERD field or a named module/Server Action in the Capability → Architecture Map, and flagged anything unsupported, contradicted, or ambiguous. Rows that already have a matching `[ASSUMPTION]`/Deferred entry acknowledged consistently on both sides are not re-flagged as gaps (e.g. copy for "Aucun livrable", Karim's stepper-not-applicable case, skill-attachment mechanism).

## Findings

### 1. No LIVRABLE ↔ CONVERSATION relationship in the ERD (High)

EXPERIENCE.md, Component Patterns, "Révision globale" row: *"Ne crée pas de nouvelle suggestion ancrée automatiquement ; le résultat revient **dans la conversation liée au document**."* Flow 1's climax also depends on this link implicitly: the anchored suggestions in the editor exist "en fonction de la conversation qu'elle venait d'avoir" — i.e. the livrable is tied to a specific conversation, not just a project.

The ERD has:
```
LIVRABLE { id, projectId, title, content }
CONVERSATION { id, projectId, title, proactiveSuggestionState }
```
Both hang off `PROJECT` independently; there is no FK either direction and no join entity. EXPERIENCE.md explicitly allows **multiple conversations per project** ("Plusieurs conversations peuvent coexister sur un même projet"), so `projectId` alone cannot disambiguate which conversation a given livrable/global-revision result should route back to. As written, the spine has no way to resolve "la conversation liée au document."

**Recommendation:** add a FK capturing the document↔conversation link (e.g. `LIVRABLE.sourceConversationId`, nullable) before finalizing `SUGGESTION.type='global'` handling — this is a schema decision, not just a Deferred note, because EXPERIENCE.md treats the *existence* of the link as locked (only the exact return payload is `[ASSUMPTION]`).

### 2. Spine's Deferred note for OQ-4 reopens something EXPERIENCE.md already locked (High)

EXPERIENCE.md's `[ASSUMPTION]` on the Révision globale row is scoped narrowly: *"le comportement exact de ce retour n'a pas été spécifié"* — i.e. only the **exact shape/copy** of the return is open. The row's main clause — *"Ne crée pas de nouvelle suggestion ancrée automatiquement"* — is stated as settled behavior, not flagged as an assumption.

ARCHITECTURE-SPINE.md's Deferred section says: *"**Comportement du retour de la révision globale (OQ-4)** — `SUGGESTION.type = 'global'` existe dans le modèle, mais ce qu'il déclenche exactement (**nouvelle suggestion**, message conversation) n'est pas fixé."* This reopens "nouvelle suggestion" as a live option, which contradicts EXPERIENCE.md's locked "ne crée pas de nouvelle suggestion ancrée automatiquement."

**Recommendation:** narrow the Deferred entry to the actually-open question (format/content of the conversation message the global revision produces), and state explicitly that no new `SUGGESTION` row (anchored or otherwise) is created by this path — only a `MESSAGE` in the linked conversation (which itself depends on Finding 1 being resolved).

### 3. No named Server Action/skill for "Retravailler" or "Révision globale" mutation paths (Medium — AD-2/AD-3 fit is unclear)

EXPERIENCE.md describes two mutation paths that are not simple livrable-content rewrites:
- **Retravailler** (anchored suggestion): *"ouvre un champ pour préciser la demande, renvoie en attente une fois envoyée"*; Flow 2's climax has the card update with a new, source-grounded proposal ("sans qu'il ait eu à rouvrir la conversation générale") — implying a targeted AI call scoped to one `SUGGESTION` row, not a full livrable rewrite.
- **Révision globale**: a free-text field whose submission must trigger some processing that ends up as a conversation message (see Finding 1).

The Capability → Architecture Map's only named module for feature 4.4 is `skills/propose_livrable_content.ts`, and AD-3's rule is scoped specifically to "le même appel outil qui crée ou modifie le contenu d'un livrable." Neither "Retravailler" nor "Révision globale" is guaranteed to modify `LIVRABLE.content` (Retravailler updates one `SUGGESTION.text`; Révision globale may only ever produce a `MESSAGE`), so it's unclear which module owns these calls, whether they still route through `actions/livrable.ts` (AD-2 compliance), and how AD-3's read/write boundary is meant to apply to them.

**Recommendation:** name the two additional mutation paths explicitly (e.g. `skills/revise_suggestion.ts`, `skills/global_revision.ts`, both invoked from `actions/livrable.ts` per AD-2), and extend AD-3's rule text to cover them or explain why they're exempt.

### 4. Stepper's "changes conversation context" has no supporting field (Medium)

EXPERIENCE.md, Stepper row: *"Cliquer une étape la rend active et change le contexte de la conversation en dessous."* This implies each workflow step maps to a conversation (or a filtered view of conversations) that swaps automatically on step click. The "Liste de conversations" row only offers this as a loose example ("ex. un sujet par étape ou par question"), not a rule.

The ERD gives `PROJECT.activeStepKey` but `CONVERSATION` has no `stepKey`/workflow-step field, so nothing in the data model can drive an automatic conversation switch keyed off the active step.

**Recommendation:** either (a) add a nullable `stepKey` on `CONVERSATION` so the active step can filter/select a conversation, or (b) if step-switching is meant to be UI-only (no automatic conversation swap), soften EXPERIENCE.md's wording so it doesn't read as a hard behavioral rule the data model must serve.

### 5. "Reappears on a new session" isn't representable by the persisted enum as defined (Low)

EXPERIENCE.md, State Patterns: *"Ne réapparaît que sur un nouveau changement d'étape de workflow ou **une nouvelle session** — jamais en boucle dans la même conversation."*

`CONVERSATION.proactiveSuggestionState` (`shown | dismissed | accepted`) is a durable field with no session/time dimension, and the spine's Deferred section puts "Auth, multi-utilisateur" — the closest concept to a session — fully out of scope for round 1. As specified, a `dismissed` conversation stays `dismissed` across app relaunches, which would prevent the "new session" reappearance EXPERIENCE.md calls for.

**Recommendation:** clarify what "nouvelle session" means operationally for a mono-user, no-auth round 1 (app relaunch? tab reopen?) and either add the minimal field needed (e.g. a `lastSeenAt` marker compared against process start) or drop/soften the reappearance-on-new-session rule.

## Not flagged (consistent or already acknowledged)

- Stepper's fixed 4-step list, checkmark/active/neutral rendering — no schema need beyond `activeStepKey` + a fixed ordered constant list in `domain/workflow.ts`.
- Panneau Skills / `PROJECT_SKILL` join — matches AD-4 exactly.
- Composer's model selector — covered by `MESSAGE.model`.
- Panneau Contexte / `DOCUMENT.source` (`drive | manual`) — matches.
- Suggestion ancrée fade-but-persist behavior — matches `SUGGESTION.status` with no delete path.
- Karim's flow (stepper doesn't apply) — already reconciled via `activeStepKey` nullable + matching Deferred entry ("Workflow du cas 'livrable de mission'").
- "Une seule suggestion active par paragraphe à la fois" — plausible as a `domain/suggestion.ts` business rule rather than a schema constraint; not counted as a gap, but worth a unit test once implemented.
