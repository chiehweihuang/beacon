# Changelog

## [Unreleased]

### Added

- **Viewport tiers** (`core/scripts/viewport-tiers.mjs`): three nested check levels
  (`quick`, `feature`, `full`) with more phone widths and fewer laptop/tablet widths.
  Phone, tablet, and the unfolded Galaxy Z Fold 6 (744x860) run under Playwright mobile
  emulation; 320x720 stays unemulated (WCAG 1.4.10 is a zoom width, not a device).
- **UI gate hook** (`scripts/beacon-ui-gate.mjs`, wired in `hooks/hooks.json`): `Stop`
  blocks once per turn when UI files changed without a covering `quick` design-qa result;
  `PreToolUse` denies `git commit` without a `feature`-level result.

### Changed

- `design-qa.mjs`: `--level` (default `full`), per-viewport browser contexts with
  emulation, `metadata.level`, `metadata.viewports` now lists labels; engine
  `beacon-design-qa@2`.
- `tier2-audit.mjs`: `--level` (default `feature`: 320x720, 360x780, 768x1024, 1280x900);
  engine `beacon-tier2-audit@3` because touch-target findings change under emulation.

## [3.6.0] — 2026-08-29

### Added

- **Reader task audit module** (`core/scripts/reader-task-audit.mjs`): browser/agent task
  evidence — site intent, task outcomes, non-visual surface — kept structurally out of
  scoring and the summary. Originated in a parallel session; shipped as-is with green
  tests in the combined suite.

- **Jurisdiction data module** (`core/scripts/jurisdictions.mjs`, primary-source research
  dated 2026-08-29 in `plans/2026-08-29-jurisdiction-expansion/`, including a same-day
  verification pass): expands legal-section coverage from 6 hardcoded jurisdiction
  strings to 23 jurisdictions across three tiers (`specific-law` /
  `framework-no-web-specifics` / `no-specific-law`) and three presentation styles
  (full card / regional-comparison group / one-line honest-null) — China, South Korea,
  Hong Kong SAR, Macau SAR, and Mongolia (East Asia); Brazil, Argentina, Colombia, and
  Peru as full cards (Peru's private-sector clause was upgraded to primary-quoted in the
  verification pass, promoting it out of the comparison group) plus Chile/Uruguay/Ecuador
  as a South American comparison group and Venezuela/Bolivia/Paraguay/Guyana/Suriname as
  one-line honest-nulls (South America), on top of the corrected existing six.
- **Verification pass incorporated**: South Korea's cited statute (지능정보화기본법
  제46조) was superseded — repealed 2025-01-21, replaced with 디지털포용법
  (Digital Inclusion Act) 제19조, in force 2026-01-22; the data module cites the new
  law. Hong Kong's Digital Policy Office handbook now targets WCAG 2.2 A/AA (was cited
  as 2.0, now stale). Still-open flags (Macau gazette exhaustiveness, Mongolia article
  number, Colombia WCAG level, Brazil ABNT NBR 17225 mandatory status, Ecuador's exact
  article number) render with explicit uncertainty markers, never as bare fact.

### Fixed

- **Six wrong or misleadingly incomplete jurisdiction claims corrected** (primary-source
  research, `plans/2026-08-29-jurisdiction-expansion/existing-six-deepened.md`):
  - US: `core/references/cases.md`'s Domino's v. Robles entry said "Supreme Court
    confirmed ADA applies to websites/apps" — the Supreme Court denied certiorari
    (2019-10-07) without ruling on the merits; the Ninth Circuit ruling stands as binding
    precedent in that circuit, not a nationwide holding.
  - Canada: the ACA has no binding digital/ICT technical standard yet — EN 301 549 was
    adopted voluntarily (May 2024); the binding Digital Technologies Accessibility
    Regulations don't come into force until 2027 (federal public sector) / 2028 (large
    federally-regulated private sector).
  - Taiwan: 身心障礙者權益保障法第52條之2 binds government agencies and schools only —
    zero general private-sector obligation, now stated explicitly rather than hedged.
  - Japan: JIS X 8341-3 conformance is not itself a legal mandate for private business —
    only the 2024-04-01 reasonable-accommodation duty (case-by-case, on request) is a
    legal duty; JIS sits under 環境の整備 (preparatory groundwork), not a standalone
    violation trigger.
  - EU: the EAA's actual technical standard is EN 301 549 (which embeds WCAG 2.1/2.2 AA
    for web content, plus non-web ICT requirements), not WCAG alone; scope is enumerated
    products/services (not a general website law) with a microenterprise carve-out and a
    transition to 2030 for pre-2025 service contracts.
  - Australia: WCAG 2.1 AA is AHRC 2014 advisory guidance, not a statutory requirement —
    the DDA itself names no technical standard; added Maguire v. SOCOG (2000), the actual
    landmark web-accessibility case (AUD 20,000 damages), replacing the absence of any
    real case citation.
- **Per-finding `legal_exposure` derives from the finding's actual WCAG level** instead
  of one identical hardcoded string ("May affect ADA / EAA / JIS / Taiwan accessibility
  expectations depending on deployment context.") on every finding regardless of level —
  an AAA-level best-practice item now correctly states that no tracked jurisdiction's
  binding standard requires AAA, while A/AA findings get a jurisdiction list derived from
  the data module plus an explicit "summary-level technical mapping, not a legal
  determination" caveat. Fixed in both `static-audit.mjs`'s `addFinding()` default and
  `tier2-audit.mjs`'s `baseFinding()` default (the merge funnel never forwards
  `legal_exposure` across the boundary, so this also fixes every merged tier-2 finding).
- **Report legal section (§06) renders per-jurisdiction cards from the data module**
  instead of six near-identical hardcoded risk-cards sharing one templated hedge
  sentence and one duplicated WCAG-criteria line per card; the duplicated line is now
  stated once in the shared context note. Design gates unchanged (bilingual, no
  color-alone signaling, explicit font stacks).

## [3.5.0] — 2026-08-29

### Changed

- **Engine bumped `beacon-static-audit@18` → `@19`**: detection behavior changed
  (click-handler demote, `action` field, touch-finding merge, decided-sample contrast
  gate — see below), per repo convention that carries a bump.
- **Report judgment-precision overhaul** (user ruling 2026-08-29, reproduced live on
  chiehweihuang.github.io/zh.html): `click-handler-keyboard-missing` is a proximity
  heuristic that cannot see element semantics (native `<button>` vs. a real keyboard trap,
  or a passive/analytics listener) — it never emits `critical`/`fail` anymore, demoted to
  `check:'review'` with a mandatory verification caveat in its description (both the raw
  finding and the report's `FINDING_I18N` copy, which previously shadowed it and rendered
  in neither language).
- Every finding now carries an `action` field derived once in `addFinding()`:
  `'direct-fix'` (`check:'fail'`), `'design-judgment'` (`check:'review'` and a key ending
  `-advisory` — a non-normative best-practice suggestion, e.g. touch-target comfort
  sizing), or `'human-verify'` (everything else under `check:'review'`). Rendered on every
  finding card, not just in the JSON, so an agent triaging report text alone can read it.
- Tier-2 touch findings are deduplicated by `(key, selector)` at `--merge-findings` time:
  one DOM element measured at N viewports becomes one finding carrying a per-viewport
  measurement list and a min/max range, instead of N flat instances (was reading "×14" for
  7 unique elements × 2 viewports).
- `--merge-findings`'s implicit "clean contrast pass" derivation now credits only
  **decided** browser-measured samples (`tier2-audit.mjs`'s new
  `countDecidedContrastSamples` / `contrast_samples_decided`), not the raw capture count —
  a sample the analyzer skips as "nothing to measure" (invisible/transparent ink) is
  neither a pass nor a fail and must never inflate the pass count. Older tier2 artifacts
  without the new field fall back to the raw count, and now log which artifact triggered
  the fallback. The report's "mostly derived" disclosure tracks the real fraction
  (`derived_pass` vs. `pass`) instead of a hardcoded "mostly" — says "all" when it's all.
- `mergeExternalFindings` now passes `affected_users` and `description` through for every
  merged finding (previously dropped on the floor — the highest-visibility "who is
  affected" line on a merged tier-2 finding rendered empty, and its limitation/blind-spot
  text was silently lost even though `tier2-audit.mjs` authors both fields).
- Report layout: one calibrated confirmed-problem / needs-human-check headline sentence
  (decision layer and client summary now share one framing, instead of a second "N issues,
  M critical... batch-fixable patterns" vocabulary in the client summary); "fix these next"
  split into confirmed-to-fix vs. needs-judgment-or-verification tiers, independently
  ranked, with truthful coverage math instead of a flat "100% of everything found"; every
  finding card gets a verdict sentence (通過/不通過/需人工/看不到), its measured wild
  precision with a 95% CI and the engine version it was measured on (or an explicit
  "not yet measured" disclosure), and its blind-spot description; methodology + legal
  sections collapsed behind closed `<details>` by default; engine fingerprint moved out of
  the masthead into the footer only.

### Fixed

- **XSS**: a `--merge-findings` viewport label was interpolated into `report.html`
  unescaped in the merged-touch measurement line; now escaped like every other untrusted
  string field.
- The JSON-LD-missing fix text listed six schema types with no default, forcing an
  arbitrary content decision; now leads with one concrete pick (WebSite, or Organization
  for a company/brand page) with the rest as alternatives.
- A finding group merging instances with different underlying code shapes (e.g. a native
  `<button>` and a document-level analytics listener sharing one detector key) rendered a
  single representative code snippet; multi-shape groups now show one snippet per distinct
  shape, each labelled with its own location.

## [3.4.0] — 2026-08-18

### Features

- add evidence-aware design QA workflow (742a570)

### Documentation

- replace fixed release freeze with evidence gate (b3189c2)
- merge the duplicate 3.3.2 sections into one curated entry (e3c50cc)

## [3.3.2] — 2026-08-09

### Fixed

- **Six FP-class fixes from hunt round 2** (`beacon-static-audit@17` → `@18`, source:
  `beacon-benchmark-100/hunt-round-2/verdicts.json`): (1) `isHiddenAttrs` read the word
  "hidden" inside a quoted attribute VALUE (`style="overflow: hidden overlay;"`,
  `class="hidden md:block"`) as the boolean `hidden` ATTRIBUTE, opening a phantom hidden
  range that blacked out the rest of the document — now parses the tag with the existing
  quote-aware `attr-scan.mjs` instead of a bare regex over the raw attrs blob. (2) The
  `quality-flags` loop (generic alt / link text / role-echo) was the only detector loop
  in the file not gated on `visible()`, so it reported signals inside hidden subtrees.
  (3) Link accessible-name replaced HTML character references with a space before
  trimming, so an entity-only label (`&gt;&gt;` pagination arrows, `&raquo;`, `&hellip;`)
  collapsed to `''` and read as nameless — a new `decodeCommonEntities` decodes named +
  numeric references to their real characters instead. (4) Static contrast applied
  WCAG 1.4.3's 4.5:1 to every resolvable text node unconditionally; a node whose entire
  content is a Private-Use-Area codepoint (an icon-font glyph) is non-text and is now
  judged at 1.4.11's 3:1 instead, under a new `non-text-contrast-sub-threshold` key.
  (5) `input-label-missing` now implements the full HTML-AAM accessible-name fallback
  chain (aria-labelledby-resolving → aria-label → label[for]/wrapping label → title →
  placeholder); a bare `id` no longer exempts an input by itself, it must have a
  matching `<label for>` (fixing both the false positive AND its false-negative twin,
  three independent agents converged on this one); title/placeholder-only names emit a
  new `input-label-weak` review finding instead of a critical fail; 3.3.2 is now
  correctly labelled Level A. (6) `motion-reduced-motion-missing` is demoted to
  `check:'review'`, tagged `level:'AAA'`, and excluded from `legal_risk.mapped_criteria`
  and all six jurisdiction arrays (2.3.3 is Level AAA, never a legal baseline in any
  mapped jurisdiction) — motion returns to `not-machine-checkable` whenever it has any
  evidence, fires or handled, and never scores again. Its trigger was rewritten from a
  file-wide `/(animation|transition):/` presence check to require a motion-bearing
  property (transform, a position offset, or a `@keyframes` animation using one — never
  color/background/border-color/box-shadow/opacity, and `transition: all` counts too)
  on a selector verified reachable in the static markup; hover/active-gated
  micro-transitions are noted as weaker evidence in the finding description rather than
  suppressed, and an unfetchable external stylesheet is called out as a capture gap
  rather than a confirmed absence.
- **hakuso round-1 follow-up on item 6**: the `animation` shorthand is
  order-independent (`animation: 1s spin` and `animation: 1s ease-in spin` both name the
  keyframe "spin"), but only the first token was checked — fixed to test every token.

### Measured

- **Wild-corpus movement, `test/wild-corpus/` (40 real captured pages)**: 31/40 sites
  moved end to end (`@17` → `@18`), verified against the committed `@17` engine run side
  by side, not inferred. The five non-motion fixes moved 19/40
  (`benchmark/2026-08-10-at18-fpclass-movement.md`); the motion demote + rewrite moved a
  further 30/40 on top of that (`benchmark/2026-08-10-at18-item6-motion-movement.md`,
  includes the hakuso animation-token-scan fix, +1/40 more with no score change since
  motion was already out of scoring by then). No finding key was lost or gained outside
  the two new keys (`non-text-contrast-sub-threshold`, `input-label-weak`); every other
  key change is a count movement of an existing key. Golden vectors:
  `clean.expected.json` coverage 66%→61% (motion `scored`/100→`not-machine-checkable` —
  it leaves the scored set, which is why coverage drops; confidence stays `medium`,
  overall score unaffected); `dirty.expected.json` coverage/confidence/
  score unchanged (61%/`medium`/9) — the fixture gained a second, genuinely nameless
  `<input>` so `input-label-missing` stays exercised alongside the new
  `input-label-weak` case. No fresh Spearman/GT rerun for `@18` — findings outside the
  six fixes are unaffected, same not-yet-empirically-reverified status as `@17`.

## [3.3.1] — 2026-08-08

### Measured

- **Per-detector precision, on pages nobody hand-picked.** VALIDATION.md L1 has always
  required a wild-sample false-positive measurement before a detector may feed the score;
  most detectors never had one. Six now do, sampled across distinct real sites, judged
  instance by instance at the cited markup and adversarially re-judged: `image-alt` 1.000,
  `link-name` 0.933, `heading-order` 0.867, `clickable` 0.615, `button-name` 0.600,
  `input-label` 0.417 (n=15 each; confidence intervals and every per-instance call,
  including the eight the reviewer overturned, in `benchmark/2026-08-03-wild-precision/`).
  The leading cause of false positives is markup hidden by a stylesheet class rather than
  an inline style — the first price tag on the Tier-2 capture-annotation gap.

### Added

- **Wild regression corpus** (`test/wild-corpus/`): 40 real captured pages with per-site
  score and per-key finding counts frozen, re-audited by `node --test`. Catches page-wide
  regressions that hand-written fixtures structurally cannot show; the 2026-07
  phantom-mask class would have failed here immediately.

### Fixed

- **L2 monotonicity KNOWN VIOLATION** (`beacon-static-audit@16` → `@17`, user ruling
  2026-08-08, "A+"): retired the `insufficient-evidence` category state, which could exit a
  thin (1-2 check) category from the weighted average and let fixing a violation LOWER the
  overall score. Any auditable evidence now scores; a category below `THIN_EVIDENCE_MIN` (3)
  instead carries a `thin: true` flag, rendered in the report as a same-line, same-weight
  qualifier next to the score (never colour-alone) rather than an unscored, hidden state.
  The 90-100 band's conclusion wording also downgrades when overall coverage is under 50%
  (ruling #3), so a high score built on a sliver of measured weight no longer reads as an
  unqualified "meets baseline". 38/40 sites moved on the 40-site wild regression corpus
  (median |Δ| 7, max |Δ| 58 — cuni.cz, `0 → 58`, the case that motivated the fix); finding
  keys unchanged on all 40 sites (scoring-only change, `benchmark/2026-08-08-aplus-movement.md`).
  No fresh Spearman/GT rerun for `@17` — findings are unaffected by this change, so both are
  expected unchanged from `@12`, not yet empirically re-verified.
- **Three detector false-positive classes** found by that measurement
  (`beacon-static-audit@15`): out-of-scope input types (`submit`/`hidden`/`button`/
  `image`/`reset`) no longer demand a label; `title` is accepted as a button's accessible
  name, as it already was for links; and an attribute *name* that merely contains the
  substring `onclick` is no longer read as a click handler. Re-running the same sample
  afterwards eliminates 7 of the 20 adjudicated false positives with no true positive
  lost — but that is a re-check on the very instances the fixes were written against, not
  independent evidence, so the published precision figures stay at their measured values
  until a fresh holdout sample is drawn and judged.
- The `title` fix went through three adversarial review rounds and needed all of them: the
  first version matched any attribute *ending* in `title`, so `data-title` — and worse, an
  empty `title=""` — silently suppressed genuinely nameless buttons. That is the third
  appearance of one bug class (an attribute matched by substring rather than by name);
  a shared attribute-reading primitive that makes the class unrepresentable is queued.
- Known recall cost, recorded rather than hidden: the `onclick` anchoring also stops the
  detector from accidentally catching framework click bindings (`data-wp-on--click` and
  friends) that it had only ever matched by coincidence, through a string inside an
  attribute *value*. Those elements are real violations; detecting them deliberately is
  queued.
- **Three previously-unmeasured detectors were badly broken** (`beacon-static-audit@16`):
  completing the wild-sample precision table above surfaced `html-lang-mismatch` (precision
  0.067 — its Vietnamese character class included ordinary Portuguese diacritics, misflagging
  every á/ã page), `focus-outline-removed` (0.267 — narrowed to unscoped resets after missing
  four real violations, including `* { outline: none }`), and `fixed-minmax-overflow`
  (0.133 — has no model of CSS grid, so demoted to `check:'review'` rather than narrowed to
  fit two examples). `list-non-li-child` also lost a true positive to a backreference bug and
  was rewritten to a non-consuming, depth-counted scan. A shared attribute-tokenization
  primitive (`core/scripts/attr-scan.mjs`) now backs four detectors that had each
  independently mismatched attributes by substring.
- **Masking unified into one scanner, plus a wrapper false-positive class**
  (`beacon-static-audit@13`/`@14`): script/style/noscript/comment ranges were three
  independent regex passes that could pair across each other and open a phantom mask
  swallowing every later finding on the page (latent since `@5`); now one left-to-right
  scan. A div/span whose own direct content wraps a native `<button>`/`<a href>` (an
  analytics wrapper) no longer reads as a keyboard barrier.
- **`--output` to a nonexistent directory no longer crashes**: `static-audit.mjs`,
  `generate-report.mjs`, `tier2-audit.mjs`, and `lighthouse-extract.mjs` now create the
  parent directory before writing, matching the documented
  `--output reports/a11y/audit-results.json` usage on a project's first run.

### Documentation

- Published the per-detector precision table above and Beacon's own measured WCAG 2.2
  A+AA coverage (14/55 criteria have any detector, 2/55 fully decided) across every
  README, translation, and the landing site, replacing the inherited "~30-40%" industry
  estimate.
- Named who each of the 53 undecided WCAG criteria leaves out, per that criterion's own
  W3C-documented beneficiary population, correcting 12 previously wrong or imprecise rows.
- De-Claude'd the Codex-adapter skill and reference docs (a marker-block system so
  `build.mjs` emits divergent prose per adapter from one source) and fixed a Codex
  plugin-manifest validation gap (missing `capabilities`/`defaultPrompt` fields).

## [3.3.0] — 2026-07-27

Native Tier-2 browser measurement harness (`beacon-tier2-audit@2`) + a static contrast
reference value (`beacon-static-audit@10`) + axe-core optionalization with a code-backed
contrast gate (`beacon-static-audit@11`) + two detector bugs found and fixed while
self-measuring WCAG coverage (`beacon-static-audit@12`) + Codex distribution moving to
a native plugin marketplace.

- **Native Tier-2 harness** (`core/scripts/tier2-audit.mjs`): a plain-Playwright browser
  layer (no axe-core dependency) that measures WCAG 2.2 1.4.3 contrast and 2.5.8
  touch-target size at 320px and 1280px viewports. Capture/analyze split mirrors
  `focus-flow.mjs`: DOM/computed-style walking stays browser-side, all color math
  (parsing, multi-layer alpha compositing, luminance, ratio) is pure and unit-tested.
  **Findings-only by default, not score-inert**: the harness emits a separate
  findings-only artifact with no automatic scoring — merging its findings with
  `--merge-findings` (the same path axe already uses) CAN move `overall_score`,
  `coverage_percent`, and the category's state, once the category's merged evidence
  reaches `THIN_EVIDENCE_MIN`. What is deferred is auto-merging in the default `inspect`
  flow, not the scoring mechanism itself. Touch-target spacing implements the real circle-vs-circle test for
  undersized neighbors (an earlier circle-vs-rect version under-detected the 12-24px gap
  band, fixed after a hakuso HIGH finding). Background resolution refuses to guess
  through a background-image/gradient ancestor, and fully-transparent foreground text is
  guarded (previously a false 1.00:1 fail). Repo stays dependency-free: the harness
  detects an available Playwright at runtime and fails loudly, with actionable next
  steps, when one isn't found; a new `tier2-browser` CI job installs Playwright +
  Chromium into a scratch dir to exercise it.
- **Tier-2 engine bump to `beacon-tier2-audit@2`** (2026-07-26 calibration pass,
  `plans/2026-07-26-tier2-bugfix-notes.md` + `plans/2026-07-26-tier2-calibration.md`): four
  real detector defects found by hand-adjudicating a wild-population run, not corpus
  artifacts. (1) Non-ancestor backgrounds (Wix "Get Started"/"Thriving with Wix" sibling
  overlay, Atlassian `#tab-teamwork` pill, linear.app's two hero-text spans relying on a
  `color-scheme: dark` default canvas) now mark the sample `tier2-contrast-unresolvable`
  instead of a guessed pass/fail — background resolution also now catches pseudo-element
  and inset-box-shadow paint, not just background-image/gradient. (2) Disabled/
  `aria-disabled` controls (confirmed on a Mailchimp survey-modal button and an
  en.wikipedia.org donation banner) are excluded from contrast sampling entirely, per WCAG
  1.4.3's inactive-component exemption. (3) A `SETTLE_QUIET_MS = 500` settle window
  (measured on a wayfair.com PerimeterX snapshot: 1 unstable finding at 0ms, 5 stable
  findings from 300ms on) makes repeated runs on the same page byte-identical. (4) A
  per-viewport try/catch (confirmed on a real zoom.us snapshot's navigation race) records
  `{viewport, error}` and continues to the next viewport instead of killing the whole
  process.
- **Tier-2 report rendering** (`core/scripts/generate-report.mjs`): the score/category
  card gains a provenance chip + measured-value line for any category tier-2 findings
  touched — a bilingual "Browser-measured (tier 2)" chip with the measured denominator
  (samples/targets actually looked at, from `audit.tier2.summary.by_viewport`), and a
  per-finding-group line rendering the actual measured ratio/color pair (contrast) or
  width/height (touch), including the 24px spacing-exception note when that's why a touch
  target failed. Four new bilingual `FINDING_I18N` keys (`tier2-contrast-fail`,
  `tier2-contrast-unresolvable`, `tier2-touch-target-fail`, `tier2-touch-target-advisory`);
  N unresolvable instances at the same key collapse into one finding group with an
  aggregate `×N` count rather than one row per instance. Purely presentational: category
  `state`/`score` are computed exactly as before this change and are never touched by it.
- **Static contrast reference value** (`static-audit.mjs`'s contrast category): an
  evidence line plus per-pair `check:'review'` findings for foreground/background pairs
  that are certain from the source file alone (inline styles, or a same-file `<style>`
  rule matched by a whole bare class/id selector — any doubt, including an
  externally-defined class or `alpha < 1`, leaves the pair unresolved rather than
  guessed). Every finding is review-severity, so this is **zero score effect** —
  verified on real snapshots and both golden vectors. Calibrated in three rounds against
  hand adjudication of the raw source, the third broadening the population to 774
  snapshots / 78 sites with resolvable pairs (`plans/2026-07-26-contrast-calibration-broad.md`)
  and catching a new false-positive shape: an absolutely-positioned overlay whose real
  visual backdrop is a photographic `<img>` sibling, not a CSS background, was resolved
  against a distant, unrelated ancestor's background instead (confirmed on
  100291.html:2790, a 1.00:1 white-on-white false "finding"). Fixed the same way as the
  existing background-image block: an `<img>` sibling behind a `position:absolute`/`fixed`
  element now blocks the walk instead of guessing.
- **Axe-core optionalization + code-backed contrast gate**: `inspect.md` now documents
  `scripts/tier2-audit.mjs` as the default browser layer; axe-core moves from a required
  baseline to an optional cross-check for ARIA-validity rules tier-2 doesn't cover yet.
  The contrast-verification gate the doc always mandated was found doc-promised but not
  code-backed — `static-audit.mjs` hardcoded `requires_live_audit: true` and never
  emitted the mandated tip. Fixed at the root: the engine now checks, once after any
  merge, whether real browser-verified contrast data was merged in, and emits a
  bilingual, review-severity `contrast-not-verified` tip (or flips
  `requires_live_audit`) accordingly. Golden vectors regenerated for the new tip; both
  gained exactly one finding, scores unchanged.
- **What did not change**: scoring semantics are untouched by this release — every
  finding NATIVELY added by `@10`/`@11` (the static engine's own detectors) is
  `check:'review'`, which never enters the fail/severity accounting on its own. The two
  Tier-2 categories (contrast, touch) are ordinary weighted categories already in
  `CATEGORY_WEIGHTS` — merging tier-2 findings with `--merge-findings` moves their score
  exactly like any other merged finding, once merged evidence reaches
  `THIN_EVIDENCE_MIN`; nothing about this release adds a new, permanently-unscored
  category. Ground-truth P/R (`1.000 / 0.727 / 0.829`, pattern/instance) carries unchanged
  from `@8`: neither GT criterion set nor FP adjudication touches `check:'review'`
  findings. No benchmark Spearman rerun was performed for `@10`/`@11` — expected
  score-neutral for the static engine's own findings per the argument above, not yet
  empirically confirmed on the full cohort.
- **Engine bump to `beacon-static-audit@12`** (hakuso audit of a WCAG coverage-measurement
  document found these with fixtures, `plans/2026-07-27-wcag-coverage-measurement.md`):
  two `document-title-missing`/`html-lang-missing` false-negative bugs, fixed at the root.
  `document-title-missing`'s check matched a `<title>` anywhere in the raw text (including
  inside an `<svg><title>` icon label) and accepted whitespace-only content; it now strips
  inline `<svg>` (a different, SVG-namespaced element) and requires non-empty trimmed text
  on the first remaining `<title>`, matching `document.title` semantics — a first attempt
  additionally scoped the search to before `</head>`/`<body>`, which a hakuso auditor caught
  in real Chromium as over-flagging real titled pages (a `<title>` in the body or a hidden
  ancestor still sets `document.title`); dropped, keeping only the svg-strip and the trim.
  `html-lang-missing`'s presence test matched the `xml:lang=` substring (no real `lang`
  attribute needed); it now requires the whitespace that separates a real HTML attribute. A
  new `html-lang-invalid` finding (bilingual `FINDING_I18N` entry) catches a malformed tag
  shape (e.g. `lang="english"`) via a new `isWellFormedLangTag()` BCP-47-shape check in
  `lang-detect.mjs`, which previously fell through `assessLang` to `UNMODELLED` (silently
  unflagged) — a shape-valid-but-wrong code like `lang="jp"` is unaffected, still caught by
  `assessLang`'s existing country-code path. Golden vectors: fingerprint-only diff (neither
  fixture exercises these cases). GT retention re-verified directly: zero finding-set diff
  on all 20 `benchmark/2026-07-06-ground-truth/` sites and on the broader 86-site
  `benchmark/2026-07-05/` population (ADDED 0 / REMOVED 0, final version). Full detail,
  including the head/body-scoping false positive found and fixed mid-pass: VALIDATION.md's
  `@12` engine section.
- **Self-measured WCAG 2.2 A+AA coverage table** (`plans/2026-07-27-wcag-coverage-measurement.md`):
  replaces inherited industry-hearsay coverage percentages with a criterion-by-criterion
  table verified against the current detector code, not the doc's prior claims. After
  resolving three inconsistently-applied machine-testability rows and shipping the `@12`
  fixes above: **14/55 criteria (25.5%) have any coverage, 2/55 (3.6%) are fully decided**
  by the engine alone; against the narrower machine-testable-in-principle subset (48
  criteria) that is **14/48 (29.2%) any coverage, 2/48 (4.2%) fully decided**. 2.4.2 Page
  Titled and 3.1.1 Language of Page are the only two FULL rows, and only because of the
  `@12` fixes above — both were previously miscounted as FULL by a doc claim the code
  didn't back. Full row-by-row detail and the machine-testability rule: the plan doc;
  numbers cross-checked against VALIDATION.md's `@12` section.
- **Codex distribution moves to a native plugin marketplace**: replaces the hand-copy
  deploy script (`tools/deploy-codex.mjs`, removed) with Codex's own marketplace mechanism
  — `.agents/plugins/marketplace.json` plus a generated
  `adapters/codex/.codex-plugin/plugin.json` whose version is driven by
  `.claude-plugin/plugin.json` through `build.mjs`, with a `build.mjs --check` guard and a
  `.release.json` sync entry so the manifest can never ship a version behind. Install is
  now:
  ```bash
  codex plugin marketplace add chiehweihuang/beacon
  codex plugin add beacon@beacon
  ```

## [3.2.0] — 2026-07-24

Engine `beacon-static-audit@9` (thin-evidence category state) + report information
architecture redesign (Workstream B) + a review round on the new report (score
scope-binding, standard lines, evidence clamp, life-safety banner) + new governance
gates (layout integrity, font floor, horizontal-scroll ban), all in the same release.

- **New category state `insufficient-evidence`**: a category that would otherwise be
  `scored` but has fewer than 3 total machine checks (`pass + fail < 3`) now reports
  `score: null` and exits the scoring denominator (weight redistributed, same mechanism
  as `not-machine-checkable`/`not-applicable`). A 1-2 check category is a coin-flip
  denominator — indistinguishable in confidence from a six-check 100 if rendered as a
  number. Findings are unaffected: the category's fail(s) are still listed in full;
  `coverage_percent` drops to carry the honesty signal instead. The N=3 threshold is a
  **calibration decision** (VALIDATION.md L2), not a physical constant — revisit with data.
- Report renderer: the new state gets its own text badge and detail line (bilingual,
  zh/en), rendered the same way as the other unscored states; unscored categories never
  render a score ring (pre-existing behavior, confirmed unaffected).
- **Golden vectors regenerated**: `clean.expected.json` keeps `overall_score: 100` (top
  band still reachable) but `keyboard`/`forms`/`responsive`/`motion` move from `scored`
  to `insufficient-evidence` (each had exactly 1 native check); coverage 66% → 23%,
  confidence `medium` → `low`. `dirty.expected.json`: `keyboard`/`forms`/`responsive`
  move the same way (1-2 checks each); `overall_score` 9 → 0 (the dirty fixture's one
  above-average category, responsive at 45, was carried by exactly 2 checks and exits
  the denominator). Every changed line is explained by the N=3 threshold; no other diff.
- **Benchmark rerun** (`beacon-benchmark-100/run-2026-07-05`, n=71 paired vs Lighthouse):
  Spearman 0.477 (@8) → **0.468** (@9) — a small decrease; the rank correlation absorbs
  score movements unevenly across the cohort even though most individual deltas are
  improvements. Score-delta distribution across 85 comparable sites: median |Δ| = 7,
  p95 = 19, max = 23 (wayfair.com −23; squarespace.com +21); 18 band flips. Motivating
  case confirmed: rakuten.co.jp 40 → **54** (`responsive` and `motion` each had exactly
  1 fail with 0 counterbalancing pass — a naked 0 on a coin-flip denominator — and both
  now exit the denominator instead of dragging the weighted average down).
- **GT retention** (finding emission is unaffected by this change — `scoreCategory` never
  touches the findings array): `total_findings` counts are byte-identical between the
  archived @8 results and the @9 rerun across all 85 comparable benchmark sites,
  including all 7 sites in the `gt-remap-6` ground-truth cohort. Ground-truth P/R
  (1.000 / 0.727, `pr-analysis-v8.json`) stands unchanged — no FP introduced, no TP lost.
- **Evidence excerpt clamping**: `code_before`/`code_after`/evidence excerpts are now
  capped to a ~300-char window centered on the matched text (ellipsis on cut ends, match
  kept intact) at the shared `snippetAt` capture path — a single-line minified CSS block
  no longer produces a 15KB `code_before` (found on rakuten.co.jp's `focus-outline-removed`
  finding, benchmark `run-2026-07-05`). Report generator adds a defense-in-depth ~500-char
  hard cap with a bilingual truncation notice so a stale oversized audit JSON can never
  blow up the rendered report. Evidence strings never entered scoring; no golden delta is
  score-affecting.

### Workstream B — report information architecture redesign

- Replaced the tabbed table/expand-detail report layout with a single scrolling read:
  a decision hero (overall score, coverage/confidence derivation, life-safety-or-safe
  flag, and a "fix these next" panel ranking the top 3 remediation actions by
  severity × instance count), evidence-density category cards (a log-scaled meter
  showing how many checks stand behind each score or unscored state), findings grouped
  by fix action rather than repeated per instance (with per-category filter chips), and
  an always-visible, print-ready client executive summary. Methodology, jurisdiction
  mapping, and optional Lighthouse performance signals remain as a deep-dive tail
  (sections 05-07) behind the same jump nav.
- Everything renders from the audit artifact at generation time — no mockup-era numbers
  hardcoded into the generator.
- Carries forward the existing zh/en language toggle and light/dark/auto theme toolbar
  (localStorage-persisted), plus the Layout Integrity Gate and sans-serif font-floor
  rules (explicit CJK-safe stacks on every `font-family`, including `pre`/`code`, so
  CJK text never falls back to a legacy Ming/Mincho face).
- **Review round on the new hero**: the score ring caption now reads "N/100・機測部分"
  with a coverage-only line, scoping the number to what was actually machine-measured;
  the confidence-low sentence is removed from the rendered report (still recorded in
  the audit JSON's `confidence_level`). A bilingual "標準・Standard" line — what the
  cited WCAG criterion actually requires — now precedes every fix line across all 27
  finding keys, grounded in `core/references/wcag-quick.md`; the two keys that had a
  detector but no rendered copy (`html-lang-mismatch`, `html-lang-mismatch-review`)
  gained their missing text in the same pass, covered by a new coverage test (330/330
  green). Manual/insufficient category cards gain a pointer sentence toward tier-2
  (browser/human) measurement. The life-safety banner, dropped when Workstream B
  rewrote the hero, is restored in the new layout.
- **New governance gates** (enforced in this guide, the advisor pattern table, the
  `bright-raven-uiux`/`akegarasu-design` skills, and `~/.codex/AGENTS.md`): a Layout
  Integrity Gate (text-measure floor, content-driven height, full-width sweep at
  320-1920 plus a non-breakpoint width); a sans-serif font floor across zh/en/ja
  including code blocks, later narrowed to ban only PMingLiU/MingLiU (other serif
  faces remain a deliberate, reviewed choice); and a horizontal-scroll ban (nav/chips
  wrap, long strings and tables break-wrap or reflow instead of `overflow-x`, verified
  with a `scrollWidth <= clientWidth` assertion).

## [3.1.0] — 2026-07-22

Engine @8 + the production improvement loop + public services entry points.

- Engine `beacon-static-audit@8` includes `role="heading" aria-level="1-6"` in the document outline and excludes native headings with `role="presentation|none"`. This addresses the remaining aria-heading attribution gap identified by the v3.0 ground-truth study.
- Measured (2026-07-22, study rerun): ground-truth precision 0.979 → **1.000**, pattern recall 0.712 → **0.727**, instance recall 0.826 → 0.829, FP patterns 1 → **0** — the engine now reports ibm.com's true 1→4 aria-heading skip instead of the spurious h1→h5, and jnto.go.jp's presentational-heading FP is gone (+3 points, the only benchmark score that moved; 47/47 prior TPs retained; Spearman 0.477, n=71, noise-level vs @7's 0.480). Known ceiling recorded in the GT README: the outline detector reports only the first level-skip per document.
- Refreshed the public roadmap, release highlights, Claude/Codex install parity, and skill/hook boundary language.
- Category summaries now say when the static scan completed but a score cannot be justified, provide per-category and expand-all disclosure controls, and render as in-viewport cards on mobile instead of requiring horizontal table scrolling.
- **Services pointer**: the HTML report gains a one-line footer linking to the landing page's new Services section (maintainer's accessibility consulting; disclosure included — scores are never influenced by contact). Landing pages and README carry the same section.
- **Production improvement loop**: `beacon:inspect` now keeps a local-only usage ledger (`~/.beacon/usage.jsonl` — inspect summaries + user false-positive marks; never transmitted, deletable anytime) and offers an opt-in upstream FP report: sanitized payload, shown in full before anything is shared, prefilled into the new `false-positive` GitHub issue form. Detector fixes triggered by reports still walk the full VALIDATION.md discipline.
- Bilingual landing page with live sample reports (GitHub Pages), demo-report back-navigation, and the plugin@marketplace format note next to the install command.
- Measurement infrastructure (local benchmark workspace, reference copies in benchmark/drift-harness/): self-maintaining target registry grown to 100 core sites (append-only policy, active floor, auto re-probe of walled sites), Tranco-sourced survey tier on the road to 10,000 sites, weekly capture-drift schedule, a queryable SQLite layer over all measurement data, and consented community-report ingestion.


All notable changes to Beacon are documented here. Versions follow the plugin
manifest (`.claude-plugin/plugin.json`); dates are release-prep dates.

## [3.0.0] — 2026-07-07

Scoring-semantics overhaul driven by the 2026-07-05 scoring-validity audit, hardened
over three validation rounds (engine `beacon-static-audit@3` → `@7`).
**Breaking: scores shift versus 2.3.0.**

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
