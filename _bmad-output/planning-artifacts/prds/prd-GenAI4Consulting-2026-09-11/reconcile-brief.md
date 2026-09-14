# Reconciliation: Brief + Addendum → PRD (GenAI4Consulting)

**Inputs compared:**
- `_bmad-output/planning-artifacts/briefs/brief-GenAI4Consulting-2026-09-10/brief.md`
- `_bmad-output/planning-artifacts/briefs/brief-GenAI4Consulting-2026-09-10/addendum.md`
- `_bmad-output/planning-artifacts/prds/prd-GenAI4Consulting-2026-09-11/prd.md`

**Method:** Read all three documents in full. Walked the brief section by section (Executive Summary, Problem, Solution, What Makes This Different, Who This Serves, Success Criteria, Scope, Vision) and the addendum section by section (scenario, open questions, market context, session context), checking each factual claim *and* each qualitative/rationale claim against the PRD. Distinguished silent drops from disclosed/deliberate compressions (the PRD explicitly says in §0 that it builds on the brief/UX docs "plutôt que de les dupliquer," so some omissions are by design, not oversight — those are noted but not counted as gaps).

---

## 1. Section-by-section walk

### Executive Summary (brief) → §1 Vision, "Why Now" (PRD)
- Three bricks, two use cases, prototype-not-platform framing: **carried forward**, close paraphrase.
- "Ce n'est plus une hypothèse : c'est déjà la référence que les clients commencent à connaître" → PRD "Why Now" repeats this almost verbatim. **Carried forward.**
- Round 1 goal (validate the idea is worth pursuing further, not a numeric ROI): **carried forward** (§1, §6.2 note, §7 SM-2, Non-Goals).

### The Problem (brief) → §1 Vision / "Why Now" (PRD)
- Core fact (<50% of consultants use AI in a structured way, no cross-project capitalization): **carried forward** (§1, "Why Now").
- Three named consequences in the brief: (a) competitive credibility, (b) attraction & retention, (c) the gap between "those who know" and "those who don't" widening structurally.
  - (a) Credibility: **carried forward** ("Why Now": "un problème de crédibilité face aux clients").
  - (b) Attraction/retention: **partially carried** — PRD keeps the *feeling* ("se sentir aussi équipé," JTBD §2.1) and the *label* ("facteur d'attraction/rétention," Why Now), but drops the concrete **mechanism** the brief gives: junior/high-demand consultants either leave for a better-equipped firm, *or* resort to shadow IT ("chacun bricole sa propre solution hors du cadre du cabinet, ce qui aggrave encore la fragmentation"). That shadow-IT risk is a distinct, concrete argument in the brief — not just color — and it doesn't appear anywhere in the PRD. **→ Gap #1 below.**
  - (c) Widening gap: **loosely carried** via Vision §1 ("ce qui fonctionne chez les uns ne profite jamais au reste du cabinet") — the "gap keeps widening over time" dynamic is implied but softer than the brief's explicit framing. Minor, not flagged as a standalone gap.

### The Solution (brief) → §1 Vision, §4 Features (PRD)
- Three bricks, "connect to an existing workspace → add missing docs → work with skills/agents" schema: **carried forward** structurally through UJ-1/UJ-2 and the Feature sections.
- Use case #2 is named in the brief as **"livrables de mission hors code"** (explicitly excluding code deliverables) — both in "The Solution" and again in "Scope." The PRD refers to this use case only as "livrables de mission" (§1 Vision, §6.1 MVP Scope, UJ-2, Doc Purpose) and never restates the "hors code" boundary anywhere, including in §5 Non-Goals where a scope exclusion would normally live. **→ Gap #2 below.**

### What Makes This Different (brief) → not clearly present in PRD
This section is explicitly framed in the brief as "le cœur de la différenciation" (two reasons "assumées comme" the heart of it):
1. The "just give everyone ChatGPT Enterprise / Copilot and train them" argument is insufficient, because OCTO has specific ways of working (methods, référentiels, mission know-how) a generic AI tool doesn't know and can't surface on its own.
2. Efficiency comes from **easy access and integration**, not a superior AI model — connecting to an already-organized workspace (Octopod/drive/Mattermost) instead of starting from a blank page is what saves time.
3. The explicit, quotable conclusion: **"Le moat n'est donc pas technologique — il est dans l'intégration à l'existant OCTO et dans le savoir-faire du cabinet qu'on rend accessible."**

The PRD's §4.1 description references this section only indirectly ("c'est le mécanisme qui rend concret le différenciateur 's'intègre à l'existant plutôt que de le remplacer' (brief, §What Makes This Different)") — i.e., it cites the *conclusion's label* but never restates the *argument* (why generic tools fail, why access/integration beats model quality, the "moat is not technological" framing). Nothing in Vision, Why Now, or Non-Goals carries this reasoning either. For a document meant to brief an architect and new testers who may not re-read the brief closely, this is the single most load-bearing piece of "why this shape of product" reasoning in the whole brief, and it isn't restated anywhere in the PRD's own prose. **→ Gap #3 below.**

(Note: the *practical implications* — OCTO's own methods/référentiels aren't accessible yet, sourcing mission references/experts is unresolved — do survive, as OQ-1 and OQ-2. So the downstream open questions are preserved; it's the connecting argument/rationale that's missing.)

### Who This Serves (brief) → §2.2 Non-Users (PRD)
- Horizontal, no persona identified, small pre-identified test group not to be expanded: **carried forward** well.
- Minor tone shift: the brief frames "no persona identified" as **provisional** ("pas un profil particulier identifié à ce stade" — leaves the door open for later). PRD §5 Non-Goals restates it as a firmer design decision ("Ne cible pas un profil de consultant en particulier... horizontal pour tous, sans personnalisation par rôle"). Subtle, not worth a standalone gap, but worth a note: a reader of the PRD alone would not sense this was left open in the brief.

### Success Criteria (brief) → §7 Success Metrics (PRD)
- Functional bar (connect, find skills/agents, use them without blocking) → SM-1. **Carried forward.**
- Qualitative target reaction (the consultant quote) → SM-2 references "la citation cible du brief" without reproducing it, consistent with the PRD's stated no-duplication policy (§0). **Deliberate, not a gap.**
- "Pas de ROI chiffré... pas garanti de tout connecter en vrai" → carried forward, and actually *strengthened* by the PRD via the explicit "NOTE FOR PM" in §6.2 flagging real integration as the main gap to close post-round-1. **Good — improvement, not a loss.**

### Scope (brief) → §5 Non-Goals, §6 MVP Scope (PRD)
- Three bricks present, two use cases, integrations mocked-but-credible: **carried forward**, and FR-5 even quotes the brief's exact line ("l'expérience doit rester crédible... sans que tout soit branché en réel") — a good example of a qualitative constraint preserved verbatim.
- Out-of-round-1 items (qualification method, data source for references/experts, no deadline): **carried forward** as OQ-1, OQ-2, OQ-5.

### Vision (brief, closing section) → no counterpart in PRD
The brief's final section is a forward-looking statement: *if round 1 validates the idea, the project is meant to grow beyond these two initial use cases, toward more use cases and deeper integration into the OCTO tooling ecosystem* — timeline and scale of that growth deliberately undefined. The PRD has no section that carries this aspiration forward. §5 Non-Goals only states the negative ("ne construit pas une plateforme à l'échelle...," "ne définit pas de délai") — true to round 1, but the brief's positive growth vision (what happens *if it works*) is absent, and a reader of the PRD alone would not know the project has any ambition beyond round 1 at all. **→ Gap #4 below.**

---

## 2. Addendum walk

### Detailed avant-vente scenario (6 steps) → UJ-1, Glossary (PRD)
- Steps 1–4 (receive RFP, create Octopod opportunity with drive/Mattermost, connect from GenAI4Consulting, add missing docs) map cleanly onto UJ-1's "Entrée"/"Parcours" and FR-1/FR-2. **Carried forward.**
- Step 5 (launch a workflow via skill(s) following a response method: "qualification (peut/veut-on répondre ?), cohérence avec les compétences OCTO...") is condensed into a single stepper step "Qualification" (FR-13). The PRD already flags this compression honestly via an inline `[ASSUMPTION]` note on FR-13 ("condensent le scénario en 6 points... non validées étape par étape"). **Disclosed compression, not a silent gap** — well handled.
- Step 6 (find similar OCTO references, identify the right OCTO experts, produce a first draft) maps to the Références/Experts/Rédaction stepper steps and to UJ-1's climax. **Carried forward.**
- "Le même schéma... s'applique au second cas d'usage" → UJ-2 exists as a parallel journey and FR-14 explicitly notes the stepper doesn't necessarily apply there. **Carried forward, with disclosed open question (OQ-3).**

### Open questions (addendum) → §8 Open Questions (PRD)
All three addendum open questions (qualification method formalized or not; data source for references/experts; round-1 deadline) reappear as OQ-1, OQ-2, OQ-5. **Fully carried forward**, in some cases with added precision (OQ-1/OQ-2 now cross-reference the specific FRs they block).

### Market context research (addendum) → §9 Assumptions Index (PRD)
The addendum contains a detailed, sourced set of competitor figures (McKinsey Lilli's 40,000+ consultants/72% adoption/30% time saved, Deloitte's 75,000 seats, Accenture's 85,000+, Bain's 13,000 Copilot seats + 19,000 GPTs, PwC's 200,000-seat ChatPwC, BCG Deckster's HBS study of +12.2% tasks/+25.1% speed/+40% quality), plus a caveat that these figures need re-verification before any external use. The PRD's Assumptions Index (§9) explicitly states these figures were "volontairement absents" from the PRD, noting only that competitor platforms exist, not their scale. **This is a disclosed, deliberate omission**, not a silent drop — flagged as such in the PRD itself, so not counted as a gap. Worth noting only because the *interpretive conclusion* the addendum draws from these numbers ("l'idée n'est pas originale... l'angle OCTO n'est pas de rivaliser en échelle, mais de rattraper un écart réel") **is** preserved, in "Why Now"'s closing sentence. So the qualitative takeaway survives even though the supporting evidence doesn't — a defensible editorial choice.

### Session context (addendum) → not applicable
This section documents process/provenance (a prior cloud session, a push failure, brief reconstruction from a user-provided synthesis). It's meta-information about how the brief was produced, not product content. Correctly absent from the PRD.

---

## 3. Gaps identified (ranked by materiality)

### Gap #1 — Shadow-IT / attrition mechanism dropped from the "attraction & retention" consequence
**Brief:** "Les consultants les plus juniors ou les plus demandés attendent des outils IA-natifs. Sans eux, le risque est soit un départ vers un cabinet mieux équipé, soit du 'shadow IT' — chacun bricole sa propre solution hors du cadre du cabinet, ce qui aggrave encore la fragmentation."
**PRD:** Only keeps the emotional JTBD ("se sentir aussi équipé...") and the label "facteur d'attraction/rétention" (Why Now). The concrete failure modes (attrition *or* shadow IT worsening fragmentation) are gone.
**Why it matters:** this is a distinct, actionable risk argument (not just color) that a PM/sponsor might want re-surfaced when justifying urgency or scoping round 2.

### Gap #2 — "hors code" scope qualifier dropped from the mission-deliverable use case
**Brief:** consistently scopes use case #2 as "livrables de mission **hors code**" (Solution section and Scope section both use this exact qualifier).
**PRD:** refers to the same use case simply as "livrables de mission" throughout (§1 Vision, §6.1 MVP Scope, UJ-2, Doc Purpose) — the code/non-code boundary is never restated, including in §5 Non-Goals where such a scope fence would normally be recorded.
**Why it matters:** without this qualifier explicitly stated in the PRD, a later reader (architect, new tester, or someone extending scope in round 2) has no textual signal that code-related mission deliverables were deliberately excluded — they'd have to go back to the brief to learn that boundary exists at all.

### Gap #3 — The core differentiation argument ("the moat is not technological") isn't restated
**Brief:** frames two reasons as "le cœur de la différenciation": generic AI tools (ChatGPT Enterprise/Copilot) can't surface OCTO-specific methods and know-how; and efficiency comes from easy access/integration, not a superior model — concluding "le moat n'est donc pas technologique — il est dans l'intégration à l'existant OCTO et dans le savoir-faire du cabinet."
**PRD:** §4.1 cites the section by name for one mechanic (auto-inheriting drive/Mattermost) but never restates the argument itself anywhere in Vision, Why Now, or Non-Goals.
**Why it matters:** this is the single piece of reasoning most likely to be asked about by an architect or stakeholder deciding where to invest engineering effort (e.g., "why prioritize integration depth over model choice?") — currently they'd need to re-open the brief to find the answer, even though the PRD claims to build on the brief rather than duplicate it (§0), the connecting *rationale*, as opposed to its *labels*, would arguably be worth one sentence for a document meant to be read on its own during round 1.

### Gap #4 — Brief's post-round-1 growth Vision has no PRD counterpart
**Brief:** closes with "si le round 1 valide l'idée, le projet a vocation à grossir au-delà de ces deux cas d'usage initiaux — vers plus de cas d'usage et une intégration plus profonde à l'écosystème d'outils OCTO."
**PRD:** only negates round-1 ambition ("ne construit pas... ne définit pas de délai") in §5 Non-Goals; there is no positive statement of what happens if round 1 succeeds.
**Why it matters:** a reader of the PRD alone would not know the sponsor has any ambition beyond validating round 1 — useful context for anyone deciding how much architectural runway to leave (e.g., whether to hard-code assumptions that only hold for two use cases).

---

## 4. Not gaps (checked, and found to be handled well or deliberately)

- Target-reaction quote and detailed market figures: intentionally not duplicated, consistent with the PRD's stated "builds on, doesn't duplicate" policy (§0) and, for the market figures, explicitly logged in the Assumptions Index (§9).
- FR-5's mock-credibility requirement quotes the brief's exact wording — a good example of a qualitative nuance preserved precisely.
- The "no ROI, not guaranteed to connect for real" nuance is not just preserved but sharpened, via the explicit "NOTE FOR PM" flagging the mocked-vs-real-integration gap as the main follow-up risk.
- Stepper condensation of the addendum's 6-step scenario into 4 stages is disclosed via an inline `[ASSUMPTION]` rather than silently asserted as validated.
- Addendum's interpretive conclusion about market context ("not original, but a real gap worth closing at a much smaller scale") is preserved in "Why Now" even though the supporting figures are not.
