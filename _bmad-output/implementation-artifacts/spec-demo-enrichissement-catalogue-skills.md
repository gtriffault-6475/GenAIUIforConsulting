---
title: "Mode démo : enrichir le catalogue de skills OCTO (3 → 13 skills)"
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'cce1e30193798bb245ec42a0d6a83149707fea1c'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-demo-catalogue-skills.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** entrée différée de `spec-demo-catalogue-skills.md` (`deferred-work.md`) -- la popup "Catalogue de skills OCTO" ne montre que 3 skills, trop peu pour donner l'impression d'un catalogue partagé qu'on parcourt.

**Approche :** ajouter 10 entrées à `SKILL_CATALOG` (`skills/catalog.ts`, AD-4), avec `name`, `description`, `category` et des `instructions` réelles et plausibles (elles partent dans le prompt système une fois chargées, AD-11) : `rfp-qualification`, `pricing-estimation`, `expert-finder`, `workshop-facilitation`, `architecture-review`, `cloud-migration`, `genai-use-cases`, `data-maturity`, `agile-diagnostic`, `executive-summary`. Les 3 catégories existantes sont conservées telles quelles (Avant-vente, Capitalisation, Cadrage de mission) ; trois nouvelles s'y ajoutent : Architecture & tech, Data & IA, Delivery & livrables. Aucun changement de composant : la popup dérive déjà ses catégories du catalogue. Aucun nom de personne réelle, aucune fixture `PROJECT_SKILL` modifiée.

</frozen-after-approval>

## Implementation Notes

`skills/catalog.ts` only: 10 entries added as specified, 6 categories in total. Entries reordered by category (Avant-vente, Cadrage de mission, Capitalisation, Architecture & tech, Data & IA, Delivery & livrables), because the popup lists cards and derives its category sidebar in insertion order. The `data-maturity` description now says "données", so a natural demo search ("donnees") finds it. `expert-finder`/`pricing-estimation` instructions got a guardrail sentence (no invented people, no invented daily rates). The file header comment was updated to cover the 13 entries. No component change was needed.

Verified: `npx tsc --noEmit` and `npx next build --turbopack` clean. In the browser, in demo mode on RFP Acme, the popup shows 13 cards, "Toutes 13" and 6 categories with the expected counts (3/2/2/2/2/2), the cards are grouped by category, and "donnees" returns "Diagnostic de maturité data". This spec closes the `deferred-work.md` entry from `spec-demo-catalogue-skills.md` that asked to enrich the catalogue; the entry is left in place, since that file is append-only.

## Review Triage Log

Blind-hunter only (oneshot route).

| # | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| 1 | File header comment still says the catalogue holds three entries. | low | patch | Verified; comment updated. |
| 2 | The spec has only an Intent section and an empty Implementation Notes. | false | reject | The oneshot template deliberately drops the other sections; Notes and status are filled in at finalization. |
| 3 | The `deferred-work.md` entry is still open. | low | reject | `deferred-work.md` is append-only per the workflow ("do not edit old entries"); closure is recorded in this spec's Implementation Notes. |
| 4 | Under "Toutes", cards are not grouped by category, and the sidebar order is accidental. | low | patch | Verified: insertion order split Avant-vente and Capitalisation; `SKILL_CATALOG` reordered by category, confirmed in the browser. |
| 5 | Under 640px, 7 stacked category buttons push the cards below the fold. | low | reject | The app's page layout is not phone-adapted anyway (demo on desktop); the fix is a new mobile layout, not a direct correction. |
| 6 | `expert-finder`/`pricing-estimation` instructions can lead the model to invent consultants or daily rates. | medium | patch | Real once loaded outside demo mode (instructions go into the system prompt, AD-11); one guardrail sentence added to each. |
| 7 | Nothing checks each entry's `key` against its record key. | false | reject | All 13 entries checked: every `key` equals its record key; a helper would add surface for no demonstrated defect. |
| 8 | Category fit (`agile-diagnostic` under "Delivery & livrables"), naming style, and skills concatenated into the system prompt without separators. | low | reject | Category and naming are editorial choices in the frozen intent; concatenation predates this change (`skills/buildRequest.ts`, AD-11). |
