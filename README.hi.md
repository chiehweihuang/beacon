# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Translation status: pending native review.

Claude Code के लिए accessibility + AEO inspection plugin.

Beacon agent-assisted UI work के लिए एक तेज accessibility baseline है। यह पहले static heuristic checks चलाता है, और जब उपलब्ध हो तो Playwright और axe-core आधारित live audit से evidence को मजबूत करता है। Report बताती है कि क्या ठीक करना है और क्यों।

Beacon compliance certificate नहीं है, legal advice नहीं है, और disabled users के साथ testing का replacement नहीं है। High score का अर्थ केवल यह है कि available evidence में automated checks ने कम problems पाई हैं।

Beacon local रूप से चलता है; site files आपकी machine पर रहती हैं जब तक आप उन्हें स्पष्ट रूप से share नहीं करते. Installed plugin आपके environment में अपने आप बदलता नहीं है. Maintainers offline evaluation loops चला सकते हैं और बाद के releases में बेहतर detectors जोड़ सकते हैं. Users को benefit plugin update करने पर मिलता है.

## Commands

| Command | कब उपयोग करें | Output |
|---|---|---|
| `beacon:inspect` | जब page, component, HTML file, या UI change review करना हो। | 0-100 baseline score, 10 category scores, findings, jurisdiction context notes, remediation order, और interactive HTML report। |
| `beacon:guide` | UI design या coding शुरू करने से पहले। | Accessible patterns, component guidance, WCAG reminders, और design tradeoffs। |
| `beacon:advisor` | HTML, CSS, JSX, TSX, Vue, या Svelte edit करते समय। | Contextual a11y advice। Claude Code में UI file edits पर PostToolUse hook से भी चलता है। |

## Three-tier Model

| Tier | Evidence | Strength | Limitation |
|---|---|---|---|
| Tier 1 static scan | `scripts/static-audit.mjs` से files और markup patterns। | तेज, repeatable, browser dependency नहीं। | केवल heuristic baseline। Real visibility, computed style, runtime focus, या true contrast नहीं जानता। |
| Tier 2 live audit | Playwright + axe-core से browser evidence। | Contrast, ARIA, visibility, और runtime behavior के लिए मजबूत। | फिर भी automated है। Real task success या language clarity prove नहीं करता। |
| Tier 3 human testing | Manual walkthrough और disabled users के साथ testing। | Cognitive load, task completion, real assistive technology, और usability के लिए जरूरी। | Planning चाहिए और AI इसे replace नहीं कर सकता। |

यदि Tier 1 और Tier 2 अलग हों, live browser और axe-backed evidence को प्राथमिकता दें।

## Installation

```text
/plugin install beacon@beacon
```

Marketplace जोड़ें:

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

Plugin facts: `beacon`, version `3.0.0`, MIT, repository `chiehweihuang/beacon`.

## स्कोर की व्याख्या

स्कोर को triage signal के रूप में उपयोग करें:

| स्कोर बैंड | अर्थ |
|---|---|
| 90-100 | Automated baseline मजबूत दिखता है। महत्वपूर्ण flows के लिए फिर भी keyboard, screen reader, zoom, और real-user checks चलाएं। |
| 50-89 | कुछ barrier या review items पाए गए। प्रभावित users और severity के आधार पर findings को प्राथमिकता दें। |
| 0-49 | High-priority review की सलाह दी जाती है। जांची गई evidence substantial barriers का संकेत देती है। |

हर स्कोर के साथ `coverage_percent` जुड़ा होता है, यानी scoring weight का वह हिस्सा जो वास्तव में measure हुआ। Machine evidence के बिना categories संख्या के बजाय एक स्थिति (`not-machine-checkable` / `not-applicable`) रिपोर्ट करती हैं, और एक confirmed seizure-risk finding (WCAG 2.3.1) category weights की परवाह किए बिना overall score को 0-49 band में सीमित कर देती है।

ये आंकड़े कैसे honest रखे जाते हैं (reliability, detector validity, score-semantics properties, external benchmarks, और fairness invariants), यह [VALIDATION.md](VALIDATION.md) में specify और executable रूप में दिया गया है; measured data [benchmark/](benchmark/) के तहत है।

## Categories

| Category | What it checks |
|---|---|
| Contrast | Text/UI contrast ratios, color-only information, dark mode, और state contrast. |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links, और pointer interactions के keyboard alternatives. |
| Screen Reader | Landmarks, heading structure, alt text, names, roles, ARIA, page language, और semantic structure. |
| Forms | Labels, instructions, error messages, autocomplete, required fields, और validation behavior. |
| Media | Captions, transcripts, autoplay, audio control, flashing content, और media alternatives. |
| Motion | `prefers-reduced-motion`, time limits, auto-moving content, और animation from interaction. |
| Touch | Target size, spacing, drag alternatives, pointer gestures, और orientation assumptions. |
| Cognitive | Consistent navigation, help mechanisms, readable labels, predictable flows, और dark patterns. |
| Responsive | 320px reflow, zoom, viewport settings, fixed widths, fluid typography, और layout overflow. |
| Agent/AEO | Schema.org, metadata, canonical links, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, optional `llms.txt`, और answer-engine clarity. |

## Jurisdiction Context

Beacon findings को US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, और Australia DDA context में relevant WCAG criteria से map करता है। यह legal advice नहीं है और per-jurisdiction mechanical risk score भी नहीं है। Compliance claim करने से पहले current local requirements confirm करें।

## AEO And Agent Readiness Workflow

Beacon की Agent/AEO category actionable structural check है, AI citation की guarantee नहीं।

1. Beacon द्वारा मिले structural issues ठीक करें: meta description, canonical, Schema.org JSON-LD, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, और optional `llms.txt`.
2. Public sites के लिए Cloudflare [`isitagentready.com`](https://isitagentready.com/) या URL Scanner Agent Readiness जैसे external scanner से robots policy, sitemap discovery, Markdown negotiation, Content Signals, और MCP/API/OAuth discovery cross-check करें।
3. Outcome अलग से मापें: server logs में AI-crawler hits, manual answer-engine queries, और analytics referral sources.

External scanner structural check के कुछ हिस्से supplement या replace कर सकता है, लेकिन outcome measurement replace नहीं कर सकता। Structure ready होने से यह prove नहीं होता कि AI engine ने content को सच में cite किया है।

## Reading The Report

Score के ऊपर context banner पहले पढ़ें। फिर overall score, category scores, findings, Methodology & Limits, remediation priority, और jurisdiction context notes देखें। Release readiness केवल score से तय न करें।

`requires_live_audit: true` का अर्थ है static evidence पर्याप्त नहीं है। `review` और `incomplete` का अर्थ है कि available evidence से condition verify नहीं हो सकी।

## Codex

Codex adapter `adapters/codex/` में है और यहां deploy होता है:

```text
~/.codex/skills/beacon/
```

See [ADAPTERS.md](./ADAPTERS.md).

## License

MIT
