#!/usr/bin/env node
// Beacon advisor for Codex.
// Usage:
//   node advisor.mjs <file> [file...]

import { readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

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

  if ((isHTML || isJS) && /addEventListener\s*\(\s*['"]click['"]/.test(content)) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/addEventListener\s*\(\s*['"]click['"]/.test(lines[i])) {
        const ctx = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        if (!/<button|role\s*=\s*["']button["']|keydown|keyup/.test(ctx)) {
          findings.push('click handler may be keyboard-inaccessible; use <button> or add role/button keyboard handling');
          break;
        }
      }
    }
  }

  if ((isHTML || isJS) && /<(div|span)[^>]+onClick=/.test(content)) {
    findings.push('onClick on <div>/<span>; prefer native <button> or add correct role, tabindex, and Enter/Space handling');
  }

  if ((isCSS || isHTML) && /outline\s*:\s*(none|0)\b/.test(content) && !/focus-visible/.test(content)) {
    findings.push('outline:none/0 without :focus-visible replacement; keyboard focus may be invisible');
  }

  if ((isHTML || isJS) && /aria-hidden\s*=\s*["']true["'][^>]*(tabindex|<(button|a|input|select|textarea))/.test(content)) {
    findings.push('aria-hidden region appears to contain focusable content; this can trap assistive-tech users');
  }

  if (isCSS && /minmax\(\s*\d+px/.test(content) && !/min\(\s*\d+px\s*,\s*100%/.test(content)) {
    findings.push('minmax(Npx, ...) may break 320px reflow; use minmax(min(Npx, 100%), 1fr)');
  }

  if ((isHTML || isJS) && (content.match(/role\s*=\s*["']alert["']/g) || []).length > 1) {
    findings.push('multiple role="alert" regions; simultaneous announcements may be dropped');
  }

  if ((isHTML || isJS) && /tabindex\s*=\s*["']?[1-9]/.test(content)) {
    findings.push('positive tabindex detected; custom tab order often breaks reverse navigation');
  }

  const inputMethodMatch = content.match(/["'>](click|tap|swipe|pinch) (here|to |the )/i);
  if (inputMethodMatch) {
    findings.push(`input-method-specific copy detected ("${inputMethodMatch[0].replace(/["'>]/g, '').trim()}"); prefer "select", "activate", or "open"`);
  }

  // PDF output (WCAG applies to PDFs too; untagged = unreadable). Same detectors
  // as the Claude-side a11y-advisor hook, in this advisor's bare-string style.
  if (isPdfGen) {
    if (/jsPDF|pdfmake|wkhtmltopdf/i.test(content)) {
      findings.push('jsPDF / pdfmake / wkhtmltopdf cannot emit tagged (accessible) PDFs; use headless-Chrome page.pdf with tagged:true, PDFKit tagged mode, WeasyPrint, or tagged LaTeX');
    }
    if (/page\.pdf\s*\(|printToPDF/i.test(content) && !/tagged\s*:\s*true/.test(content)) {
      findings.push('page.pdf()/printToPDF without tagged: true; print-to-PDF output is untagged by default. Set tagged: true and verify with PAC');
    }
    if (/new PDFDocument\s*\(/.test(content) && !/tagged\s*:\s*true/.test(content)) {
      findings.push('PDFKit document without { tagged: true }; also set lang + displayTitle and build the structure tree (doc.struct)');
    }
    if (ext === 'tex' && !/\\DocumentMetadata/.test(content)) {
      findings.push('LaTeX source without \\DocumentMetadata; recent kernels support \\DocumentMetadata{lang=..., tagging=on} for accessible output');
    }
  }

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
