# Paired benchmark — 2026-07-05 (87 sites, Beacon vs Lighthouse a11y)

The committed benchmark the scoring engine is checked against. Before this run, no
benchmark data lived in the repo (the "44-site calibration" cited by older docs was never
committed and its narrative bands failed an external comparison). This directory is the
replacement: data, analysis, and the harness to reproduce it.

## What this is

- 87 real sites (7 a-priori quality bands: exemplar / strong / commercial / media / spa /
  builder / jp-tw), homepage rendered DOM captured via headless Chromium
  (Playwright chromium-1228, `domcontentloaded` + networkidle grace + 2s settle).
- Beacon `static-audit` run per snapshot (`--date 2026-07-05`, Tier-1 static only,
  no axe merge), paired with pre-existing Lighthouse a11y scores from the 2026-06 run
  (kept locally in `beacon-benchmark-100/raw/`, one `*-rec.json` per site).
- 71 clean pairs (rest: Lighthouse-side bot walls or capture failures; see
  `capture_failures` in the analysis JSONs).

## Headline numbers

| Engine | Spearman vs LH a11y (n=71) | Equal-weight Spearman | Notes |
|---|---|---|---|
| `beacon-static-audit@3` | 0.354 | 0.320 | first run, pre-fix |
| `beacon-static-audit@4` | **0.474** | 0.415 | after FP fixes, identical snapshots |

The @3→@4 delta is pure detector/scoring fixes (attribute-order FPs, a11y-tree-exempt
image FPs, adjacent-button undercount, per-key severity cap, frame-title detector) —
see CHANGELOG "Fixed" section and `diagnosis-summary.md` for the per-site evidence.

Weight table check: 10 weight perturbations spread Spearman across 0.16–0.40 (@3 basis) —
weights are load-bearing (screenreader weight dominates) and the current table sits near
the top of the achievable range against this reference. "Weights were never calibrated"
remains true historically; "weights are arbitrary" is refuted.

## How to read this honestly

- **Lighthouse is a concurrent-validity reference, not ground truth.** It is itself an
  axe-subset with heavy top-compression here (50.7% of sites ≥95, 28.2% =100). A rank
  correlation against it measures rule-set overlap, not correctness.
- Range restriction, per-site coverage variation (48–66% of Beacon's scoring weight),
  timing drift between the two tools' runs, and a big-brand English-heavy sample all cap
  what any correlation here can prove. Do not quote these numbers as "accuracy".
- Outlier diagnosis cut both ways: some Beacon "misses" turned out to be Lighthouse
  capture defects (discord.com: recorded LH 100 / zero failures, but a fresh live run
  scores 96 and flags the exact 6 empty links Beacon found).
- Next step that would actually upgrade this: a human-audited WCAG ground-truth subset
  (~20 sites spanning bad→good) scored against BOTH tools for precision/recall.

## Files

| File | Content |
|---|---|
| `pairs-engine3.csv` / `pairs-engine4.csv` | per-site: band, LH a11y, Beacon overall, coverage, confidence, findings |
| `results-engine3.json` / `results-engine4.json` | same plus per-category state/score/pass/fail |
| `analysis-engine3.json` / `analysis-engine4.json` | correlations, coverage tiers, band means, capture failures |
| `outliers-engine3.json` | the 10 rank-disagreement outliers that were per-site diagnosed |
| `diagnosis-summary.md` | per-outlier verdicts with evidence (what drove each fix) |
| `harness/capture-audit.mjs` | capture + audit + pairing harness (machine-specific paths: adjust `CHROME`, `SCANNER`, and run it from the local data dir) |
| `harness/analyze.mjs` | correlation / band / weight-sensitivity analysis |

Not committed: the 87 rendered HTML snapshots (site content copyright + ~100MB). They
live locally under `beacon-benchmark-100/run-2026-07-05/snapshots/`; the harness
regenerates them (page content will drift — the committed engine fingerprints in
`results-*.json` pin what was actually scored).

## Known open detector gaps (documented, not yet fixed)

- Link/button accessible-name computation counts text inside `aria-hidden` descendants
  and `<span hidden>` as a name (developer.chrome.com: 20 real icon-link failures missed;
  trello.com: hidden-label hamburger missed).
- `data-alt=` / `data-id=` substrings still suppress the corresponding FAIL detectors
  (pass counting is already immune).
- Tiny-denominator categories (1–3 checks) still swing hard on one finding; per-category
  evidence counts are in the artifacts if a confidence weighting is designed later.
