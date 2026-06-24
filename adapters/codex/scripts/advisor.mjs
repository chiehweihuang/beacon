#!/usr/bin/env node
// Beacon advisor for Codex.
// Usage:
//   node advisor.mjs <file> [file...]

import { readFileSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scanRecords, loadRecords, fileKindForExt } from './pattern-runtime.mjs';

// Web detectors share the same declarative library + runtime as the CC hook.
let RECORDS = [];
try {
  RECORDS = loadRecords(join(dirname(fileURLToPath(import.meta.url)), 'patterns'));
} catch { /* patterns not shipped: degrade to checklist-only */ }

const UI_FILE_PATTERN = /\.(html?|css|scss|less|jsx|tsx|vue|svelte|swift|kt|dart|xaml)$/i;
const JS_FILE_PATTERN = /\.(js|cjs|mjs|ts)$/i;
const DOC_FILE_PATTERN = /\.(tex|typ)$/i;   // LaTeX / Typst — compile to PDF
const PY_FILE_PATTERN = /\.py$/i;           // only when PDF-gen indicators present
// PDF generation across the JS (jsPDF, pdfmake, PDFKit, headless-Chrome page.pdf)
// and Python (ReportLab, WeasyPrint, fpdf, xhtml2pdf) ecosystems + html-to-pdf.
const PDF_GEN_INDICATORS = /jsPDF|pdfmake|pdfkit|new PDFDocument\s*\(|page\.pdf\s*\(|printToPDF|html2pdf|wkhtmltopdf|dompdf|TCPDF|mpdf|reportlab|weasyprint|xhtml2pdf|fpdf/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', 'coverage']);

function usage() {
  console.error('Usage: node advisor.mjs <file-or-dir> [file-or-dir...]');
  process.exit(1);
}

function collect(inputPath, out = []) {
  const stat = statSync(inputPath);
  if (stat.isDirectory()) {
    for (const name of readdirSync(inputPath)) {
      if (SKIP_DIRS.has(name)) continue;
      collect(join(inputPath, name), out);
    }
    return out;
  }
  if (UI_FILE_PATTERN.test(inputPath) || JS_FILE_PATTERN.test(inputPath) ||
      DOC_FILE_PATTERN.test(inputPath) || PY_FILE_PATTERN.test(inputPath)) out.push(inputPath);
  return out;
}

function looksLikeUiJs(content) {
  return /createElement\(|innerHTML|document\.querySelector|className\s*=|<(div|button|input|form|nav|header|footer|a|section|article|dialog)[\s>]|styled[.(]|from ['"]styled-components['"]|return\s*\(\s*</.test(content);
}

function scan(filePath) {
  const content = readFileSync(filePath, 'utf8').slice(0, 200 * 1024);
  const ext = filePath.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
  const isStrictUIFile = UI_FILE_PATTERN.test(filePath);
  const isJSFile = !isStrictUIFile && JS_FILE_PATTERN.test(filePath);
  const isDocFile = DOC_FILE_PATTERN.test(filePath);
  const isPyFile = PY_FILE_PATTERN.test(filePath);
  const isPdfGen = isDocFile || PDF_GEN_INDICATORS.test(content);
  // JS/TS only matters if UI-like OR it generates a PDF (e.g. jsPDF). Plain .py
  // only matters when PDF-gen indicators are present (do not spam every .py).
  if (isJSFile && !looksLikeUiJs(content) && !isPdfGen) return null;
  if (isPyFile && !isPdfGen) return null;

  const isHTML = ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);
  const isCSS = ['css', 'scss', 'less'].includes(ext);
  const isJS = ['js', 'cjs', 'mjs', 'ts'].includes(ext) && isJSFile;
  const findings = [];
  const checks = [];

  const webKind = fileKindForExt(ext);
  if (webKind) {
    for (const f of scanRecords(RECORDS, content, webKind).findings) findings.push(f.flag);
  }

  // PDF detectors are records too (pdf/* in ./patterns/); scanRecords above runs them.

  if (isHTML) {
    checks.push(
      'semantic elements (<button>, <nav>, <main>, <article>)',
      'accessible names (labels, alt text, aria-label)',
      'heading hierarchy',
      'keyboard operation (Tab, Enter, Space, Escape)',
    );
  }

  if (isCSS) {
    checks.push(
      'contrast 4.5:1 text / 3:1 UI',
      'prefers-reduced-motion',
      'prefers-contrast for light and dark modes',
      'visible focus indicator',
      'touch targets at least 24x24px',
      '320px reflow',
    );
  }

  if (isJS) {
    checks.push(
      'native semantic elements before custom handlers',
      'keyboard support for non-native click handlers',
      'focus management on modal open/close and route changes',
      'ARIA state reflects actual state',
      'dynamic updates use aria-live/status when needed',
    );
  }

  if (isPdfGen) {
    checks.push(
      'tagged PDF output enabled (untagged = screen readers guess reading order)',
      'document title + language metadata set (and displayTitle, so the viewer shows the title not the filename)',
      'headings tagged H1-H6; bookmarks/outline for long documents',
      'images have alt text; decorative images marked as artifacts',
      'tables tagged with header cells (never screenshots of tables)',
      'real selectable text, not rasterized (scanned pages need an OCR text layer)',
      'fonts embedded (critical for CJK glyph rendering)',
      'verified with PAC / veraPDF / Acrobat checker',
    );
  }

  checks.push('works without color alone');
  return { filePath, ext, isPdfGen, findings, checks };
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const files = [...new Set(args.flatMap(p => collect(p)))];
let issueCount = 0;

for (const file of files) {
  const result = scan(file);
  if (!result) continue;
  issueCount += result.findings.length;
  console.log(`\nA11Y Check: ${result.filePath}${result.isPdfGen ? ' (PDF output)' : ''}`);
  if (result.findings.length) {
    console.log('Detected issues:');
    for (const item of result.findings) console.log(`  - ${item}`);
  } else {
    console.log('Detected issues: none from static advisor rules');
  }
  console.log('Checklist:');
  result.checks.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
}

if (files.length === 0) {
  console.log('No UI-like files found.');
}

process.exit(issueCount > 0 ? 2 : 0);
