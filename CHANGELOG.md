# Changelog

All notable changes to Beacon are documented here. Versions follow the plugin
manifest (`.claude-plugin/plugin.json`); dates are release-prep dates.

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
