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
if (!UI_FILE_PATTERN.test(filePath)) process.exit(0);

// Don't trigger on skill/command files or config files
if (/[/\\](skills|commands|plugins|scripts)[/\\]/.test(filePath)) process.exit(0);
if (/SKILL\.md$/i.test(filePath)) process.exit(0);

// Determine file type for targeted advice
const ext = filePath.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
const isHTML = ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);
const isCSS = ['css', 'scss', 'less'].includes(ext);

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
  'For detailed patterns: read ~/.claude/skills/a11y-advisor/references/patterns.md',
].join('\n');

process.stderr.write(msg + '\n');
