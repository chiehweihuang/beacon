# Q3 — Is suggestion-toned verdict vocabulary actually preferred by developers?

Research artefact for ROADMAP.md Open Question 3. Research only; proposes nothing in product code.

- **Question (ROADMAP.md:81)**: "Is the suggestion-toned vocabulary (Meets baseline / Consider improving / Priority review recommended) actually preferred by developers over the judgemental vocabulary (PASS / NEEDS WORK / FAIL)? This is a UX-research question, not a technical one."
- **Status**: literature survey complete. No Beacon-specific user study exists. Verdict below is a judgement call backed by a strong, convergent external evidence base, explicitly labelled where it is inference rather than direct measurement.

---

## 1. What Beacon currently does

The v2.0.7 tone pass (ROADMAP.md:30, ARCHITECTURE.md:307-309) replaced judgemental verdict labels with suggestion-toned ones. The exact mapping lives in `scripts/generate-report.mjs`:

| Score band | EN label (`generate-report.mjs:176-178`) | ZH label (`:107-109`) | Pre-pass label |
|---|---|---|---|
| `>= 90` | `Meets baseline` | `達到基準` | PASS / 通過 |
| `50-89` | `Consider improving` | `建議考慮改進` | NEEDS WORK / 需改進 |
| `< 50` | `Priority review recommended` | `建議優先檢視` | FAIL |

Selection logic — `scoreLabel()` at `generate-report.mjs:242-246`:

```js
function scoreLabel(score) {
  if (score >= 90) return t('verdict_pass');
  if (score >= 50) return t('verdict_needs_work');
  return t('verdict_fail');
}
```

The same suggestion-toned pattern was extended to per-finding labels (`verdict_critical: 'higher priority'` not "CRITICAL", `generate-report.mjs:180`) and remediation priorities (`rem_p0: 'P0 — 建議優先處理'`, `:136`). The comment in the source is explicit about intent: `// Verdict (suggestion-toned, not judgmental)` (`generate-report.mjs:106`).

The tone pass is **incomplete and asymmetric** (ROADMAP.md:35-66): `commands/inspect.md` and `commands/advisor.md` skill prose, the legal risk-level badges (`buildLegalRiskHTML` uppercases to "HIGH"/"MEDIUM", ROADMAP.md:48), and the PostToolUse hook output (`a11y-advisor-hook.mjs`, ROADMAP.md:60) all still speak in pre-pass judgemental language. So today a user can read "Meets baseline" in the rendered report and "FAIL"-equivalent imperative phrasing in the hook checklist for the same project. This asymmetry is itself a finding: see section 5.

---

## 2. The evidence base

There is no controlled study of "PASS/FAIL vs Meets baseline/Consider improving" in an accessibility tool specifically. But the question decomposes into three sub-claims, each of which *does* have evidence:

1. Judgemental, blaming, or fault-attributing language in dev tools causes measurable negative reactions.
2. Those negative reactions translate into reduced tool use / avoidance.
3. Neutral, non-blaming framing is the established UX-writing standard for tool feedback.

### 2a. Controlled / empirical evidence — judgemental tone has measurable cost

**Gunawardena et al., "Destructive Criticism in Software Code Review Impacts Inclusion" (ACM CSCW 2022).** The strongest single source. An anonymous questionnaire, n=93 developers (43 women, 43 men, 3 non-binary, 4 undisclosed), each evaluating one constructive and one destructive code-review comment. *Destructive criticism* is defined as feedback that is "both nonspecific and inconsiderate" — inconsiderate meaning a harsh tone or attributing poor performance to a flaw of the individual. Findings: destructive feedback was rated "less appropriate, less valid, and less likely to help improve the code quality" than constructive criticism, and "negatively impacts motivation to continue working and mood." 22% of respondents reported receiving inconsiderate negative feedback at least once a year; women and non-binary participants rated destructive criticism as significantly less appropriate and reported lower motivation after receiving it. This is direct evidence that *how* a true finding is phrased changes whether developers act on it and how they feel — independent of the finding's substantive correctness.
Source: https://hasel.auckland.ac.nz/2022/02/23/destructive-criticism-in-software-code-review-impacts-inclusion/ — paper: https://dl.acm.org/doi/abs/10.1145/3555183

**El Asri et al. / "Predicting developers' negative feelings about code review" (ICSE 2020).** Large-scale study modelling which review characteristics predict negative emotional reactions. Confirms that tone (linguistic markers such as second-person pronouns, negation, "bitter frustration" and "impatience" tones) predicts negative feeling independent of the technical content. Toxic-tone conversations correlate with authors becoming "afraid to express themselves" and eventually leaving projects.
Source: https://dl.acm.org/doi/10.1145/3377811.3380414

**Static-analysis adoption literature.** Multiple empirical studies converge: high false-positive rates and "imprecise and misleading messages" are primary reasons developers ignore or suppress linter / static-analysis warnings, and "consistently undermine developer trust in analysis tools and reduce the likelihood of continuous use." This is the adoption-loss mechanism (sub-claim 2) shown empirically. Note: this evidence is about *message quality and trust*, and a judgemental label is one form of "misleading message" — it asserts a definitive verdict (FAIL) that a ~30-40%-coverage tool cannot actually support. Beacon's own methodology banner concedes the score is "~30-40% of what matters" (ARCHITECTURE.md:321), so a hard "FAIL" would itself be an overclaim, the exact thing that erodes trust.
Sources: An Empirical Study of Suppressed Static Analysis Warnings (FSE 2025) https://software-lab.org/publications/fse2025_suppressions.pdf · The Adoption of JavaScript Linters in Practice (ESLint case study) https://www.researchgate.net/publication/327757757_The_Adoption_of_JavaScript_Linters_in_Practice_A_Case_Study_on_ESLint

**Self-conscious-emotions / technology-adoption research (Dias et al., *Psychology & Marketing* 2026).** Outside software engineering but directly on mechanism: embarrassment and shame act as "sequential emotional barriers" that hinder technology adoption, and shame can "evolve into avoidant behavior, in which the individual actively avoids similar consumption situations." This is the academic articulation of Beacon's stated rationale — "developers who feel judged by a tool tend to skip it" (ARCHITECTURE.md:309).
Source: https://onlinelibrary.wiley.com/doi/10.1002/mar.70048

### 2b. Practitioner / design-system guidance — converges on the same answer

This tier is opinion, not controlled study, but it is remarkably consistent and comes from the most authoritative UX-writing sources.

**Nielsen Norman Group, "Error-Message Guidelines."** Explicit: "Don't use phrasing that blames users or implies they are doing something wrong, such as invalid, illegal, or incorrect"; use "a positive and nonjudgmental tone of voice." Rationale: "The proper usage of any system lies with its creators and not with the system's users, so the system must gracefully adapt and not shift blame." Grounded in Nielsen's Heuristic #9.
Source: https://www.nngroup.com/articles/error-message-guidelines/

**Elm compiler philosophy (Evan Czaplicki).** A landmark case in dev-tool tone. Stated design goal: "compilers should be assistance, not adversaries." Elm's friendly, non-judgemental, example-rich error messages were widely praised (John Carmack among others) and were explicitly the model Rust's `rustc` error overhaul learned from (Rust RFC 1644). This is the closest real-world precedent to Beacon's reframing — and the industry verdict on it was strongly positive.
Sources: https://blog.rust-lang.org/2016/08/10/Shape-of-errors-to-come/ · https://rust-lang.github.io/rfcs/1644-default-and-expanded-rustc-errors.html · https://news.ycombinator.com/item?id=39923127

**Google Engineering Practices ("How to write code review comments").** "People tend to get more upset about the tone of comments rather than reviewers' insistence on quality"; make comments "about the code and never about the developer"; reviewers "should not be accusatory." Note this guidance keeps the substance fully intact — it changes framing, not standards. That is exactly Beacon's intended move (ARCHITECTURE.md:309: "keeps the substance ... but reframes the relationship").
Source: https://google.github.io/eng-practices/review/reviewer/comments.html

General UX-writing guidance (Smashing Magazine, UX Content Collective, UserTesting) repeats the same line: avoid "Error", "Failed", "Denied", "Invalid"; describe the issue, not a person's failure.

### 2c. Evidence on the other side — where suggestion-tone can backfire

Honest counter-evidence. It is real but narrower than the case for neutral tone.

1. **Vagueness risk.** Business- and technical-communication research is consistent that euphemism trades clarity for softness: "the very purpose of euphemism is to be vague"; "when it comes to matters of health or safety, directness leads to comprehension." If "Priority review recommended" causes a developer to *not* register that a page is below WCAG 2.2 AA — a legal-exposure fact — softness has destroyed information. The Beacon labels mostly avoid this (they keep the literal score and the WCAG criterion visible), but the verdict *word* alone is now ambiguous: "Consider improving" spans a 40-point band (50-89) that previously read as a single blunt "NEEDS WORK". Counter-source: https://readabilityguidelines.co.uk/clear-language/error-messages/
2. **Developer subculture preference for bluntness.** The CSCW 2022 study itself records that developers disagree: "some advocating for polite comments while others saying direct feedback may be easier to parse." A segment of developers reads softened verdicts as condescending or as the tool hiding the ball. There is no measurement of how large this segment is.
3. **Action-threshold erosion.** A "FAIL" creates a clear stop-the-line signal in CI and in a developer's mental model. "Priority review recommended" is a recommendation, and recommendations are easier to defer. No study measures this for accessibility tools specifically; it is a plausible mechanism, not a demonstrated effect. Flagged as conjecture.

The counter-evidence argues against *vague* tone, not against *non-judgemental* tone. The two are separable, and the literature that warns about vagueness (2c) and the literature that warns about blame (2a/2b) are not in conflict — they jointly point to: non-blaming **and** specific.

---

## 3. Verdict

**The suggestion-toned vocabulary is the better-supported choice — but the support is for "non-judgemental + specific", and Beacon's current labels are only partly there.**

Confidence: **moderate-to-high** that non-judgemental framing beats blaming framing for tool adoption and developer trust. This rests on convergent evidence — one strong controlled study (CSCW 2022), a large empirical study (ICSE 2020), a consistent static-analysis-adoption literature, and unanimous practitioner guidance from the most authoritative sources, plus a successful real-world precedent (Elm/Rust). Convergence across study types is what raises confidence above any single source.

Confidence: **low** that Beacon's *specific* current strings ("Meets baseline" / "Consider improving" / "Priority review recommended") are optimal. No study tested these exact words. "Meets baseline" is good (factual, non-judgemental, accurate to what a ~30-40%-coverage tool can claim). "Consider improving" is the weakest — it is the most euphemistic and covers too wide a band. "Priority review recommended" is defensible but, per 2c.3, may under-signal in a CI gate context.

What the evidence does **not** support: a claim that developers, surveyed directly, would *prefer* the new wording in a head-to-head. That specific preference question is genuinely untested and remains a judgement call. The defensible claim is the weaker, sturdier one: judgemental labels carry a measurable adoption and trust cost that neutral labels avoid, and Beacon as a ~30-40%-coverage tool cannot honestly assert a hard "FAIL" anyway — so the tone pass also improved epistemic accuracy, not just feelings.

---

## 4. Recommendation

1. **Keep the suggestion-toned direction.** It is the better-evidenced default and consistent with Beacon's own epistemic-honesty stance (a tool that says "this is ~30-40% of what matters" cannot coherently also stamp "FAIL").
2. **Fix the asymmetry before refining wording.** The largest concrete problem is not the labels — it is that `a11y-advisor-hook.mjs` (the most-seen surface, ROADMAP.md:60), `inspect.md`, `advisor.md`, and the legal badges still use judgemental language while the report does not. Inconsistent tone within one tool is worse than either tone applied consistently: it reads as unconsidered. This is ROADMAP items 2 and 6.
3. **Treat "specific" as non-negotiable alongside "non-judgemental."** The counter-evidence (2c) is real. Every softened verdict must keep the literal score, the WCAG criterion, and the affected user group adjacent and unsoftened. Beacon mostly does this already; the rule should be explicit so future edits don't drift toward pure euphemism.
4. **Reconsider "Consider improving" specifically.** It is the weakest string: most euphemistic, widest band (50-89). A two-band split or a more concrete phrasing ("Below AA on N checks") would lose less information. This is a wording tweak, not a direction change — and is the one place a small paper exercise or A/B with real developers would have the highest value-per-effort.
5. **If a study is ever run**, the right design is a within-subjects paper exercise: same audit JSON, two rendered reports differing only in verdict strings, measure (a) self-reported likelihood of acting on findings, (b) perceived tool credibility, (c) comprehension check ("is this page WCAG 2.2 AA compliant?" — guards against the vagueness failure mode). Sample should over-recruit so the "prefers bluntness" segment (2c.2) is visible rather than averaged away.

ROADMAP item 3 can be marked **answered with moderate-to-high confidence on direction, low confidence on exact strings**. It does not need a full controlled study to proceed; it needs the asymmetry fixed and the "Consider improving" string reconsidered.

---

## 5. Sources

Controlled / empirical (strongest):
- Gunawardena, Devine, Beaumont, Garden, Blincoe, Murphy-Hill — "Destructive Criticism in Software Code Review Impacts Inclusion", ACM CSCW 2022 — https://dl.acm.org/doi/abs/10.1145/3555183 — lab summary with statistics: https://hasel.auckland.ac.nz/2022/02/23/destructive-criticism-in-software-code-review-impacts-inclusion/
- "Predicting developers' negative feelings about code review", ICSE 2020 — https://dl.acm.org/doi/10.1145/3377811.3380414
- "An Empirical Study of Suppressed Static Analysis Warnings", FSE 2025 — https://software-lab.org/publications/fse2025_suppressions.pdf
- "The Adoption of JavaScript Linters in Practice: A Case Study on ESLint" — https://www.researchgate.net/publication/327757757_The_Adoption_of_JavaScript_Linters_in_Practice_A_Case_Study_on_ESLint
- Dias et al., "Self-Conscious Emotions in Technology Adoption", Psychology & Marketing 2026 — https://onlinelibrary.wiley.com/doi/10.1002/mar.70048

Practitioner / design-system guidance (consistent, but opinion not study):
- Nielsen Norman Group, "Error-Message Guidelines" — https://www.nngroup.com/articles/error-message-guidelines/
- Google Engineering Practices, "How to write code review comments" — https://google.github.io/eng-practices/review/reviewer/comments.html
- Rust Blog, "Shape of errors to come" — https://blog.rust-lang.org/2016/08/10/Shape-of-errors-to-come/
- Rust RFC 1644 (default & expanded rustc errors) — https://rust-lang.github.io/rfcs/1644-default-and-expanded-rustc-errors.html
- Smashing Magazine, "Designing Better Error Messages UX" — https://www.smashingmagazine.com/2022/08/error-messages-ux-design/
- UX Content Collective, "How to write error messages" — https://uxcontent.com/how-to-write-error-messages/

Counter-evidence (vagueness / clarity):
- Readability Guidelines (UK), "Error messages" — https://readabilityguidelines.co.uk/clear-language/error-messages/
- (Bluntness-preference counter-point is recorded within the CSCW 2022 study itself.)

Repo references:
- `ROADMAP.md:81` (question), `ROADMAP.md:30` (v2.0.7 tone pass), `ROADMAP.md:35-66` (asymmetries)
- `ARCHITECTURE.md:307-309` (tone-pass design decision), `ARCHITECTURE.md:321` (~30-40% epistemic-honesty claim)
- `scripts/generate-report.mjs:106-113` (ZH verdict strings + intent comment), `:176-182` (EN verdict strings), `:242-246` (`scoreLabel()` band logic)
- `commands/inspect.md:654` ("Needs work" score-band prose, pre-tone-pass language)
