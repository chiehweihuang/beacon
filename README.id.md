# Beacon

[English](./README.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [简体中文](./README.zh-Hans.md) · [繁體中文](./README.zh-Hant.md) · [Bahasa Indonesia](./README.id.md) · [Tiếng Việt](./README.vi.md) · [ไทย](./README.th.md) · [हिन्दी](./README.hi.md)

Status terjemahan: pending native review.

Plugin accessibility + AEO inspection untuk Claude Code.

Beacon adalah baseline aksesibilitas cepat untuk kerja UI dengan bantuan agent. Beacon memulai dari static heuristic checks, lalu dapat diperkuat dengan live audit berbasis Playwright dan axe-core saat tersedia. Laporannya menjelaskan apa yang perlu diperbaiki dan mengapa.

Beacon bukan sertifikat kepatuhan, bukan nasihat hukum, dan bukan pengganti pengujian dengan pengguna difabel. Skor tinggi hanya berarti automated checks menemukan lebih sedikit masalah pada bukti yang tersedia.

Beacon berjalan secara lokal; file situs tetap di mesin Anda kecuali Anda membagikannya secara eksplisit. Plugin terpasang tidak berubah otomatis di lingkungan Anda. Maintainer dapat menjalankan offline evaluation loop dan menambahkan detector yang lebih baik pada rilis berikutnya. Pengguna mendapat manfaat dengan memperbarui plugin.

## Commands

| Command | Kapan digunakan | Hasil |
|---|---|---|
| `beacon:inspect` | Saat halaman, komponen, file HTML, atau perubahan UI siap ditinjau. | Skor baseline 0-100, 10 skor kategori, findings, catatan konteks yurisdiksi, prioritas remediasi, dan interactive HTML report. |
| `beacon:guide` | Sebelum mendesain atau menulis UI. | Accessible patterns, component guidance, WCAG reminders, dan design tradeoffs. |
| `beacon:advisor` | Saat mengedit HTML, CSS, JSX, TSX, Vue, atau Svelte. | Saran a11y kontekstual. Di Claude Code juga berjalan melalui PostToolUse hook untuk edit file UI. |

## Three-tier Model

| Tier | Evidence | Strength | Limitation |
|---|---|---|---|
| Tier 1 static scan | File dan markup pattern melalui `scripts/static-audit.mjs`. | Cepat, repeatable, tanpa browser. | Heuristic baseline saja. Tidak bisa mengetahui visibility nyata, computed style, runtime focus, atau contrast sebenarnya. |
| Tier 2 live audit | Browser evidence melalui Playwright + axe-core. | Lebih kuat untuk contrast, ARIA, visibility, dan runtime behavior. | Tetap otomatis. Tidak membuktikan task success atau kejelasan bahasa bagi pengguna nyata. |
| Tier 3 human testing | Manual walkthrough dan pengujian dengan pengguna difabel. | Diperlukan untuk cognitive load, task completion, assistive technology nyata, dan usability. | Perlu perencanaan dan tidak bisa digantikan AI. |

Jika Tier 1 dan Tier 2 berbeda, prioritaskan live browser dan axe-backed evidence.

## Installation

```text
/plugin install beacon@beacon
```

Tambahkan marketplace:

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
| Contrast | Rasio kontras teks/UI, informasi yang hanya bergantung pada warna, dark mode, dan state contrast. |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links, dan alternatif keyboard untuk interaksi pointer. |
| Screen Reader | Landmarks, heading structure, alt text, names, roles, ARIA, page language, dan semantic structure. |
| Forms | Labels, instructions, error messages, autocomplete, required fields, dan validation behavior. |
| Media | Captions, transcripts, autoplay, audio control, flashing content, dan media alternatives. |
| Motion | `prefers-reduced-motion`, time limits, auto-moving content, dan animation from interaction. |
| Touch | Target size, spacing, drag alternatives, pointer gestures, dan orientation assumptions. |
| Cognitive | Consistent navigation, help mechanisms, readable labels, predictable flows, dan dark patterns. |
| Responsive | 320px reflow, zoom, viewport settings, fixed widths, fluid typography, dan layout overflow. |
| Agent/AEO | Schema.org, metadata, canonical links, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, optional `llms.txt`, dan answer-engine clarity. |

## Jurisdiction Context

Beacon memetakan findings ke WCAG criteria yang relevan dalam konteks US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, dan Australia DDA. Ini bukan nasihat hukum dan bukan risk score mekanis per yurisdiksi. Konfirmasi aturan lokal yang berlaku sebelum membuat klaim kepatuhan.

## AEO And Agent Readiness Workflow

Kategori Agent/AEO Beacon adalah pemeriksaan struktur yang dapat ditindaklanjuti, bukan jaminan AI citation.

1. Perbaiki struktur yang ditemukan Beacon: meta description, canonical, Schema.org JSON-LD, heading outline, crawlable content, `robots.txt`, `sitemap.xml`, dan optional `llms.txt`.
2. Untuk situs publik, cross-check dengan external agent-readiness scanner seperti Cloudflare [`isitagentready.com`](https://isitagentready.com/) atau URL Scanner Agent Readiness untuk robots policy, sitemap discovery, Markdown negotiation, Content Signals, dan MCP/API/OAuth discovery.
3. Ukur outcome secara terpisah: AI-crawler hits di server logs, manual answer-engine queries, dan referral sources di analytics.

External scanner dapat melengkapi atau menggantikan sebagian pemeriksaan struktur, tetapi tidak menggantikan outcome measurement. Struktur yang siap tidak membuktikan bahwa AI engine benar-benar mengutip content tersebut.

## Reading The Report

Baca context banner di atas skor terlebih dahulu. Lalu tinjau overall score, category scores, findings, Methodology & Limits, remediation priority, dan catatan konteks yurisdiksi. Jangan gunakan skor saja untuk memutuskan kesiapan rilis.

`requires_live_audit: true` berarti bukti statis tidak cukup. `review` dan `incomplete` berarti kondisi belum dapat diverifikasi dari bukti yang tersedia.

## Codex

Codex adapter berada di `adapters/codex/` dan dideploy ke:

```text
~/.codex/skills/beacon/
```

See [ADAPTERS.md](./ADAPTERS.md).

## License

MIT
