---
name: inspect
description: >-
  Lighthouse-style accessibility inspection: 0-100 scoring across 10 categories (contrast,
  keyboard, screen reader, forms, media, motion, touch, cognitive, responsive, AEO),
  interactive HTML report with score rings and code diffs, before/after comparison with
  previous inspections, legal risk scoring for 6 jurisdictions (US ADA, EU EAA, Japan JIS,
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

Conduct a structured accessibility audit that produces **quantitative scores** and an **interactive HTML report** — not just a checklist. Think Lighthouse for accessibility, but with legal risk assessment and human-centered explanations.

## What This Version Adds

1. **Scoring** — 0-100 score per category and overall, like Lighthouse
2. **HTML Report** — Interactive visual report with score rings, collapsible findings, code diffs
3. **Before/After Comparison** — Load a previous audit JSON to show deltas
4. **Legal Risk Scoring** — Per-jurisdiction risk level with exposure scores
5. **Anonymized Feedback** — Opt-in aggregate stats for continuous improvement
6. **Confidence Level** — Indicates how much of the page was auditable (CSR/SPA detection)
7. **Unverifiable State** — Items that cannot be confirmed from static HTML are flagged, not penalized
8. **Pedagogical Demo Detection** — Intentionally bad examples in educational content are excluded from scoring

## Scoring Calibration (from 44-site benchmark)

These reference ranges help calibrate scores:
- **90-96**: Hand-crafted best-practice pages, top government design systems
- **85-91**: Leading a11y-focused organizations (W3C WAI, WebAIM, GOV.UK)
- **75-84**: Well-built public sites (BBC, NHS, government sites)
- **55-74**: Average commercial sites, website builders
- **20-40**: SPA shells (CSR-only), neglected sites
- **15-20**: Intentionally inaccessible pages

## Process

### Step 1: Define Scope

Ask the user (if not already specified):

1. **Scope**: Entire project / specific page / specific component?
2. **Target level**: WCAG 2.2 AA (default) or AAA?
3. **Target jurisdictions**: US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, Australia DDA?
4. **Platform**: Web / iOS / Android / Desktop?
5. **Previous audit**: Is there a previous `audit-results.json` to compare against?
6. **Feedback opt-in**: Would you like to contribute anonymized aggregate data to improve this skill?

### Step 2: Automated Scan (if applicable)

If automated tools are available, run them first:

```bash
# axe-core via Playwright (best automated coverage)
npx playwright test --grep accessibility

# Lighthouse CLI
npx lighthouse <url> --only-categories=accessibility --output=json

# eslint a11y plugin (React/JSX)
npx eslint --rule 'jsx-a11y/*' src/
```

Automated tools catch ~30-40% of issues. The remaining 60-70% requires manual review.

### Step 2a: Three-Tier Audit Architecture

This skill supports three audit tiers. Use the highest tier available:

```
Tier 1: Static HTML Analysis (always available)
  Tools: Read, Grep, Glob
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

4. Tab order test:
   browser_press_key -> Tab (repeat 30x, record focus path)

5. Viewport reflow test:
   browser_resize -> width=320, height=800
   browser_take_screenshot -> evidence of reflow behavior

6. Contrast spot-check (on specific elements):
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
| **LOW** | < 40% visible; CSR shell | Score static HTML only. Append disclaimer: "This score reflects static HTML analysis only. A live browser audit is required for a meaningful assessment." Lower the overall score ceiling to 60 and mark the audit as `requires_live_audit: true` |

Include `confidence_level` in the JSON output metadata.

### Step 2c: Pedagogical Demo Detection

If the page appears to be educational (accessibility tutorial, demo site, training material), check for intentionally inaccessible examples:

**Detection hints:**
- Elements with `data-a11y-demo`, `data-demo`, `class*="demo"`, `class*="simulation"`, `class*="example-bad"`
- Sections preceded by headings like "Bad Example", "Anti-Pattern", "What Not To Do", "Before"
- Toggle buttons that switch between accessible/inaccessible modes
- Content within `<details>` or collapsible sections labeled as demonstrations

**Action:** Exclude these elements from scoring. Note them in the report as "Pedagogical demo — excluded from score" with a brief explanation of what the demo teaches.

### Step 3: Manual Review

Check each category systematically. Read `../a11y-advisor/references/wcag-quick.md` for criterion details.

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

**Every check item MUST be classified as exactly one of:**

| Verdict | Meaning | Score impact |
|---------|---------|-------------|
| `pass` | Evidence confirms compliance | +1 to category pass count |
| `fail` | Evidence confirms violation | -1 to category pass count + finding |
| `unverifiable` | Cannot confirm from static HTML (e.g., JS-rendered content, runtime behavior, actual contrast) | Excluded from both pass and fail counts. Does NOT reduce score. |

This three-state system prevents penalizing CSR/SPA sites for things that simply cannot be verified from static HTML. It also reduces inter-auditor variance by eliminating the "probably fails" gray area.

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

Overall score is a weighted average:
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

### Step 5: Assess Legal Risk

For each selected jurisdiction, calculate an exposure score (1-10):

| Factor | Impact |
|--------|--------|
| Level A violation exists | +4 |
| Level AA violation exists | +2 |
| Jurisdiction has active lawsuits (US ADA) | +2 |
| Deadline approaching (EU EAA, ADA Title II) | +1 |
| CAPTCHA or overlay widget detected | +3 |
| No accessibility statement present | +1 |

Cap at 10. Map to risk levels:
- 8-10: CRITICAL
- 5-7: HIGH
- 3-4: MEDIUM
- 1-2: LOW

Reference: `../a11y-advisor/references/legal-brief.md`

### Step 6: Build the Structured JSON

Write `audit-results.json` in the project root (or user-specified location). This is the **source of truth** — the HTML report is generated from it.

```json
{
  "metadata": {
    "date": "2026-04-04",
    "scope": "Full project",
    "standard": "WCAG 2.2 AA",
    "jurisdictions": ["US ADA", "Japan JIS"],
    "platform": "Web",
    "tool_version": "a11y-audit-v2.1",
    "confidence_level": "high",
    "requires_live_audit": false
  },
  "summary": {
    "overall_score": 72,
    "total_findings": 15,
    "critical": 3,
    "warnings": 7,
    "tips": 5,
    "unverifiable": 4,
    "pedagogical_excluded": 0,
    "categories": [
      { "id": "contrast", "name": "Color & Contrast", "score": 85, "pass": 5, "fail": 1, "unverifiable": 2 },
      { "id": "keyboard", "name": "Keyboard Navigation", "score": 60, "pass": 4, "fail": 3, "unverifiable": 0 }
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
    "overall_level": "high",
    "overall_score": 6,
    "jurisdictions": [
      {
        "name": "US ADA Title III",
        "law": "Americans with Disabilities Act",
        "risk_level": "high",
        "score": 7,
        "detail": "3 Level A violations. 8,667 lawsuits in 2025.",
        "deadline": null
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
node ~/.claude/skills/a11y-audit/scripts/generate-report.mjs audit-results.json
```

For before/after comparison (if previous audit exists):

```bash
node ~/.claude/skills/a11y-audit/scripts/generate-report.mjs audit-results.json \
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

### Step 9: Anonymized Feedback (Opt-in)

If the user opted in during Step 1, save anonymized aggregate data to `~/.claude/a11y-audit-stats.jsonl` (one JSON line per audit). This data contains NO source code, file paths, or project names:

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
  "legal_risk_level": "high",
  "has_previous": true,
  "score_delta": 12
}
```

What this enables:
- Track which WCAG criteria are most commonly violated (to improve skill guidance)
- Track score improvement trends across audits
- Identify which categories need better skill coverage
- All data stays local unless the user explicitly shares the file

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

| Score | Meaning |
|-------|---------|
| 90-100 | Excellent — minor improvements only |
| 70-89 | Good — some issues need attention |
| 50-69 | Needs work — significant barriers exist |
| 0-49 | Poor — critical barriers blocking users |

## References

This skill shares references with a11y-advisor:
- `../a11y-advisor/references/disabilities.md` — Disability categories
- `../a11y-advisor/references/wcag-quick.md` — WCAG 2.2 by scenario
- `../a11y-advisor/references/patterns.md` — Component patterns
- `../a11y-advisor/references/legal-brief.md` — Legal quick reference
- `../a11y-advisor/references/cases.md` — Case studies
