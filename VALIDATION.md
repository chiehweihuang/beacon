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
| L3 External validity | the number tracks the world | 3,700-site survey mother cohort ([snapshot](benchmark/2026-08-13-survey-3700.md)); `benchmark/2026-07-05/` (87-site paired benchmark + harness); `benchmark/2026-07-06-ground-truth/` (20-site P/R inventory + harness); `test/wild-corpus/` (40 real captured pages, per-key counts frozen) | see those READMEs; `node --test` for the corpus | survey drives stratified samples but never substitutes for adjudication; Spearman not regressing; GT re-verify on detector changes; wild-corpus diffs explained line by line |
| L4 Fairness | same defect → same penalty, however the site is built | cross-stack test in `test/scoring-properties.test.mjs`; life-safety gate test; four-state (never score absence) tests | `node --test` | identical finding sets + scores across dialects; gate uncircumventable |
| L5 Interpretation | the report cannot overclaim | coverage shown beside every score; `summary.score_bands` as single source; context banner | code review on report changes | see "forbidden claims" |

---

## L0 — reliability details

**Golden vectors.** `test/golden/clean.html` (must score 100 — pins the reachable top)
and `test/golden/dirty.html` (must land in the fail band with criticals). Expected
JSONs are committed. After an INTENTIONAL scoring change:

```
node tools/regen-golden.mjs
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

The lifecycle and SemVer boundary are normative in
[RELEASE-POLICY.md](RELEASE-POLICY.md): new detectors begin as review-only evidence and
can enter scoring only in a minor release after their predeclared evidence gate passes.

A detector may not feed the score until it has BOTH:
1. A regression corpus (positive + near-miss negative cases) in `test/`.
2. A wild-sample FP measurement: run it over an *unselected* real-page sample (e.g.
   the committed benchmark snapshots), adjudicate every flag (see L3 judgement rules),
   record precision. "0 FP on the corpus I wrote for it" is not evidence — that
   mistake was made repeatedly before 2026-07.

When an FP is found, name its CLASS (hidden-state, attribute-order, masked-context,
name-computation…) and ask across the whole engine: **which other detectors share this
cause?** Fix the class, not the instance.

**Measured wild precision** (`benchmark/2026-08-03-wild-precision/`, engine @14, 15
instances per detector drawn across distinct survey sites, adversarially re-judged):

| Detector | Precision | decided n | 95% CI |
|---|---|---|---|
| `image-alt-missing` | 1.000 | 14 | 0.78–1.00 |
| `link-name-missing` | 0.933 | 15 | 0.70–0.99 |
| `heading-level-skipped` | 0.867 | 15 | 0.62–0.96 |
| `clickable-non-button` | 0.615 | 13 | 0.36–0.82 |
| `button-name-missing` | 0.600 | 15 | 0.36–0.80 |
| `input-label-missing` | 0.417 | 12 | 0.19–0.68 |

Read the intervals, not the point estimates: n=15 ranks detectors and surfaces FP
classes, it does not publish a precise per-detector number. The dominant class is
**stylesheet/class-based hiding** (closed dropdowns, `md:hidden`, unopened dialogs,
consent panels) — outside the a11y tree at rest, invisible to a tier that never loads
CSS. It affects five of the six detectors and is what puts `input-label-missing` last.
This is the first price tag on the Tier-2 capture-annotation gap. The remaining classes
are ordinary bugs, queued: out-of-scope input types flagged for labels, `title` not
accepted as a button's accessible name, and `onclick` matching inside the substring
`paginationclickable` (the whitespace-anchoring class of the 2026-07 `data-reactid` bug).

Detectors not in that table still rest on their own regression corpora only. Extending
the measurement is cheap now: the survey tier supplies wild instances for ~36 keys.

## L2 — properties the formula must keep

- Top and bottom reachable (goldens pin both).
- Monotonicity, **in a fixed measurement universe** (user ruling 2026-08-08: the promise
  cannot be unconditional when coverage itself can move — if a "fix" is deleting evidence
  rather than resolving a violation, the measurement universe changed and the promise does
  not apply): adding a confirmed violation never raises any score; turning a confirmed
  `fail` into a `pass` on the SAME evidence never lowers any score; adding compliant
  elements never costs points.
  **KNOWN VIOLATION, measured 2026-08-04, present in released v3.3.0, FIXED by engine `@17`
  (user ruling 2026-08-08).** BOTH directions of the promise used to fail. Reproduction,
  runnable as written:

  ```html
  <html lang="en"><head><title>t</title><meta name="description" content="d">
  <link rel="canonical" href="/"><script type="application/ld+json">{"@type":"Thing"}</script></head>
  <body><main><h1>H</h1>
  <button aria-label="a">A</button><button aria-label="b">B</button>
  <div onclick="x()">clickable with no keyboard path</div>
  <img src="1.png"><img src="2.png"><img src="3.png">
  </main></body></html>
  ```

  Under `@16` that page scored **44**; deleting the `<div onclick>` line (a real 2.1.1
  violation, now fixed) dropped it to **38** — fixing a violation LOWERED the score. Under
  `@17` fixing the same violation RAISES the score, **33 → 45**
  (`test/scoring-properties.test.mjs`, no longer `todo`) — the promise now holds, and the
  result is stronger than mere score-equality: keyboard evidence stays in the weighted
  denominator (`pass+fail` drops 3 → 2, thin now true, but the category stays scored — under
  `@16` it would have exited the denominator at exactly that point),
  so its category score jumps 55 → 100 and pulls the overall up with it, instead of exiting
  the denominator and dragging a better-scoring category out with the violation. (`@16`'s
  and `@17`'s absolute numbers on this page differ, 44/38 vs 33/45, because `@17` also
  scores `responsive` and `keyboard` as thin rather than excluding them — the number to
  compare is the DIRECTION of the fix, not the absolute score.) An independent check
  reproduced the same discontinuity at larger amplitude on a synthetic page (2 → 21 on
  adding one violation) and on real captured markup: `test/wild-corpus/` page 101380
  (cuni.cz) moved **22 → 0** under `@16` when a single false-positive finding was removed;
  under `@17` it moves **0 → 58** (see the 2026-08-08 movement table below) — the recovery
  this fix exists for.

  Mechanism (fixed): the category used to drop from 3 evidence items to 2, fall under
  `THIN_EVIDENCE_MIN`, get re-stated as `insufficient-evidence`, and leave the weighted
  denominator — and because it had been scoring better than the categories that remain,
  the average fell. Introduced with the thin-evidence state (`@9`). `@17` retires the
  `insufficient-evidence` state: ANY auditable evidence (`pass + fail >= 1`) now scores and
  stays in the weighted denominator; a category below `THIN_EVIDENCE_MIN` just carries a
  `thin: true` flag, rendered in the report as a same-line, same-weight qualifier next to
  the score (never colour-alone) rather than hidden as an unscored state.
  Fix direction taken: count-what-you-see (any evidence scores), not the continuous-weight
  or clamp-the-counterfactual alternatives that were also on the table (see
  `plans/` for the comparison) — chosen because it is the only one that removes the
  variable-denominator mechanism itself rather than smoothing it.
- Injection dose-response: known violations injected into the clean fixture degrade
  the score monotonically with dose (ground truth is the injection itself).
- Coverage and score move independently; absence of evidence is a state
  (`not-machine-checkable` / `not-applicable`, score null), never a number. Thinness of
  evidence (engine `@17`) is a `thin: true` qualifier on an otherwise normal score, not a
  separate unscored state.
- Life-safety gate (confirmed 2.3.1 critical → overall ≤ 49) beats all weights.
- Severity repeat-cap (3 per finding key) is a CALIBRATION DECISION, revisit with
  data; the pass/fail base ratio always counts every instance.
- Thin-evidence flag (engine `@17`, retired the `@9` floor): a category with
  `pass + fail < 3` still scores normally and stays in the weighted-average denominator and
  `coverage_percent`; it additionally carries `thin: true`, which the report surfaces as a
  same-line "證據薄弱"/"thin evidence" qualifier next to the score. N=3 is still a
  CALIBRATION DECISION (same status as the severity repeat-cap above), not a physical
  constant — revisit with data. Findings are unaffected either way.
  Historical `@9` measurement (superseded, kept for the record — exclusion-based floor, n=71
  paired, 2026-07-22): Spearman 0.477 → 0.468; score-delta distribution across 85 comparable
  sites: median |Δ| 7, p95 19, max 23, 18 band flips (both directions — a thin category
  EXITING the denominator could raise OR lower the overall). `@17` measurement (inclusion-based
  flag, n=40 real captured pages, `test/wild-corpus/`, 2026-08-08): 38/40 sites moved, median
  |Δ| 7, max |Δ| 58 (cuni.cz, the KNOWN VIOLATION motivating case above); finding keys
  byte-identical on all 40 sites (scoring-only change, verified by `node --test`). Full
  per-site table: `benchmark/2026-08-08-aplus-movement.md`. Motivating case retained:
  rakuten.co.jp was 40 (`@8`, pre-thin-floor) → 54 (`@9`, thin-excluded, `responsive`/`motion`
  each a single uncountered fail) — under `@17` both single-fail categories score instead of
  exiting, so the discontinuity that produced the 40→54 jump no longer exists.

### L2 — Tier-2 (browser-measured) thresholds, engine `beacon-tier2-audit@3`

**Calibration note 2026-10-17 (viewport tiers, `plans/2026-10-17-viewport-tiers.md`).**
Engine bumped @2 -> @3. Default tier-2 matrix is now the `feature` level: 320x720,
360x780, 768x1024, 1280x900 (was 320x720 + 1280x900). 360x780 and 768x1024 run under
Playwright mobile emulation (isMobile, hasTouch, DPR, device UA), so touch-target
findings can differ from @2 on the same page. 320x720 stays UNEMULATED on purpose: WCAG
1.4.10 means 320 CSS px at 400% zoom, not a device. The 1.4.10 coverage rows stay PARTIAL
(tier-2 does not measure reflow). `design-qa` moves to `beacon-design-qa@2`: levels
quick/feature/full, viewport labels in `metadata.viewports`, `metadata.level` added. No
threshold changed; the new matrix was not re-calibrated against the wild corpus.

Native Playwright measurement (contrast + touch targets), added 2026-07-25 (v3.3
Workstream A). Findings render as evidence + findings by default because merge is an
explicit, agent-initiated step (`--merge-findings`, `core/content/inspect.md` Step 6) —
NOT because the scoring mechanism is undecided. `mergeExternalFindings()`
(`core/scripts/static-audit.mjs` ~1440-1486) has been the sole channel for Tier-2/manual
findings to enter the scored artifact since commit `a1d8cab` (2026-06-21), and
`tier2-audit.mjs` findings use that exact same channel as axe or any manual finding. Since
engine `@17` (2026-08-08), a category with ANY merged evidence (pass + fail >= 1) leaves
`not-machine-checkable` and becomes `scored` immediately — `THIN_EVIDENCE_MIN` (3) now only
gates the `thin: true` qualifier, not whether the category scores at all. Measured on the
committed fixture `test/golden/clean.html` (pinned by `test/golden/clean.expected.json`,
reproducible with `node scripts/static-audit.mjs --scope golden-clean --date 2026-07-26
[--merge-findings <N tier2-contrast-fail findings>.json] test/golden/clean.html`): baseline
contrast (0 pass/0 fail) → `not-machine-checkable`, overall 100, coverage 66%; +1 merged
fail → `scored` at 0 (`thin: true`), overall 100 → 84, coverage 66% → 79%; +3 → contrast
still `scored` at 0, now `thin: false`, overall and coverage unchanged from the +1 case (84,
79%) — the score already reflected the evidence at n=1, only the thin qualifier clears at
n=3. `confidence_level` stays `medium` throughout this example (the band boundary is 60%
coverage; the clean fixture already clears it before any merge, since @17 counts its other
thin-but-scored categories into coverage too) — it moves only when a coverage change crosses
that boundary. What is genuinely undecided (USER DECISIONS, see
`plans/2026-07-25-v3.3-browser-measurements.md` Workstream A step 4): (a) whether the
default inspect flow should run tier-2 + auto-merge, so scores move by default rather than
only on an explicit agent action; (b) whether `THIN_EVIDENCE_MIN=3` is the right threshold
for a tier-2 source that can produce hundreds of checks per page, where one merge call
instantly clears the thin flag; (c) how the report distinguishes a static-only score from a
tier-2-inclusive one so the two numbers are never confusable. Every threshold below is a
CALIBRATION DECISION, not a physical constant — revisit with data the same way the
static-tier N=3 floor and severity repeat-cap are tracked above.

- **Dependency policy (ruling 2026-07-25)**: this repo stays zero-dependency (no
  `package.json`). Playwright is detected at runtime, never installed as a dependency —
  `loadPlaywright()` tries, in order, `PLAYWRIGHT_MODULE_PATH` (explicit override,
  authoritative — a bad value throws immediately rather than silently falling through),
  `require.resolve('playwright')` from the caller's cwd (covers a user's own project that
  already depends on it), then known global npm install locations, then throws a clear
  install-command error. Browser-backed tests skip LOUDLY (node:test skip reason
  `tier2: playwright unavailable on this machine`) when none resolve — see
  `.github/workflows/ci.yml`'s `tier2-browser` job, the only CI job that installs
  Playwright ad hoc (into a scratch dir, not the repo) so these tests actually run
  somewhere; every other CI job is expected to show the loud skip.
- **Contrast ratio minimums**: 4.5:1 normal text, 3:1 large text (WCAG 2.2 SC 1.4.3
  verbatim). Not a choice made here — the SC itself fixes these two numbers.
- **Large-text definition**: `fontSizePx >= 24` (18pt) OR (`fontSizePx >= 18.6667` (14pt)
  AND bold, where bold = computed `font-weight === 'bold'` or numeric weight ≥ 700). The
  18.6667px conversion (14pt × 4/3) and the ≥700 bold cutoff are calibration choices, not
  restated from the SC text; a font family with a lighter visual "bold" at 600 would be
  missed by the ≥700 cutoff.
- **Background resolution**: ancestor-walk + alpha compositing (element's own
  background-color first, walking outward, stopping at the first fully-opaque layer or
  the document root); a `background-image` (raster OR gradient) anywhere in that walk
  before reaching opacity makes the WHOLE sample `unresolvable` (a `review` finding, never
  a guessed ratio) — this is honest-by-construction, not a tuned threshold, but the
  boundary (any image/gradient blocks resolution, however small or however composited
  underneath) is worth revisiting if it proves too conservative on real pages (measured
  2026-07-25 on the rakuten.co.jp benchmark snapshot, engine @1: 1584/1917 samples
  unresolvable across both viewports — an image-heavy e-commerce page is close to a
  worst case for this detector, not necessarily representative). **Engine @2 (2026-07-26
  calibration) broadened `unresolvable` to three more signals found on real, CSS-intact
  renders, not corpus artifacts**: a background painted by a `::before`/`::after`
  pseudo-element or an inset `box-shadow` (`hasPseudoBg`/`hasInsetBoxShadow`, confirmed on
  Wix "Get Started"/"Thriving with Wix"); a non-ancestor sibling/cousin element stacked
  behind via `position` + `z-index`, found with a geometric rect-overlap scan rather than
  `document.elementsFromPoint` because that API silently excludes
  `pointer-events: none` elements from hit-testing — exactly how the confirmed Wix
  `bgLayers` div and Atlassian `aria-hidden` tab-indicator div are built
  (`hasNonAncestorOverlay`); and a page that opts into `color-scheme: dark` with no opaque
  ancestor background anywhere (`defaultsToCanvas` + `pageDefaultsToDarkCanvas`, confirmed
  on linear.app, whose html/body both report a fully transparent `backgroundColor` yet the
  page renders on a solid near-black canvas — the old compositor hardcoded a white default,
  exactly backwards for that page). All three: block and report unresolvable, never guess,
  the same honesty boundary as the original image/gradient case. Cost: the overlap scan is
  O(elements-needing-the-check × total-elements-on-page); the full two-viewport audit on
  the largest of the three confirming snapshots (wix.com, 2.2MB) still completed in ~4s.
- **Disabled/`aria-disabled` contrast exemption** (engine @2, 2026-07-26 calibration):
  `browserCollectContrastSamples` excludes any element inside
  `[disabled], [aria-disabled="true"]` (via `el.closest(...)`, mirroring the existing
  `[aria-hidden]`/`[hidden]` exclusion) from contrast sampling entirely, per WCAG 1.4.3's
  own exemption for "incidental text ... that is part of an inactive user interface
  component." Confirmed on two real false positives: a Mailchimp survey-modal button
  (`disabled=""` confirmed via direct DOM check) and an en.wikipedia.org donation-banner
  "Continue" button (screenshot showed a clearly grayed-out disabled state). Mirrors the
  `el.disabled` check `browserCollectTouchTargets` already had for touch targets.
- **Settle window** `SETTLE_QUIET_MS = 500` (engine @2, 2026-07-26 calibration,
  `core/scripts/tier2-audit.mjs`): after `domcontentloaded`, the harness waits for the
  `load` event (best-effort, 5s cap, swallowed — aborted subresources may prevent it from
  firing on some sites) and then this fixed quiet window, before any capture. Measured on
  a wayfair.com PerimeterX snapshot: 1 finding (unstable) at 0ms vs 5 findings (stable)
  from 300ms on — 500ms gives a ~200ms safety margin above the measured stabilization
  point, at a cost of +500ms × 2 viewports ≈ 1s per site. Distinct from L0's capture
  recipe ("domcontentloaded + networkidle grace + 2s settle") — tier-2 uses `load` instead
  of `networkidle` and a shorter 500ms window because it is calibrated against a single
  measured PerimeterX case, not L0's broader corpus; the two recipes are not meant to be
  the same number, only the same shape (wait for stability, then capture). Verified via
  `test/tier2-fixtures/settle.html` (a 150ms-deferred DOM mutation): 3 full repeated
  `runTier2Audit` runs on the same page produce byte-identical `findings` arrays.
  `# ponytail: fixed delay, not adaptive (e.g. mutation-observer-based quiescence) —
  revisit if a real site needs longer than 500ms to settle its deferred UI.`
- **Per-viewport error capture** (engine @2, 2026-07-26 calibration, resilience behavior,
  not a calibration threshold): `runTier2Audit`'s per-viewport loop wraps
  goto/settle/capture/analyze in a try/catch; on error it records `{viewport, error:
  <message>}` in `summary.by_viewport` for that viewport and continues to the next one
  instead of throwing and killing the whole process. Verified two ways: a deterministic
  unit test injecting a fake `playwrightModule` whose `page.evaluate` always throws the
  exact zoom.us error message ("Execution context was destroyed, most likely because of a
  navigation"), and the real zoom.us snapshot re-run 3 times — the navigation race
  reproduced in all 3 runs (on a different viewport each time, consistent with a genuine
  race), each time caught cleanly with the other viewport's findings intact. The "0
  crashes" figure in the pre-@2 real-page smoke run below predates this guard and should
  not be read as "this guard was never needed."
- **Touch-target floor**: 24×24 CSS px (WCAG 2.2 SC 2.5.8 verbatim), with the spacing
  exception implemented per the SC's own technique: a 24px-diameter circle centered on an
  undersized target must not intersect ANOTHER target — where "another target" is that
  neighbor's real bounding box for a full-size neighbor, or that neighbor's OWN 24px
  circle when the neighbor is itself undersized (circle-vs-circle, i.e. center distance
  < 24px). Fixed 2026-07-25 (hakuso HIGH): an earlier version tested circle-vs-rect
  against every neighbor regardless of the neighbor's own size, which under-detected the
  gap band (~12-24px center distance between two undersized targets whose small rects
  don't touch but whose circles do) — VALIDATION.md previously mischaracterized that
  earlier version as "the SC's own technique" too (hakuso LOW, corrected here). The
  inline, equivalent-target-elsewhere, and essential-presentation exceptions are NOT
  implemented (out of scope for v3.3 Workstream A) — a target flagged
  `tier2-touch-target-fail` may still be a false positive under one of those three
  unimplemented exceptions. Interactive-element selector list and the disabled/hidden
  exclusions are a calibration surface too (`core/scripts/tier2-audit.mjs`,
  `browserCollectTouchTargets`).
- **44px best-practice line**: recorded as advisory evidence (`check:'review'`,
  `severity:'tip'`) whenever a target is below 44px in either dimension, REGARDLESS of
  whether it passed the 24px floor directly or via the spacing exception — this is
  explicitly not a WCAG requirement, so it must never contribute a `fail`.
- Fixture ground truth (`test/tier2-fixtures/`, hand-computed pass/fail/review pairs,
  `test/tier2-audit.test.mjs`): `contrast.html` and `touch-targets.html` (engine @1),
  including the composited semi-transparent-background case (proves the alpha-blend math,
  not just presence/absence) and a viewport-dependent touch target (proves the harness
  produces different findings at 320 vs 1280 when the same element's CSS size changes
  under a media query); plus four @2 calibration fixtures: `contrast-overlay.html`
  (pseudo-element, inset-box-shadow, and non-ancestor-sibling backgrounds, plus a
  regression control proving an ordinary decorative box-shadow is NOT swept into
  unresolvable), `contrast-dark-canvas.html` (`color-scheme: dark` with no opaque
  ancestor), `contrast-disabled.html` (disabled/`aria-disabled` contrast exemption), and
  `settle.html` (a 150ms-deferred DOM mutation, proving 3 repeated full runs produce
  byte-identical findings).
- Real-page smoke run (2026-07-25, rakuten.co.jp benchmark snapshot #97, both viewports,
  **engine @1**): 2914 findings — 190 `tier2-contrast-fail`, 1584
  `tier2-contrast-unresolvable`, 15 `tier2-touch-target-fail`, 1125
  `tier2-touch-target-advisory`, 0 crashes. @2's broadened unresolvable classification and
  disabled-control contrast exemption (below) move these counts — this is a snapshot of
  @1's behavior, not a re-measurement. Not yet a wild FP measurement (no human
  adjudication of these flags) — that is required before any of
  these categories could feed a score (L1 new-detector protocol applies once step 4 is
  decided).

### L1/L2 — Workstream B: static contrast reference value (engine `beacon-static-audit@10`)

Static (regex/tag-walk, no browser) evidence line + per-pair `check:'review'` findings —
never a score, contrast stays `not-machine-checkable` regardless (`review` never bumps
`fail`; verified by `test/static-contrast.test.mjs`). Resolvability is deliberately narrow:
certain literal fg/bg only (inline style, or a same-file `<style>` rule matched by a
SINGLE, unambiguous class/id — id beats class per fixed specificity, multiple classes
disagreeing is a tie and unresolved, a class redeclared anywhere in the file is unresolved,
alpha != 1 anywhere is unresolved, a `background-image`/gradient ancestor blocks resolution,
and reaching the document root with no background declared anywhere is unresolved — no
default-to-white guess, unlike tier-2's real-browser default, because static analysis
cannot know whether an external stylesheet sets it). No external CSS (`<link>`) is ever
consulted. Reuses `parseColor`/`relLuminance`/`contrastRatio` from `tier2-audit.mjs`
(imported, not duplicated); only hex-color parsing is new (getComputedStyle never returns
hex, authored CSS commonly does).

**FP calibration, three rounds** (`plans/2026-07-25-ws-b-contrast-calibration.md` for
rounds 1-2, `plans/2026-07-26-contrast-calibration-broad.md` for round 3 — current numbers
at the top of those files, prior-pass numbers kept below for the audit trail):

1. Round 1: caught a genuine false-certainty before any fix shipped — a class absent from
   the file's own `<style>` blocks (e.g. an external Tailwind `bg-white` utility class) was
   treated as "nothing declared here" and the walk fell through to an unrelated ancestor's
   inline background, producing a false 1.00:1 ratio. **Fix**: an element carrying ANY
   class that doesn't resolve to a certain background via a same-file rule now BLOCKS that
   level of the walk instead of being skipped past. Effect: resolved pairs 196 → 41 (26 →
   21 sites), sub-threshold 17 → 16.
2. Round 2 (hakuso HIGH): the rule-extraction regex matched only the trailing
   `[.#][\w-]+` token before `{`, so a compound (`.a.b`), descendant (`.parent .child`), or
   element-qualified (`div.c4`) selector was mis-recorded under its bare tail token —
   resolving on any element carrying just that one class. **Fix**: capture the full
   selector prelude, split on `,`, and only record entries matching the WHOLE string
   `^[.#][\w-]+$`; anything else is never recorded (same "unresolved by omission" as an
   external class). This retroactively invalidated most of round 1's "verified" OneTrust
   findings — the round-1 manual check (grep for a substring like
   `#onetrust-pc-btn-handler {`) only confirmed the token appeared before a `{`, not that
   it WAS the whole selector; the real rule was a descendant selector
   (`#onetrust-banner-sdk #onetrust-pc-btn-handler`). Effect: resolved pairs 41 → 22
   (21 → **9** sites — below the initial ≥10-site bar, flagged explicitly, not padded to
   hit a number), sub-threshold 16 → 4. One pair was also GAINED (a comma-separated
   selector list the old regex could only match the last entry of).
3. Round 3 (broader population pass, `plans/2026-07-26-contrast-calibration-broad.md`):
   broadened the population ~9x past round 2's 9-site sample — 774 files scanned (735
   `survey-snapshots` + 26 `intake-snapshots` + 13 `run-2026-07-22-weekly` snapshots), 0
   scan failures. 78 sites with ≥1 resolvable pair, 483 resolved pairs, 45 sub-threshold,
   re-adjudicated against the literal CSS/inline-style text directly (never a substring
   grep — the exact mistake round 2's methodology-correction section warns against
   repeating). 44/45 confirmed GENUINE. **1 confirmed FALSE POSITIVE** (100291.html:2790):
   a caption `<a>` inside an absolutely-positioned overlay whose real visual backdrop is a
   photographic `<img>` sibling, not a CSS background — none of the intervening `<div>`s
   declare any background at all, so the walk climbed straight past the photo and resolved
   white text against a distant, unrelated ancestor's white page background (a nonsensical
   1.00:1 white-on-white "finding" for text a real user sees on top of a photo). **Fix**
   (folded into `beacon-static-audit@11` — this pass landed in the same uncommitted batch,
   no separate version bump): a `position:absolute`/`fixed` element whose own parent
   already has an `<img>` as a direct child now blocks the climb at that point rather than
   reaching a further ancestor, the same honesty rule as the existing background-image
   block. Miss-rate observation (not a bounded claim): 1/45 ≈ 2.2% in this population;
   round 2's much smaller population found 0 misses and only surfaced this class because
   the population grew ~22x — read as "broadening the corpus keeps surfacing real bugs at
   a low but non-zero rate," not a rate to plan around. Regression test + control:
   `test/static-contrast.test.mjs` ("an absolutely-positioned overlay over a sibling
   `<img>` blocks the bg walk" + its position:absolute-without-`<img>` control).

Both fixes are strictly conservative (can only turn a resolved pair into an unresolved
one, except the one comma-list recovery in round 2, which is a correctness gain, not a
laxer rule). Golden vectors unaffected by either fix (fingerprint-only diff both times).
Regression tests for both bug classes: `test/static-contrast.test.mjs` ("an unresolved
class on the fg element itself blocks the walk", plus the three compound/descendant/
element-qualified leak-shape tests and their controls). Score-neutrality re-confirmed
post-round-2 on a real snapshot (contrast category stays `not-machine-checkable`/`fail:0`
regardless). Small single-benchmark sample both rounds, not a bounded FP-rate claim — and
round 2's own lesson (a substring-grep "verification" missed a real bug) is recorded so a
future calibration pass reads the full selector prelude, not a token match.

### Engine `beacon-static-audit@11` — the contrast verification gate is now code-backed

Workstream C's own audit (hakuso prose-check + a codex heterogeneous review against the
CODE) found `inspect.md`'s "Contrast verification gate" was doc-promised but not
code-backed: `requires_live_audit` was hardcoded `true` unconditionally, and the mandated
"Contrast not verified, run Tier 2" tip finding was never emitted (`static-audit.mjs` only
ever bumped a silent `stats.contrast.review` count). Fixed: after any `--merge-findings`
call, `stats.contrast.pass`/`.fail` are checked — those counters are set ONLY by merged
external findings (native tier-2 or axe; nothing else in this engine ever reports contrast
pass/fail) — so `stats.contrast.pass > 0 || stats.contrast.fail > 0` is a reliable
"was contrast exercised by a browser this run" signal. If false: emit the
`contrast-not-verified` tip finding (bilingual, `check:'review'`, never scored) and set
`requires_live_audit: true`; if true, both are correctly suppressed — **verified directly**:
merging one `check:'pass'` contrast finding flips `requires_live_audit` to `false` and
skips the tip. This is a clean supersede using the EXISTING `--merge-findings` mechanism;
no new merge machinery was added. Golden vectors: both gained exactly one new finding
(the tip) plus the version bump — `overall_score` unaffected on both (check:'review' never
enters the fail/severity accounting); `clean.expected.json`'s prior "0 findings" guarantee
is now "no confirmed (`check:'fail'`) findings" (`test/golden-vectors.test.mjs`, updated
alongside). GT confirmed-finding neutrality re-verified directly on a real benchmark
snapshot (`beacon-benchmark-100` #97): diffing engine output before/after this fix shows
exactly one finding ADDED (`contrast-not-verified`), zero REMOVED, and `overall_score`/
`critical`/`warnings` byte-identical.

### Engine `beacon-static-audit@12` — document-title and html-lang presence/validity bugs (hakuso audit, `plans/2026-07-27-wcag-coverage-measurement.md`)

The coverage-measurement audit ran fixtures against the code (not just the table) and found
two of the three cited FULL-coverage rows were actually PARTIAL, both one-regex bugs:

- **2.4.2 Page Titled** (`document-title-missing`): the check
  `/<title\b[^>]*>[^<]+<\/title>/` matched a `<title>` ANYWHERE in the raw text, so a page
  with an `<svg><title>icon label</title></svg>` and no real document title was reported
  clean, and `[^<]+` (one-or-more, not one-or-more-non-whitespace) let
  `<title>   </title>` pass as present. **Fix**: `extractDocumentTitle()` strips any inline
  `<svg>...</svg>` first (an `<svg><title>` is a different, SVG-namespaced element, not the
  document title), then requires the first remaining `<title>`'s trimmed text to be
  non-empty. It intentionally does NOT scope to before `</head>`/`<body>` — a first attempt
  did, and a hakuso auditor caught it in real Chromium: `document.title` is "the first HTML
  `<title>` element in the document," and a browser's parser (and axe's `doc-has-title`)
  honor one anywhere, body or hidden ancestor included; scoping to `<head>` over-flagged real
  titled pages as missing (below).
- **3.1.1 Language of Page** (`html-lang-missing` / new `html-lang-invalid`): the presence
  test `/<html[^>]+lang=/` was satisfied by the `xml:lang=` substring (a bare `\b` boundary
  still matches right after the `:` in `xml:lang`, so word-boundary alone doesn't exclude
  it) — a page with only `xml:lang` was reported as having a declared language. There was
  also no format-validity check at all: `<html lang="english">` passed silently, because
  `assessLang`'s `declaredFamily()` falls through to `UNMODELLED` (no finding) for anything
  it doesn't recognize as a real language or a known country-code substitution. **Fix**:
  the presence/value regex now requires the whitespace that separates every real HTML
  attribute (`/<html\b[^>]*\slang\s*=\s*["']?([^\s"'>]+)/`, excludes `xml:lang=`/
  `data-lang=`), and a new `isWellFormedLangTag()` in `lang-detect.mjs` gates a well-formed
  BCP-47 shape (2-3 ALPHA primary subtag, optional `-`-separated 1-8-alphanumeric subtags —
  a SHAPE check, not an ISO 639 registry lookup) before content-mismatch assessment runs.
  A malformed tag gets the new `html-lang-invalid` finding and skips `assessLang` entirely
  (content-matching a tag that isn't a real language is moot). A shape-valid-but-wrong code
  ("jp" for "ja") is a *different*, already-handled failure mode — `assessLang`'s existing
  `COUNTRY_AS_LANG` path still catches those via `html-lang-mismatch`, unchanged; the two
  checks are complementary, not duplicated.

**Golden vectors**: fingerprint-only diff (neither fixture exercises these edge cases —
`clean.html` has a real title and a valid `lang="en"`; `dirty.html` has no title and no
lang at all, both already caught pre-fix). **GT retention**: re-ran old-vs-new engine on
all 20 `benchmark/2026-07-06-ground-truth/` site snapshots — zero finding-set diff for
`html-lang-*`/`document-title-missing` on any site, and zero diff on the broader
`benchmark/2026-07-05/` 86-site population (ADDED 0 / REMOVED 0). A head/body-scoped first
attempt at the title fix DID add one finding on that 86-site population
(`document-title-missing` on the linear.app snapshot, idx 77) — that page's only `<title>`
sits inside a `<div hidden="">` in the body, no title anywhere in `<head>`. It was
initially logged here as "a genuine catch" on the reasoning that `hidden` content is
already excluded from every other finding/pass in this engine; a hakuso auditor verified
in real Chromium that this reasoning does not apply to `document.title` (the property
reads DOM structure, not the accessibility tree — `hidden` never blocks it) and axe's own
`doc-has-title` agrees, making it a **false positive**, not a catch. Dropping the head/body
scope (keeping the svg-strip and the trim) fixed it: 0/0 diff on both populations, plus a
new regression fixture asserting a hidden-body-div title does NOT flag
(`test/static-audit-detectors.test.mjs`).

## L3 — external validity protocol

**Paired benchmark** (`benchmark/2026-07-05/`): re-run on the stored snapshots after
any detector/scoring change (`capture-audit.mjs --audit-only`, then `analyze.mjs`);
the Spearman-vs-Lighthouse trend goes in the CHANGELOG. Lighthouse is a concurrent
reference, never ground truth (top-compressed: half the sites ≥95).

**Wild regression corpus** (`test/wild-corpus/`): 40 real captured pages (gzipped rendered
DOM, scores 0–100, 31 detector keys represented) with per-site score, coverage, and
per-key finding counts frozen. `node --test` re-audits every one and fails on ANY
unexplained change. This is the guard the hand-written goldens structurally cannot be:
the 2026-07 phantom-mask class (one stray token silently killing every later finding on a
page) and detector runaway on one framework's markup both show up here immediately, and
neither could show up in a 16-line fixture. A diff is not automatically a failure — it is
an *unexplained* change; intentional detector work regenerates the corpus deliberately
(`build-wild-corpus.mjs` in the benchmark workspace) and the commit explains every moved
number, exactly like the goldens. Corpus absent from a checkout → the test skips, never
fails. Sensitivity verified on introduction: perturbing one score and one key count made
the test name exactly those two lines.

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

<a id="wcag-criterion-coverage"></a>
## WCAG 2.2 A+AA criterion coverage — measured, not inherited

This is the canonical, stable home for the claim every published report and README links
to; do not move or rename this section without repointing every surface that cites
`VALIDATION.md#wcag-criterion-coverage`. The working record — denominator derivation,
escape-hatch rule, and the hakuso audit trail that corrected five row verdicts and three
axis calls — stays at `plans/2026-07-27-wcag-coverage-measurement.md`; this section is the
result, kept in sync with it.

**Denominator**: WCAG 2.2's A+AA set is **55** criteria (31 A + 24 AA), not 2.1's 50 — 2.2
added six (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) and removed one (4.1.1 Parsing,
deprecated). Source: the WCAG 2.2 Recommendation and quickref, filtered to A/AA.

**Axes**: *Machine-testable in principle* — could any tool decide at least one real failure
mode without judging meaning? (escape-hatch rule: YES if any one satisfying path has a
structural proxy, even if another path is judgement-only). *Beacon coverage* — FULL if a
detector decides the criterion for every realistic automatable failure mode; PARTIAL if it
catches some but not all; NONE if no detector exists. "Fully decided" below always means
**within automation's reach** — a criterion whose only remaining failure modes are
inherently semantic (e.g. 2.4.2's title *presence* is decided; title *descriptiveness* is
not, and no automated tool decides it either).

| # | Criterion | Level | Machine-testable in principle | Beacon coverage | Detector key(s) | What's missed |
|---|---|---|---|---|---|---|
| 1.1.1 | Non-text Content | A | YES | **PARTIAL** | `image-alt-missing`; `quality-alt-generic`/`quality-alt-filename`/`quality-alt-redundant` (review) | CSS background-only meaningful images, SVG/canvas/object/embed alternatives; alt-text *meaningfulness* is review-only, never a scored fail |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | A | NO | NONE | — | no detector |
| 1.2.2 | Captions (Prerecorded) | A | YES | NONE | — | no `<track kind="captions">`/caption-file check exists in either script |
| 1.2.3 | Audio Description or Media Alternative (Prerecorded) | A | YES | NONE | — | `<track kind="descriptions">` is a checkable structural artifact (escape-hatch rule); no detector implemented |
| 1.2.4 | Captions (Live) | AA | NO | NONE | — | no detector |
| 1.2.5 | Audio Description (Prerecorded) | AA | YES | NONE | — | `<track kind="descriptions">` is the identical artifact to 1.2.2's caption-track check; no detector implemented |
| 1.3.1 | Info and Relationships | A | YES | **PARTIAL** | `main-landmark-missing`; `heading-level-skipped`; `list-non-li-child`; `pdf-untagged`; `pdf-marked-false`; `pdf-encrypt-blocks-at`; `pdf-encrypt-a11y-bit-cleared` | table header/scope association, fieldset/legend grouping, aria-owns/describedby validity, reading-order mismatches, definition lists |
| 1.3.2 | Meaningful Sequence | A | YES | NONE | — | no DOM-order-vs-visual-order comparison exists in either script |
| 1.3.3 | Sensory Characteristics | A | NO | NONE | — | no detector |
| 1.3.4 | Orientation | AA | YES | NONE | — | no detector |
| 1.3.5 | Identify Input Purpose | AA | YES | NONE | — | no `autocomplete` token check exists |
| 1.4.1 | Use of Color | A | YES | NONE | — | link-vs-body-text color-only distinction is a checkable structural proxy; no detector implemented |
| 1.4.2 | Audio Control | A | YES | NONE | — | no autoplay-audio detector |
| 1.4.3 | Contrast (Minimum) | AA | YES | **PARTIAL**† | `tier2-contrast-fail`; `tier2-contrast-unresolvable` (review); `static-contrast-sub-threshold` (review, static-audit only); `contrast-not-verified` (review); `static-contrast-evidence` (review) | †only when `tier2-audit.mjs` is run and merged. `browserCollectContrastSamples` reads only direct text child nodes, so `::before`/`::after`, `::placeholder`, `<input value>`, shadow DOM, and iframe content are never sampled |
| 1.4.4 | Resize Text | AA | YES | **PARTIAL** | `viewport-zoom-disabled` | does not verify actual 200%-zoom reflow/clipping |
| 1.4.5 | Images of Text | AA | YES | NONE | — | OCR-based detection is checkable (same class as 2.3.1's frame analysis); no detector implemented |
| 1.4.10 | Reflow | AA | YES | **PARTIAL** | `viewport-meta-missing`; `fixed-minmax-overflow`; `large-fixed-width` (review) | no rendered-320px horizontal-scroll/clipping check |
| 1.4.11 | Non-text Contrast | AA | YES | NONE | — | no UI-component/icon border-contrast check |
| 1.4.12 | Text Spacing | AA | YES | NONE | — | no detector |
| 1.4.13 | Content on Hover or Focus | AA | YES | NONE | — | no detector |
| 2.1.1 | Keyboard | A | YES | **PARTIAL** | `clickable-non-button`; `click-handler-keyboard-missing` | custom widgets/drag targets/canvas controls with no click-listener pattern; non-inline event-binding idioms |
| 2.1.2 | No Keyboard Trap | A | YES | NONE | — | `focus-flow.mjs` targets this but is not imported by either audit script |
| 2.1.4 | Character Key Shortcuts | A | YES | NONE | — | no detector |
| 2.2.1 | Timing Adjustable | A | YES | NONE | — | no detector |
| 2.2.2 | Pause, Stop, Hide | A | YES | NONE | — | `motion-reduced-motion-missing` exists but checks CSS support, not a pause/stop control |
| 2.3.1 | Three Flashes or Below Threshold | A | YES (specialized frame analysis, e.g. PEAT) | NONE | — | no flash-rate/frame analysis exists |
| 2.4.1 | Bypass Blocks | A | YES | NONE | — | no skip-link detector |
| 2.4.2 | Page Titled | A | YES | **FULL**‡ | `document-title-missing`; `pdf-title-not-shown` | ‡decides presence/non-emptiness only; title *descriptiveness* is semantic and outside any automated check's reach |
| 2.4.3 | Focus Order | A | YES | NONE | — | `focus-flow.mjs` targets this but is not wired into either script |
| 2.4.4 | Link Purpose (In Context) | A | YES | **PARTIAL** | `quality-link-generic` (review) | review-only, catches only the generic-phrase pattern |
| 2.4.5 | Multiple Ways | AA | YES | NONE | — | no detector |
| 2.4.6 | Headings and Labels | AA | YES | NONE | — | no detector decides descriptiveness (heading hierarchy and existence are 1.3.1 failure modes, not 2.4.6's) |
| 2.4.7 | Focus Visible | AA | YES | **PARTIAL** | `focus-outline-removed` | doesn't verify indicator contrast/thickness, JS-based removal, or externally-linked CSS |
| 2.4.11 | Focus Not Obscured (Minimum) | AA | YES | NONE | — | `focus-flow.mjs` targets this but is not wired into either script |
| 2.5.1 | Pointer Gestures | A | NO | NONE | — | no detector |
| 2.5.2 | Pointer Cancellation | A | YES | NONE | — | no down-event-vs-up-event detector |
| 2.5.3 | Label in Name | A | YES | NONE | — | no visible-label-vs-accessible-name comparison |
| 2.5.4 | Motion Actuation | A | NO | NONE | — | no detector |
| 2.5.7 | Dragging Movements | AA | YES | NONE | — | no drag-listener/alternative detector |
| 2.5.8 | Target Size (Minimum) | AA | YES | **PARTIAL**† | `tier2-touch-target-fail`; `tier2-touch-target-advisory` (review) | †only with `tier2-audit.mjs`. `VALIDATION.md` L2 states the inline/equivalent-target-elsewhere/essential-presentation exceptions are NOT implemented |
| 3.1.1 | Language of Page | A | YES | **FULL**‡ | `html-lang-missing`; `html-lang-mismatch`; `html-lang-mismatch-review`; `html-lang-invalid`; `pdf-lang-missing` | ‡content-mismatch layer falls back to no-finding on JS-heavy pages with too little static text |
| 3.1.2 | Language of Parts | AA | YES | NONE | — | `detectLangParts` exists but is deliberately gated off (calibration false-positives), never emitted |
| 3.2.1 | On Focus | A | YES | NONE | — | no detector |
| 3.2.2 | On Input | A | YES | NONE | — | no detector |
| 3.2.3 | Consistent Navigation | AA | YES | NONE | — | no cross-page structural comparison — both scripts operate per-file/per-page |
| 3.2.4 | Consistent Identification | AA | YES | NONE | — | no cross-page structural comparison |
| 3.2.6 | Consistent Help | A | YES | NONE | — | no cross-page structural comparison |
| 3.3.1 | Error Identification | A | YES | NONE | — | no form-submission/error-association check |
| 3.3.2 | Labels or Instructions | A | YES | **PARTIAL** | `input-label-missing`; `input-label-weak` | only checks `<input>`, not `<select>`/`<textarea>`; engine @18 implements the full HTML-AAM accname fallback chain (aria-labelledby-resolving → aria-label → label[for]/wrapping label → title → placeholder) — an `id` alone no longer exempts an input, it must have a matching `<label for>`; title/placeholder-only names emit `input-label-weak` as a `check:'review'` finding rather than a critical fail |
| 3.3.3 | Error Suggestion | AA | NO | NONE | — | no detector |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | AA | NO | NONE | — | no detector |
| 3.3.7 | Redundant Entry | A | YES | NONE | — | no multi-step-form field comparison |
| 3.3.8 | Accessible Authentication (Minimum) | AA | YES | **PARTIAL** | `auth-recaptcha-invisible`; `auth-recaptcha-v2`; `auth-turnstile`; `auth-text-captcha`; `auth-password-paste-blocked`; `auth-password-autocomplete-off`; `auth-recaptcha-js-render`; `auth-hcaptcha-js-render`; `auth-captcha-injected-script`; `auth-password-clipboard-blocked-js` | custom/non-branded CAPTCHA and hand-rolled cognitive-function-test implementations |
| 4.1.2 | Name, Role, Value | A | YES | **PARTIAL** | `frame-title-missing`; `button-name-missing`; `link-name-missing`; `quality-label-role-echo` (review); `pdf-encrypt-blocks-at`; `pdf-encrypt-a11y-bit-cleared` | ARIA state/property correctness, invalid role values, custom-widget value exposure, form controls beyond buttons/links |
| 4.1.3 | Status Messages | AA | YES | NONE | — | no `aria-live`/`role="status"` detector |

**Arithmetic**: 2 FULL + 12 PARTIAL = 14 criteria with any coverage → **14/55 = 25.5%**.
FULL only (2.4.2, 3.1.1 — the only two rows that reach FULL, both within automation's
reach, not full conformance): **2/55 = 3.6%**. Against the 48 machine-testable-in-principle
criteria (7 are NO — 1.2.1, 1.2.4, 1.3.3, 2.5.1, 2.5.4, 3.3.3, 3.3.4): any coverage
**14/48 = 29.2%**, FULL only **2/48 = 4.2%**.

This measures *criteria* (how many of WCAG's 55 A+AA categories have any Beacon detector),
not *instances* (how many real violations Beacon catches on a benchmark corpus — that is
the 0.727 ground-truth recall figure above, a different denominator). Do not average,
blend, or substitute one for the other in any report.

Full derivation, the escape-hatch rule, and the hakuso audit trail (five row-verdict
corrections, three machine-testable axis flips, two detector-bug fixes at engine
`beacon-static-audit@12`):
[`plans/2026-07-27-wcag-coverage-measurement.md`](plans/2026-07-27-wcag-coverage-measurement.md).

### Exclusion mapping — who this scan's silence leaves out

The arithmetic above answers "how much of WCAG has a detector." It does not answer the
question that matters to a person using the site this scan approved: when this scan is
silent on a criterion, who does that silence leave out, and why?

Per Kat Holmes, *Mismatch: How Inclusion Shapes Design* (MIT Press, 2018): exclusion is
the predictable result of a design decision, not a deficiency in the excluded person. Not
building a detector for a criterion is a decision, and a decision has a subject. The table
below names that subject instead of leaving it implicit inside a percentage. Every "who"
is the population each criterion's own WCAG Understanding document ("Intent") names as its
intended beneficiary — not this project's inference about who might be affected.

Each row's population claim was checked against that specific criterion's own W3C
Understanding page — not inferred from a neighboring or similarly-named criterion, and not
defaulted to screen-reader users as a generic AT stand-in. A citation check found 3 wrong
and 9 imprecise rows out of the original 53 on exactly those two failure modes (borrowing a
neighbor's population, or substituting a plausible-sounding but unsourced group); all 12
are corrected below. Full row-by-row source citations, verdicts, and the corrected wording:
[`plans/2026-07-28-exclusion-mapping-citation-check.md`](plans/2026-07-28-exclusion-mapping-citation-check.md).

#### A. Where a detector could exist, but doesn't (yet), or exists only in part — 46 criteria

These 46 are all marked "machine-testable in principle: YES" in the table above: nothing
about WCAG's own definition rules out a structural check here. Beacon's silence on them is
a build decision (not built, or built for one failure mode and not others), not a limit of
automation itself.

| SC | Level | Coverage | What this scan does not check | Who that leaves out |
|---|---|---|---|---|
| 1.1.1 | A | PARTIAL | CSS background-only meaningful images, SVG/canvas/object/embed alternatives get no check at all; alt-text *meaningfulness* is review-only, never scored | Blind and low-vision screen-reader/braille-display users — left out entirely when an image's meaning lives in a CSS background, SVG, canvas, or embedded object with no text alternative, and stuck with a technically-present but useless `alt="image"` the review layer flags but never fails |
| 1.3.1 | A | PARTIAL | Table header/scope association, fieldset/legend grouping, `aria-owns`/`describedby` validity, reading-order mismatches, definition lists | AT users who can't tell which header a table cell belongs to, whose related form fields lose their grouping, or whose reading order doesn't match the visual layout — this criterion exists to expose structure AT needs, and these are exactly the structures still unchecked |
| 1.3.2 | A | NONE | No DOM-order-vs-visual-order comparison exists | Screen-reader and other AT users who hear content read in an order that doesn't match the sighted reading order (CSS grid/flex/absolute-position reordering) |
| 1.3.4 | AA | NONE | No detector | People with mobility impairments using a device mounted in a fixed orientation (wheelchair or bed mount) who cannot physically rotate it to match a portrait- or landscape-only design |
| 1.3.5 | AA | NONE | No `autocomplete` token check exists | People with cognitive disabilities who rely on autofill or personalized symbols for common fields, and people with motor impairments avoiding re-typing |
| 1.4.1 | A | NONE | Link-vs-body-text color-only distinction is a checkable structural proxy; no detector implemented | Colorblind users, people with low vision or partial sight, older users experiencing age-related color-vision decline, and users on monochrome or limited-color displays - anyone who cannot distinguish a cue conveyed by color alone (a red required-field mark, a link the same color as body text with no underline) |
| 1.4.2 | A | NONE | No autoplay-audio detector | Screen-reader users, whose access to their own AT's speech is drowned out by audio that starts playing with no warning and no easy way to stop it |
| 1.4.3 | AA | PARTIAL | `browserCollectContrastSamples` reads only direct text child nodes: `::before`/`::after`, `::placeholder`, `<input value>`, shadow DOM, and iframe content are never sampled; static-only runs skip contrast entirely | Low-vision readers of exactly the content classes never sampled — placeholder text doubling as a label, generated content, typed-in form values, embedded widgets — none of which get a contrast check at all |
| 1.4.4 | AA | PARTIAL | Does not verify actual 200%-zoom reflow/clipping | Low-vision users who zoom to 200% and hit horizontally-scrolling or clipped/overlapping text that only appears once the page is actually rendered, which this scan never does |
| 1.4.5 | AA | NONE | OCR-based detection is checkable (same class as 2.3.1's frame analysis); no detector implemented | Low-vision users who need to resize or recolor text, people with visual tracking problems who need to change its line spacing or alignment, and people with cognitive disabilities affecting reading who need to restyle it to suit their needs - none of whom can do any of that when the text is a picture |
| 1.4.10 | AA | PARTIAL | No rendered-320px horizontal-scroll/clipping check | Low-vision users at high zoom or on narrow viewports who hit two-dimensional scrolling this scan cannot see without rendering the page |
| 1.4.11 | AA | NONE | No UI-component/icon border-contrast check | Low-vision users who cannot locate or distinguish the boundary or state of an interactive control (an input outline, a checkbox, an icon) with no enforced contrast |
| 1.4.12 | AA | NONE | No detector | People with low vision or dyslexia who override line-height, letter-, or word-spacing via a user stylesheet and then hit clipped or overlapping content |
| 1.4.13 | AA | NONE | No detector | Screen-magnifier users (who see only part of the screen at a time) and people with tremor who trigger a hover tooltip by accident and can't reach, read, or dismiss it before it disappears |
| 2.1.1 | A | PARTIAL | Custom widgets, drag targets, and canvas controls with no click-listener pattern; non-inline event-binding idioms | Keyboard-only and switch-device users who hit a custom control (a slider, a drag target, a canvas widget) this scan reports as fine because its detector recognizes only one authoring pattern for keyboard handlers |
| 2.1.2 | A | NONE | `focus-flow.mjs` targets this but is not imported by either audit script | Keyboard-only users trapped inside a component (a modal, a rich-text editor, an embedded widget) with no keyboard path back out |
| 2.1.4 | A | NONE | No detector | Speech-input users, whose dictation is interpreted as strings of letters and can accidentally fire single-key shortcuts, and keyboard-only users with dexterity challenges who are prone to hitting keys by accident, on a page whose single-key shortcut cannot be turned off or remapped |
| 2.2.1 | A | NONE | No detector | People with cognitive, learning, or motor disabilities; blind and low-vision users navigating item-by-item; and Deaf users communicating in sign language, who may need more time to interpret audio content - all needing more time than a fixed session or activity timer allows and having no way to extend it |
| 2.2.2 | A | NONE | `motion-reduced-motion-missing` exists but checks CSS support, not a pause/stop control | People with attention-related cognitive disabilities, and screen-reader/low-vision users, for whom moving or auto-updating content that cannot be paused interferes with reading or concentration |
| 2.3.1 | A | NONE | No flash-rate/frame analysis exists | People with photosensitive seizure disorders, for whom flashing content above the threshold is a physical trigger, not an inconvenience |
| 2.4.1 | A | NONE | No skip-link detector | Keyboard and screen-reader users forced to tab or listen through the same repeated navigation block on every single page |
| 2.4.3 | A | NONE | `focus-flow.mjs` targets this but is not wired into either script | Keyboard users whose Tab order jumps in a sequence that doesn't match the visual or reading order, losing track of where focus is |
| 2.4.4 | A | PARTIAL | Review-only, catches only the generic-phrase pattern ("click here") | Screen-reader users navigating a page's pulled-out links list who land on link text that's distinct-looking but still uninformative out of context, a pattern this scan's one heuristic doesn't catch |
| 2.4.5 | AA | NONE | No detector | People with cognitive disabilities and screen-reader users who need more than one way (search, sitemap, nav) to find a page when their first method fails |
| 2.4.6 | AA | NONE | No detector decides descriptiveness (heading hierarchy/existence are 1.3.1 failure modes, not 2.4.6's) | People whose disabilities make reading slow, and people with limited short-term memory, who rely on a descriptive heading to know what a section contains without reading it in full - and screen-reader users scanning a page by its list of headings, who get one like "Section 3" that tells them nothing about what follows |
| 2.4.7 | AA | PARTIAL | Doesn't verify indicator contrast/thickness, JS-based removal, or externally-linked CSS | Keyboard-only users (sighted, low-vision, or with certain motor/cognitive conditions) whose focus indicator is technically present but too faint or thin to see, or removed by JavaScript or a stylesheet this scan never loads |
| 2.4.11 | AA | NONE | `focus-flow.mjs` targets this but is not wired into either script | Keyboard and screen-magnifier users who tab to a control hidden behind a sticky header, cookie banner, or overlay |
| 2.5.2 | A | NONE | No down-event-vs-up-event detector | People with visual disabilities, cognitive limitations, or motor impairments (including tremor and limited fine motor control) who press the wrong target and need to slide off or release without triggering it |
| 2.5.3 | A | NONE | No visible-label-vs-accessible-name comparison | Speech-input users, who activate a control by speaking its visible label and get nothing when the accessible name silently differs from it |
| 2.5.7 | AA | NONE | No drag-listener/alternative detector | People with motor impairments, tremor, or single-switch access who cannot complete an accurate drag gesture (reordering a list, a slider) with no tap/click alternative offered |
| 2.5.8 | AA | PARTIAL | Inline/equivalent-target-elsewhere/essential-presentation exceptions are not implemented | People with limited fine motor control (tremor, reduced dexterity) hitting a target this scan mis-scores in either direction because it can't yet apply WCAG's own listed exceptions |
| 3.1.2 | AA | NONE | `detectLangParts` exists but is deliberately gated off (calibration false positives), never emitted | Screen-reader users who hear a foreign-language word, quote, or passage mispronounced because it isn't marked with its own `lang` and gets read in the page's default voice |
| 3.2.1 | A | NONE | No detector | People with visual disabilities, cognitive limitations, or motor impairments, disoriented by an unannounced context change (new window, auto-submit) triggered merely by an element receiving focus, before they have done anything else |
| 3.2.2 | A | NONE | No detector | People with visual disabilities or cognitive limitations, disoriented by an unannounced context change triggered by selecting an option or typing, before an explicit submit action (a narrower population than 3.2.1's — this SC's own W3C source does not name motor impairments) |
| 3.2.3 | AA | NONE | No cross-page structural comparison (both scripts operate per-file/per-page) | Low-vision users who use screen magnification and rely on visual cues and page boundaries to locate repeated content quickly, and blind screen-reader users who navigate sequentially and rely on a consistent source order - both lose that shortcut when navigation's relative order changes from page to page, invisible to a single-page audit by construction |
| 3.2.4 | AA | NONE | No cross-page structural comparison | People who use screen readers, who rely on familiarity with a consistently-labeled function across pages, and people with cognitive limitations, for whom a control or icon whose identity (label, icon) changes across pages for the same function increases cognitive load |
| 3.2.6 | A | NONE | No cross-page structural comparison | People with cognitive disabilities who rely on finding help (contact, chat, FAQ) in the same relative place on every page |
| 3.3.1 | A | NONE | No form-submission/error-association check | Screen-reader users who submit a form and get no text-based indication of which field failed or why, and people with cognitive disabilities who can't tell what needs fixing |
| 3.3.2 | A | PARTIAL | Only checks `<input>`, not `<select>`/`<textarea>`; title/placeholder-only names remain review evidence rather than confirmed labels | Screen-reader and other AT users on an unlabeled `<select>` or `<textarea>`, or users who lose the only instruction when placeholder text disappears after typing |
| 3.3.7 | A | NONE | No multi-step-form field comparison | People with cognitive or motor disabilities forced to re-enter information (name, address) they already gave earlier in the same multi-step process |
| 3.3.8 | AA | PARTIAL | Custom or non-branded CAPTCHA and hand-rolled cognitive-function-test implementations | People with cognitive disabilities blocked by an in-house puzzle or CAPTCHA that isn't one of the handful of branded services this scan recognizes by fingerprint |
| 4.1.2 | A | PARTIAL | ARIA state/property correctness, invalid role values, custom-widget value exposure, form controls beyond buttons/links | AT users (screen readers, switch access, voice control) operating a custom widget whose ARIA is present but wrong, incomplete, or absent, so their AT announces a state that doesn't match reality or announces nothing useful |
| 4.1.3 | AA | NONE | No `aria-live`/`role="status"` detector | Screen-reader users who miss a status update (an item added to a cart, a background error, a loading state) because the page never announces the DOM change a sighted user would simply see |
| 1.2.2 | A | NONE | No caption-track check exists for prerecorded video (`<track kind="captions">`) | Deaf and hard-of-hearing viewers of prerecorded audio/video content |
| 1.2.3 | A | NONE | `<track kind="descriptions">` is a checkable structural artifact; no detector implemented | Blind and low-vision viewers who miss visual-only information a video conveys silently (actions, on-screen text, scene changes) |
| 1.2.5 | AA | NONE | Identical artifact to 1.2.3's caption-track check; no detector implemented | Same population as 1.2.3, at the stronger AA level WCAG sets because it treats audio description as the more reliable solution |

#### B. Where no tool can ever fully decide — the boundary of automation, not a Beacon gap — 7 criteria

These 7 are marked "machine-testable in principle: NO" in the table above. No static or
dynamic scanner, from any vendor, can structurally decide them: WCAG defines their failure
condition in terms of meaning a machine cannot judge (does this description convey what the
video shows, is this a binding legal or financial commitment, would a person find this
warning sufficient). This is the boundary of what automation can ever be, not a thing
Beacon chose not to build. It is exactly why human testing, named throughout this
document's Methodology section, is not an optional supplement to automated scanning —
these 7 criteria have no automated path at all, by any tool, ever.

| SC | Level | Why no tool can decide this structurally | Who that leaves out |
|---|---|---|---|
| 1.2.1 | A | Whether an audio-only or video-only transcript/alternative exists *and is accurate and complete* has no structural proxy | Deaf and hard-of-hearing users, who get no transcript of audio-only content, and blind and low-vision users, who get no description of what a video-only presentation shows |
| 1.2.4 | AA | Whether captions are present, synchronized, and accurate during a *live* broadcast cannot be checked outside the live event itself | Deaf and hard-of-hearing viewers of live streams, webinars, and broadcasts |
| 1.3.3 | A | Judging whether an instruction relies solely on shape, size, visual location, orientation, or sound requires reading and understanding the instruction's meaning, not its markup | Blind and low-vision users who cannot perceive a shape- or location-only reference (click the round button on the right). WCAG's own Understanding document names no specific population for the sound-only-cue half of this criterion - that clause rests on the SC's own text, not a sourced population claim |
| 2.5.1 | A | Whether a multipoint or path-based gesture has a single-pointer alternative is an interaction-design judgment, not a checkable DOM/CSS structure | People with motor impairments, including many single-finger-only touch and switch-device users, who cannot perform a pinch, multi-finger, or path-based gesture |
| 2.5.4 | A | Whether shaking/tilting a device to trigger an action has a UI alternative, and whether accidental motion can be disabled, is a runtime interaction property, not a static or structural pattern | People with mobility impairments who cannot tilt or shake a device, or who trigger a motion-based control by accident with no way to turn it off, and people whose device is mounted in a fixed position |
| 3.3.3 | AA | Suggesting a specific, correct fix for invalid input requires understanding both the error and a valid alternative — meaning, not structure | People with cognitive and learning disabilities who know something is wrong but have no idea what value would be accepted, and screen-reader users who need that same information stated in text |
| 3.3.4 | AA | Whether a reversible-confirm-or-review step exists for a legal, financial, or data-deleting action is a workflow judgment, not a DOM pattern | People with reading disabilities, who may transpose numbers and letters, and people with motor disabilities, who may hit the wrong key or button by mistake - both most exposed to a binding commitment or deletion submitted by mistake with no chance to review or undo it |

**53 criteria mapped** (46 in Group A + 7 in Group B) — every one of the 55 A+AA criteria
except the two FULL rows (2.4.2, 3.1.1), which are already qualified above as decided only
within automation's reach, not full conformance.

#### Persona Spectrum: the same limit, three durations

Frame: Microsoft's Inclusive Design Toolkit, "Persona Spectrum" — the same capability limit
appears as permanent, temporary, and situational, and the design requirement is identical
across all three. Three examples, drawn only from criteria this scan does not check:

1. **Limited precision in a sustained drag gesture (2.5.7, Dragging Movements - Group A,
   NONE) — an illustrative extension of the SC's Intent, not itself sourced to WCAG's
   Understanding page (which frames this criterion around precision/dexterity and adapted
   single-pointer devices, not hand count).** Permanent: someone with a tremor or a
   condition affecting fine motor control. Temporary: a wrist injury or a cast limiting
   precise, sustained pointer movement. Situational: someone operating a device one-handed
   and unsupported (holding a baby, a bag, a handrail), whose free hand loses the steadiness
   a supported grip would give it, trying to reorder a list or operate a slider. All three
   need a tap/click alternative to a drag gesture; none of the three get one from a detector
   this scan doesn't have.
2. **Needing more time than a fixed limit allows (2.2.1, Timing Adjustable — Group A,
   NONE).** Permanent: a cognitive or learning disability that slows reading and decision
   time. Temporary: recovering from a concussion or general anesthesia, with processing
   speed measurably reduced for days or weeks. Situational: filling out a form on a slow
   or unstable connection while also watching a toddler, so each step takes long enough
   that a session timer expires before the task is done.
3. **Cannot access audio right now (1.2.2, Captions (Prerecorded) — Group A, NONE).**
   Permanent: someone who is Deaf. Temporary: an ear infection or recent ear surgery.
   Situational — the case most sighted, hearing readers recognize immediately: watching a
   video with the sound off on a commuter train, in an open-plan office, or in a waiting
   room, because playing audio out loud isn't acceptable there. A person with full hearing
   is, in that moment, exactly as dependent on captions as someone who is Deaf.

The frame is descriptive, not statistical: it names why the same fix serves overlapping
groups, not how many people are in each group.

#### How many people does this leave out?

Not a number this document can produce, and stating one here would be fabrication, not
measurement. What can honestly be counted: the 53 rows above name roughly a dozen
recurring populations — blind and low-vision screen-reader/braille-display users, D/deaf
and hard-of-hearing users, deafblind users, colorblind users, people with photosensitive
seizure disorders, people with cognitive and learning disabilities, people with motor
impairments (including tremor and limited dexterity), speech-input users, keyboard-only
and switch-device users, and people using a fixed-mount device. That is a count of
**categories of need**, named by WCAG's own stated rationale and appearing repeatedly
across criteria — not a count of people, and not a share of any site's users.

No dataset ties a WCAG criterion to a number or a percentage of real users it protects.
Disability prevalence statistics, assistive-technology usage surveys, and
situational-limitation incidence are each measured separately, by different methods, for
different populations, at different times — and none of them decomposes per WCAG
criterion. Treating "14/55 criteria covered" as "X% of users protected" would blend two
quantities that were never the same kind of measurement (see the criteria-vs-instances
warning above); inventing a headcount or a "this protects N% of users" figure for this
table specifically would go one step further and publish a number with no source at all.
This document does not do either.

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

### 30-second report comprehension gate

Before a report layout is released, a person unfamiliar with Beacon must be able to
answer these questions from the report within 30 seconds:

1. What is the measured state of this page, and how much evidence supports it?
2. What should be fixed first?
3. What still requires browser, assistive-technology, or human testing?

The answer must come from the decision layer and its immediate next action, not from
reading the methodology. A numeric score alone cannot answer question 1. Long rationale
and teaching material belong in the methodology or external references, not ahead of
the first remediation action.

---

## Release gate (run in order)

```
node --test                                   # 483 tests, all green as of v3.3.2
node build.mjs --check                        # generated copies match core
node tools/measure-detectors.mjs              # report-only characterization
node tools/measure-semantic.mjs --min-precision 1.0 --min-recall 0.4
# benchmark re-run (needs local snapshots; see benchmark/2026-07-05/README.md):
#   node capture-audit.mjs --audit-only && node analyze.mjs
# GT re-verify on detector changes: FP-elimination kept, TPs retained
# if scoring changed intentionally: node tools/regen-golden.mjs + explain the diff
```

Record in CHANGELOG: engine version, Spearman, and (when GT re-ran) P/R.

## Measured state (2026-07-27, engines `beacon-static-audit@12` + `beacon-tier2-audit@2`)

| Metric | Value |
|---|---|
| Spearman vs Lighthouse a11y (n=71) | 0.354 (@3) → 0.474 (@4) → 0.488 (@5/@6) → 0.480 (@7) → 0.477 (@8) → 0.468 (@9); no @10-@12 rerun — @10/@11 add only `check:'review'` findings and @12 was confirmed byte-identical on all 20 GT + 86 benchmark-population sites (below), so all three are expected score-neutral on this cohort (not yet empirically re-run) |
| Ground-truth P/R, pattern-level | @4: 0.600 / 0.591 → @6: 0.979 / 0.712 → @8/@9/@10/@11/@12: **1.000 / 0.727** (48/48 TPs incl. the recovered aria-heading case; FP 0; @9-@12 are category-level-neutral, findings unchanged for GT purposes — contrast is not a GT criterion, `@10`/`@11` findings are all `check:'review'` (never touched by GT's FP adjudication), and @12's `html-lang-*`/`document-title-missing` fixes produced zero finding-set diff on all 20 GT site snapshots, re-verified directly) · Lighthouse 0.811 / 0.462 |
| Ground-truth recall, instance-level | @4: 0.743 → @6: 0.826 → @8/@9/@10/@11/@12: **0.829** · Lighthouse 0.225 |
| @12 title/lang bug fix retention | Old-vs-new engine diff on `html-lang-*`/`document-title-missing` findings, final (post-correction) version: 20/20 GT sites zero diff; 86-site `benchmark/2026-07-05/` population zero diff (ADDED 0 / REMOVED 0) — see the `@12` engine-section detail above for the head/body-scoped first attempt's one false positive (linear.app idx 77) and the fix that removed it |
| @5 re-verification | 14/15 FP classes eliminated, 39/39 TPs retained, 18 new catches |
| @7 wild input-label FP elimination | 46/57 findings were wrapped-input FPs → 0; only jnto (+20) and spotify (+8) moved |
| @9 thin-evidence state (`insufficient-evidence`, N=3) | Spearman 0.477 → 0.468 (n=71); score-delta median \|Δ\| 7, p95 19, max 23 across 85 comparable sites, 18 band flips; `total_findings` byte-identical @8→@9 on all 85 sites incl. all 7 `gt-remap-6` sites (finding emission unaffected) — SUPERSEDED by @17 below |
| @17 A+ scoring fix (thin evidence scores, `thin: true` flag, retires `insufficient-evidence`; user ruling 2026-08-08) | 38/40 sites moved on `test/wild-corpus/` (real captured pages), median \|Δ\| 7, max \|Δ\| 58 (cuni.cz, the L2 KNOWN VIOLATION motivating case, recovers 0→58); finding keys byte-identical on all 40 sites (scoring-only change, `node --test`). No fresh Spearman/P/R rerun against Lighthouse or GT for @17 — findings are unaffected by this change so both are expected unchanged from @12, not yet empirically re-verified. Full per-site table: `benchmark/2026-08-08-aplus-movement.md` |
| @18 six FP-class fixes (2026-08 hunt round 2: quote-aware `isHiddenAttrs`; `quality-flags` visible() gate; link-name entity decoding; static-contrast PUA/icon classification → 1.4.11 3:1, new `non-text-contrast-sub-threshold` key; input-label accname chain, new `input-label-weak` review key, 3.3.2 relabelled Level A; motion demoted to `check:'review'`/`level:'AAA'`, out of scoring and `legal_risk` mapping, trigger rewritten to motion-bearing-property + markup-reachability) | 31/40 sites moved on `test/wild-corpus/`, verified against the committed @17 engine run side by side (not inferred) — 5 fixes: 19/40 moved (`benchmark/2026-08-10-at18-fpclass-movement.md`); motion item: 30/40 moved on top of that (`benchmark/2026-08-10-at18-item6-motion-movement.md`, includes a hakuso-round-1 follow-up fixing an animation-shorthand token-scan bug and adding `transition: all` as motion-bearing, 1/40 additionally moved with no score change since motion was already out of scoring). No finding key was lost or gained outside the five/six fixes' own new keys (`non-text-contrast-sub-threshold`, `input-label-weak`); every other key change is a count movement of an existing key. Golden vectors: `clean.expected.json` coverage 66%→61% (motion category `scored`/100→`not-machine-checkable` — it leaves the scored set, which is exactly why coverage drops; unaffected by overall score, confidence stays `medium`); `dirty.expected.json` coverage/confidence/score unchanged (61%/`medium`/9) — the golden dirty fixture gained a second, genuinely nameless `<input>` (fixture hygiene fix, hakuso round 1) specifically so `input-label-missing` stays exercised alongside the new `input-label-weak` case, which nets out to the same coverage share. No fresh Spearman/P/R rerun for @18 — same status as @17. |
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
6. ~~Engine @9 thin-evidence category state~~ DONE 2026-07-22: `insufficient-evidence`
   (N=3 floor) ships; benchmark rerun Spearman 0.477 → 0.468 (n=71), score-delta median
   7 / p95 19 / max 23 across 85 sites, 18 band flips; GT retention confirmed
   (`total_findings` byte-identical @8→@9 on all 85 sites incl. `gt-remap-6`). SUPERSEDED:
   this exclusion mechanism was the L2 KNOWN VIOLATION's root cause (a thin category could
   exit the weighted denominator and drag the overall the wrong way when a violation was
   fixed) — see item 7.
7. ~~L2 monotonicity KNOWN VIOLATION / engine @17 A+ scoring fix~~ DONE 2026-08-08 (user
   ruling): retired `insufficient-evidence`; any auditable evidence now scores and stays in
   the weighted denominator, with `thin: true` as a same-line report qualifier instead of an
   exclusion. `test/scoring-properties.test.mjs`'s `todo` monotonicity test now passes for
   real. 38/40 `test/wild-corpus/` sites moved (median |Δ| 7, max |Δ| 58), finding keys
   unchanged (`benchmark/2026-08-08-aplus-movement.md`). N=3 stays an open calibration knob
   for the `thin` flag (CHANGELOG 3.2.0).
