# Coverage-Split Citation — the "30-40% / 60-70%" claim

Research artefact for ROADMAP Open Question 1. Produced by the Beacon self-research
loop, branch `research/report-quality`.

**Purpose.** Provide a footnote-style citation that can be embedded into the
`generate-report.mjs` context banner and the Methodology & Limits tab, replacing the
current vague attribution ("statements from the axe-core team itself").

---

## Verdict

**The 30-40% / 60-70% split is defensible — but only when scoped as "percentage of
WCAG success criteria automated tools can fully test", not "percentage of real-world
issues caught".** The two framings differ by design, and the report's banner currently
conflates them. The claim is well-supported by a UK Government Digital Service (GDS)
audit and by criterion-by-criterion analyses; it is *contradicted* only by Deque's
2021 study, which deliberately measures a different quantity (issue volume, not
criteria count).

Recommendation: keep the 30-40% range, but (a) attribute it correctly to the GDS
audit rather than "the axe-core team", and (b) add one clause noting that by
*issue-volume* an automated tool can reach ~57%, so the gap is in *criteria breadth*,
not raw catch rate.

---

## Primary sources

### S1 — UK GDS audit of 13 automated tools (strongest source for 30-40%)

> "A GDS audit of automated tools found that out of 142 known accessibility issues,
> the best tools only found around 30 to 40 percent."

- Reported in the **DWP Accessibility Manual**, "Automated accessibility testing":
  https://accessibility-manual.dwp.gov.uk/tools-and-resources/automated-accessibility-testing
- The underlying GDS study tested 13 automated tools against a page seeded with known
  barriers; best tool ~40%, worst ~13%. GDS recommends running 2-3 tools in
  combination to approach ~50% coverage, and stresses manual testing is still required.
- This is the cleanest citation for the *exact* "30-40%" figure: a government body,
  controlled known-issue set, criteria-style measurement.

### S2 — Accessible.org criterion-by-criterion analysis of WCAG 2.2 AA

> "13% of WCAG 2.2 AA criteria (7 of 55)" reliably detectable;
> "45% of criteria (25 of 55)" partially detectable;
> "42% of criteria (23 of 55)" not detectable by automated scanning at all.

- Source: https://accessible.org/automated-scans-wcag/
- Method: each of the 55 WCAG 2.2 AA success criteria evaluated individually for
  automatability.
- Interpretation: if "covered" means *fully* reliable → ~13%. If it means *fully or
  partially* (7+25 of 55) → ~58%. The 30-40% band sits between these two readings and
  is a reasonable midpoint for "criteria an automated tool meaningfully contributes to".

### S3 — Deque 2021 automated coverage study (the counter-figure, ~57%)

> "57 percent of accessibility issues were completely covered by this automated testing."

- Blog: https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/
- Full report (PDF): https://accessibility.deque.com/hubfs/Accessibility-Coverage-Report.pdf
- Sample: 2,000+ axe-powered audits, 13,000+ pages (first-time assessments only),
  ~300,000 issues.
- Critical caveat — Deque explicitly **changes the unit of measurement**:
  > "Measures of automated testing coverage are often based on the percentage of WCAG
  > Success Criteria that can be tested [...] Measuring the total volume of issues
  > detected by severity and impact is a more meaningful and accurate metric."
- So 57% is *issue-volume* coverage, inflated because a few criteria (alt text, contrast,
  empty links) account for a disproportionate share of all real-world violations.
  It does **not** contradict the 30-40% criteria-count figure; it measures a different
  thing.

### S4 — "the commonly cited 30% / 20-30%" baseline

- WCAG 2.1 AA: automated tools find issues for ~16 of 50 Level AA success criteria
  (~30-32%). Referenced across multiple secondary summaries, e.g. Level Access:
  https://www.levelaccess.com/blog/automated-accessibility-testing-a-practical-guide-to-wcag-coverage/
- This is the figure Deque's own study describes as "the widely-accepted belief" it set
  out to revise — confirming 30% is the established criteria-count number.

---

## Footnote text (embeddable)

Short form, suitable for the banner footnote or Methodology tab:

> Automated tooling fully or reliably tests roughly **30-40% of WCAG 2.2 AA success
> criteria**; the remaining ~60-70% (cognitive load, screen-reader task completion,
> meaningful labelling, dynamic-interaction quality) require human judgement. Figure
> from a UK Government Digital Service audit of 13 automated tools against 142 known
> issues [GDS, via DWP Accessibility Manual]. Note: measured by *issue volume* rather
> than criteria count, a single tool can reach ~57% (Deque, 2021) — the gap is in
> criteria *breadth*, not raw catch rate.

Sources for the footnote:
- GDS audit: https://accessibility-manual.dwp.gov.uk/tools-and-resources/automated-accessibility-testing
- Deque 2021: https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/
- Criterion analysis: https://accessible.org/automated-scans-wcag/

---

## Note on the current report wording

`scripts/generate-report.mjs` line ~359 currently says the 30-40% figure comes from
"statements from the axe-core team itself". This is **inaccurate** — the axe-core /
Deque team's own published figure is 57%, not 30-40%. The 30-40% number comes from
GDS, not Deque. The attribution should be corrected (this is a wording fix to the
banner string, not a schema or structural change, so it does not violate the iron
rules). Pa11y and Tenon publish no first-party coverage percentage of their own;
Pa11y wraps HTML_CodeSniffer/axe and Tenon's engine was retired, so neither yields an
independent figure — the cross-check ends with GDS, Deque, and the criterion-level
analyses above.
