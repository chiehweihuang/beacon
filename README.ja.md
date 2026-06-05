# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Claude Code 向けの accessibility + AEO inspection plugin です。

Beacon は agent-assisted UI 開発のための高速なアクセシビリティ基準チェックです。まず静的ヒューリスティックで確認し、可能な場合は Playwright と axe-core を使った live audit で補強します。レポートは、何を直すべきか、なぜ直すべきかを人間に分かる言葉で説明します。

Beacon は適合証明書ではなく、法律助言でもありません。障害のあるユーザーとのテストを置き換えるものでもありません。高いスコアは、確認できた証拠の範囲で自動チェックが見つけた問題が少ないことを示すだけです。

Beacon はローカルで実行され、サイトファイルは明示的に共有しない限り手元の環境に残ります。インストール済み plugin は環境内で自動的に変化しません。メンテナーがオフライン評価ループを実行し、後続リリースで detector を追加・改善することがあります。ユーザーは plugin を更新するとその改善を受け取れます。

## Commands

| Command | 使う場面 | 得られるもの |
|---|---|---|
| `beacon:inspect` | ページ、コンポーネント、HTML ファイル、UI 変更を確認するとき。 | 0-100 の基準スコア、10 分類のスコア、findings、管轄区域ごとの WCAG context、修復順序、interactive HTML report。 |
| `beacon:guide` | UI を設計または実装する前。 | アクセシブルな pattern、component guidance、WCAG の注意点、設計上の tradeoff。 |
| `beacon:advisor` | HTML、CSS、JSX、TSX、Vue、Svelte を編集しているとき。 | 文脈に応じた a11y 提示。Claude Code では UI ファイル編集時に PostToolUse hook でも起動します。 |

## Three-tier Model

| Tier | Evidence | Strength | Limitation |
|---|---|---|---|
| Tier 1 static scan | `scripts/static-audit.mjs` による file と markup pattern。 | 高速、再現可能、browser 不要。 | ヒューリスティック基準です。可視性、computed style、runtime focus、実際の contrast は判断できません。 |
| Tier 2 live audit | Playwright + axe-core による browser evidence。 | contrast、ARIA、visibility、runtime behavior で強い証拠が得られます。 | それでも自動化です。実際の task completion や言葉の分かりやすさは証明できません。 |
| Tier 3 human testing | 手動確認と障害のあるユーザーとのテスト。 | cognitive load、task completion、実際の assistive technology 利用を確認できます。 | 計画が必要で、AI では置き換えられません。 |

Tier 1 は高速な基準であり、最終判定ではありません。Tier 1 と Tier 2 が異なる場合は、live browser と axe-backed evidence を優先してください。

## Installation

```text
/plugin install beacon@beacon
```

Claude Code config の `extraKnownMarketplaces` に追加します。

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

Plugin facts: `beacon`, version `2.0.10`, MIT, repository `chiehweihuang/beacon`.

## Categories

| Category | What it checks |
|---|---|
| Contrast | Text/UI contrast ratios, color-only information, dark mode, and state contrast. |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links, and keyboard alternatives. |
| Screen Reader | Landmarks, headings, alt text, names, roles, ARIA, language, and semantic structure. |
| Forms | Labels, instructions, errors, autocomplete, required fields, and validation. |
| Media | Captions, transcripts, autoplay, audio controls, flash, and alternatives. |
| Motion | `prefers-reduced-motion`, time limits, moving content, and interaction animation. |
| Touch | Target size, spacing, drag alternatives, pointer gestures, and orientation assumptions. |
| Cognitive | Consistent navigation, help mechanisms, readable labels, predictable flows, and dark patterns. |
| Responsive | 320px reflow, zoom, viewport, fixed widths, fluid typography, and overflow. |
| Agent/AEO | Schema.org, metadata, canonical links, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, optional `llms.txt`, and answer-engine clarity. |

## Jurisdiction Context

Beacon は US ADA、EU EAA、Japan JIS、Taiwan、Canada ACA、Australia DDA という各 context に findings を WCAG criteria として対応づけます。これは法律助言ではなく、管轄区域ごとの機械的な risk score でもありません。Compliance claim を出す前に、現在有効な地域要件を確認してください。

## AEO And Agent Readiness Workflow

Beacon の Agent/AEO カテゴリは実行可能な構造チェックであり、AI 引用の保証ではありません。

1. Beacon が検出した構造問題を修正します: meta description、canonical、Schema.org JSON-LD、heading outline、crawlable content、`robots.txt`、`sitemap.xml`、optional `llms.txt`。
2. 公開サイトでは、Cloudflare の [`isitagentready.com`](https://isitagentready.com/) や URL Scanner Agent Readiness などの外部 scanner で robots policy、sitemap discovery、Markdown negotiation、Content Signals、MCP/API/OAuth discovery を交差確認します。
3. 実際の効果は別に測定します: server log の AI crawler hits、manual answer-engine queries、analytics referral。

External scanner は一部の構造チェックを補強または置き換えられますが、outcome measurement は置き換えられません。構造が整っていても、AI engine がその content を引用した証明にはなりません。

## Reading The Report

Read the context banner above the score first. Then review overall score, category scores, findings, Methodology & Limits, remediation priority, and jurisdiction context notes. Do not decide release readiness from the score alone.

`requires_live_audit: true` means static evidence is not enough. `review` and `incomplete` mean the condition could not be verified from the available evidence.

## Codex

Codex adapter lives in `adapters/codex/` and deploys to:

```text
~/.codex/skills/beacon/
```

See [ADAPTERS.md](./ADAPTERS.md).

## License

MIT
