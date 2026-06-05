# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

สถานะการแปล: pending native review.

Plugin สำหรับ accessibility + AEO inspection ใน Claude Code.

Beacon เป็น baseline สำหรับตรวจ accessibility อย่างรวดเร็วในงาน UI ที่มี agent ช่วยทำงาน โดยเริ่มจาก static heuristic checks และสามารถเสริมด้วย live audit ผ่าน Playwright และ axe-core เมื่อมี browser evidence รายงานจะอธิบายว่าควรแก้อะไรและเพราะอะไร

Beacon ไม่ใช่ใบรับรอง compliance ไม่ใช่คำแนะนำทางกฎหมาย และไม่สามารถแทนที่การทดสอบกับผู้ใช้พิการได้ คะแนนสูงหมายถึง automated checks พบปัญหาน้อยลงในหลักฐานที่ตรวจได้เท่านั้น

Beacon ทำงานแบบ local; ไฟล์เว็บไซต์อยู่บนเครื่องของคุณ เว้นแต่คุณจะแชร์เองอย่างชัดเจน Plugin ที่ติดตั้งแล้วจะไม่เปลี่ยนตัวเองใน environment ของคุณ Maintainer อาจรัน offline evaluation loop เพื่อเพิ่ม detector ที่ดีขึ้นใน release ถัดไป ผู้ใช้จะได้รับประโยชน์เมื่ออัปเดต plugin

## Commands

| Command | ใช้เมื่อไร | ผลลัพธ์ |
|---|---|---|
| `beacon:inspect` | เมื่อมี page, component, HTML file, หรือ UI change ที่ต้องตรวจ | คะแนน baseline 0-100, 10 category scores, findings, jurisdiction context notes, remediation order, และ interactive HTML report |
| `beacon:guide` | ก่อนออกแบบหรือเขียน UI | Accessible patterns, component guidance, WCAG reminders, และ design tradeoffs |
| `beacon:advisor` | เมื่อแก้ HTML, CSS, JSX, TSX, Vue, หรือ Svelte | คำแนะนำ a11y ตามบริบท และใน Claude Code จะทำงานผ่าน PostToolUse hook เมื่อแก้ UI files |

## Three-tier Model

| Tier | Evidence | Strength | Limitation |
|---|---|---|---|
| Tier 1 static scan | Files และ markup patterns ผ่าน `scripts/static-audit.mjs` | เร็ว ทำซ้ำได้ ไม่ต้องใช้ browser | เป็น heuristic baseline เท่านั้น ไม่เห็น visibility จริง, computed style, runtime focus, หรือ contrast จริง |
| Tier 2 live audit | Browser evidence ผ่าน Playwright + axe-core | ดีกว่าสำหรับ contrast, ARIA, visibility, และ runtime behavior | ยังเป็น automation ไม่พิสูจน์ task success หรือความเข้าใจของผู้ใช้จริง |
| Tier 3 human testing | Manual walkthrough และการทดสอบกับผู้ใช้พิการ | จำเป็นสำหรับ cognitive load, task completion, assistive technology จริง, และ usability | ต้องวางแผน และ AI แทนไม่ได้ |

ถ้า Tier 1 และ Tier 2 ไม่ตรงกัน ให้เชื่อ live browser และ axe-backed evidence มากกว่า

## Installation

```text
/plugin install beacon@beacon
```

เพิ่ม marketplace:

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
| Contrast | Text/UI contrast ratios, color-only information, dark mode, และ state contrast |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links, และ keyboard alternatives สำหรับ pointer interactions |
| Screen Reader | Landmarks, heading structure, alt text, names, roles, ARIA, page language, และ semantic structure |
| Forms | Labels, instructions, error messages, autocomplete, required fields, และ validation behavior |
| Media | Captions, transcripts, autoplay, audio control, flashing content, และ media alternatives |
| Motion | `prefers-reduced-motion`, time limits, auto-moving content, และ animation from interaction |
| Touch | Target size, spacing, drag alternatives, pointer gestures, และ orientation assumptions |
| Cognitive | Consistent navigation, help mechanisms, readable labels, predictable flows, และ dark patterns |
| Responsive | 320px reflow, zoom, viewport settings, fixed widths, fluid typography, และ layout overflow |
| Agent/AEO | Schema.org, metadata, canonical links, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, optional `llms.txt`, และ answer-engine clarity |

## Jurisdiction Context

Beacon map findings กับ WCAG criteria ที่เกี่ยวข้องในบริบทของ US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, และ Australia DDA ส่วนนี้ไม่ใช่คำแนะนำทางกฎหมาย และไม่ใช่ risk score แบบอัตโนมัติแยกตาม jurisdiction ควรตรวจข้อกำหนดท้องถิ่นล่าสุดก่อนกล่าวอ้าง compliance

## AEO And Agent Readiness Workflow

หมวด Agent/AEO ของ Beacon เป็น structural check ที่ลงมือแก้ได้ ไม่ใช่การรับประกัน AI citation

1. แก้ structural issues ที่ Beacon พบ: meta description, canonical, Schema.org JSON-LD, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, และ optional `llms.txt`
2. สำหรับ public sites ให้ cross-check ด้วย external agent-readiness scanner เช่น Cloudflare [`isitagentready.com`](https://isitagentready.com/) หรือ URL Scanner Agent Readiness สำหรับ robots policy, sitemap discovery, Markdown negotiation, Content Signals, และ MCP/API/OAuth discovery
3. วัด outcome แยกต่างหาก: AI-crawler hits ใน server logs, manual answer-engine queries, และ referral sources ใน analytics

External scanner อาจช่วยเสริมหรือแทนที่บางส่วนของ structural check ได้ แต่แทน outcome measurement ไม่ได้ Structure ready ไม่ได้พิสูจน์ว่า AI engine cite content นั้นจริง

## Reading The Report

อ่าน context banner เหนือคะแนนก่อน จากนั้นดู overall score, category scores, findings, Methodology & Limits, remediation priority, และ jurisdiction context notes อย่าตัดสิน release readiness จากคะแนนอย่างเดียว

`requires_live_audit: true` หมายถึง static evidence ยังไม่พอ `review` และ `incomplete` หมายถึงยังตรวจยืนยันไม่ได้จากหลักฐานที่มี

## Codex

Codex adapter อยู่ใน `adapters/codex/` และ deploy ไปที่:

```text
~/.codex/skills/beacon/
```

See [ADAPTERS.md](./ADAPTERS.md).

## License

MIT
