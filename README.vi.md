# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Trạng thái bản dịch: pending native review.

Plugin accessibility + AEO inspection cho Claude Code.

Beacon là baseline kiểm tra accessibility nhanh cho quy trình UI có agent hỗ trợ. Beacon bắt đầu bằng static heuristic checks, sau đó có thể dùng live audit với Playwright và axe-core khi có browser evidence. Báo cáo giải thích cần sửa gì và vì sao.

Beacon không phải chứng chỉ tuân thủ, không phải tư vấn pháp lý, và không thay thế kiểm thử với người dùng khuyết tật. Điểm cao chỉ có nghĩa là automated checks tìm thấy ít vấn đề hơn trong phạm vi bằng chứng hiện có.

Beacon chạy local; file website ở lại trên máy của bạn trừ khi bạn chủ động chia sẻ. Plugin đã cài không tự thay đổi trong môi trường của bạn. Maintainer có thể chạy offline evaluation loop để thêm detector tốt hơn trong các bản phát hành sau. Người dùng hưởng lợi bằng cách cập nhật plugin.

## Commands

| Command | Khi nào dùng | Kết quả |
|---|---|---|
| `beacon:inspect` | Khi cần review page, component, HTML file, hoặc UI change. | Điểm baseline 0-100, 10 category scores, findings, ghi chú jurisdiction context, remediation order, và interactive HTML report. |
| `beacon:guide` | Trước khi thiết kế hoặc viết UI. | Accessible patterns, component guidance, WCAG reminders, và design tradeoffs. |
| `beacon:advisor` | Khi chỉnh HTML, CSS, JSX, TSX, Vue, hoặc Svelte. | Gợi ý a11y theo ngữ cảnh. Trong Claude Code, nó cũng chạy qua PostToolUse hook khi chỉnh UI files. |

## Three-tier Model

| Tier | Evidence | Strength | Limitation |
|---|---|---|---|
| Tier 1 static scan | Files và markup patterns qua `scripts/static-audit.mjs`. | Nhanh, lặp lại được, không cần browser. | Chỉ là heuristic baseline. Không biết visibility thật, computed style, runtime focus, hoặc contrast thật. |
| Tier 2 live audit | Browser evidence qua Playwright + axe-core. | Mạnh hơn cho contrast, ARIA, visibility, và runtime behavior. | Vẫn là tự động. Không chứng minh task success hay độ dễ hiểu với người dùng thật. |
| Tier 3 human testing | Manual walkthrough và kiểm thử với người dùng khuyết tật. | Cần cho cognitive load, task completion, assistive technology thật, và usability. | Cần lập kế hoạch và không thể thay bằng AI. |

Nếu Tier 1 và Tier 2 khác nhau, ưu tiên live browser và axe-backed evidence.

## Installation

```text
/plugin install beacon@beacon
```

Thêm marketplace:

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

Plugin facts: `beacon`, version `3.0.0`, MIT, repository `chiehweihuang/beacon`.

## Diễn Giải Điểm Số

Hãy dùng điểm số như một tín hiệu triage:

| Dải điểm | Ý nghĩa |
|---|---|
| 90-100 | Baseline tự động trông tốt. Vẫn nên chạy kiểm tra keyboard, screen reader, zoom, và real-user cho các luồng quan trọng. |
| 50-89 | Đã tìm thấy một số barrier hoặc mục cần review. Ưu tiên findings theo người dùng bị ảnh hưởng và mức độ nghiêm trọng. |
| 0-49 | Khuyến nghị review ưu tiên cao. Bằng chứng đã kiểm tra cho thấy có barrier đáng kể. |

Mỗi điểm số đi kèm `coverage_percent`, tức là phần scoring weight thực sự được đo. Category không có bằng chứng máy sẽ báo cáo trạng thái (`not-machine-checkable` / `not-applicable`) thay vì con số, và một finding về nguy cơ co giật đã xác nhận (WCAG 2.3.1) sẽ giới hạn overall score vào band 0-49 bất kể trọng số category.

Cách các con số này được giữ trung thực (reliability, tính hợp lệ của detector, tính chất score-semantics, benchmark bên ngoài, và fairness invariant) được quy định và có thể thực thi trong [VALIDATION.md](VALIDATION.md); dữ liệu đo lường nằm trong [benchmark/](benchmark/).

## Categories

| Category | What it checks |
|---|---|
| Contrast | Tỷ lệ tương phản text/UI, thông tin chỉ dựa vào màu, dark mode, và state contrast. |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links, và keyboard alternatives cho pointer interactions. |
| Screen Reader | Landmarks, heading structure, alt text, names, roles, ARIA, page language, và semantic structure. |
| Forms | Labels, instructions, error messages, autocomplete, required fields, và validation behavior. |
| Media | Captions, transcripts, autoplay, audio control, flashing content, và media alternatives. |
| Motion | `prefers-reduced-motion`, time limits, auto-moving content, và animation from interaction. |
| Touch | Target size, spacing, drag alternatives, pointer gestures, và orientation assumptions. |
| Cognitive | Consistent navigation, help mechanisms, readable labels, predictable flows, và dark patterns. |
| Responsive | 320px reflow, zoom, viewport settings, fixed widths, fluid typography, và layout overflow. |
| Agent/AEO | Schema.org, metadata, canonical links, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, optional `llms.txt`, và answer-engine clarity. |

## Jurisdiction Context

Beacon map findings với WCAG criteria liên quan trong bối cảnh US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, và Australia DDA. Đây không phải tư vấn pháp lý và không phải risk score cơ học theo từng jurisdiction. Hãy xác nhận yêu cầu địa phương hiện hành trước khi tuyên bố compliance.

## AEO And Agent Readiness Workflow

Category Agent/AEO của Beacon là structural check có thể hành động, không phải bảo đảm AI citation.

1. Sửa các vấn đề cấu trúc Beacon tìm thấy: meta description, canonical, Schema.org JSON-LD, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, và optional `llms.txt`.
2. Với public sites, cross-check bằng external agent-readiness scanner như Cloudflare [`isitagentready.com`](https://isitagentready.com/) hoặc URL Scanner Agent Readiness cho robots policy, sitemap discovery, Markdown negotiation, Content Signals, và MCP/API/OAuth discovery.
3. Đo outcome riêng: AI-crawler hits trong server logs, manual answer-engine queries, và referral sources trong analytics.

External scanner có thể bổ sung hoặc thay thế một phần structural check, nhưng không thay thế outcome measurement. Structure ready không chứng minh rằng AI engine đã thật sự cite content đó.

## Reading The Report

Đọc context banner phía trên điểm trước. Sau đó xem overall score, category scores, findings, Methodology & Limits, remediation priority, và ghi chú jurisdiction context. Không dùng riêng score để quyết định release readiness.

`requires_live_audit: true` nghĩa là static evidence chưa đủ. `review` và `incomplete` nghĩa là điều kiện chưa thể xác minh từ bằng chứng hiện có.

## Codex

Codex adapter nằm trong `adapters/codex/` và deploy tới:

```text
~/.codex/skills/beacon/
```

See [ADAPTERS.md](./ADAPTERS.md).

## License

MIT
