# Changelog

All notable changes to Beacon are documented here. Versions follow the plugin
manifest (`.claude-plugin/plugin.json`); dates are release-prep dates.

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
