# Beacon Architecture

System-level overview as of **v2.0.8**. For state-of-work see [ROADMAP.md](./ROADMAP.md). For per-skill behaviour see `commands/*.md`.

---

## 1. The Three-Skill Pipeline

Beacon ships as three composable skills that map to three phases of UI development:

```
+--------+   +--------+   +---------+
| design |-->|  code  |-->|  ship   |
+--------+   +--------+   +---------+
    |             |             |
    v             v             v
 /beacon:    /beacon:      /beacon:
  guide       advisor       inspect
   |            |              |
   |            +-- hook auto-trigger on
   |                Edit/Write of UI files
   |
   +-- description-triggered when user
       describes a UI they want to build
```

| Phase | Skill | Invocation | What it produces |
|-------|-------|------------|------------------|
| Design | `/beacon:guide` | Description-triggered (pre-code intent) | Pattern recommendations, scaffolds, design checklists |
| Development | `/beacon:advisor` | (a) PostToolUse hook on UI file edits, (b) manual `/beacon:advisor` | Inline a11y checklist that the agent must address before continuing |
| Review | `/beacon:inspect` | User-invoked (after substantial UI change) | `audit-results.json` + interactive HTML report |

The pipeline is **not enforced** — each skill is independently usable. But the three-phase mental model is intentional and is repeated across `README.md`, `beacon-governance.md`, and each skill's prose.

---

## 2. Repository Layout

```
beacon/
├── .claude-plugin/
│   ├── plugin.json           # name, version, description, keywords
│   └── marketplace.json      # marketplace metadata
├── commands/
│   ├── guide.md              # /beacon:guide skill prose (~684 lines)
│   ├── advisor.md            # /beacon:advisor skill prose (~146 lines)
│   └── inspect.md            # /beacon:inspect skill prose (~664 lines)
├── hooks/
│   └── hooks.json            # PostToolUse + SessionStart + UserPromptSubmit registrations
├── scripts/
│   ├── generate-report.mjs   # HTML report generator (~1260 lines, the heart of inspect)
│   ├── a11y-advisor-hook.mjs # PostToolUse hook output (~202 lines)
│   ├── beacon-session-start.mjs    # SessionStart proactive trigger (~28 lines)
│   └── beacon-prompt-gate.mjs      # UserPromptSubmit gate (~35 lines)
├── references/
│   ├── disabilities.md       # Disability categories + global stats
│   ├── wcag-quick.md         # WCAG 2.2 criteria by scenario
│   ├── patterns.md           # Extended component patterns
│   ├── legal-brief.md        # Legal quick reference per jurisdiction
│   ├── cases.md              # Notable accessibility legal cases
│   └── documents.md          # Templates (accessibility statement, etc.)
├── README.md                 # Public-facing intro
├── beacon-governance.md      # Injected into Claude sessions; mandates when to invoke
├── ROADMAP.md                # State + open questions (this is the doc you should read first)
└── ARCHITECTURE.md           # System internals (this file)
```

Total under-3000-line codebase. Skill prose dominates; only `generate-report.mjs` is non-trivial code.

---

## 3. The Report Generator (`scripts/generate-report.mjs`)

This is the largest single file and the most architecturally interesting piece. ~1260 lines, single-module Node ESM script with no external dependencies.

### Entry point

```
node generate-report.mjs <audit-json> [--previous <old-json>] [--output <path>]
```

- `<audit-json>`: required, path to a structured audit result (schema below)
- `--previous`: optional, path to a previous audit-results.json for before/after delta rendering
- `--output`: optional, output path; if omitted, defaults to `a11y-report-<slug>-<date>.html` in the same directory as input, where `<slug>` is derived from `audit.metadata.url` (hostname + first path segment) or falls back to `audit.metadata.scope`

### High-level structure

```
[helpers]
  scoreColor / scoreLabel / riskColor / deltaArrow
  escapeHtml
  buildSlug (URL -> filesystem-safe slug)
  bi() / t() / catName() -- I18N helpers

[builders]
  buildCategoryRows()       -- summary table
  buildFindingsHTML()       -- finding cards (critical/warning/tip variants)
  buildLegalRiskHTML()      -- per-jurisdiction risk cards
  buildContextBanner()      -- epistemic-honesty banner (bilingual)
  buildLimitationsHTML()    -- methodology & limits tab (bilingual)
  buildScoreRing()           -- SVG score ring with optional delta

[template literal]
  HTML document with embedded CSS + JS
  - <style>: ~600 lines, including theme variables
  - <body>: toolbar + h1 + meta + score rings + verdict + tabs + tab contents
  - <script>: tab switching + lang/theme toggle handlers + localStorage
```

### Theme architecture

The report demonstrates the "correct" dark-mode pattern that Beacon's own methodology recommends:

```css
:root { /* light defaults */ }

@media (prefers-color-scheme: dark) {
  :root { /* dark overrides, applied automatically */ }
}

:root[data-theme="light"] { /* button-forced light, wins */ }
:root[data-theme="dark"]  { /* button-forced dark, wins */ }
```

The three layers compose: OS preference is the default fast path (pure CSS variable swap, no JS); button override sets a `data-theme` attribute that wins via specificity; localStorage persists the choice. The methodology panel cites this implementation as a positive example.

### I18N architecture

```js
const I18N = {
  zh: { tab_overview: '總覽', ... },
  en: { tab_overview: 'Overview', ... },
};

function bi(zh, en) { return `<span class="lang-zh">...</span><span class="lang-en">...</span>`; }
function t(key)     { return bi(I18N.zh[key] || key, I18N.en[key] || key); }
function catName(cat) { return bi(I18N.zh[`cat_${cat.id}`] || cat.name, ...); }
```

Both languages are rendered into the HTML; CSS hides the inactive one via `body[data-active-lang="zh"] .lang-en { display: none }`. Toggling is instant — no DOM re-render. Trade-off: HTML ~30% larger.

Default language is **zh** (per user preference); EN is one click away.

Category names work through ID lookup (`cat_contrast`, `cat_keyboard`, …) and fall back to whatever string is in `audit.summary.categories[].name` for custom categories.

### Severity & score model

Each finding has `severity: critical | warning | tip`. Mapping to score impact:

```
base_score = (pass_count / auditable_count) * 100
            where auditable_count = pass_count + fail_count
            (unverifiable is excluded from both)

category_score = base_score
               - (critical_count * 12)
               - (warning_count  * 5)
               - (tip_count      * 1)
clamp to [0, 100]
```

Overall score is a weighted average of categories. Weights are defined in `commands/inspect.md` Step 4 and currently are:

```
Screen Reader 18% | Keyboard 13% | Contrast 13% | Forms 13%
Responsive    12% | Touch     8% | Cognitive 8% | Motion  5%
Media          5% | Agent/AEO 5%
```

**Severity matrix override**: for specific WCAG criteria, severity is mandated regardless of confidence. E.g., 1.4.3 contrast is always `warning` (never `critical`), even at very low ratios. The full matrix is in `commands/inspect.md` Step 4 under "SEVERITY MATRIX".

### Three-state verdict per check item

Each individual check resolves to:

- `pass`: confirmed by evidence, contributes to numerator + denominator
- `fail`: confirmed violation, contributes to denominator + finding
- `unverifiable`: cannot confirm from available evidence (CSR shell, runtime-only behaviour, oklab/oklch alpha-channel backgrounds that the contrast formula can't resolve cleanly, etc.). **Excluded from both numerator and denominator** — does not reduce the score.

This is the key architectural difference from naive auditors: a single-page-app shell that has 50 "we don't know" items will not score 0/50; it scores `unknown` and is marked as `requires_live_audit: true`.

---

## 4. Audit JSON Schema (Implicit)

There is no formal JSON Schema document yet. The implicit schema is:

```typescript
type AuditResults = {
  metadata: {
    date: string;            // YYYY-MM-DD
    url?: string;            // used for slug filename + AEO checks
    scope: string;           // human-readable scope description
    standard: string;        // e.g. "WCAG 2.2 AA"
    jurisdictions?: string[]; // e.g. ["US ADA Title III", "EU EAA"]
    platform?: string;       // "Web" | "iOS" | "Android" | "Desktop"
    tool_version?: string;
    confidence_level: "high" | "medium" | "low";
    requires_live_audit?: boolean;
    audit_tier?: string;     // e.g. "Tier 2 (live browser + axe-core)"
    audit_methods?: string[]; // free-text list of methods applied
  };
  site_signals?: object;      // free-form, used in TTR audit
  aeo_signals?: {
    aeo_subscore?: number;    // 0-100
    schema_org_jsonld?: string[];
    /* ... other AEO observations ... */
  };
  summary: {
    overall_score: number;     // 0-100
    total_findings: number;
    critical: number;
    warnings: number;
    tips: number;
    unverifiable: number;
    pedagogical_excluded?: number;
    categories: Array<{
      id: string;              // matches I18N cat_<id> for translation
      name: string;            // fallback display name
      score: number;
      pass: number;
      fail: number;
      unverifiable: number;
      weight: number;
      review?: number;         // legacy field, used as fallback in some renders
      note?: string;
    }>;
  };
  findings: Array<{
    id: string;
    category: string;          // matches summary.categories[].id
    severity: "critical" | "warning" | "tip";
    title: string;
    wcag?: string;             // e.g. "1.4.3"
    level?: string;            // "A" | "AA" | "AAA" | "best-practice" | "code-health"
    affected_users?: string;
    location?: string;
    description?: string;
    fix?: string;
    legal_exposure?: string;
    code_before?: string;
    code_after?: string;
    axe_node_count?: number | string;
  }>;
  legal_risk?: {
    overall_level: "critical" | "high" | "medium" | "low";
    overall_score: number;     // 1-10
    narrative?: string;
    jurisdictions: Array<{
      name: string;
      law: string;
      risk_level: "critical" | "high" | "medium" | "low";
      score: number;           // 1-10
      detail?: string;
      deadline?: string;
    }>;
  };
  remediation?: Array<{
    priority: "p0" | "p1" | "p2" | "p3";
    title: string;
    wcag?: string;
    effort?: string;           // free-text, e.g. "~10 min"
    impact?: string;           // free-text, e.g. "high"
  }>;
  testing_recommendations?: string[];
  screenshots?: Array<{ label: string; path: string }>;
  dark_mode_analysis?: object;  // free-form per-audit notes
};
```

**Open question** (see ROADMAP): formalising this as a versioned JSON Schema would enable third-party tooling.

---

## 5. Hook Integration

Defined in `hooks/hooks.json`. Three hook surfaces:

### PostToolUse — `a11y-advisor-hook.mjs`

Fires after `Edit` / `Write` tool calls. Inspects the modified file's extension and, if it matches HTML/CSS/JSX/TSX/Vue/Svelte, writes a targeted accessibility checklist to stderr. The hook output is treated by Claude Code as a non-negotiable review list: the agent must address each item or state explicitly why it does not apply.

The hook does **static-pattern detection**, not full audit (audit is a separate skill). E.g., it greps for `onClick` without `onKeyDown`, missing `alt` attributes, `outline: none` without `:focus-visible` substitute, etc. The PostToolUse path keeps overhead small (~50ms typical).

### SessionStart — `beacon-session-start.mjs`

Injects `beacon-governance.md` content at session start so the agent knows the triggering rules without the user having to remember. This is the "proactive triggering" addition from v2.0.x.

### UserPromptSubmit — `beacon-prompt-gate.mjs`

Scans user prompts for trigger phrases (`design`, `a11y`, `setting up`, etc.) in en/zh/ja. If matched, nudges the agent toward invoking the relevant `/beacon:*` command.

The threshold is intentionally low ("1% chance" per governance prose) because the cost of false-positive invocation is small (one skill read) and the cost of false-negative (missed inaccessibility shipping) is large.

---

## 6. Key Design Decisions Worth Knowing

### a. Skills not subagents

Beacon's three commands are skills, not subagents. Reason: skills are loaded into the main conversation, can be referenced by the user mid-flow, and don't require a subagent dispatch. The trade-off is that they cannot run in parallel — but a11y guidance is inherently sequential to user intent, so this is fine.

### b. Three-state verdict instead of pass/fail

A naive scanner gives every check a pass/fail. Beacon's `pass / fail / unverifiable` three-state lets SPA shells, CSR rendering, and runtime-only signals be honest about what static analysis cannot see. Without this, a CSR-only site would score artificially low and the score would lose meaning.

### c. Suggestion-toned vocabulary (v2.0.7 tone pass)

`PASS / FAIL` → `Meets baseline / Priority review recommended`. The intent is to avoid shame-avoidance: developers who feel judged by a tool tend to skip it. Suggestion-toned vocabulary keeps the substance ("this is below WCAG 2.2 AA") but reframes the relationship from examiner-to-examinee to advisor-to-advisee. See ROADMAP item 3 — this should be empirically tested.

### d. Bilingual rendering, not language routing (v2.0.4 + 2.0.6)

Both languages are baked into the rendered HTML. The toggle is a CSS class switch, not a re-render. Trade-off: ~30% larger HTML. Benefit: instant switching, no JS dependency for the language preference itself (only for the toggle interaction). The report file is also useful for offline sharing (the recipient doesn't need a back-end to read it in their preferred language).

### e. Eat-your-own-dog-food dark mode

The report's own dark mode uses `prefers-color-scheme` for the fast CSS-variable path + explicit `data-theme` for manual override + `localStorage` for persistence. This is intentional: the methodology panel cites half-implemented dark mode as an anti-pattern (real performance pain when browsers force-dark), and the report demonstrates the correct alternative. Shipping a half-implemented dark mode in a tool that warns against it would be self-undermining.

### f. Epistemic honesty via banner + dedicated tab (v2.0.4)

Rather than hide limitations in external docs, Beacon's report banner and Methodology & Limits tab are first-class report sections. Every audit ships with "this is ~30-40% of what matters" as visible content. The risk of this design: users might dismiss the whole report. The benefit: users who do trust the report trust it for the right reasons.

### g. Default-language is zh-Hant

The user (chiehweihuang) is Traditional Chinese-speaking. Default language is zh. EN is a toggle. This is the inverse of most a11y tooling which defaults to EN — and intentional, because the EN-default world already exists.

### h. Severity matrix override

Some WCAG criteria have well-known severity classifications (1.4.3 contrast = warning; 2.3.1 flashes = critical with LIFE-SAFETY override). The matrix in `commands/inspect.md` removes auditor judgement variance for these. Without it, different agents could reasonably classify the same finding differently and reports would be inconsistent across runs.

---

## 7. Where the Pieces Fit Together

```
USER ASKS                           AGENT INVOKES                          OUTPUT
"I want to build a modal"     -->   /beacon:guide                     -->  scaffold + checklist
[agent edits Modal.jsx]       -->   PostToolUse hook -> a11y-advisor  -->  inline checklist
"audit this page"             -->   /beacon:inspect                   -->  audit-results.json
                                       -> generate-report.mjs         -->  a11y-report-<slug>-<date>.html
[user reads report]           -->   sees score + limits banner        -->  next-action understanding
```

The shape is intentional: **the further along the pipeline a user gets, the more honest the framing becomes** about what tooling can and cannot tell them. The inspect report has the most prominent "this is only ~30-40%" framing because by that point the user is most at risk of treating the score as truth.

---

## 8. For Auto-Research Loops Reading This

If you are an automated agent looking at Beacon for the first time:

1. **Read [ROADMAP.md](./ROADMAP.md) first** — it has the open questions and the "if you only do one thing" research targets
2. **Read this file second** — system structure so you don't re-derive what's already documented
3. **Pick a specific research question** from ROADMAP "Open Questions" — those are bounded and have artefact-shaped outputs
4. **Avoid the temptation to redesign** — the architecture has converged through 8 patch iterations; suggesting wholesale changes is lower-value than evidence-finding for specific claims
5. **Cite sources** — Beacon makes claims (the 30-40% split, the misframing reframes, the legal exposure heuristics) that would benefit from explicit citation. Producing those citations is genuinely useful research output
6. **Don't optimise for "completion"** — if your loop is configured to run 1000 iterations, focus on finding ≥3-5 high-quality artefacts (a citation, a draft section, a comparison table) rather than touching every line. Quality over coverage

When you produce an artefact, the convention is:
- Citation / external source → `references/<topic>.md`
- Draft skill section → comment in markdown in a new file under `drafts/` (not yet a committed directory, so create it)
- Comparison / benchmark → new file under `research/` (also not yet committed)
- Schema documentation → new file under `references/`

Open a PR or write to a feature branch named `research/<short-topic>`. Keep `master` clean.
