#!/usr/bin/env node
// PostToolUse hook: a11y advisor
// Triggers on Write|Edit of UI files (html, css, jsx, tsx, vue, svelte, etc.)
// Two-layer output:
//   1. Static-pattern detectors — scan new_string/file content for known violations
//   2. Targeted checklist — reminders relevant to the file type
// Outputs via stdout JSON additionalContext (PostToolUse spec).
// stderr + exit 0 was silently swallowed by Claude Code (verified 2026-05-05).

import { readFileSync } from 'fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRecords, loadRecords, fileKindForExt } from './pattern-runtime.mjs';

// Web detectors are declarative: records in ./patterns/ (shipped from core/patterns)
// run through the shared pattern-runtime, so this hook and the codex advisor share
// one engine and cannot drift. Degrade to checklist-only if patterns are absent.
let RECORDS = [];
try {
  RECORDS = loadRecords(join(dirname(fileURLToPath(import.meta.url)), 'patterns'));
} catch { /* patterns not shipped */ }

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

// Only trigger on UI files, document sources, or code that can generate PDFs
const UI_FILE_PATTERN = /\.(html?|css|scss|less|jsx|tsx|vue|svelte|swift|kt|dart|xaml)$/i;
const JS_FILE_PATTERN = /\.(js|cjs|mjs|ts)$/i;
const DOC_FILE_PATTERN = /\.(tex|typ)$/i;   // LaTeX / Typst — compile to PDF
const PY_FILE_PATTERN = /\.py$/i;           // only fires when PDF-gen indicators present
const isStrictUIFile = UI_FILE_PATTERN.test(filePath);
const isJSFile = !isStrictUIFile && JS_FILE_PATTERN.test(filePath);
const isDocFile = DOC_FILE_PATTERN.test(filePath);
const isPyFile = PY_FILE_PATTERN.test(filePath);
if (!isStrictUIFile && !isJSFile && !isDocFile && !isPyFile) process.exit(0);

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

// PDF-generation indicators: library names and print-to-PDF calls across the
// JS (jsPDF, pdfmake, PDFKit, headless-Chrome page.pdf) and Python (ReportLab,
// WeasyPrint, fpdf, xhtml2pdf) ecosystems, plus generic html-to-pdf converters.
const PDF_GEN_INDICATORS = /jsPDF|pdfmake|pdfkit|new PDFDocument\s*\(|page\.pdf\s*\(|printToPDF|html2pdf|wkhtmltopdf|dompdf|TCPDF|mpdf|reportlab|weasyprint|xhtml2pdf|fpdf/i;
const isPdfGen = isDocFile || PDF_GEN_INDICATORS.test(scanContent || '');

// For plain JS/TS, only trigger when the file contains UI indicators or PDF
// generation. For Python, ONLY PDF generation (don't spam every .py edit).
const UI_INDICATORS = /createElement\(|innerHTML|document\.querySelector|className\s*=|<(div|button|input|form|nav|header|footer|a|section|article|dialog)[\s>]|styled[.(]|from ['"]styled-components['"]|return\s*\(\s*</;
const hasUIIndicators = UI_INDICATORS.test(scanContent || '');
if (isJSFile && !hasUIIndicators && !isPdfGen) process.exit(0);
if (isPyFile && !isPdfGen) process.exit(0);

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
  // Web + PDF detectors are one declarative library (./patterns/) run through the
  // shared pattern-runtime, so this hook and the codex advisor cannot drift.
  const webKind = fileKindForExt(ext);
  if (webKind) {
    for (const f of scanRecords(RECORDS, c, webKind).findings) findings.push(`⚠ ${f.flag}`);
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

if (isJS && hasUIIndicators) {
  checks.push(
    'Semantic elements used? (<button>, not <div> with onClick)',
    'Click handlers paired with keyboard support? (Enter/Space for non-native triggers)',
    'Focus managed on route change / modal open-close? (return focus to trigger)',
    'ARIA state attributes reflect real state? (aria-expanded / aria-pressed / aria-selected)',
    'Dynamic updates announced? (aria-live, role="status", role="alert")',
  );
}

if (isPdfGen) {
  checks.push(
    'Tagged PDF output enabled? (untagged = screen readers must guess reading order)',
    'Document title + language metadata set? (and displayTitle, so the viewer shows the title, not the filename)',
    'Headings tagged H1-H6, bookmarks/outline generated for long documents?',
    'Images have alt text; decorative images marked as artifacts?',
    'Tables tagged with header cells? (and never screenshots of tables)',
    'Real selectable text, not rasterized? (scanned pages need an OCR text layer)',
    'Fonts embedded? (critical for CJK glyph rendering)',
    'Verified with PAC / veraPDF / Acrobat checker before shipping?',
  );
}

checks.push('Works without color alone? (shape, text, icon as alternatives)');

// ─────────────────────────────────────────────────────────────────────────────
// Compose output
// ─────────────────────────────────────────────────────────────────────────────
const lines = [`A11Y Check (${ext.toUpperCase()} modified${isPdfGen ? ' · PDF output' : ''}):`];

if (findings.length > 0) {
  lines.push('', 'Detected patterns to review:');
  findings.forEach(f => lines.push(`  ${f}`));
}

lines.push('', 'Checklist:');
checks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));

lines.push(
  '',
  findings.length > 0
    ? 'Address confirmed issues above, then verify runtime-dependent checklist items.'
    : 'No static detector fired; verify runtime-dependent checklist items when relevant.',
  isPdfGen
    ? 'For document specifics: read references/documents.md in the beacon plugin (PDF/UA, Matterhorn checkpoints, EPUB alternative).'
    : 'For detailed patterns: invoke /beacon:advisor or read the references/ directory in the beacon plugin.',
);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: lines.join('\n'),
    },
  }),
);
