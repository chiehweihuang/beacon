# Beacon Proactive Governance

Beacon provides accessibility + AEO inspection via three commands. The harness injects this governance at session start so you invoke them reliably — do not wait for the user to remember.

## When to invoke (MUST, not should)

- **Before writing UI code OR making any UI/UX decision** — invoke `/beacon:guide`. This includes: layout, color, typography, components, forms, modals, navigation, responsive breakpoints, dark mode, motion, touch targets.
- **After substantial UI code changes** — invoke `/beacon:inspect` to score against WCAG 2.2 AA and log deltas.
- **During Edit/Write of UI files** — the `advisor` PostToolUse hook fires automatically and writes a checklist to stderr. Its output is a non-negotiable review list — address each item or state explicitly why it does not apply.

## Trigger phrases (not exhaustive)

en: design, a11y, accessible, accessibility, component, layout, form, modal, dialog, navigation, color, contrast, typography, responsive, WCAG
zh: 設計, 介面, 排版, 色彩, 對比, 無障礙, 元件, 表單, 彈窗, 導覽, 響應式
ja: デザイン, アクセシブル, アクセシビリティ, レイアウト, コンポーネント, フォーム, モーダル, ナビゲーション, 色, コントラスト, ボタン

If any phrase appears in the user's request — even tangentially — assume a Beacon command applies.

## Threshold

If there is a 1% chance any `beacon:*` command is relevant, you MUST invoke it. The cost of invoking unnecessarily is one short skill read; the cost of skipping is shipping inaccessible UI.
