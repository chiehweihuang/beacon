# Misframings Table — Evidence Audit

Research artefact for ROADMAP Open Question 5. Branch `research/report-quality`.

**Purpose.** Grade each of the 6 rows in `commands/guide.md` "Common Misframings to
Gently Counter" table (guide.md:97-102) by the strength of its supporting evidence.
Tag each: **strong** (peer-reviewed / official / large-survey backing), **weak**
(directionally sound but the specific claim is un-sourced or imprecise), or
**needs-more** (a number or assertion that should be softened or sourced before
shipping).

Summary: 4 rows **strong**, 1 row **weak** (the "10×" number), 1 row **strong on the
core claim but with one over-precise sub-claim**. No row is pure conjecture; the
table is in good shape. Two wording fixes recommended below.

---

## Row 1 — "Is this WCAG-compliant?" → "WCAG is a floor, not a ceiling"

**Tag: strong.**

The "floor not ceiling" framing is W3C/WAI's own position. W3C Understanding WCAG
states conformance is a minimum and lists an optional conformance-claim component for
"additional steps taken that go beyond the Success Criteria". Multiple authoritative
restatements call WCAG "the floor, not the ceiling" and recommend supplementing it
with user testing.

- W3C, Understanding Conformance: https://www.w3.org/TR/UNDERSTANDING-WCAG20/conformance.html
- W3C WAI, WCAG 2 Level AA Conformance: https://www.w3.org/WAI/WCAG2AA-Conformance

Reasoning: this is not opinion; it is the standards body's own framing. Keep as is.

## Row 2 — "Just give me the accessible way" → "conventional pattern + verify with real users"

**Tag: strong (as an epistemic stance, not an empirical claim).**

This row makes no falsifiable numeric claim. It restates the same
"default vs verified" distinction the W3C conformance model implies (Row 1) and that
Beacon's own architecture is built on (ARCHITECTURE.md decision 6f, "epistemic
honesty"; guide.md:89 "conventional accessible default" vs "the accessible answer").
It is internally consistent and needs no external citation.

Reasoning: a methodological reframe, correctly scoped. Keep as is.

## Row 3 — "We can audit later" → "decisions now are roughly 10× cheaper to revise"

**Tag: weak — the *direction* is strong, the *"10×" number* is not cleanly sourced.**

The claim has two parts:
1. *Earlier fixes are cheaper.* Strongly supported. The IBM System Science Institute
   relative-cost-of-defects curve and standard SDLC research show a roughly
   order-of-magnitude rise per phase (design → test → production). Deque applies this
   "shift left" argument directly to accessibility.
2. *The multiplier is specifically 10×.* This is where it weakens. The "10×" is a
   generic software-defect heuristic transplanted onto accessibility. Deque's own
   accessibility article gives *dollar* deltas ($350 dev→QA, $450 QA→prod, up to
   $800+ in prod) that the author explicitly says are from personal metrics, "not an
   external research study". Other sources cite up to **100×** for production vs
   design. So the true figure is "somewhere between 10× and 100×, phase-dependent,
   not accessibility-specific".

Recommendation: soften "roughly 10× cheaper" → "often an order of magnitude cheaper
(the standard shift-left cost curve)". Drop the precise multiplier; keep the claim.

- Deque, shift-left numbers: https://www.deque.com/blog/doing-the-numbers-digital-accessibility-and-shifting-left/
- IBM System Science Institute defect-cost curve: https://www.researchgate.net/figure/BM-System-Science-Institute-Relative-Cost-of-Fixing-Defects_fig1_255965523
- Accessibility-specific "10× / 100×" framing: https://htdhealth.com/insights/the-true-cost-of-accessibility-why-adding-accessibility-later-can-cost-10x-more/

## Row 4 — "No disabled users on our team" → "including disabled testers is highest-leverage"

**Tag: strong.**

The claim that real-user testing with disabled people is the single highest-leverage
intervention follows directly from the Q1 coverage finding: automated + expert review
covers only ~30-40% of WCAG criteria by count; the remaining ~60-70% (task
completion, comprehension, AT interaction) is only confirmable with disabled users.
This is consistent across W3C WAI guidance, GDS practice, and Beacon's own
methodology (`generate-report.mjs` line ~558: "One session with a screen-reader user
reveals more than ten automated audit runs").

- See companion artefact `references/coverage-split-citation.md`.
- W3C WAI involving-users guidance is the standard reference for this claim.

Reasoning: a defensible synthesis of well-established evidence. Keep as is. (Minor:
the row asserts a value judgement, "one of the highest-leverage" — already correctly
hedged with "one of", so no over-claim.)

## Row 5 — "Our overlay widget handles a11y" → "overlays have a poor track record"

**Tag: strong on the core claim; one sub-clause is over-precise.**

Core claim — overlays have a poor track record with real AT users — is strongly
supported:
- WebAIM survey: **72%** of screen-reader / AT users rated overlays "not at all" or
  "not very" effective; **67%** of accessibility practitioners rate them ineffective.
- FTC fined **AccessiBe $1M (April 2025)** for misrepresenting WCAG-compliance claims.
- UserWay faced a class-action (Bloomsybox, July 2024) over "full compliance" claims.
- The Overlay Fact Sheet (Karl Groves), signed by 800+ professionals, formally states
  overlays are not an effective accessibility means.
- 800+ businesses using overlays still faced ADA lawsuits in 2023-2024.

Over-precise sub-clause: the row says overlays "are the **primary cause** of recent
ADA lawsuits against the sites that installed them." The evidence shows overlays
**fail to prevent** lawsuits and that overlay-using sites are still sued — it does
**not** establish the overlay is the *primary cause* of those suits (the underlying
inaccessibility is). This is a causal over-statement.

Recommendation: change "are the primary cause of recent ADA lawsuits against the
sites that installed them" → "do not protect against ADA lawsuits — sites that
installed them have still been sued in large numbers, and the overlay vendors
themselves have faced FTC action and class-action suits." Same force, accurate
causality.

- FTC / AccessiBe and survey data: https://www.a11y-collective.com/blog/accessibility-overlays/
- Lawsuit volume: https://www.accessibility.works/blog/avoid-accessibility-overlay-tools-toolbar-plugins/
- UserWay class action: https://accessbydesign.uk/userway-faces-class-action-lawsuit-over-alleged-false-accessibility-and-ada-compliance-claims/
- Overlay Fact Sheet: https://overlayfactsheet.com/

## Row 6 — "Will dark mode help accessibility?" → "dark mode is UX preference, not WCAG"

**Tag: strong.**

Two verifiable claims:
1. *Dark mode is not a WCAG requirement.* Correct — no WCAG 2.2 success criterion
   mandates a dark theme; WCAG 1.4.3/1.4.11 govern contrast ratios regardless of
   theme. Verifiable directly against the WCAG 2.2 spec.
2. *Half-implemented dark mode causes force-dark pain.* Browser/OS force-dark
   (Chrome `enable-force-dark`, Android auto-dark) algorithmically inverts sites
   without a native dark theme, producing unreadable contrast and image artefacts —
   well-documented browser behaviour. Beacon's own methodology treats this as a
   first-class finding type (ARCHITECTURE.md decision 6e, "eat-your-own-dog-food dark
   mode").

Reasoning: both halves are technically accurate and the row is correctly scoped as
"preference, not requirement". Keep as is.

---

## Verdict summary

| Row | Claim | Tag | Action |
|-----|-------|-----|--------|
| 1 | WCAG is a floor, not a ceiling | strong | keep |
| 2 | Conventional pattern + verify with users | strong | keep |
| 3 | Design decisions ~10× cheaper to revise | **weak** | soften "10×" → "order of magnitude / shift-left curve" |
| 4 | Disabled-user testing is highest-leverage | strong | keep |
| 5 | Overlays have a poor track record | strong core / over-precise sub-clause | fix "primary cause of lawsuits" → "do not protect against lawsuits" |
| 6 | Dark mode is UX preference, not WCAG | strong | keep |

Overall: the table is evidence-backed, not conjecture. Two surgical wording fixes
(Row 3 multiplier, Row 5 causal claim) bring it fully defensible. Both are prose edits
to `guide.md` and touch neither `generate-report.mjs` nor the JSON schema.
