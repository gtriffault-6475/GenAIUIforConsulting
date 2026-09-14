# Reconciliation: PRD vs UX Spines (DESIGN.md / EXPERIENCE.md)

**Inputs:**
- `_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/DESIGN.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-GenAI4Consulting-2026-09-11/EXPERIENCE.md`
- `_bmad-output/planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md`

**Method:** Walked every row of EXPERIENCE.md's Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, and Inspiration & Anti-patterns tables, plus the Foundation and Information Architecture sections and both Key Flows, and checked each locked behavioral rule against the PRD's FR-1…FR-23. Also checked DESIGN.md's Components/Do's-Don'ts for behavioral (not purely visual) implications.

## Summary verdict

No direct contradictions found — nowhere does the PRD's wording state something that conflicts with a locked UX decision. The PRD is a faithful functional decomposition of the UX spines for everything it covers. The gaps below are all **omissions**: UX spine rules (state patterns, an information-architecture constraint, an accessibility-floor rule, and one action embedded in a Key Flow) that imply a functional requirement that has no corresponding FR, consequence, or Out-of-Scope note in the PRD.

## Row-by-row match (for record)

| UX spine element | PRD coverage | Verdict |
|---|---|---|
| Stepper: 4 fixed steps, click activates + changes context, passed/active/upcoming states | FR-13, FR-15 | Match |
| Suggestion proactive: one at a time, "Oui, commençons" advances stepper, "Plus tard" hides without advancing | FR-16 | Match |
| Panneau Skills: list + "Ajouter une skill" entry point, mechanism out of scope | FR-10 | Match (see Gap 2 for empty state) |
| Liste de conversations: multiple per project, click activates, "Nouvelle conversation" creates+activates, no delete/rename | FR-6, FR-7, FR-8, FR-7 Out of Scope | Match |
| Conversation: private to author, only deliverables/assets shared | FR-9 | Match |
| Composer: model selector never doubles as agent selector | FR-11 | Match |
| Panneau Contexte: drive docs, read-only, no add/edit/delete here | FR-3 | Match (see Gap 1 for the flow tension) |
| Panneau Livrables: click opens Éditeur assisté | FR-12 | Match (see Gap 2 for empty state) |
| Panneau Mattermost: preview + link only, never a send surface | FR-4 | Match |
| Suggestion ancrée: Accepter/Rejeter/Retravailler, one active per paragraph | FR-19, FR-20 | Match |
| Suggestion ancrée state persistence: treated ones stay visible, muted | FR-21 | Match |
| Révision globale: separate field, result returns to linked conversation | FR-22 (same open assumption as EXPERIENCE) | Match |
| Suggestion proactive non-reappearance within same conversation | FR-17 | Match |
| Simulated integrations never disclosed as fake | FR-5 | Match |
| Rejected: generic AI chat without project context | FR-1 ("sans projet sélectionné, aucune surface... accessible") | Match |
| Rejected: exposing mocked state | FR-5 | Match |
| Rejected: model selector doubling as agent selector | FR-11, §5 Non-Goals | Match |
| Breadcrumb back from Éditeur assisté | FR-18 | Match |

## Gaps found

### Gap 1 — Adding a document from outside the drive is used in the Key Flow but has no FR

EXPERIENCE.md's Flow 1 (step 3) has Camille add "un compte-rendu de call achats, absent du drive, que le client lui a envoyé par email" before the proactive suggestion appears — the PRD's own UJ-1 "Parcours" repeats this exact step verbatim. But the "Mapping capacité → FR" table right below UJ-1 attaches no FR number to that step (only FR-1/FR-2 for connecting the project), and FR-3 (Panneau Contexte) explicitly forecloses any add/edit action from that panel: "Aucune action d'édition, de suppression ou d'ajout de document n'est disponible depuis ce panneau." No other FR grants a mechanism to bring an external, non-drive document into the project's context. Either this is a missing FR (e.g., "attach an external document to a project, surfaced outside the read-only Contexte panel") or the Key Flow step needs to be reconciled with FR-3's read-only constraint — as written, the PRD does not make this climax-adjacent capability buildable.

### Gap 2 — Two locked empty-state behaviors have no corresponding FR

EXPERIENCE.md's State Patterns table locks two specific empty-state treatments:
- **Panneau Skills, no skill loaded:** "Liste vide + l'invite 'Ajouter une skill' reste visible en premier élément, pas de message d'erreur."
- **Panneau Livrables, no livrable:** "Un texte court invite à en créer un depuis la conversation ou un workflow — pas de case vide silencieuse."

FR-10 (skills) and FR-12 (livrables) describe only the populated-list behavior and say nothing about the zero-items state. Since EXPERIENCE.md explicitly rules out a silent/error-styled empty state for both panels, this is a testable behavioral rule that should have its own consequence under FR-10/FR-12 (or a new FR) but currently doesn't — an implementer following the PRD alone could ship a silent empty box or an error state for either panel without violating any FR.

### Gap 3 — Accessibility-floor rule for suggestion states (non-color distinction) is missing from the FRs

EXPERIENCE.md's Accessibility Floor locks: "Les trois états d'une suggestion (acceptée/rejetée/en attente) se distinguent par autre chose que la seule couleur (icône check pour acceptée, libellé texte pour rejetée)." This is a specific, testable behavioral requirement on the same suggestion-state UI that FR-19/FR-20/FR-21 already describe in detail (anchoring, actions, muted persistence) — but none of those FRs, nor any other FR, requires the non-color distinguishability (icon for accepted vs. text label for rejected vs. pending). As written, FR-21 would be satisfied by a purely color-coded treatment, which the UX spine explicitly forbids.

### Gap 4 — No-nested-modals rule (Information Architecture) has no FR or NFR

EXPERIENCE.md's Information Architecture section states as a locked layout rule: "Pas de pile de modales à plus d'un niveau." This constrains any future FR that introduces a modal/dialog (e.g., the skill-attachment entry point in FR-10, or the "Retravailler" field in FR-20) to never stack a second modal on top of a first. Nothing in §4 or the Cross-Cutting NFRs captures this constraint, so a builder implementing FR-10's "point d'entrée" or FR-20's "Retravailler" field with a modal could legally add a second-level modal (e.g., a confirmation dialog inside the skill-attach modal) without violating any written FR.

### Gap 5 (minor) — Mono-tenancy ("un projet à la fois") is not expressed as a testable FR-1 consequence

EXPERIENCE.md's Foundation states: "Mono-tenant par projet : un consultant travaille dans un projet à la fois." FR-1's consequences describe the project selector as "accessible... à tout moment" but never state that selecting a new project fully replaces the active one (single active project, not simultaneous multi-project work). This is a lower-severity gap since no PRD wording contradicts mono-tenancy and the intent is likely obvious to an implementer, but it is a locked foundational constraint with no explicit testable consequence attached to FR-1.

## Recommendation

Gaps 1–3 are the ones most likely to cause a build/spec mismatch (a real capability used in the canonical Key Flow with no FR; two explicitly-designed empty states; an accessibility rule tied directly to a heavily-specified component) and are worth resolving before the PRD leaves draft. Gaps 4–5 are lower-risk cross-cutting constraints that could be captured as a short NFR or Constraints/Guardrails addition rather than new FRs.
