# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Claude Code 的 accessibility + AEO 檢查 plugin。

Beacon 是給 agent-assisted UI 工作流使用的快速無障礙基線：先用靜態啟發式檢查，有 live audit 時再用瀏覽器與 axe-core 補強，並用人看得懂的報告說明要修什麼、為什麼要修。

Beacon 不是合規證書，不是法律意見，也不能取代與障礙使用者一起測試。高分只表示自動化檢查在當前證據中找到較少問題，不代表產品已完全可達。

Beacon 在本機執行；除非你明確分享，站點檔案會留在你的機器上。已安裝的 plugin 不會在你的環境裡自動變化。維護者可能在離線環境跑 evaluation loop，並在新版加入更好的 detector；使用者更新 plugin 後才會受惠。

## 三個命令

| Command | 何時使用 | 產出 |
|---|---|---|
| `beacon:inspect` | 已有頁面、元件、HTML 檔或 UI 變更要檢查。 | 0-100 基線分數、10 類分數、finding、司法管轄區脈絡、修復順序、互動式 HTML report。 |
| `beacon:guide` | 開始設計或寫 UI 之前。 | 可用的無障礙 pattern、元件建議、WCAG 提醒與設計 tradeoff。 |
| `beacon:advisor` | 正在編輯 HTML、CSS、JSX、TSX、Vue 或 Svelte。 | 情境式 a11y 提醒；在 Claude Code 中也會透過 PostToolUse hook 自動觸發。 |

## 三層檢查模型

| Tier | 證據 | 強項 | 限制 |
|---|---|---|---|
| Tier 1 靜態掃描 | `scripts/static-audit.mjs` 讀檔與 markup pattern。 | 快速、可重複、零瀏覽器依賴。 | 只能作為啟發式基線，無法知道真實可見性、computed style、runtime focus 或真實 contrast。 |
| Tier 2 live audit | Playwright + axe-core 的瀏覽器證據。 | 對 contrast、ARIA、visibility、runtime behavior 證據更強。 | 仍是自動化，不能證明真實任務完成率或文字是否易懂。 |
| Tier 3 人工測試 | 手動走查與障礙使用者測試。 | 驗證認知負荷、任務完成、真實 assistive technology 使用。 | 需要規劃，不能被 AI 取代。 |

Tier 1 是快速基線，不是權威判定。若 Tier 1 和 Tier 2 不一致，優先相信 live browser 與 axe-backed evidence。靜態層對隱藏元素、list 結構、CSS visibility 相關問題可能超報。

## 安裝

```text
/plugin install beacon@beacon
```

Claude Code config 需在 `extraKnownMarketplaces` 加入：

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

Plugin facts：`beacon`、version `2.0.10`、MIT、repository `chiehweihuang/beacon`。

## 檢查類別

| 類別 | 檢查內容 |
|---|---|
| Contrast | 文字與 UI 對比、只靠顏色傳達資訊、dark mode、狀態對比。 |
| Keyboard | Tab order、focus indicator、keyboard trap、skip link、指標互動的鍵盤替代。 |
| Screen Reader | Landmark、heading、alt text、name、role、ARIA、頁面語言與語意結構。 |
| Forms | Label、說明、錯誤訊息、autocomplete、required field、validation 行為。 |
| Media | Caption、transcript、autoplay、audio control、flash 與替代內容。 |
| Motion | `prefers-reduced-motion`、time limit、自動移動內容、互動動畫。 |
| Touch | 目標尺寸、間距、drag 替代、pointer gesture、orientation 假設。 |
| Cognitive | 一致導覽、help mechanism、易懂標籤、可預期流程、dark pattern。 |
| Responsive | 320px reflow、zoom、viewport、fixed width、fluid typography、overflow。 |
| Agent/AEO | Schema.org、metadata、canonical、heading outline、可爬取內容、`robots.txt`、`sitemap.xml`、optional `llms.txt`、answer-engine clarity。 |

## 司法管轄區脈絡

Beacon 會把 finding 對照到 US ADA、EU EAA、Japan JIS、Taiwan、Canada ACA、Australia DDA 等脈絡中的 WCAG 相關條件。這不是法律意見，也不是逐法域機械風險分數；若要宣稱合規，仍需確認當地目前有效的要求。

## AEO 與 agent readiness 工作流程

Beacon 的 Agent/AEO 類別是可執行的結構檢查，不是 AI 引用保證。

建議流程：

1. 先修 Beacon 可直接指出的結構問題：meta description、canonical、Schema.org JSON-LD、heading outline、可爬取內容、`robots.txt`、`sitemap.xml`，以及 optional `llms.txt`。
2. 公開站再用外部 agent-readiness scanner 交叉檢查，例如 [Cloudflare 的 `isitagentready.com`](https://isitagentready.com/) 或 Cloudflare URL Scanner Agent Readiness。這類工具涵蓋 robots policy、sitemap discovery、Markdown negotiation、Content Signals、MCP/API/OAuth discovery 等公開站訊號。
3. 實際效果要另外量測：server log 的 AI crawler hits、手動 answer-engine query、analytics referral。

外部 scanner 可以補強或取代部分結構檢查，但不能取代 outcome measurement。結構 ready 不代表 AI engine 已經引用內容。

## 如何讀報告

先讀分數上方的 context banner，再看 overall score、category score、finding、Methodology & Limits、Remediation priority 與司法管轄區脈絡。不要只用分數決定是否可發布；鍵盤走查、zoom/reflow、assistive technology 測試與使用者測試更重要。

若看到 `requires_live_audit: true`，代表目前靜態證據不足，需要 live browser audit。`review` 或 `incomplete` 不是 pass，也不是 fail，而是目前無法驗證。

## Codex

Codex adapter 位於 `adapters/codex/`，部署到：

```text
~/.codex/skills/beacon/
```

Codex 使用同一套 accessibility + AEO 知識，但沒有 Claude Code hook layer。詳見 [ADAPTERS.md](./ADAPTERS.md)。

## 開發

shared output 從 `core/` 產生：

```bash
node build.mjs
node build.mjs --check
node --test test/*.test.mjs
```

不要直接改 generated copies。修改 `core/` 後重建。

## License

MIT
