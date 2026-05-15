#!/usr/bin/env node
// PostToolUse hook: a11y advisor
// Triggers on Write|Edit of UI files (html, css, jsx, tsx, vue, svelte, etc.)
// Two-layer output:
//   1. Static-pattern detectors — scan new_string/file content for known violations
//   2. Targeted checklist — reminders relevant to the file type
// Outputs via stdout JSON additionalContext (PostToolUse spec).
// stderr + exit 0 was silently swallowed by Claude Code (verified 2026-05-05).

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

// Get content to scan: Edit provides new_string, Write provides content field.
// Fall back to reading the file (PostToolUse runs after write so file exists).
let scanContent = toolInput.new_string || toolInput.content || '';
if (!scanContent) {
  try {
    scanContent = readFileSync(filePath, 'utf8').slice(0, 200 * 1024);
  } catch {
    // proceed without scan content — checklist still fires
  }
}

// For plain JS/TS, only trigger when the file contains UI indicators.
if (isJSFile) {
  const UI_INDICATORS = /createElement\(|innerHTML|document\.querySelector|className\s*=|<(div|button|input|form|nav|header|footer|a|section|article|dialog)[\s>]|styled[.(]|from ['"]styled-components['"]|return\s*\(\s*</;
  if (!UI_INDICATORS.test(scanContent || '')) process.exit(0);
}

// Determine file type for targeted advice
const ext = filePath.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
const isHTML = ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);
const isCSS = ['css', 'scss', 'less'].includes(ext);
const isJS = ['js', 'cjs', 'mjs', 'ts'].includes(ext) && isJSFile;

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: Static-pattern detectors
// Each detector returns a finding string or null.
// ─────────────────────────────────────────────────────────────────────────────
const findings = [];
const c = scanContent;

if (c) {
  // Clickable non-button (HTML/JS) — keyboard trap risk
  if ((isHTML || isJS) && /addEventListener\s*\(\s*['"]click['"]/.test(c)) {
    // Only flag if there's no accompanying button/role=button on a nearby line
    const lines = c.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/addEventListener\s*\(\s*['"]click['"]/.test(lines[i])) {
        const ctx = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        if (!/<button|role\s*=\s*["']button["']/.test(ctx)) {
          findings.push('⚠ click handler on non-button element (keyboard inaccessible) — use <button> or add role="button" + keydown Enter/Space');
          break;
        }
      }
    }
  }

  // outline: none without :focus-visible companion (CSS/HTML)
  if ((isCSS || isHTML) && /outline\s*:\s*none|outline\s*:\s*0/.test(c)) {
    const hasCompanion = /focus-visible/.test(c);
    if (!hasCompanion) {
      findings.push('⚠ outline:none/0 without :focus-visible companion — keyboard focus will be invisible (WCAG 2.4.7)');
    }
  }

  // aria-hidden on focusable container (HTML/JS)
  if ((isHTML || isJS) && /aria-hidden\s*=\s*["']true["']/.test(c)) {
    const ariaHiddenLines = c.split('\n').filter(l => /aria-hidden\s*=\s*["']true["']/.test(l));
    for (const line of ariaHiddenLines) {
      // Warn if the same element or a nearby sibling has tabindex / focusable tag
      if (/tabindex|<(button|a|input|select|textarea)/.test(line)) {
        findings.push('⚠ aria-hidden="true" on or near focusable element — keyboard focus will be trapped inside hidden region');
        break;
      }
    }
  }

  // minmax(Npx, ...) without min() wrapper — reflow failure (WCAG 1.4.10)
  if (isCSS && /minmax\(\s*\d+px/.test(c) && !/min\(\s*\d+px/.test(c)) {
    findings.push('⚠ minmax(Npx, ...) without min(Npx, 100%) — fixed min breaks 320px reflow (WCAG 1.4.10)');
  }

  // role="alert" appears more than once — screen reader dedup risk (web-general rule #2)
  if ((isHTML || isJS) && (c.match(/role\s*=\s*["']alert["']/g) || []).length > 1) {
    findings.push('⚠ multiple role="alert" elements — screen readers may silence all but the first simultaneous announcement');
  }

  // Prescriptive input-method copy — keyboard/switch users see wrong instructions (web-general rule #3)
  const inputMethodMatch = c.match(/["'>](click|tap|swipe|pinch) (here|to |the )/i);
  if (inputMethodMatch) {
    findings.push(`⚠ prescriptive input-method copy ("${inputMethodMatch[0].replace(/["'>]/g,'').trim()}") — use device-agnostic wording ("select", "activate", "open")`);
  }

  // focus-visible pairing: :focus defined without :focus-visible (web-general rule #1)
  if (isCSS && /:focus\s*\{/.test(c) && !/:focus-visible/.test(c)) {
    findings.push('⚠ :focus style without :focus-visible — sighted keyboard users get focus ring; pointer users also get it unexpectedly. Pair :focus-visible with :focus');
  }

  // Custom tabindex > 0 without reverse-order handling (web-general rule #4)
  if ((isHTML || isJS) && /tabindex\s*=\s*["']?[1-9]/.test(c)) {
    findings.push('⚠ tabindex > 0 detected — custom tab order breaks Shift+Tab reverse navigation unless all focusable elements in the sequence are also managed');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2: Targeted checklist (reminders, not detectors)
// ─────────────────────────────────────────────────────────────────────────────
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

checks.push('Works without color alone? (shape, text, icon as alternatives)');

// ─────────────────────────────────────────────────────────────────────────────
// Compose output
// ─────────────────────────────────────────────────────────────────────────────
const lines = [`A11Y Check (${ext.toUpperCase()} modified):`];

if (findings.length > 0) {
  lines.push('', 'Detected issues (fix before proceeding):');
  findings.forEach(f => lines.push(`  ${f}`));
}

lines.push('', 'Checklist:');
checks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));

lines.push(
  '',
  findings.length > 0
    ? 'Fix detected issues above. Then verify checklist items.'
    : 'If issues found, apply fixes. If clean, proceed silently.',
  'For detailed patterns: invoke /beacon:advisor or read the references/ directory in the beacon plugin.',
);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: lines.join('\n'),
    },
  }),
);
