# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Claude Code 的 accessibility + AEO 检查 plugin。

Beacon 是面向 agent-assisted UI 工作流的快速无障碍基线：先做静态启发式检查，有 live audit 时再用浏览器和 axe-core 补强，并用清楚的报告解释要修什么、为什么要修。

Beacon 不是合规证书，不是法律意见，也不能取代与障碍用户一起测试。高分只表示自动化检查在当前证据中找到的问题较少，不代表产品已经完全可达。

Beacon 在本地执行；除非你明确分享，站点文件会留在你的机器上。已安装的 plugin 不会在你的环境里自动变化。维护者可能在离线环境运行 evaluation loop，并在新版加入更好的 detector；用户更新 plugin 后才会受益。

## 三个命令

| Command | 何时使用 | 产出 |
|---|---|---|
| `beacon:inspect` | 已有页面、组件、HTML 文件或 UI 变更要检查。 | 0-100 基线分数、10 类分数、finding、司法管辖区语境、修复顺序、交互式 HTML report。 |
| `beacon:guide` | 开始设计或写 UI 之前。 | 可用的无障碍 pattern、组件建议、WCAG 提醒与设计 tradeoff。 |
| `beacon:advisor` | 正在编辑 HTML、CSS、JSX、TSX、Vue 或 Svelte。 | 情境式 a11y 提醒；在 Claude Code 中也会通过 PostToolUse hook 自动触发。 |

## 三层检查模型

| Tier | 证据 | 强项 | 限制 |
|---|---|---|---|
| Tier 1 静态扫描 | `scripts/static-audit.mjs` 读取文件和 markup pattern。 | 快速、可重复、零浏览器依赖。 | 只是启发式基线，无法知道真实可见性、computed style、runtime focus 或真实 contrast。 |
| Tier 2 live audit | Playwright + axe-core 的浏览器证据。 | 对 contrast、ARIA、visibility、runtime behavior 证据更强。 | 仍是自动化，不能证明真实任务完成率或文字是否易懂。 |
| Tier 3 人工测试 | 手动走查与障碍用户测试。 | 验证认知负荷、任务完成、真实 assistive technology 使用。 | 需要规划，不能被 AI 取代。 |

Tier 1 是快速基线，不是权威判定。若 Tier 1 和 Tier 2 不一致，优先相信 live browser 与 axe-backed evidence。静态层对隐藏元素、list 结构、CSS visibility 相关问题可能超报。

## 安装

```text
/plugin install beacon@beacon
```

Claude Code config 需要在 `extraKnownMarketplaces` 加入：

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

Plugin facts：`beacon`、version `3.0.0`、MIT、repository `chiehweihuang/beacon`。

## 分数解读

请把分数当作分诊信号使用：

| 分数区间 | 含义 |
|---|---|
| 90-100 | 自动化基线检查表现良好，重要流程仍需人工做 keyboard、screen reader、zoom 与真实用户检查。 |
| 50-89 | 发现了一些 barrier 或待复核项，请依受影响用户与严重程度排定 finding 优先级。 |
| 0-49 | 建议优先复核，已检查的证据显示存在较严重的 barrier。 |

每个分数都会附带 `coverage_percent`（实际测量到的 scoring weight 占比）。没有机器证据的类别会以状态（`not-machine-checkable` / `not-applicable`）取代数字，且一旦确认存在癫痫发作风险的 finding（WCAG 2.3.1），无论各类别权重如何，overall score 都会被限制在 0-49 区间。

这些数字如何保持可信（可靠性、detector 有效性、score-semantics 性质、外部 benchmark、fairness invariant）已在 [VALIDATION.md](VALIDATION.md) 中规范并可执行；实测数据存放在 [benchmark/](benchmark/) 下。

## 检查类别

| 类别 | 检查内容 |
|---|---|
| Contrast | 文字与 UI 对比、只靠颜色传达信息、dark mode、状态对比。 |
| Keyboard | Tab order、focus indicator、keyboard trap、skip link、指针交互的键盘替代。 |
| Screen Reader | Landmark、heading、alt text、name、role、ARIA、页面语言与语义结构。 |
| Forms | Label、说明、错误消息、autocomplete、required field、validation 行为。 |
| Media | Caption、transcript、autoplay、audio control、flash 与替代内容。 |
| Motion | `prefers-reduced-motion`、time limit、自动移动内容、交互动画。 |
| Touch | 目标尺寸、间距、drag 替代、pointer gesture、orientation 假设。 |
| Cognitive | 一致导航、help mechanism、易懂标签、可预期流程、dark pattern。 |
| Responsive | 320px reflow、zoom、viewport、fixed width、fluid typography、overflow。 |
| Agent/AEO | Schema.org、metadata、canonical、heading outline、可爬取内容、`robots.txt`、`sitemap.xml`、optional `llms.txt`、answer-engine clarity。 |

## 司法管辖区语境

Beacon 会把 finding 对照到 US ADA、EU EAA、Japan JIS、Taiwan、Canada ACA、Australia DDA 等语境中的 WCAG 相关条件。这不是法律意见，也不是逐法域机械风险分数；若要宣称合规，仍需确认当地当前有效的要求。

## AEO 与 agent readiness 工作流程

Beacon 的 Agent/AEO 类别是可执行的结构检查，不是 AI 引用保证。

建议流程：

1. 先修 Beacon 可直接指出的结构问题：meta description、canonical、Schema.org JSON-LD、heading outline、可爬取内容、`robots.txt`、`sitemap.xml`，以及 optional `llms.txt`。
2. 公开站再用外部 agent-readiness scanner 交叉检查，例如 [Cloudflare 的 `isitagentready.com`](https://isitagentready.com/) 或 Cloudflare URL Scanner Agent Readiness。这类工具涵盖 robots policy、sitemap discovery、Markdown negotiation、Content Signals、MCP/API/OAuth discovery 等公开站信号。
3. 实际效果要另外量测：server log 的 AI crawler hits、手动 answer-engine query、analytics referral。

外部 scanner 可以补强或取代部分结构检查，但不能取代 outcome measurement。结构 ready 不代表 AI engine 已经引用内容。

## 如何读报告

先读分数上方的 context banner，再看 overall score、category score、finding、Methodology & Limits、Remediation priority 与司法管辖区语境。不要只用分数决定是否可发布；键盘走查、zoom/reflow、assistive technology 测试与用户测试更重要。

若看到 `requires_live_audit: true`，代表目前静态证据不足，需要 live browser audit。`review` 或 `incomplete` 不是 pass，也不是 fail，而是目前无法验证。

## Codex

Codex adapter 位于 `adapters/codex/`，部署到：

```text
~/.codex/skills/beacon/
```

Codex 使用同一套 accessibility + AEO 知识，但没有 Claude Code hook layer。详见 [ADAPTERS.md](./ADAPTERS.md)。

## 开发

shared output 从 `core/` 产生：

```bash
node build.mjs
node build.mjs --check
node --test test/*.test.mjs
```

不要直接改 generated copies。修改 `core/` 后重建。

## License

MIT
