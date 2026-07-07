# Changelog

All notable changes to Beacon are documented here. Versions follow the plugin
manifest (`.claude-plugin/plugin.json`); dates are release-prep dates.

## [Unreleased]

Scoring-semantics overhaul driven by the 2026-07-05 scoring-validity audit.
**Breaking: scores shift versus 2.3.0** (`DETECTOR_VERSION` → `beacon-static-audit@3`).

### Changed

- **Category states**: a category with no machine evidence now reports
  `state: "not-machine-checkable"` (review-only) or `"not-applicable"` (no evidence) with
  `score: null`. The former placeholder scores (constant 60 for review-only categories,
  100 for empty ones) are gone — absence of evidence is no longer presented as a score.
- **Overall score** is the weighted average over scored categories only, weights
  renormalised; `summary.coverage_percent` reports the share of scoring weight actually
  measured. This removes the old hidden ceiling of 86 that made the 90+ band unreachable.
- **Report**: the category table column that rendered the score under a "Coverage" header
  is now labelled Score; real weight coverage appears under the hero rings; unscored
  categories render text state badges instead of score bars.
- **Gradient restoration**: named buttons, labelled inputs, alt-carrying images, named
  links, and keyboard-paired click handlers now count as passes, so keyboard and forms
  scores are proportions instead of binary {100, 0}.
- **Life-safety gate**: a confirmed critical on WCAG 2.3.1 caps the overall score at 49,
  sets `summary.life_safety_flag`, and renders a dedicated report banner — category
  weights can no longer dilute a seizure risk.
- **Merge ingestion**: `--merge-findings` accepts `check: "pass"` for externally verified
  passes (previously silently coerced to FAIL); unknown check values are skipped with a
  warning instead of becoming fails.
- **`confidence_level`** is derived from measured coverage (low / medium; the static
  pipeline never claims high) instead of being hardcoded to `medium`.
- **Score bands** are emitted in the artifact (`summary.score_bands`) as the single source
  for report colouring and docs; the stale 4-band interpretation table and the retired
  44-site narrative ranges were removed from inspect.md.

### Fixed (validated on the committed 87-site benchmark, `benchmark/2026-07-05/`)

Engine `beacon-static-audit@4`. Each false-positive class below was found by per-site
adversarial diagnosis of Beacon-vs-Lighthouse rank outliers, verified against the raw
markup, then fixed test-first. Re-running the identical snapshots moved Spearman rank
correlation with Lighthouse a11y from **0.354 to 0.474** (n=71 pairs).

- **Attribute-order sensitivity**: `viewport-meta-missing`, `meta-description-missing`,
  and `canonical-missing` fired whenever `content=` / `href=` / `data-rh=` preceded
  `name=` / `rel=` (React Helmet et al.). Four benchmark sites were falsely flagged; a
  single phantom viewport fail zeroed the whole responsive category.
- **`image-alt-missing`** now exempts images removed from the accessibility tree:
  `aria-hidden="true"`, `role="presentation|none"`, inline `display:none` (tracking
  pixels, preload stashes). One site carried 14 false criticals from this class alone.
- **Adjacent nameless buttons** no longer merge into one greedy regex match (the inner
  tag group swallowed `</button>`), so icon-button rows are counted per instance.
- **Severity stacking cap**: the per-category severity penalty counts at most 3 instances
  per finding key — 9 identical criticals stamped out by one reused nav template had
  floored a 96%-passing category to 0. All instances still count in the pass/fail base.
- **New detector `frame-title-missing`** (WCAG 4.1.2): statically detectable and
  previously a silent gap that let iframe-heavy pages score 100.

### Fixed (round 2 — validated on the 2026-07-06 ground-truth study, `benchmark/2026-07-06-ground-truth/`)

Engine `beacon-static-audit@5`. Driven by a 20-site evidence-anchored violation
inventory (10 structural criterion classes, triangulated + adversarially verified).
Against it: 14/15 unambiguous false-positive classes eliminated, 39/39 true positives
retained, 18 previously-missed violation patterns now caught. Benchmark Spearman vs
Lighthouse a11y: 0.474 → 0.488.

- **Hidden-subtree masking** (`computeHiddenRanges`): elements inside inline
  `display:none` / `visibility:hidden`, `aria-hidden="true"`, or `[hidden]` subtrees
  produce no findings AND no passes across all markup detectors (img, iframe, link,
  button, input, list, clickable, headings). The dominant ground-truth FP class —
  hidden tracking iframes, preload images, collapsed carousels/menus — dies here
  (rakuten.co.jp alone: 125 false image-alt criticals).
- **`document-title-missing`** no longer fires on `<title data-next-head="">…</title>`
  (attribute-bearing title tags; hit Next.js sites).
- **img/iframe detectors respect script masking**: template literals inside `<script>`
  bodies are not elements.
- **Button accessible-name computation descends**: a child carrying a non-empty
  `aria-label` (e.g. a labelled `<svg>`) names its button.
- **Link wrapped-image alt semantics**: a wrapped `<img alt="text">` names the link
  (pass); all-`alt=""` wrapped images leave the link nameless (now a caught violation —
  previously silently deferred); images with no alt stay deferred to image-alt.
- **Hidden headings excluded from the outline sequence** (a `display:none` h2 no longer
  bridges an h1→h3 skip).

### Added — validation charter (engine `beacon-static-audit@6`)

`VALIDATION.md` makes the whole validity discipline executable and model-agnostic
(written so any capable maintainer or LLM can run it without session context):

- **Golden test vectors** (`test/golden/` + `test/golden-vectors.test.mjs`): committed
  input → committed expected artifact; pins the reachable top (clean=100) and the fail
  band (dirty=9, 13 criticals). Regenerate intentionally via `test/golden/regen.mjs`.
- **Scoring property tests** (`test/scoring-properties.test.mjs`): monotonicity,
  injection dose-response (self-ground-truthed), and cross-stack fairness — which
  caught a real bug on first run: `data-reactid` contains the substring `id=` and
  suppressed unlabelled-input findings on React pages only. Fixed (`\sid=` anchoring),
  closing the documented data-id blind spot.
- **Cross-machine determinism**: engine sorts its file list and normalises path
  separators; new CI matrix (`.github/workflows/validation.yml`, 3 OS × 2 Node) fails
  on any platform-dependent artifact diff.
- **Drift comparator** (`tools/drift-compare.mjs`): score-delta distribution / band
  flips between two benchmark runs — the instrument for the temporal-baseline and
  two-machine experiments that will publish the score's error bar.
- Benchmark rank correlation unchanged vs @5 (Spearman 0.488).

### Fixed (round 3 — engine `beacon-static-audit@7`, driven by the CJK FP study `benchmark/2026-07-07-cjk-fp/`)

- **Wrapping-label recognition**: `input-label-missing` no longer flags inputs inside
  `<label>…</label>` and credits them as forms passes. This killed 46 of the
  detector's 57 findings across the 88-site benchmark (81% FP rate — the largest
  remaining wild FP class, concentrated on jnto.go.jp ×43 and spotify.com ×3).
- **Phantom-range masking (latent since @5)**: both range scanners
  (`computeHiddenRanges`, new `computeLabelRanges`) previously tokenized raw text, so
  a tag token inside a `<script>` template string or an HTML comment could open a
  phantom range and silently swallow every downstream finding on the page. Tag tokens
  inside script/style bodies and HTML comments are now invisible to the scanners, and
  commented-out markup no longer yields findings or passes for any markup detector.
  Known residual (documented in-code): `<!--` inside an attribute value still leaks;
  needs a real lexer; not hit by any known benchmark page.
- Gate: three-round adversarial review (two empirically-reproduced BLOCKs fixed, then
  PASS), 12 new adversarial regression tests (322 total), goldens unchanged except the
  engine fingerprint, semantic held-out gate green.
- Effect on the 88-site benchmark: only the two FP-carrying sites moved (jnto +20,
  spotify +8, one band flip fail→needs-work); all other 83 compared sites byte-stable.
  Spearman vs Lighthouse 0.488 → 0.480 (n=71; within the ±1-point capture-noise floor,
  and the fix is ground-truth-driven, not rank-driven). Ground-truth re-verify at @7:
  47/47 flagged violations retained, the single known FP (aria-heading) unchanged —
  the @6 P/R (0.979 / 0.712) carries to @7 on the ground-truth scope.

### Measured (2026-07-07 — validation results for engine @6)

- **Official ground-truth P/R after the detector fixes** (full @6 re-mapping of the
  20-site inventory; every residue finding adjudicated + adversarially re-verified):
  precision 0.600 → **0.979**, pattern recall 0.591 → **0.712**, instance recall
  0.743 → **0.826**; FP patterns 26 → **1** (the known aria-heading bridging gap on
  ibm.com). Lighthouse on the same inventory: 0.811 / 0.462 / 0.225. Zero new
  violations entered the pool, so the numbers are directly comparable to @4. See
  `benchmark/2026-07-06-ground-truth/README.md`.
- **Temporal score drift baseline** (2-day window, 13-site stratified subset, same
  machine, pinned capture recipe): median |Δ| 0, p95 |Δ| 1, max 1, zero band flips —
  the same-machine error bar is ±1 point (VALIDATION.md L0). Cross-machine bar still
  unmeasured.
- **rakuten link-name spot-check resolved**: the hidden-subtree walker is correct, not
  over-masking — all 83 eliminated candidates sit in genuine inline-hidden subtrees
  (72 cloned genre-tab carousel panels).

## [2.3.0] — 2026-06-26

Held-out-driven detector precision/recall improvements; each fix is validated by
the held-out case it targets, which then becomes a regression guard.

### Improved

- **aria-hidden-on-focusable** no longer flags an element already made inert with
  `tabindex="-1"` (the canonical remediation): precision 0.67 → 1.00.
- **3.3.8 authentication** strips HTML comments before scanning, so captcha markup
  quoted in a comment is not treated as a live barrier: precision 0.88 → 1.00.
- **3.1.1 language** now detects Latin-vs-Latin mismatches (English declared over
  French / German / Spanish / Vietnamese, etc.) via a function-word profile,
  closing the script-counting blind spot: recall 0.50 → 1.00, precision still 1.00.
- **prescriptive-input-copy / positive-tabindex** gain a dependency-free structural
  strip (HTML comments + `<code>`/`<pre>` blocks, plus a string-respecting JS
  comment lexer), so they stop firing on copy/attributes quoted in comments or
  example code while still matching real copy and user-facing string literals
  (innerHTML, Lit templates): tabindex precision 0.50 → 0.78, prescriptive
  0.50 → 0.71.

### Changed

- CI hard-gates the semantic held-out (`measure-semantic --min-precision 1.0
  --min-recall 0.4`); `measure-detectors` stays report-only because its
  FP/FN-ceiling corpora are a growing characterization set. Fixed a bug where
  `measure-detectors` scored the language/auth corpora as ~30 spurious false
  negatives.

### Notes

- The remaining false positives and negatives need a real parser or page
  semantics, and are deliberately left so the detectors stay dependency-free:
  whether a string literal is user-facing (innerHTML copy vs a debug/test string),
  aria-hidden across a DOM tree, CSS auto-fill reflow, and obfuscated or
  non-English source-level auth barriers.

## [2.2.0] — 2026-06-25

Ships the **Pattern Library v1.0** (detectors become shared, contributable data)
and folds in the detector, PDF, language, authentication, and audit-integrity
work committed on the branch since v2.1.0.

### Added

- **Declarative pattern library for the advisor detectors.** The web and PDF
  detectors run by the PostToolUse hook (`scripts/a11y-advisor-hook.mjs`) and the
  codex advisor (`adapters/codex/scripts/advisor.mjs`) are no longer hardcoded in
  each script. They are declarative records in `core/patterns/` (`web.json`,
  `pdf.json`), validated against `wcag-catalog.json` and executed by one shared
  interpreter, `core/scripts/pattern-runtime.mjs`. Both surfaces import the same
  runtime and load the same records, so they can no longer drift; the two copies
  had already diverged in four guards and two detectors before this change. 13
  records (9 web + 4 PDF) reproduce every prior detector.
- **`tools/validate-patterns.mjs`** with five gates on every record: schema, regex
  compilation, namespaced-unique id, WCAG-catalog cross-check, and a claim + leak
  lint (no over-claims, REVIEW-band messages must hedge, and `fix.example` may
  contain only synthetic identifiers so a contributed record cannot leak client
  code).
- **Characterization baseline** `test/detector-baseline.test.mjs` locking every
  web + PDF detector's fire/silent behaviour across both runtimes; the prior hook
  test had covered none of the web detectors. Plus `test/pattern-runtime.test.mjs`
  and `test/patterns-schema.test.mjs`.
- **Deterministic detector measurement harness** (`tools/measure-detectors.mjs`)
  over a labelled corpus (`corpus/*.cases.json`), reporting per-detector
  precision/recall (TP/FP/FN). Ships a calibration seed set plus a **held-out set
  (41 real-world cases)** for the four known regex-ceiling modes
  (prescriptive-input-copy, positive-tabindex, fixed-minmax-reflow,
  aria-hidden-on-focusable); held-out P/R 0.56/0.58 records the ceiling as a
  regression baseline. The held-out collection also surfaced two
  previously-undocumented misfires: aria-hidden flags the canonical `tabindex="-1"`
  remediation, and fixed-minmax flags auto-fill RAM grids.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): `node --test`, build
  `--check` parity, and the detector measurement (report-only).
- **WCAG 3.1.1 declared-vs-content language mismatch** detection in `static-audit`
  (flags an `<html lang>` that disagrees with the page's actual language), wired
  into Tier-2 so it also covers SPA/CSR pages.
- **WCAG 3.3.8 authentication barriers** (source-level): JS-set passwords,
  clipboard blocks on auth fields, and hCaptcha-style cognitive function tests.
- **PDF accessibility probe** in `static-audit` (WCAG 1.3.1 / 2.4.2 / 3.1.1 /
  4.1.x) and a **`pdf-triage` batch CLI** for auditing a site's PDFs; the codex
  advisor gains PDF-generation parity with the CC hook.
- **`quality-detect`** heuristic content-quality red-flags (generic alt text, bare
  link text).
- **WCAG 3.1.2 Language of Parts** (unmarked foreign passages) — *experimental*:
  the static heuristic over-flags on real multilingual pages and is not relied
  upon for scoring (see Notes).
- **Keyboard `focus-flow` + multi-state auditing** — the analyzer ships, but live
  capture is not reliable on real pages, so keyboard review stays manual (see
  Notes).

### Changed

- **The two detector runtimes were reconciled before externalisation** (a
  deliberate, reviewed behaviour merge, locked by the baseline): the CC hook
  gained `keydown|keyup` suppression on click handlers, a `<div>/<span> onClick`
  detector, a word-boundary on `outline`, and the tighter `min(Npx, 100%)` reflow
  guard; the codex advisor gained the `:focus`-without-`:focus-visible` detector
  and per-line `aria-hidden` scanning. Detector behaviour is otherwise preserved.
- **Audit integrity** (P1/P3/P8): `static-audit.mjs` is now the sole author of
  `audit-results.json` (P1); each run stamps an `engine_fingerprint` for
  reproducibility (P3); and LLM judgement is quarantined out of the deterministic
  machine score (P8).
- **Report palette**: cool-slate scheme; fixed a muddy score-ring colour.

### Fixed

- **PDF detection**: catalog-aware secondary-marker resolution (11 false positives
  → 0).
- **auth-hcaptcha** word boundary + a PDF encryption-suppression follow-up (P5).
- **static-audit** now reads an unquoted `<html lang=…>`.
- Addressed independent codex-review findings on the 3.1.1 / 3.x detectors.

### Docs

- Published the auth-detect and pdf-detect false-positive tables.
- Added OCRmyPDF (OCR text-layer remediation) and veraPDF to the PDF tools
  reference.

### Notes

- The pattern library is **v1.0 (data-only)**: detectors become declarative and
  contribution-ready, but the contribution flow (agent drafts, human approves, PR;
  CI schema-validation; local memory) is deferred to v1.1, and cross-person
  aggregation to v2. See [ROADMAP.md](./ROADMAP.md).
- **Precision posture (held-out validated).** The language (3.1.1) and
  authentication (3.3.8) detectors now have a held-out validation set
  (`corpus/holdout-{lang,auth}.cases.json`, 36 realistic cases, scored by
  `tools/measure-semantic.mjs`). Scoped results:
  - **3.1.1** precision 1.00 / recall 0.50 — no false flags (holds even on CJK
    pages that are ~55% Latin); reliably catches CJK-vs-Latin and cross-CJK-script
    (zh/ja/ko) mismatches and country-code-as-language errors, but is
    **structurally blind to Latin-language-vs-Latin-language** mismatches (it
    counts scripts, so an en-declared French / German / Spanish / Vietnamese page
    reads as "Latin" and passes). The recall ceiling is the script method itself,
    not a defect.
  - **3.3.8** precision 0.88 / recall 0.54 — catches inline markup/JS barriers
    (paste-blocked password, text CAPTCHA, reCAPTCHA v2 / hCaptcha, inline
    clipboard block); the heuristic source scan misses obfuscated / aliased /
    non-English-prompt / form-level cases, and it scans HTML comments (so captcha
    markup quoted in a comment can false-positive).
  - **3.1.2** stays experimental and **gated off** in static-audit (0 TP / 2 FP on
    real pages); keyboard `focus-flow` runtime capture is not reliable, so keyboard
    review stays manual. Neither carries an external precision claim.

## [2.1.0] — 2026-06-06

### Added

- **Lighthouse performance signal in `beacon:inspect`.** Inspect now runs
  Lighthouse for the three categories axe-core does not cover — performance,
  best-practices, and SEO — and surfaces them in a new **Performance** tab in
  the HTML report. The Lighthouse run executes in parallel with the Tier 2
  axe-core audit (performance needs a cold load; axe needs the warm, rendered
  DOM), so the two never share a page load and total wall-clock collapses to the
  slower of the two.
- **Cross-cutting root causes.** `scripts/lighthouse-extract.mjs` derives signals
  where a single root cause spans multiple dimensions — e.g. an oversized DOM
  that at once slows style & layout (performance), burdens screen-reader
  traversal (accessibility), and hampers structure extraction for AI crawlers
  (AEO). This is the insight no single-purpose tool surfaces on its own.
- **`scripts/lighthouse-extract.mjs`** — normalizes a raw Lighthouse report into
  a compact `lighthouse` object (category scores, Core Web Vitals, main-thread
  breakdown, DOM stats, opportunities, best-practices/SEO issues). Handles the
  Lighthouse 13.x `dom-size` → `dom-size-insight` audit rename. Registered in the
  build manifest and exported for testing.
- 9 unit tests for the extractor (`test/lighthouse-extract.test.mjs`).

### Notes

- The Lighthouse signal is **supplementary** and is **not** folded into the
  Beacon accessibility score. axe-core remains the accessibility engine.
  Lighthouse scores swing run-to-run with device emulation, CPU throttle, and
  machine load, and are presented as directional, not absolute (the CLI default
  is mobile + 4x CPU throttle; `--preset=desktop` typically scores 15-25 points
  higher).
- **Backward compatible.** Audits without a `lighthouse` object render exactly as
  before — no Performance tab, no score change. The step is skipped when
  Lighthouse or Chrome is unavailable.

## [2.0.10] — 2026-05-31

### Added

- **Phase A core-extraction build system.** A single source of truth in `core/`
  now drives every generated output. `build.mjs` regenerates `commands/`,
  `scripts/`, `references/`, and `adapters/codex/` from `core/` via an
  `@cc`/`@codex` marker grammar (`tools/markers.mjs`), an explicit GENERATED
  manifest (`tools/manifest.mjs`), and an LCS variant-merge (`tools/lcs.mjs`).
  `build.mjs --check` fails on any stale output, guarding byte-identity.
- **Codex adapter** (`adapters/codex/`). Beacon runs as a Codex skill carrying
  the same accessibility + AEO knowledge without the Claude Code hook layer,
  deployed via `tools/deploy-codex.mjs`.
- **Deterministic Tier 1 scanner** `scripts/static-audit.mjs` — a
  zero-dependency, browser-free static audit that writes a
  `generate-report.mjs`-compatible `audit-results.json`. New detectors: link
  accessible-name, list structure, meta-viewport-zoom, frame-title, and scaled
  contrast heuristics; `aria-hidden` subtrees are skipped to cut false positives.
- **Contrast verification gate** in `beacon:inspect`: a static-only run can no
  longer report a passing contrast score — it must set
  `"requires_live_audit": true` and emit contrast as an explicit unverified item.
- **Step 2 automated scan is default-on**, closing the axe-core contrast
  detection gap (a 50-site survey found contrast violations the static scanner
  structurally cannot see on 18 of 50 sites).
- Test suite: `build-manifest`, `build-roundtrip`, `marker-parser`,
  `static-audit-detectors`.

## [2.0.9] — 2026-05-31

Baseline for this changelog. Highlights of the line that preceded the Phase A
refactor: AEO sub-score honesty disclaimer, full bilingual (zh/en) report,
Methodology & Limits tab, theme toggle, suggestion-toned vocabulary, and
HTML-escaping of user-supplied text in the report generator.

[2.1.0]: https://github.com/chiehweihuang/beacon/compare/v2.0.10...v2.1.0
[2.0.10]: https://github.com/chiehweihuang/beacon/compare/v2.0.9...v2.0.10
[2.0.9]: https://github.com/chiehweihuang/beacon/releases/tag/v2.0.9
