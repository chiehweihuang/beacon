# Competitor Positioning Map

Research artefact for ROADMAP Open Question 4. Branch `research/report-quality`.

**Purpose.** Place Beacon against the six tools named in the roadmap (Lighthouse,
axe-core CLI, Pa11y, WebAIM WAVE, IBM Equal Access, Deque axe DevTools) and isolate
its differentiation: epistemic honesty, bilingual output, per-jurisdiction legal
framing, and lifecycle-phase coverage. This is a positioning artefact, not a claim
that Beacon is "better" — each tool is strong in its own niche.

---

## 1. Differentiation comparison table

| Tool | Engine | Lifecycle phase | Output | False-positive stance | License / cost | Notable blind spot |
|------|--------|-----------------|--------|----------------------|----------------|--------------------|
| **Lighthouse (a11y)** | Subset of axe-core | Ship / ad-hoc | Score 0-100 in DevTools / CI JSON | Conservative (inherits axe) | Free, OSS | Runs only a *subset* of axe-core rules, so strictly less complete than axe; single page; no crawl, no manual-review prompts |
| **axe-core CLI** | axe-core | Code / CI | JSON | Very conservative — reports only unambiguous violations; also emits "incomplete" items needing review | Free, OSS (MPL-2.0) | No human-judgement layer; "needs review" items punted to the integrator; no narrative, no legal context |
| **Pa11y** | HTML_CodeSniffer by default (axe-core available as alternate runner) | Code / CI | JSON / HTML / CLI | Moderate — HTML_CodeSniffer flags more borderline items than axe | Free, OSS | Takes a URL, not DOM-level access; "less flexible" than axe for deep scenarios; default engine is older than axe |
| **WebAIM WAVE** | WebAIM's own engine | Ship / manual audit | In-page visual overlay + per-page report | Liberal — flags many borderline items as "alerts" for a human to judge | Free (web); paid API | Per-page only, not built for continuous monitoring or CI; visual overlay assumes a human reviewer present |
| **IBM Equal Access** | IBM Equal Access Ruleset | Code / ship | DevTools panel + report + CI Node packages | Moderate; maps findings to WCAG 2.0/2.1/2.2, Section 508, EN 301 549 | Free, OSS | Engine-and-checklist tool; no design-phase guidance, no narrative remediation prose |
| **Deque axe DevTools (Pro)** | axe-core + guided tests | Code / ship | DevTools panel, guided manual tests, Jira export | Very conservative core + guided manual flows | Freemium; Pro is per-seat paid | Pro features (component checks, flows, dedup, AI fix) are paywalled; centred on the developer's browser, not the design or report-sharing phase |
| **Beacon** | axe-core (Tier 2) + static heuristics (Tier 1) + agent reasoning | **Design → code → ship (all three)** | `audit-results.json` + interactive bilingual HTML report | Three-state `pass / fail / unverifiable` — does not penalise what static analysis genuinely cannot see | Free, OSS (Claude Code plugin) | Depends on an LLM agent runtime; no standalone CLI; single-page audits; not a CI-native scanner |

---

## 2. Where Beacon is genuinely differentiated

Three claims hold up against the comparison; one is weaker than the roadmap implies.

### 2a. Epistemic honesty — **genuinely distinct**
Every other tool reports findings as fact. axe-core has an "incomplete / needs
review" bucket, which is the closest analogue, but it hands those items to the
integrator silently. Beacon is the only tool in the set that (a) carries a
first-class `unverifiable` verdict that is *excluded from the score denominator*
rather than counted as a pass or a fail, and (b) ships a visible
"this is ~30-40% of what matters" banner and a dedicated Methodology & Limits tab.
No competitor surfaces its own coverage ceiling inside the report. See
ARCHITECTURE.md section 6f and section 3 ("Three-state verdict").

### 2b. Lifecycle-phase coverage — **genuinely distinct**
Every competitor is a *ship-phase* or *code-phase* checker. None addresses the
*design* phase. Beacon's `/beacon:guide` (pre-code pattern recommendations) plus
`/beacon:advisor` (in-editor PostToolUse hook) plus `/beacon:inspect` (post-code
audit) is a three-phase pipeline (ARCHITECTURE.md section 1). The differentiation is
not "better auditing" — axe DevTools Pro audits more thoroughly — it is *catching
accessibility intent before code exists*, which no scanner does.

### 2c. Per-jurisdiction legal framing — **genuinely distinct, with a caveat**
IBM Equal Access maps findings to Section 508 and EN 301 549 *as standards*. Beacon
goes further: `legal_risk.jurisdictions[]` in the schema produces per-jurisdiction
*risk levels and narrative* (US ADA Title III, EU EAA, etc. — see
`references/legal-brief.md` and `references/cases.md`). Caveat: this is heuristic
legal-exposure framing, not legal advice, and the heuristics themselves are
un-cited (a separate roadmap concern). The *feature* is distinct; its *evidentiary
strength* is a separate open question.

### 2d. Bilingual output — **a real feature, weaker as differentiation**
Beacon renders zh-Hant + en into one HTML file with a CSS-class toggle
(ARCHITECTURE.md 3, decision 6d). No competitor in the set ships a built-in
bilingual report. But this is differentiation *for a specific audience* (the
zh-Hant-default user, decision 6g), not a general competitive moat — an
English-only team gains nothing from it. Position it as audience fit, not as a
universal advantage.

---

## 3. Where Beacon is *not* competitive (honest limits)

- **CI-native scanning**: axe-core CLI and Pa11y are purpose-built for pipelines.
  Beacon has no standalone CLI; it runs inside a Claude Code agent. For a
  regression-gate use case, Beacon should *recommend* axe-core/Pa11y, not replace
  them — `commands/inspect.md` already does this (it runs axe-core via Playwright in
  Tier 2 rather than reinventing it).
- **Audit depth**: axe DevTools Pro's guided manual tests and component-level checks
  exceed Beacon's static + single-axe-pass coverage.
- **Multi-page / crawl**: every audit Beacon produces is single-page. Lighthouse CI
  and commercial crawlers cover whole sites.

---

## 4. One-line positioning statement

> Beacon is not another scanner. It is a design-to-ship accessibility *advisor* that
> wraps axe-core with an LLM agent, is honest about the ~30-40% of WCAG it can verify,
> and frames findings as per-jurisdiction legal exposure in the user's language.
> For CI regression gating, it defers to axe-core CLI / Pa11y rather than competing.

---

## Sources

- Free tool comparison (axe vs WAVE vs Lighthouse vs Pa11y), inclly:
  https://inclly.com/resources/accessibility-testing-tools-comparison
- axe DevTools vs Lighthouse, inclly:
  https://inclly.com/resources/axe-vs-lighthouse
- Pa11y practical guide (engine, CI, output formats), Ramotion:
  https://www.ramotion.com/blog/practical-accessibility-testing-with-pa11y-and-axe-core/
- IBM Equal Access review (ruleset, standards coverage, CI packages), Sparkbox:
  https://sparkbox.com/foundry/ibm_equal_access_evaluation_tool_website_accessibility_audit_website_accessibility_checker
- axe DevTools Pro feature set, Chrome Web Store listing:
  https://chromewebstore.google.com/detail/axe-devtools-web-accessib/lhdoppojpmngadmnindnejefpokejbdd
- 30-40% automated coverage shared limitation across all tools: see companion
  artefact `references/coverage-split-citation.md`.
- Beacon internals: `ARCHITECTURE.md` sections 1, 3, 6; `commands/inspect.md`;
  `references/legal-brief.md`.
