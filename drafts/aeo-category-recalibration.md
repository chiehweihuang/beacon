# Draft: AEO Category Recalibration for inspect.md

Research artefact (draft) — Beacon self-research loop, Session B.
Branch: `research/aeo-evidence`. Date: 2026-05-20.

> This is a **draft proposal**, not an applied change. It is grounded in
> `references/aeo-signal-evidence.md` and `research/aeo-engine-comparison.md`.
> It respects the three iron rules: it does not touch `generate-report.mjs`, does not
> change `audit-results.json` schema, and proposes only skill-prose edits to
> `commands/inspect.md`. Applying it is a decision for the main session.

## Problem statement

`commands/inspect.md` presents the AEO sub-score and category 3i as if every signal is
an established AI-citation lever. The evidence does not support that uniformity:

- Only 2 of 11 signals (content-in-HTML, robots/noindex absence) have strong evidence.
- The single peer-reviewed study (GEO, KDD 2024) tested **zero** HTML signals — it
  found the real citation wins are in content body (quotations, statistics, sourced
  claims), which the AEO category does not check at all.
- The FAQ-schema line is partly stale (Google retired FAQ rich results; FAQ markup is
  not weighted as an AI surface signal).
- The AI-crawlability `+N` weights are presented as if equally evidenced; `+30`
  content-in-HTML is strong, `+10` sitemap is speculative.

This understates uncertainty in a way that contradicts Beacon's own epistemic-honesty
principle (ARCHITECTURE §6f: limitations are first-class content, not hidden).

## Proposed change 1 — add an evidence-tier label to each 3i AEO bullet

Minimal, non-structural. Append a tier tag to each Answer-Engine-Optimization bullet in
category 3i. No score logic changes; this is prose only.

Draft replacement for the "Answer Engine Optimization (AI agents)" sub-list in 3i:

```
*Answer Engine Optimization (AI agents):*

Evidence tiers below: [strong] = controlled study / official engine statement;
[weak] = correlational / indirect / vendor-sourced; [speculative] = inferred from
how crawlers are assumed to work, no primary evidence. See references/aeo-signal-evidence.md.

- [strong] Content is in the HTML (not hidden behind JS-only rendering) — GPTBot,
  ClaudeBot, PerplexityBot do not execute JavaScript; CSR-only content is invisible
  to them. (Most critical for Perplexity/ChatGPT; less so for Google AI Overviews,
  which inherits Googlebot's rendered index.)
- [strong] No `<meta name="robots" content="noindex">` on pages meant to be
  discoverable — a noindex/disallow directive is a hard exclusion gate.
- [weak] Schema.org structured data present (JSON-LD preferred): Article, Product,
  Organization, BreadcrumbList. Helps engines parse the page; Google states it is NOT
  a ranking factor. Most useful when the target is Google AI Overviews.
- [weak] `<meta name="description">` present and descriptive — crawlers reportedly
  read description fields, but Google increasingly replaces author meta descriptions
  with AI-generated summaries.
- [weak] Canonical URL set (`<link rel="canonical">`) — affects which URL gets
  attribution/credit when cited, not whether the page is cited.
- [weak] Open Graph / Twitter Card metadata present — practitioner reports that
  crawlers read og:* fields; no primary study.
- [weak] Heading outline forms a coherent document structure — headings delimit
  extractable passages; strong practitioner consensus, no controlled AEO study.
- [speculative] Sitemap.xml referenced — a crawl-discovery aid; no evidence it changes
  AI citation rate.
- [speculative] Tables have `<caption>` and `<th>` — plausible AI extracts well-formed
  tables; recommended for accessibility regardless, but the AEO benefit is inferred.
- [speculative] Internal links use descriptive anchor text — reasonable SEO inference,
  no primary AEO evidence.

FAQ content: keep `<details>/<summary>` as an accessibility recommendation. NOTE: FAQ
schema is no longer an AI-citation signal — Google retired FAQ rich results and FAQ
markup is not weighted as an AI surface signal. Do not present FAQ schema as an AEO win.
```

## Proposed change 2 — add a content-substance note

The GEO study's finding is the single most actionable thing in this whole research
loop, and the AEO category currently omits it. Proposed addition at the end of 3i:

```
*Content substance (the strongest evidence in the field):*

The one peer-reviewed study on generative-engine visibility (GEO, Aggarwal et al.,
KDD 2024) found the largest citation gains come from content-body changes, not markup:
adding direct quotations (~40% visibility lift), adding statistics (~30-40%), and
citing credible sources (~30%). Keyword stuffing produced little or negative effect.

Beacon's AEO checks are structural/metadata only — they do not assess content
substance. When reporting the AEO sub-score, note this scope limit: a high AEO
sub-score means the page is machine-readable, NOT that its content is citation-worthy.
```

## Proposed change 3 — reframe the AI-crawlability sub-score weights

The current additive formula in step 2a:

```
Content in HTML (not JS-only): +30
Schema.org present: +20
Meta description present: +15
Heading outline coherent: +15
Canonical URL set: +10
Sitemap referenced: +10
```

The weights do not track evidence strength: `+10` sitemap (speculative) sits close to
`+15` meta description (weak) and `+20` schema (weak), while the only two strong signals
are content-in-HTML and noindex-absence — and noindex is not even in the formula.

Proposed revised weighting (keeps 0-100 total, no schema change, prose-only):

```
Content in HTML (not JS-only): +35      [strong]
No noindex/robots block on the page: +20 [strong]  <-- newly added to the formula
Schema.org present: +15                 [weak]
Heading outline coherent: +15           [weak]
Meta description present: +10           [weak]
Canonical URL set: +5                   [weak]
Sitemap referenced: +0 (report as a tip, not scored)  [speculative]
Total: 0-100
```

Rationale: the two strong signals carry the majority of the score; sitemap drops out of
scoring because no evidence supports it moving the number. This keeps the sub-score a
0-100 metric and changes no JSON schema (the sub-score is already a single number in
the report, per ROADMAP "AEO sub-score is computed implicitly").

## What this draft deliberately does NOT propose

- No change to `audit-results.json` schema (iron rule 2).
- No change to `generate-report.mjs` (iron rule 1).
- No new skill, no new category, no new finding type. The AEO category stays at 5%
  overall weight.
- No addition of `llms.txt` checking — see `research/aeo-engine-comparison.md` for the
  evidence-based rejection.

## Revisit triggers

- If a controlled study isolates schema or heading structure as a *causal* citation
  lever, upgrade those signals from weak and revisit the weighting.
- If a major answer engine publicly commits to `llms.txt`, reopen that decision.
- If Beacon ever adds content-substance checks, change 2's note becomes a real category
  rather than a disclaimer.

## Sources

All citations are in the two companion artefacts:
- `references/aeo-signal-evidence.md`
- `research/aeo-engine-comparison.md`
Primary study: GEO: Generative Engine Optimization — arXiv 2311.09735, KDD 2024.
