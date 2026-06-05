# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Accessibility + AEO inspection plugin for Claude Code.

Beacon is a fast accessibility baseline for agent-assisted UI work: static heuristics first, live audit support when available, and report language that explains what to fix and why. It is useful in the same part of the workflow where teams use Lighthouse, axe, Pa11y, or WAVE, but Beacon is tuned for agent coding sessions, jurisdiction-aware WCAG context, Answer Engine Optimization, and human-centered explanations.

Beacon is not a compliance certificate, not a legal opinion, and not a replacement for testing with disabled users. A high Beacon score means the automated checks found fewer problems in the inspected evidence. It does not prove that the product is fully accessible.

Beacon runs locally; site files stay on your machine unless you explicitly share them. The installed plugin does not change itself inside your environment. Maintainers may run offline evaluation loops and add better detectors in later releases; users benefit by updating the plugin.

## What Beacon Does

Beacon provides three Claude Code commands:

| Command | Use it when | What you get |
|---|---|---|
| `beacon:inspect` | You have a page, component, HTML file, or UI change to review. | A 0-100 baseline score, 10 category scores, findings, jurisdiction context notes, remediation order, and an interactive HTML report. |
| `beacon:guide` | You are about to design or code UI. | Accessible patterns, component guidance, WCAG reminders, and design tradeoffs before code is written. |
| `beacon:advisor` | You are editing HTML, CSS, JSX, TSX, Vue, or Svelte. | Contextual accessibility prompts while you work. It also runs through the Claude Code PostToolUse hook for UI file edits. |

Typical usage in Claude Code:

```text
/beacon:guide
I am building a checkout form with address autocomplete and inline validation.
```

```text
/beacon:advisor
Review the modal I am editing for keyboard, focus, and screen-reader issues.
```

```text
/beacon:inspect
Inspect this page for WCAG 2.2 AA, jurisdiction context, and AEO readiness.
```

## Audit Model

Beacon uses a three-tier model.

| Tier | Evidence | Strength | Important limitation |
|---|---|---|---|
| Tier 1: static scan | Files and markup patterns through `scripts/static-audit.mjs`. | Fast, repeatable, zero browser dependency. Good for regression baselines. | Heuristic only. It cannot compute real visibility, computed styles, runtime focus behavior, or true contrast. Hidden elements may be over-reported. |
| Tier 2: live audit | Browser evidence through Playwright and axe-core when available. | Stronger evidence for computed style, contrast, ARIA, visibility, and runtime behavior. | Still automated. It cannot prove task success or language clarity for real users. |
| Tier 3: human testing | Manual walkthroughs and tests with disabled users. | Required for cognitive load, task completion, real assistive technology behavior, and usability. | Takes planning and cannot be replaced by AI. |

Tier 1 is a fast baseline, not the authority. If Tier 1 and Tier 2 disagree, prefer the live browser and axe-backed evidence. Static checks intentionally err on the side of surfacing review items, so dense real-world pages can have false positives, especially around hidden links, list structure, and anything that depends on CSS visibility.

## Installation

Install from the Claude Code plugin marketplace:

```text
/plugin install beacon@beacon
```

Your Claude Code config must include `beacon` in `extraKnownMarketplaces`:

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

Plugin facts:

| Field | Value |
|---|---|
| Name | `beacon` |
| Version | `2.0.10` |
| Repository | `chiehweihuang/beacon` |
| License | MIT |
| Author | chiehweihuang |

## First Inspection

Run `beacon:inspect` after a substantial UI change or against a page you want to evaluate.

Beacon can produce:

- `audit-results.json`: structured audit data and findings.
- `a11y-report-*.html`: an interactive human-readable report.
- before/after comparison when a previous audit JSON is supplied.

Use the score as a triage signal:

| Score band | Meaning |
|---|---|
| 90-100 | Automated baseline looks strong. Still run keyboard, screen-reader, zoom, and real-user checks for important flows. |
| 50-89 | Some barriers or review items were found. Prioritize findings by affected users and severity. |
| 0-49 | High-priority review recommended. The inspected evidence suggests substantial barriers. |

If a report says `requires_live_audit: true`, Beacon found signals that static evidence is not enough. That is common for client-rendered apps, hidden/conditional UI, runtime ARIA, computed contrast, and interactive behavior.

`review` or `incomplete` items are not passes and not failures. They mean Beacon could not verify the condition from the available evidence.

## Inspection Categories

| Category | What it checks |
|---|---|
| Contrast | Text and UI contrast ratios, color-only information, dark mode, and contrast-sensitive states. |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links, and keyboard alternatives for pointer interactions. |
| Screen Reader | Landmarks, heading structure, alt text, names, roles, ARIA, page language, and semantic structure. |
| Forms | Labels, instructions, error messages, autocomplete, required fields, and validation behavior. |
| Media | Captions, transcripts, autoplay, audio control, flashing content, and media alternatives. |
| Motion | `prefers-reduced-motion`, time limits, auto-moving content, and animation from interaction. |
| Touch | Target size, spacing, drag alternatives, pointer gestures, and orientation assumptions. |
| Cognitive | Consistent navigation, help mechanisms, readable labels, predictable flows, and dark patterns. |
| Responsive | 320px reflow, zoom, viewport settings, fixed widths, fluid typography, and layout overflow. |
| Agent/AEO | Schema.org, metadata, canonical links, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, optional `llms.txt`, and answer-engine clarity. |

## Jurisdiction Context Coverage

Beacon maps findings to WCAG-linked context across six legal and regulatory environments:

- US ADA
- EU EAA
- Japan JIS
- Taiwan accessibility standards
- Canada ACA
- Australia DDA

These notes are not legal advice and are not a mechanical per-jurisdiction risk score. Use them to understand which WCAG criteria are relevant in each context, then confirm current local requirements before making a compliance claim.

## AEO And Agent Readiness Workflow

Beacon's Agent/AEO category is an actionable structure check, not a promise of AI citation.

Use it in three steps:

1. Fix Beacon findings that an agent can directly help with: meta description, canonical links, Schema.org JSON-LD, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, and optional `llms.txt`.
2. For public sites, cross-check with an external agent-readiness scanner such as [Cloudflare's `isitagentready.com`](https://isitagentready.com/) or Cloudflare URL Scanner Agent Readiness. These scanners cover broader public-site signals such as robots policy, sitemap discovery, Markdown negotiation, Content Signals, MCP/API/OAuth discovery, and related agent-facing standards.
3. Measure actual outcome separately: AI-crawler hits in server logs, manual answer-engine queries, and referral sources in analytics.

External scanners can supplement or replace parts of Beacon's structural AEO check. They cannot replace outcome measurement, because a ready structure does not prove that an AI engine has cited the content.

## How To Read The HTML Report

Start above the score. The report includes a context banner explaining what automation can and cannot validate.

Then read in this order:

1. Overall score and category scores for triage.
2. Category summary for where the risk clusters.
3. Findings, grouped by priority.
4. Methodology & Limits to understand evidence strength.
5. Remediation priority for a practical fix order.
6. Jurisdiction context notes if the surface is public-facing or regulated.

Do not use the score alone to decide release readiness. Keyboard walkthroughs, zoom/reflow checks, and assistive technology tests matter more than a clean-looking dashboard.

## Codex Adapter

Beacon also runs in Codex as a skill. The source lives in `adapters/codex/`; deploy it to:

```text
~/.codex/skills/beacon/
```

The Codex adapter carries the same accessibility and AEO knowledge without the Claude Code hook layer. Codex invokes Beacon by skill or goal, not by PostToolUse hook. See [ADAPTERS.md](./ADAPTERS.md).

## Development Notes

Generated plugin outputs are built from `core/`.

When changing shared scripts or skill content:

```bash
node build.mjs
node build.mjs --check
node --test test/*.test.mjs
```

Do not edit generated copies under `scripts/`, `commands/`, `references/`, or `adapters/codex/` when the source lives in `core/`. Change `core/`, then rebuild.

For architecture and roadmap details:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROADMAP.md](./ROADMAP.md)
- [ADAPTERS.md](./ADAPTERS.md)

## Known Limits

- Static scanning can over-report hidden or conditional UI.
- Static scanning cannot compute true contrast from runtime CSS.
- Static list checks intentionally inspect conservative structural signals.
- Browser and axe-backed checks are stronger, but still automated.
- AI review cannot replace testing with disabled users.
- Beacon runs locally; site files and audit artifacts stay on your machine unless you explicitly share them.

See [ROADMAP.md](./ROADMAP.md) for known incomplete areas and future work.

## License

MIT
