#!/usr/bin/env node
// PostToolUse hook: a11y advisor
// Triggers on Write|Edit of UI files (html, css, jsx, tsx, vue, svelte, etc.)
// Outputs a brief a11y checklist reminder to stderr so Claude reviews the change.

import { readFileSync } from 'fs';

// Read hook input from stdin
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

const toolInput = data.tool_input || data.input || {};
const filePath = toolInput.file_path || toolInput.path || '';

// Only trigger on UI files
const UI_FILE_PATTERN = /\.(html?|css|scss|less|jsx|tsx|vue|svelte|swift|kt|dart|xaml)$/i;
const JS_FILE_PATTERN = /\.(js|cjs|mjs|ts)$/i;
const isStrictUIFile = UI_FILE_PATTERN.test(filePath);
const isJSFile = !isStrictUIFile && JS_FILE_PATTERN.test(filePath);
if (!isStrictUIFile && !isJSFile) process.exit(0);

// Don't trigger on skill/command files or config files
if (/[/\\](skills|commands|plugins|scripts)[/\\]/.test(filePath)) process.exit(0);
if (/SKILL\.md$/i.test(filePath)) process.exit(0);

// For plain JS/TS, only trigger when the file contains UI indicators.
// PostToolUse runs after the write, so the file should exist — but silently exit on any read failure.
if (isJSFile) {
  let content = '';
  try {
    content = readFileSync(filePath, 'utf8').slice(0, 100 * 1024);
  } catch {
    process.exit(0);
  }
  const UI_INDICATORS = /createElement\(|innerHTML|document\.querySelector|className\s*=|<(div|button|input|form|nav|header|footer|a|section|article|dialog)[\s>]|styled[.(]|from ['"]styled-components['"]|return\s*\(\s*</;
  if (!UI_INDICATORS.test(content)) process.exit(0);
}

// Determine file type for targeted advice
const ext = filePath.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
const isHTML = ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);
const isCSS = ['css', 'scss', 'less'].includes(ext);
const isJS = ['js', 'cjs', 'mjs', 'ts'].includes(ext) && isJSFile;

// Build targeted checklist based on file type
const checks = [];

if (isHTML) {
  checks.push(
    'Semantic elements used? (<button> not <div onclick>, <nav>, <main>, <article>)',
    'Accessible names present? (labels, alt text, aria-label)',
    'Heading hierarchy correct? (no skipped levels)',
    'Keyboard operable? (Tab, Enter, Space, Escape)',
  );
}

if (isCSS) {
  checks.push(
    'Color contrast sufficient? (4.5:1 text, 3:1 UI)',
    'prefers-reduced-motion respected?',
    'prefers-contrast handled for BOTH light and dark modes?',
    'prefers-color-scheme supported?',
    'Focus indicator visible? (no outline:none without :focus-visible)',
    'Touch targets ≥24x24px?',
    'Grid/flex minmax() uses min(Npx, 100%) for reflow?',
  );
}

if (isJS) {
  checks.push(
    'Semantic elements used? (<button>, not <div> with onClick)',
    'Click handlers paired with keyboard support? (Enter/Space for non-native triggers)',
    'Focus managed on route change / modal open-close? (return focus to trigger)',
    'ARIA state attributes reflect real state? (aria-expanded / aria-pressed / aria-selected)',
    'Dynamic updates announced? (aria-live, role="status", role="alert")',
  );
}

// Always include these
checks.push(
  'Works without color alone? (shape, text, icon as alternatives)',
);

// Output to stderr — this becomes a message to Claude
const msg = [
  `A11Y Check (${ext.toUpperCase()} modified):`,
  ...checks.map((c, i) => `  ${i + 1}. ${c}`),
  '',
  'If issues found, apply fixes. If clean, proceed silently.',
  'For detailed patterns: invoke /beacon:advisor or read the references/ directory in the beacon plugin.',
].join('\n');

process.stderr.write(msg + '\n');
