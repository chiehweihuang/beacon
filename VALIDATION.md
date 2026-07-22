# VALIDATION.md — the Beacon scoring validation charter

**Audience**: any maintainer, human or LLM (written to be executable by GPT-5.5 /
DeepSeek 4 Pro / Claude Opus 4.8 / Sonnet 5-class models with no prior session
context). Everything here is runnable from a repo checkout; nothing depends on
anyone's memory. When you change scoring or detectors, this file tells you what to run
and what "still valid" means.

**Why it exists**: until 2026-07-05 every test in this repo was *verification* (does
the code do what the code says) — all green while the score itself was broken (an
unreachable 90+ band, "Coverage" column rendering the score, constant placeholder
scores). The missing discipline was *validation* (does the number mean anything about
pages nobody hand-picked). This charter makes both kinds permanent.

---

## Layer map

| Layer | Protects | Executable artifact | Run | Pass criterion |
|---|---|---|---|---|
| L0 Reliability | same input → same output, any machine, any day | `test/golden-vectors.test.mjs` + `test/golden/`; byte-identical test in `test/static-audit-scoring.test.mjs`; CI matrix `.github/workflows/validation.yml` (3 OS × 2 Node); `tools/drift-compare.mjs` | `node --test` locally; matrix in CI | zero diffs; drift only from layer-2 capture, never from the engine |
| L1 Detector validity | each detector's P/R is measured, not assumed | regression corpora in `test/*.test.mjs`; `tools/measure-detectors.mjs` (report-only characterization); `tools/measure-semantic.mjs` (hard gate) | see `.github/workflows/ci.yml` | semantic gate: precision 1.0, recall ≥ 0.4; new detectors ship with a wild-sample FP measurement (see protocol below) |
| L2 Score semantics | the formula's promises | `test/scoring-properties.test.mjs` (monotonicity, injection dose-response, cross-stack fairness); state/renormalisation/gate/cap/ceiling tests in `test/static-audit-scoring.test.mjs` | `node --test` | all properties hold |
| L3 External validity | the number tracks the world | `benchmark/2026-07-05/` (87-site paired benchmark + harness); `benchmark/2026-07-06-ground-truth/` (20-site P/R inventory + harness) | see those READMEs | Spearman not regressing; GT re-verify on detector changes: FP classes eliminated stay eliminated, TPs retained |
| L4 Fairness | same defect → same penalty, however the site is built | cross-stack test in `test/scoring-properties.test.mjs`; life-safety gate test; four-state (never score absence) tests | `node --test` | identical finding sets + scores across dialects; gate uncircumventable |
| L5 Interpretation | the report cannot overclaim | coverage shown beside every score; `summary.score_bands` as single source; context banner | code review on report changes | see "forbidden claims" |

---

## L0 — reliability details

**Golden vectors.** `test/golden/clean.html` (must score 100 — pins the reachable top)
and `test/golden/dirty.html` (must land in the fail band with criticals). Expected
JSONs are committed. After an INTENTIONAL scoring change:

```
node test/golden/regen.mjs
git diff test/golden/     # every changed line must be explained by your change
```

**Cross-machine determinism.** The engine sorts its file list and normalises path
separators, so identical input bytes yield identical artifacts on Windows/Linux/macOS —
the CI matrix enforces it. If the matrix ever splits by OS, that is a P0 engine bug.

**Capture drift (the irreducible part).** Rendered-DOM capture varies by geo-IP, CDN
variant, consent walls, A/B bucketing, lazy-load timing. Policy:

1. Pin what is pinnable — the capture recipe: chromium build (playwright-pinned),
   viewport 1280×900, locale en-US, `domcontentloaded` + networkidle grace + 2s settle
   (see `benchmark/2026-07-05/harness/capture-audit.mjs`).
2. Measure the rest: recapture the benchmark subset on another day and/or another
   machine, then `node tools/drift-compare.mjs baseline.json candidate.json`.
3. Publish the error bar: the p95 |score delta| is the score's stated uncertainty.
   Scores within the error bar of a band boundary (90, 50) are "at the boundary", not
   in either band. A 0–100 score without an error bar is false precision.

Measured 2026-07-07 — temporal baseline, 2-day window (2026-07-05 → 2026-07-07), same
machine, 13-site subset stratified across all 7 bands (scores 40–100, 3 CJK sites),
capture recipe pinned as above (`drift-capture.mjs` in the local benchmark workspace):
median |Δscore| 0, **p95 |Δscore| 1, max 1** (rakuten −1), 0 band flips, 0 coverage
shifts, 13/13 captures ok. Stated uncertainty for same-machine scores days apart:
±1 point; scores within 1 point of a band boundary (90, 50) are "at the boundary".

Open: a longer-window (7-day+) recapture and the two-machine same-hour experiment
(yatagarasu-aw) have not been run yet; cross-machine scores still carry no published
error bar.

## L1 — new-detector shipping protocol

A detector may not feed the score until it has BOTH:
1. A regression corpus (positive + near-miss negative cases) in `test/`.
2. A wild-sample FP measurement: run it over an *unselected* real-page sample (e.g.
   the committed benchmark snapshots), adjudicate every flag (see L3 judgement rules),
   record precision. "0 FP on the corpus I wrote for it" is not evidence — that
   mistake was made repeatedly before 2026-07.

When an FP is found, name its CLASS (hidden-state, attribute-order, masked-context,
name-computation…) and ask across the whole engine: **which other detectors share this
cause?** Fix the class, not the instance.

## L2 — properties the formula must keep

- Top and bottom reachable (goldens pin both).
- Monotonicity: adding a confirmed violation never raises any score; fixing one never
  lowers any; adding compliant elements never costs points.
- Injection dose-response: known violations injected into the clean fixture degrade
  the score monotonically with dose (ground truth is the injection itself).
- Coverage and score move independently; absence of evidence is a state
  (`not-machine-checkable` / `not-applicable`, score null), never a number.
- Life-safety gate (confirmed 2.3.1 critical → overall ≤ 49) beats all weights.
- Severity repeat-cap (3 per finding key) is a CALIBRATION DECISION, revisit with
  data; the pass/fail base ratio always counts every instance.

## L3 — external validity protocol

**Paired benchmark** (`benchmark/2026-07-05/`): re-run on the stored snapshots after
any detector/scoring change (`capture-audit.mjs --audit-only`, then `analyze.mjs`);
the Spearman-vs-Lighthouse trend goes in the CHANGELOG. Lighthouse is a concurrent
reference, never ground truth (top-compressed: half the sites ≥95).

**Ground-truth P/R** (`benchmark/2026-07-06-ground-truth/`): the strongest claim.
Protocol: candidates from Beacon ∪ Lighthouse raw nodes ∪ independent sweep → every
candidate judged by the rules below → adversarial second pass re-judges every entry →
≥10% of entries human-spot-checked per round (priorities in that README) → corrections
are RECORDED, never silently edited.

**Judgement rules** (the constitution for adjudication):
- Elements inside `display:none` / `visibility:hidden` (inline), `aria-hidden="true"`,
  or `[hidden]` subtrees are outside the accessibility tree: nothing there is a
  violation OR a pass.
- `alt=""` on decorative images is CORRECT. A missing alt attribute is a violation.
- Placeholder text is not a label. Text inside aria-hidden descendants or `[hidden]`
  elements does not name a control. A wrapped `<img alt="text">` DOES name its link.
- `meta-viewport` violations mean zoom-blocking (`user-scalable=no` /
  `maximum-scale<5`), not tag presence.
- Heading order is judged on the AT-visible sequence (hidden headings excluded);
  `role="heading" aria-level` participates; native headings with `role="presentation|none"` do not (implemented in engine @8).

## L4 — fairness invariants

- **Same defect, same penalty in every dialect**: the cross-stack test renders
  identical violations in plain HTML / React-style (`data-rh`, `data-reactid`,
  attribute reordering) / Vue-style (`data-v-*`) / web-component markup and requires
  identical finding sets and scores. This test caught a real bug on its first run
  (`data-reactid` contains `id=`, which suppressed unlabelled-input findings on React
  pages only).
- CSR/SSR: thin static evidence lowers *coverage and confidence*, never the score.
- CJK-page FP rate: measured 2026-07-07 (`benchmark/2026-07-07-cjk-fp/`) — jp-tw 0.214
  vs Latin 0.017 instance-level, but 43/45 of the jp-tw FP mass is one
  non-language-related detector class (wrapping-label blindness, also fires on Latin
  sites; engine @7 fix). Residual jp-tw FP ≈ 0.01 — no evidence of CJK-text-semantics
  bias. Re-measure after detector changes.
- Not yet measured: scale fairness (per-element counting dilutes single defects on
  huge pages).

## L5 — forbidden claims

The report and any prose about Beacon may never state:
- a score without its `coverage_percent`;
- "recall" without "relative to the machine-checkable candidate pool";
- that any score demonstrates accessibility (triage signal, not completion
  certificate — cognitive load, interaction flows, reading order, and
  name-*correctness* are permanently outside static scope);
- narrative site-archetype bands (retired 2026-07-05; require a committed benchmark
  against the current formula before any revival).

---

## Release gate (run in order)

```
node --test                                   # 310+ tests, all green
node build.mjs --check                        # generated copies match core
node tools/measure-detectors.mjs              # report-only characterization
node tools/measure-semantic.mjs --min-precision 1.0 --min-recall 0.4
# benchmark re-run (needs local snapshots; see benchmark/2026-07-05/README.md):
#   node capture-audit.mjs --audit-only && node analyze.mjs
# GT re-verify on detector changes: FP-elimination kept, TPs retained
# if scoring changed intentionally: node test/golden/regen.mjs + explain the diff
```

Record in CHANGELOG: engine version, Spearman, and (when GT re-ran) P/R.

## Measured state (2026-07-22, engine `beacon-static-audit@8`)

| Metric | Value |
|---|---|
| Spearman vs Lighthouse a11y (n=71) | 0.354 (@3) → 0.474 (@4) → 0.488 (@5/@6) → 0.480 (@7) → 0.477 (@8) |
| Ground-truth P/R, pattern-level | @4: 0.600 / 0.591 → @6: 0.979 / 0.712 → @8: **1.000 / 0.727** (48/48 TPs incl. the recovered aria-heading case; FP 0) · Lighthouse 0.811 / 0.462 |
| Ground-truth recall, instance-level | @4: 0.743 → @6: 0.826 → @8: **0.829** · Lighthouse 0.225 |
| @5 re-verification | 14/15 FP classes eliminated, 39/39 TPs retained, 18 new catches |
| @7 wild input-label FP elimination | 46/57 findings were wrapped-input FPs → 0; only jnto (+20) and spotify (+8) moved |
| CJK fairness | jp-tw FP 0.214 → ~0.01 residual after @7; no CJK-text-semantics bias found |
| Score error bar, temporal (same machine, 2-day, n=13) | median 0 / p95 1 / max 1; 0 band flips |
| Score error bar, cross-machine | NOT YET MEASURED — run the two-machine experiment before quoting scores across machines |

## Open items (highest leverage first)

1. ~~rakuten link-name adjudication~~ RESOLVED 2026-07-07: walker correct (GT README).
2. ~~Full @6 GT re-mapping~~ DONE 2026-07-07: P 0.979 / R 0.712 (GT README).
3. Two-machine experiment (temporal baseline measured 2026-07-07: p95 |Δ| = 1; the
   cross-machine bar is still open) → publish the full error bar.
4. ~~CJK FP-rate measurement~~ DONE 2026-07-07 (`benchmark/2026-07-07-cjk-fp/`); its
   product: fix the wrapping-label input-label FP class (engine @7, 46/57 wild FPs).
5. ~~Engine @8 aria-heading / presentational stripping~~ GT RERUN DONE 2026-07-22:
   P 1.000 / R 0.727, FP 0 (GT README, `pr-analysis-v8.json`); benchmark rerun Spearman
   0.477, only jnto moved (+3, its presentational-heading FP gone). New known ceiling
   recorded: the outline detector reports only the FIRST level-skip per document
   (site 90 vi=4 stays missed). Class-based hiding still needs Tier-2 capture
   annotations if future benchmark evidence justifies that larger change.
