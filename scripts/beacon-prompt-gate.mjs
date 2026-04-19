#!/usr/bin/env node
// UserPromptSubmit hook: emit a reminder when the user's prompt contains
// UI / a11y / design keywords. Silent on miss.

import { readFileSync } from 'fs';

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

if (!input.trim()) process.exit(0);

let data;
try {
  data = JSON.parse(input);
} catch {
  process.exit(0);
}

const prompt = String(data.prompt || data.user_prompt || '');
if (!prompt) process.exit(0);

const UI_KEYWORDS =
  /(design|a11y|accessible|accessibility|component|layout|form|modal|dialog|navigation|colou?r|contrast|typography|responsive|wcag|無障礙|介面|排版|色|對比|設計|元件|表單|彈窗|導覽|響應式|レイアウト|アクセシブル|アクセシビリティ|ボタン|コンポーネント|フォーム|モーダル|ナビゲーション)/i;

if (UI_KEYWORDS.test(prompt)) {
  process.stderr.write(
    'Beacon: UI/a11y keyword detected in prompt. Invoke `/beacon:guide` before writing code, or `/beacon:inspect` if reviewing existing UI.\n',
  );
}

process.exit(0);
