---
description: >-
  Lighthouse-style accessibility inspection: 0-100 scoring across 10 categories (contrast,
  keyboard, screen reader, forms, media, motion, touch, cognitive, responsive, AEO),
  interactive HTML report with score rings and code diffs, before/after comparison with
  previous inspections, legal context mapping for 6 jurisdictions (US ADA, EU EAA, Japan JIS,
  Taiwan, Canada ACA, Australia DDA), framework-specific fix patterns (React/Vue/Angular/
  Svelte/HTML), and CI/CD pipeline integration. Calibrated against a 44-site benchmark.
  Three-tier architecture: static analysis → Playwright browser audit → manual testing
  recommendations. Handles CSR/SPA detection and pedagogical demo exclusion.
  Triggers on "accessibility inspect", "a11y inspect", "a11y audit", "a11y score",
  "WCAG compliance", "check accessibility", "how accessible is this", "accessibility report",
  "無障礙檢查", "アクセシビリティ", or any request to assess, review, score, or improve
  the accessibility of a project, page, component, URL, or design.
---

# Accessibility Audit v2.1

Conduct a structured accessibility audit that produces **quantitative scores** and an **interactive HTML report** — not just a checklist. Think Lighthouse for accessibility, but with jurisdiction-aware context and human-centered explanations.

## What This Version Adds

1. **Scoring** — 0-100 score per category and overall, like Lighthouse
2. **HTML Report** — Interactive visual report with score rings, collapsible findings, code diffs
3. **Before/After Comparison** — Load a previous audit JSON to show deltas
4. **Jurisdiction Context** — Per-jurisdiction framing tied to the WCAG criteria found in the audit, without presenting mechanical warning counts as legal risk
5. **Local Artifacts Only** — Beacon keeps audit artifacts local; detector updates come from maintainer-run offline work and plugin releases
6. **Confidence Level** — Derived by the script from measured weight coverage, never hardcoded
7. **Category States** — A category with no machine evidence reports a state (`not-machine-checkable` / `not-applicable`) with `score: null`, never a number; unverifiable items are flagged, not penalized
8. **Pedagogical Demo Detection** — Intentionally bad examples in educational content are excluded from scoring

## Scoring Calibration

The former "44-site benchmark" narrative ranges are retired: the benchmark data was never
committed to this repo, and the one large external comparison that exists (the 100-site
Lighthouse baseline) contradicted those ranges. Do not quote per-band site archetypes.
Score bands come from the engine (`summary.score_bands` in the artifact — see Scoring
Interpretation below); publishing narrative ranges again requires a committed, reproducible
benchmark against the current formula.

## Process

### Step 1: Define Scope

Ask the user (if not already specified):

1. **Scope**: Entire project / specific page / specific component?
2. **Target level**: WCAG 2.2 AA (default) or AAA?
3. **Target jurisdictions**: US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, Australia DDA?
4. **Platform**: Web / iOS / Android / Desktop?
5. **Previous audit**: Is there a previous `audit-results.json` to compare against?
6. **Data boundary**: Beacon keeps audit artifacts local unless you explicitly decide to share them outside the plugin.

### Step 2: Automated Scan (default-on)

<!--@cc-->
Run automated tools first. Treat this as the baseline tier — if any of the tools below is unavailable, log the gap and continue, but do not skip the entire step on the assumption that "manual will catch it".
<!--/@cc-->
<!--@codex-->
Run automated tools first. Treat this as the baseline tier — if any tool is unavailable, log the gap and continue, but do not skip the entire step on the assumption that "manual will catch it".
<!--/@codex-->

<!--@cc-->
**Why default-on:** Beacon's Tier 1 static analysis cannot detect computed-style issues (color contrast in particular). The improve pipeline confirmed this empirically. A 50-site real-world survey (2026-05-31) found `color-contrast` violations axe-core caught and the Tier 1 static scanner missed on 18 of the 50 sites, the single largest cross-site detection gap (next: `link-name` on 9). Running axe-core in-process closes that gap without re-implementing contrast math.
<!--/@cc-->
<!--@codex-->
**Why default-on:** Beacon's Tier 1 static analysis cannot detect computed-style issues (color contrast in particular). A 50-site real-world survey (2026-05-31) confirmed axe-core catches `color-contrast` violations the static scanner misses on 18 of the 50 sites, the largest cross-site gap. Running axe-core closes that gap without re-implementing contrast math.
<!--/@codex-->

```bash
<!--@cc-->
# axe-core via Playwright — REQUIRED baseline if Playwright MCP is available
<!--/@cc-->
<!--@codex-->
<!--@duplicate-ok-->
# Beacon-native deterministic Tier 1 baseline — zero external deps, no browser.
# Produces audit-results.json compatible with generate-report.mjs. Run this
# even when the tools below are unavailable: it is the reproducible starting
# point you then enrich with judgment.
<!--@duplicate-ok-->
node scripts/static-audit.mjs --scope "<scope>" --output audit-results.json <file-or-dir>...

# axe-core via Playwright — REQUIRED baseline if a browser is available
<!--/@codex-->
# (covers color-contrast, computed-style rules, ARIA conformance)
npx playwright test --grep accessibility

# Lighthouse CLI — recommended for additional category scoring
npx lighthouse <url> --only-categories=accessibility --output=json

# eslint a11y plugin (React/JSX) — recommended for source-tree audits
npx eslint --rule 'jsx-a11y/*' src/
<!--@cc-->

<!--@duplicate-ok-->
# Beacon-native deterministic Tier 1 baseline — zero external deps, no browser.
# Produces audit-results.json directly compatible with generate-report.mjs.
# Run this even when the external tools above are unavailable: it is the
# reproducible starting point you then enrich with judgment.
<!--@duplicate-ok-->
node scripts/static-audit.mjs --scope "<scope>" --output audit-results.json <file-or-dir>...
<!--/@cc-->
```

<!--@cc-->
`scripts/static-audit.mjs` is Beacon's own scanner: it walks the given files, applies pattern checks for the same 10 categories the report scores, and writes the `audit-results.json` source-of-truth. The external tools (axe/Lighthouse/eslint) cross-check it; axe in particular covers the computed-style class (contrast) the static scanner structurally cannot. Use both when available.

**Fallback chain:** if Playwright MCP is unavailable, fall back to the Beacon-native static scanner + Tier 1 manual analysis AND record `"requires_live_audit": true` in `audit-results.json` metadata so the maintainer knows the contrast/computed-style class of findings was not exercised.
<!--/@cc-->
<!--@codex-->
`scripts/static-audit.mjs` is Beacon's own scanner: walks the given files, applies pattern checks for the same 10 categories the report scores, and writes the `audit-results.json` source-of-truth. The external tools cross-check it; axe in particular covers the computed-style class (contrast) the static scanner structurally cannot.
<!--/@codex-->

**Contrast verification gate (do not skip):** Color contrast is the single largest real-world gap a static scan cannot see (18 of 50 sites in the 2026-05-31 survey). Before writing `audit-results.json`, answer explicitly: was contrast actually exercised by a rendering engine (axe-core via a browser) this run? If not, whether because no browser was available or because the run skipped it, you MUST (a) set `"requires_live_audit": true` in metadata, and (b) emit the `contrast` category as an explicit unverified finding (severity tip, title "Contrast not verified, run Tier 2"), not a silent `review` count. Never report a passing contrast score from a static-only run.

<!--@cc-->
Automated tools catch ~30-40% of WCAG criteria. The remaining 60-70% (cognitive load, screen-reader task completion, dynamic interaction quality) requires manual review — but for the 30-40% that *is* automatable, skipping the run produces silent false negatives.
<!--/@cc-->
<!--@codex-->
Automated tools catch ~30-40% of WCAG criteria. The remaining 60-70% (cognitive load, screen-reader task completion, dynamic interaction quality) requires manual review — but for the 30-40% that *is* automatable, skipping the run produces silent false negatives. If no browser is available, run the static scanner + manual analysis AND record `"requires_live_audit": true` in metadata.
<!--/@codex-->

### Step 2a: Three-Tier Audit Architecture

This skill supports three audit tiers. Use the highest tier available:

```
Tier 1: Static HTML Analysis (always available)
<!--@cc-->
  Tools: scripts/static-audit.mjs (deterministic baseline) + Read, Grep, Glob (judgment enrichment)
<!--/@cc-->
<!--@codex-->
  Tools: scripts/static-audit.mjs (deterministic baseline) + Read, Grep, rg (judgment enrichment)
<!--/@codex-->
  Coverage: ~50% of WCAG criteria
  Confidence: MEDIUM (HIGH for server-rendered sites)

Tier 2: Live Browser Audit (if Playwright MCP available)
  Tools: Playwright browser_navigate, browser_snapshot,
         browser_evaluate (axe-core injection), browser_take_screenshot
  Additional: Firecrawl for JS-rendered content extraction
  Coverage: ~75% of WCAG criteria
  Confidence: HIGH

Tier 3: Manual Testing (human, recommended in report)
  Methods: Screen reader walkthrough, real-device touch,
           cognitive load assessment, user testing
  Coverage: ~95% of WCAG criteria
  Confidence: VERIFIED
```

**Tier 2 — Playwright MCP Integration:**

If Playwright MCP tools are available (`mcp__plugin_playwright_playwright__*`), run these additional checks:

```
1. Navigate to URL:
   browser_navigate -> url

2. Get accessibility tree:
   browser_snapshot -> full a11y tree with roles, names, states

3. Inject and run axe-core:
   browser_evaluate -> `
     const script = document.createElement('script');
     script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js';
     document.head.appendChild(script);
     await new Promise(r => script.onload = r);
     const results = await axe.run();
     JSON.stringify({
       violations: results.violations.length,
       passes: results.passes.length,
       incomplete: results.incomplete.length,
       details: results.violations
     });
   `

3b. Run Beacon's structural detectors on the RENDERED DOM (this is what covers SPAs):
   browser_evaluate -> document.documentElement.outerHTML
   Write the returned HTML to a rendered snapshot (e.g. .snapshots/<scope>-rendered.html),
   then run the static scanner on the SNAPSHOT instead of the raw page source:
     node scripts/static-audit.mjs --scope "<scope> (rendered)" --output audit-results.json <snapshot>.html
   The scanner's structural pattern checks — language-of-page mismatch (3.1.1),
   authentication barriers (3.3.8), labels, lists, viewport, AEO, and the rest —
   then see post-JS content. On a JS-rendered page the raw HTML is near-empty, so a
   static-only run returns INSUFFICIENT (language) or never sees client-injected
   widgets (CAPTCHA); running it against the rendered snapshot turns those into real
   verdicts. Axe (step 3) covers computed-style/contrast; this step covers structure.

4. Keyboard focus-flow capture (2.1.2 / 2.4.3 / 2.4.7 / 2.4.11 / 2.1.1) — runtime
   behaviors a static scan and axe cannot see. STATUS: MANUAL AID ONLY — NOT SCORED.
   A 2026-06-17 validation found this CAPTURE recipe produces systematic false
   positives on real pages (kbd-trap 9/10, focus-unreachable 10/10): a fixed Tab cap
   makes a long page read as a "trap", and the interactive selector over-counts
   non-tabbable elements. The pure analyzer (focus-flow.mjs) is correct on crafted
   fixtures, but the capture is not yet trustworthy. So drive a human keyboard pass and
   use this only to GUIDE it; do NOT merge its findings into the scored
   audit-results.json. Rework before scoring: derive the cap from the interactive
   count, narrow the selector, then re-validate with a published false-positive rate.
   Reference recipe (for the eventual reworked capture):
   a. browser_evaluate -> interactiveTotal =
      document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length
   b. Press Tab up to ~50 times; at each stop browser_evaluate on document.activeElement:
      { tag, name (accessible name), rect: getBoundingClientRect(),
        focusVisible: el.matches(':focus-visible') AND a non-none outline/box-shadow,
        obscuredBy: a selector when document.elementFromPoint(rect center) is NOT the
        focused element (covered by a sticky header/overlay) }.
      Record reachedEnd: did focus reach the end sentinel / wrap to <body> within the cap?
   c. Save the trace as JSON and run:  node scripts/focus-flow.mjs <trace>.json
      It flags keyboard traps, invisible focus, obscured focus, suspect order, and
      unreachable interactive elements. Merge its findings into audit-results.json.

5. Multi-state pass — Lighthouse/axe audit ONE state; real pages have many. For each
   significant state (open each dialog/menu, submit a form with INVALID input to surface
   errors, expand disclosures, load async content), re-capture the rendered DOM (step 3b)
   and re-run axe (step 3) + the focus-flow capture (step 4) on THAT state. Form error
   states especially: confirm the error is announced (aria-live / role="alert") and the
   field is marked aria-invalid — only observable after submission.

6. Viewport reflow test:
   browser_resize -> width=320, height=800
   browser_take_screenshot -> evidence of reflow behavior

7. Contrast spot-check (on specific elements):
   browser_evaluate -> getComputedStyle on flagged elements
```

**Tier 2 — Firecrawl MCP Integration:**

If Firecrawl is available (`mcp__plugin_firecrawl_*`), use it instead of curl for fetching:
- Returns JS-rendered content as clean markdown
- Better for CSR/SPA sites than static curl
- Extracts structured data (links, images, headings) automatically

**AEO-specific checks (Tier 1 or 2):**

```
1. Schema.org check:
   Grep for: <script type="application/ld+json">
   Parse and validate JSON-LD structure

2. Meta tags check:
   Grep for: <meta name="description">, og:title, og:description,
             twitter:card, canonical, robots

3. Heading outline extraction:
   Extract all h1-h6 into a tree -> does it form a logical TOC?

4. AI-crawlability score:
   - Content in HTML (not JS-only): +30
   - Schema.org present: +20
   - Meta description present: +15
   - Heading outline coherent: +15
   - Canonical URL set: +10
   - Sitemap referenced: +10
   Total: 0-100 AEO sub-score
```

Include the AEO sub-score in the report as a separate metric (not part of the main a11y score, but adjacent).

### Step 2a-2: Fetch Strategy Fallback Chain

When auditing a live URL (not a local file), use this fallback chain:

```
1. Read (local file) — if path provided
2. Playwright MCP browser_navigate — real browser, best for bot-protected sites
3. Firecrawl MCP — JS-rendered markdown extraction
4. curl with UA headers:
   curl -sL -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        -H "Accept: text/html,application/xhtml+xml"
        -H "Accept-Language: en-US,en;q=0.9"
5. WebFetch — built-in fetch tool
6. All failed -> mark as "bot_protected: true, unable_to_fetch: true"
```

If the fetched content is a bot-protection interstitial (Cloudflare challenge, Kasada, PerimeterX, Akamai wait room), tag the audit as `bot_protected: true` in metadata. This is distinct from CSR — the site has content but actively blocks automated access.

### Step 2b: CSR/SPA Detection & Confidence Level

Before manual review, assess how much of the page content is available in the static HTML:

**CSR indicators** (if 3+ are true, mark as CSR-dependent):
- `<body>` contains only a single `<div id="root">` or `<div id="app">` or `<div id="__next">`
- Total visible text content < 200 characters
- HTML size > 100KB but text content < 1KB (bloated JS, no content)
- `<noscript>` tag present with fallback content
- Framework-specific attributes: `data-reactroot`, `ng-app`, `data-v-`, `__NEXT_DATA__`

**Confidence levels:**

| Level | Meaning | Action |
|-------|---------|--------|
| **HIGH** | >= 80% of content visible in static HTML | Normal scoring |
| **MEDIUM** | 40-80% visible; some JS-rendered components | Score normally but flag unverifiable items |
| **LOW** | < 40% visible; CSR shell | Treat the static score as near-meaningless: state in the report narrative that "This score reflects static HTML analysis only. A live browser audit is required for a meaningful assessment." Do NOT edit any score — the script's coverage-derived `confidence_level` and the category states already express the limitation numerically. |

The script derives `confidence_level` from measured weight coverage and writes it to
`metadata` itself. Your CSR assessment here decides whether to insist on a Tier-2 live
audit before drawing conclusions — it does not change any number.

### Step 2c: Pedagogical Demo Detection

If the page appears to be educational (accessibility tutorial, demo site, training material), check for intentionally inaccessible examples:

**Detection hints:**
- Elements with `data-a11y-demo`, `data-demo`, `class*="demo"`, `class*="simulation"`, `class*="example-bad"`
- Sections preceded by headings like "Bad Example", "Anti-Pattern", "What Not To Do", "Before"
- Toggle buttons that switch between accessible/inaccessible modes
- Content within `<details>` or collapsible sections labeled as demonstrations

**Action:** Exclude these elements from scoring. Note them in the report as "Pedagogical demo — excluded from score" with a brief explanation of what the demo teaches.

### Step 2d: Performance & Best-Practices Signal (Lighthouse, supplementary)

Beacon scores accessibility with axe-core. Lighthouse is used here ONLY for the categories axe does not cover — performance, best-practices, seo — as a **supplementary signal that is never folded into the accessibility score**. Skip this step entirely if Lighthouse or Chrome is unavailable; the a11y audit stands on its own.

**Run Lighthouse in parallel with the Tier 2 axe-core audit, NOT inside the same page load.** The two have opposite needs: axe-core wants the fully rendered, warm DOM; Lighthouse performance wants a cold, throttled, from-scratch load. Sharing one page load would pollute the performance numbers. Start the two runs together — the browser axe-core drives and the Chrome that Lighthouse launches are independent — so total wall-clock collapses to the slower of the two rather than their sum.

Exclude `accessibility` from the Lighthouse categories (axe-core is the stronger a11y engine and this avoids double-counting). The three remaining categories share one trace, so adding best-practices and seo on top of performance is nearly free:

```bash
# 1. Lighthouse for the three non-a11y categories
npx lighthouse <url> --only-categories=performance,best-practices,seo \
  --output=json --output-path=lh.json --quiet \
  --chrome-flags="--headless=new --no-sandbox"

# 2. Normalize and merge into the audit source-of-truth
node scripts/lighthouse-extract.mjs lh.json --merge audit-results.json
```

`scripts/lighthouse-extract.mjs` normalizes the raw report into a compact `lighthouse` object (category scores, Core Web Vitals, main-thread breakdown, DOM stats, opportunities) and derives the value-add: **cross-cutting root causes** — a single cause such as an oversized DOM mapped to every dimension it harms (performance + a11y + AEO), the insight no single tool surfaces on its own. `generate-report.mjs` renders a "Performance" tab automatically whenever this object is present.

Carry these caveats into the report (the extractor already embeds them):
- Lighthouse scores swing run-to-run with device emulation, CPU throttle, and machine load. Present them as directional, not absolute.
- This is a supplementary signal and is NOT part of the Beacon accessibility score.
- The Lighthouse CLI default is mobile emulation with 4x CPU throttle; a desktop run (`--preset=desktop`) typically scores 15-25 points higher. Note the form factor when comparing.

### Step 3: Manual Review

Check each category systematically. Read `../references/wcag-quick.md` for criterion details.

For each check item, record a structured finding (pass/fail/review-needed) with:
- WCAG criterion reference
- Severity (critical / warning / tip)
- Affected disability categories
- Location (file:line or component name)
- Specific fix recommendation

#### Categories

**3a. Color & Contrast** (id: `contrast`)
- Text contrast >= 4.5:1 (AA) or >= 7:1 (AAA)
- Large text contrast >= 3:1 (AA) or >= 4.5:1 (AAA)
- UI component contrast >= 3:1
- Information not conveyed by color alone
- `prefers-contrast: more` + dark mode cross-test (Android Bold text triggers this)
- CSS variables resolve correctly in both themes — use `var(--bg)` not `color: white`

**3b. Keyboard Navigation** (id: `keyboard`)
- All interactive elements reachable via Tab
- Focus order matches visual order
- Focus indicator always visible (`:focus-visible`)
- No keyboard traps
- Focused element not obscured by sticky headers/footers (2.4.11)
- Modal dialogs trap focus correctly, Escape closes
- Skip links or landmark navigation present

**3c. Screen Reader** (id: `screenreader`)
- Page has descriptive `<title>`
- Landmarks present (`<header>`, `<nav>`, `<main>`, `<footer>`)
- Heading hierarchy correct (no skipped levels)
- All images have appropriate alt text
- All form inputs have associated labels
- All buttons have accessible names
- Dynamic content updates announced (aria-live)
- Language attribute set on `<html>`
- No Taiwan `:::` navigation markers

**3d. Forms** (id: `forms`)
- Every input has visible, associated `<label>`
- Required fields indicated (not by color alone)
- Error messages identify field and suggest correction
- Errors announced to screen readers
- No redundant entry required (3.3.7)
- Authentication doesn't require cognitive tests (3.3.8)
- `autocomplete` on personal data fields

**3e. Media** (id: `media`)
- Video has captions
- Audio has transcript
- Auto-playing media can be paused/stopped
- No content flashes > 3 times/second (LIFE-SAFETY)

**3f. Motion & Animation** (id: `motion`)
- `prefers-reduced-motion` respected
- `prefers-reduced-transparency` respected
- Time limits adjustable or removable
- Auto-moving content can be paused
- No `transition: all` with CSS custom properties

**3g. Touch & Target Size** (id: `touch`)
- Interactive targets >= 24x24 CSS pixels (2.5.8)
- Drag operations have single-pointer alternative (2.5.7)
- Multi-point gestures have single-pointer alternative
- Content not restricted to single orientation

**3h. Cognitive** (id: `cognitive`)
- Consistent navigation across pages
- Consistent identification (same function = same label)
- Help mechanism in consistent position (3.2.6)
- Clear, simple language where possible
- No dark patterns or guilt-inducing design
- Undo/confirmation for destructive actions

**3i. Agent Operability & AEO** (id: `agent`)

This category covers both assistive technology agents (screen readers) and AI agents (search engines, answer engines, LLM crawlers). Good a11y and good AEO share the same foundation: machine-readable semantic structure.

*Accessibility tree (AT agents):*
- Accessibility tree properly exposes all interactive elements
- Semantic HTML used (not div-based UI)
- ARIA states reflect actual component state
- No hover-only content

*Answer Engine Optimization (AI agents):*
- Schema.org structured data present (JSON-LD preferred): Article, FAQ, HowTo, Product, Organization, BreadcrumbList
- `<meta name="description">` present and descriptive
- Canonical URL set (`<link rel="canonical">`)
- Open Graph / Twitter Card metadata present
- Heading outline forms a coherent document structure (extractable as TOC)
- Content is in the HTML (not hidden behind JS-only rendering) — critical for AI crawlers that don't execute JS
- No `<meta name="robots" content="noindex">` on pages meant to be discoverable
- Sitemap.xml referenced or linked
- FAQ content uses both `<details>/<summary>` (a11y) AND FAQ schema (AEO)
- Tables have `<caption>` and `<th>` — AI agents extract tabular data for direct answers
- Internal links use descriptive anchor text (not "click here") — AI agents follow link context

**3j. Responsive Design & Reflow** (id: `responsive`)
- [ ] `<meta name="viewport">` present and does NOT contain `user-scalable=no` or `maximum-scale=1` (WCAG 1.4.4)
- [ ] Content reflows at 320px width without horizontal scrolling (WCAG 1.4.10 Reflow)
- [ ] Text resizable up to 200% without loss of content or functionality (WCAG 1.4.4)
- [ ] Text spacing overridable: line-height 1.5x, paragraph spacing 2x, letter spacing 0.12em, word spacing 0.16em (WCAG 1.4.12)
- [ ] No `minmax(Npx, 1fr)` without `min()` wrapper — causes overflow at narrow viewports
- [ ] Grid/flex layout adapts to single column at narrow viewports
- [ ] Images use `max-width: 100%` or responsive `srcset`/`sizes` — no horizontal overflow
- [ ] Tables either scroll horizontally with `overflow-x: auto` wrapper, or reflow to card layout on mobile
- [ ] Navigation adapts for mobile (hamburger/disclosure pattern, not just hidden)
- [ ] Touch targets >= 44x44px on mobile (iOS/Android guideline, exceeds WCAG 24px minimum)
- [ ] No fixed-width elements that break layout below 320px
- [ ] `clamp()` or fluid typography used (not fixed `px` font sizes)
- [ ] Form inputs use appropriate `inputmode` for mobile keyboards (`numeric`, `email`, `tel`, `url`)
- [ ] Sticky/fixed elements don't obscure content at small viewports or when zoomed
- [ ] Orientation not locked — content works in both portrait and landscape (WCAG 1.3.4)
- [ ] Safe area insets respected on notched devices (`env(safe-area-inset-*)`)
- [ ] `prefers-reduced-data` considered for heavy media on mobile connections
- [ ] Tap delay eliminated (`touch-action: manipulation` or no 300ms delay via viewport meta)
- [ ] Mobile form UX: `autocomplete` attributes, visible labels (not just placeholders that disappear on focus), appropriate `type` attributes for input fields

### Step 4: Calculate Scores

> **The script owns scoring — you do not.** `static-audit.mjs` is the sole author of every
> score, severity, and verdict in `audit-results.json`. The three-state model, the category
> formula, the severity matrix, and the category weights below are all **implemented in the
> script** and documented here only so you can read the report, not re-derive it. Do **NOT**
> hand-compute scores, hand-apply the severity matrix, or edit any number in
> `audit-results.json`. Your job is to produce *findings* (Step 3 manual review, Tier-2 axe
> contrast/focus); the script turns findings into the scored artifact (Step 6). Hand-scoring is
> exactly the stochastic step P1 removed — it is what made identical pages score differently.

**Every check item MUST be classified as exactly one of (the script applies this):**

| Verdict | Meaning | Score impact |
|---------|---------|-------------|
| `pass` | Evidence confirms compliance | +1 to category pass count |
| `fail` | Evidence confirms violation | +1 to category fail count + finding |
| `unverifiable` | Cannot confirm from static HTML (e.g., JS-rendered content, runtime behavior, actual contrast) | Excluded from both pass and fail counts. Does NOT reduce score. |

A category's evidence rolls up to a **state** in the artifact: `scored` (has pass/fail
evidence), `not-machine-checkable` (review-only), or `not-applicable` (no evidence at all).
Unscored categories carry `score: null` — absence of evidence is reported as a state, never
as a number, and never as 100.

This system prevents penalizing CSR/SPA sites for things that simply cannot be verified from static HTML. It also reduces inter-auditor variance by eliminating the "probably fails" gray area.

**Category score formula:**

```
auditable_count = pass_count + fail_count  (excludes unverifiable)
base_score = (pass_count / auditable_count) * 100

# Apply severity penalties
category_score = base_score - (critical_count * 12) - (warning_count * 5) - (tip_count * 1)
category_score = max(0, min(100, category_score))
```

Severity classification rules:
- **Critical** = WCAG Level A violation, confirmed from evidence
- **Warning** = WCAG Level AA violation, or Level A violation that is likely but not 100% confirmed
- **Tip** = Best practice, WCAG 3.0 direction, or enhancement beyond AA

`prefers-reduced-motion` absence: classify as **warning** (not critical) unless content actively flashes > 3 times/second (that is LIFE-SAFETY critical).

**SEVERITY MATRIX — overrides the general rules above for these specific criteria. When a finding maps to a row in this table, use the assigned severity EXACTLY. Do not upgrade or downgrade based on your own confidence assessment.**

| WCAG | Criterion | Mandated Severity | Reason |
|------|-----------|-------------------|--------|
| 1.1.1 | Text Alternatives (missing alt) | **critical** | Level A; presence of `alt` attribute is static-detectable |
| 1.2.2 | Captions (Prerecorded) | **critical** | Level A; `<video>` without `<track kind="captions">` is static-detectable |
| 1.3.1 | Info and Relationships | **critical** | Level A; structural markup failures (unlabeled inputs, missing `<th>`, etc.) are static-detectable |
| 1.3.6 | Identify Purpose | **tip** | Level AAA; never critical or warning |
| 1.4.1 | Use of Color | **critical** | Level A; color-only state indicators detectable from static HTML |
| 1.4.2 | Audio Control | **critical** | Level A; `<audio autoplay>` without controls is static-detectable |
| 1.4.3 | Contrast (Minimum) | **warning** | Level AA; never critical, even when ratio is confirmed |
| 1.4.4 | Resize Text | **warning** | Level AA |
| 1.4.10 | Reflow | **warning** | Level AA |
| 1.4.11 | Non-text Contrast | **warning** | Level AA |
| 1.4.12 | Text Spacing | **warning** | Level AA |
| 2.1.1 | Keyboard (no-keyboard div/span onclick) | **critical** | Level A; div/span with onclick but no keyboard handler is static-detectable |
| 2.2.2 | Pause, Stop, Hide (autoplay) | **critical** | Level A; `autoplay` attribute on media elements is static-detectable |
| 2.3.1 | Three Flashes or Below Threshold | **critical** | Level A; LIFE-SAFETY — always critical regardless of confidence |
| 2.4.1 | Bypass Blocks (skip links) | **warning** | Level A but absence of skip links requires runtime verification to confirm complete absence |
| 2.4.2 | Page Titled | **critical** | Level A; empty or missing `<title>` is static-detectable |
| 2.4.7 | Focus Visible | **warning** | Level AA |
| 2.4.11 | Focus Not Obscured (Minimum) | **warning** | Level AA |
| 3.1.1 | Language of Page | **critical** | Level A; missing `lang` on `<html>` is static-detectable |
| 3.3.2 | Labels or Instructions | **critical** | Level A; visible label absence is static-detectable |
| 4.1.2 | Name, Role, Value (missing labels/names) | **critical** | Level A; unlabeled interactive elements detectable from static HTML |

**Common misclassification traps to avoid:**
- 1.4.3 contrast violations are **always warning**, never critical — even when the exact ratio is confirmed and very low
- 2.4.1 (skip links) should be **warning**, not critical — its presence may depend on JS or other pages
- 1.4.1 (use of color) is **critical** (Level A), not warning — even if subtle
- 2.4.7 focus visibility is **warning** (Level AA), not critical — even when `outline: none` is confirmed

Overall score is a weighted average **over scored categories only**, with weights
renormalised to the scored subset:
| Category | Weight |
|----------|--------|
| Screen Reader | 18% |
| Keyboard | 13% |
| Contrast | 13% |
| Forms | 13% |
| Responsive | 12% |
| Touch | 8% |
| Cognitive | 8% |
| Motion | 5% |
| Media | 5% |
| Agent | 5% |

- Categories with `score: null` are **excluded** from the average; their weight moves
  `summary.coverage_percent` (the share of scoring weight actually measured), never the score.
- **Life-safety gate**: a confirmed critical on a life-safety criterion (2.3.1) caps the
  overall score at 49 (fail band) and sets `summary.life_safety_flag` — a weighted average
  must never dilute a seizure risk into an amber verdict.
- `summary.score_bands` carries the band definitions (single source for the report and the
  Scoring Interpretation table below).

### Step 5: Map Jurisdiction Context

For each selected jurisdiction, map the findings to the WCAG criteria they implicate. Do not convert warning counts into a legal conclusion.

The legal section should state:
- Which WCAG criteria were found.
- Which jurisdictions are relevant to review.
- That this is technical accessibility evidence, not a legal opinion.
- That Taiwan-specific certification, seal, and current-version claims must be verified before asserting compliance.

Reference: `../references/legal-brief.md`

### Step 6: Produce the Authoritative JSON (script-authored)

`audit-results.json` is the **source of truth**, and `static-audit.mjs` is its **sole author**.
You do **not** write or edit it by hand. Instead, hand the script the findings that the
automated scan could not produce on its own — your Step 3 manual review and the Tier-2 axe
contrast/focus findings — as a small JSON file, and let the script compute the verdict, the
severities (via the matrix), and the scores:

```bash
# manual-findings.json: a JSON array (or {"findings":[...]}) of finding objects, each with at
# minimum { "category": "<one of the 10 ids>", "wcag": "1.4.3", "title": "...", "location": "..." }.
# Optional: "severity" (overridden by the matrix when the WCAG criterion is listed), "fix",
# and "check": "review" for an unverifiable finding that must NOT lower the score, or
# "check": "pass" for an externally VERIFIED pass — it counts as category evidence (raising
# coverage), not as a finding. Unknown check values are skipped with a warning.
node scripts/static-audit.mjs --scope "<scope>" \
  --merge-findings manual-findings.json \
  --output audit-results.json <file-or-dir>...
```

The script re-scans, folds in your merged findings, applies the severity matrix and the
category/overall formulas, and writes the authoritative artifact. Pass `--date <YYYY-MM-DD>`
(or set `SOURCE_DATE_EPOCH`) when you need a reproducible, byte-identical run. **Never** open
`audit-results.json` and change a score, severity, or count — that is the agent-in-the-verdict-path
behavior P1 removed.

**Your judgment has a sanctioned home — keep it out of the score.** The irreducible ~60% of
WCAG no engine can decide (is this `alt` *meaningful*; does the reading order make *sense*;
cognitive load; dynamic-interaction quality) is real and valuable, but it is **not
reproducible**, so it must never enter `findings` or any score. Put it in a separate file and
pass it through the script:

```bash
# llm-judgment.json: a JSON array of { "observation": "...", "criterion": "1.1.1" (opt),
# "category": "screenreader" (opt), "note": "..." (opt) }.
node scripts/static-audit.mjs --scope "<scope>" \
  --merge-findings manual-findings.json \
  --llm-judgment llm-judgment.json \
  --output audit-results.json <file-or-dir>...
```

The script copies it verbatim into a quarantined `llm_judgment` block (labelled
"not reproducible, excluded from the machine score") and never lets it touch the score. This is
P8: the agent is the orchestration + narration shell (scope, browser-driving, human-readable
explanation, semantic judgment), never the author of the machine verdict.

The script emits this shape (reference — do not author it by hand):

```json
{
  "metadata": {
    "date": "2026-04-04",
    "scope": "Full project",
    "standard": "WCAG 2.2 AA",
    "jurisdictions": ["US ADA", "Japan JIS"],
    "platform": "Web",
    "tool_version": "a11y-audit-v2.1",
    "confidence_level": "medium",
    "requires_live_audit": true
  },
  "summary": {
    "overall_score": 72,
    "coverage_percent": 66,
    "life_safety_flag": false,
    "score_bands": [
      { "min": 90, "id": "pass" },
      { "min": 50, "id": "needs-work" },
      { "min": 0, "id": "fail" }
    ],
    "total_findings": 15,
    "critical": 3,
    "warnings": 7,
    "tips": 5,
    "unverifiable": 4,
    "pedagogical_excluded": 0,
    "categories": [
      { "id": "contrast", "name": "Color & Contrast", "state": "scored", "score": 85, "pass": 5, "fail": 1, "review": 2 },
      { "id": "keyboard", "name": "Keyboard Navigation", "state": "scored", "score": 60, "pass": 4, "fail": 3, "review": 0 },
      { "id": "media", "name": "Media", "state": "not-machine-checkable", "score": null, "pass": 0, "fail": 0, "review": 1 }
    ]
  },
  "findings": [
    {
      "id": "f1",
      "category": "contrast",
      "severity": "warning",
      "title": "Body text contrast ratio is 3.8:1",
      "wcag": "1.4.3",
      "level": "AA",
      "affected_users": "Low-vision users, elderly users",
      "location": "style.css:42",
      "description": "The body text color #777 on #fff background has a contrast ratio of 3.8:1, below the 4.5:1 minimum.",
      "fix": "Change to #595959 or darker for 4.5:1 ratio.",
      "legal_exposure": "Violates WCAG 2.2 AA. Top-7 litigated criterion in US ADA lawsuits.",
      "code_before": "color: #777;",
      "code_after": "color: #595959;"
    }
  ],
  "legal_risk": {
    "assessment_mode": "wcag_criteria_context",
    "narrative": "Technical WCAG criteria mapping only. This is not a legal opinion and is not derived from warning counts.",
    "mapped_criteria": ["1.4.3"],
    "jurisdictions": [
      {
        "name": "US ADA Title III",
        "law": "Americans with Disabilities Act",
        "detail": "Use the mapped WCAG criteria as technical evidence; legal exposure depends on business model, sector, and jurisdiction-specific facts.",
        "criteria": ["1.4.3"]
      }
    ]
  },
  "remediation": [
    {
      "priority": "p0",
      "title": "Add alt text to hero image",
      "wcag": "1.1.1",
      "effort": "~5 min"
    }
  ],
  "testing_recommendations": [
    "Run axe-core in CI pipeline",
    "Keyboard-only navigation test monthly",
    "Screen reader test per release"
  ]
}
```

### Step 7: Generate HTML Report

Run the report generator script:

```bash
node ./scripts/generate-report.mjs audit-results.json
```

For before/after comparison (if previous audit exists):

```bash
node ./scripts/generate-report.mjs audit-results.json \
  --previous previous-audit-results.json \
  --output a11y-report.html
```

Open the report in the browser for the user to review.

### Step 8: Generate Accessibility Statement

Offer to generate an accessibility statement (the international standard replacement for static badges).

Reference: W3C WAI — Developing an Accessibility Statement

Template in `references/accessibility-statement-template.md` (if it exists), otherwise use:

```markdown
# Accessibility Statement

[Organization name] is committed to ensuring digital accessibility.

## Standards Applied
WCAG 2.2 Level AA

## Known Limitations
| Area | Issue | Expected Resolution |
|------|-------|---------------------|
[Populate from Critical and Warning findings]

## Feedback
[Contact information]

## Assessment
Last reviewed on [date] based on:
- Automated testing with [tools]
- Manual review against WCAG 2.2 AA
```

### Step 9: Local Audit Summary

If useful, write a local summary file next to the generated audit artifacts. Do not send it anywhere, and do not describe this as telemetry or product analytics.

```json
{
  "date": "2026-04-04",
  "standard": "WCAG 2.2 AA",
  "platform": "web",
  "overall_score": 72,
  "category_scores": { "contrast": 85, "keyboard": 60 },
  "finding_counts": { "critical": 3, "warning": 7, "tip": 5 },
  "top_violations": ["1.4.3", "2.4.7", "1.1.1"],
  "jurisdictions": ["US ADA", "Japan JIS"],
  "legal_context": "WCAG criteria mapped; no legal conclusion",
  "has_previous": true,
  "score_delta": 12
}
```

What this enables locally:
- Compare WCAG criteria across your own audits
- Track score changes across your own project snapshots
- Identify which categories need more work in the current product
- Keep audit artifacts local unless the user explicitly shares the file

Beacon keeps these results local unless the user explicitly shares them outside the plugin. Detector improvements come from maintainer-run offline evaluation and plugin updates.

### Step 10: Follow Up

After delivering the report:
- Offer to create GitHub issues / todo items for each finding
- Suggest re-audit timeline based on severity
- If critical findings exist, offer to fix the top 3 immediately
- If the user has a11y-design-guide skill, suggest using it for redesign work

## Framework-Specific Fix Patterns

When generating `code_before` / `code_after` in findings, tailor the fix to the detected framework:

| Framework | Detection | Fix style |
|-----------|-----------|-----------|
| **React/Next.js** | `package.json` has `react` | JSX + hooks (`useRef`, `useEffect` for focus management) |
| **Vue** | `package.json` has `vue` | SFC template + `v-bind`, `@keydown` handlers |
| **Angular** | `angular.json` exists | Template + `[attr.aria-*]`, `(keydown)` bindings |
| **Svelte** | `svelte.config.js` exists | Svelte template + `bind:`, `on:keydown` |
| **Plain HTML** | No framework detected | Semantic HTML + vanilla JS event listeners |

Always prefer native elements over ARIA overrides. A `<button>` is better than `<div role="button" tabindex="0" @keydown.enter="...">`.

## CI/CD Integration

Offer to generate pipeline config for automated a11y regression checks:

**GitHub Actions:**
```yaml
- name: Accessibility check
  run: npx axe-core-cli --exit --tags wcag2a,wcag2aa ${{ env.URL }}
```

**GitLab CI:**
```yaml
a11y:
  script:
    - npx axe-core-cli --exit --tags wcag2a,wcag2aa $URL
  allow_failure: false
```

**Pre-commit hook:**
```bash
npx eslint --rule 'jsx-a11y/*' --max-warnings 0 src/
```

Include the appropriate config in the audit report when CI/CD integration is requested.

## Common Pitfalls

| Pitfall | Correct Approach |
|---------|------------------|
| `role="button"` on a `<div>` | Use native `<button>` -- includes keyboard handling for free |
| `tabindex="0"` on everything | Only interactive elements need focus; use native elements |
| `aria-label` on non-interactive elements | Use `aria-labelledby` pointing to visible text |
| `display: none` for screen reader hiding | Use `.sr-only` class instead |
| Color alone to convey meaning | Add icons, text labels, or patterns alongside color |
| Placeholder as only label | Always provide a visible `<label>` |
| `outline: none` without replacement | Always provide a visible focus indicator via `focus-visible` |
| Empty `alt=""` on informational images | Informational images need descriptive alt text |
| Skipping heading levels (h1 -> h3) | Heading levels must be sequential |
| `onClick` without `onKeyDown` | Add keyboard support or prefer native elements |
| Ignoring `prefers-reduced-motion` | Wrap animations in `@media (prefers-reduced-motion: no-preference)` |

## Scoring Interpretation

Bands are defined once in `static-audit.mjs` (`SCORE_BANDS`, emitted as
`summary.score_bands`); this table mirrors them:

| Score | Band | Meaning |
|-------|------|---------|
| 90-100 | pass | Meets the machine-checkable baseline at the measured coverage |
| 50-89 | needs-work | Confirmed issues worth addressing |
| 0-49 | fail | Substantial confirmed barriers, or the life-safety gate |

Read every score together with `coverage_percent`: 100 at 35% coverage means "nothing wrong
found in the measured 35%", not "accessible".

## References

This skill shares references with a11y-advisor:
- `../references/disabilities.md` — Disability categories
- `../references/wcag-quick.md` — WCAG 2.2 by scenario
- `../references/patterns.md` — Component patterns
- `../references/legal-brief.md` — Legal quick reference
- `../references/cases.md` — Case studies
