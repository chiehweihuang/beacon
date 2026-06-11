// Beacon · a11y-advisor PostToolUse hook — black-box tests via stdin JSON.
// Covers the PDF-output extension (doc sources, PDF-gen code) and guards the
// pre-existing UI behavior against regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = resolve(ROOT, 'scripts/a11y-advisor-hook.mjs');

function runHook(filePath, content) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: filePath, content } }),
    encoding: 'utf8',
  });
  if (!out.trim()) return null; // hook exited silently
  return JSON.parse(out).hookSpecificOutput.additionalContext;
}

// --- PDF-output triggering -------------------------------------------------
test('LaTeX source triggers the PDF checklist and DocumentMetadata nudge', () => {
  const ctx = runHook('/tmp/report.tex', '\\documentclass{article}\\begin{document}hi\\end{document}');
  assert.ok(ctx, 'hook must fire for .tex');
  assert.match(ctx, /PDF output/);
  assert.match(ctx, /Tagged PDF output enabled/);
  assert.match(ctx, /\\DocumentMetadata/);
  assert.match(ctx, /documents\.md/);
});

test('jsPDF in a plain JS file fires the no-tagged-support warning (no UI indicators needed)', () => {
  const ctx = runHook('/tmp/invoice.js', "import { jsPDF } from 'jspdf'; const doc = new jsPDF(); doc.save('a.pdf');");
  assert.ok(ctx, 'hook must fire for PDF-gen JS');
  assert.match(ctx, /cannot emit tagged/);
});

test('page.pdf() without tagged:true warns; with tagged:true does not', () => {
  const warn = runHook('/tmp/export.ts', "await page.pdf({ path: 'out.pdf', format: 'A4' });");
  assert.match(warn, /without tagged: true/);
  const ok = runHook('/tmp/export.ts', "await page.pdf({ path: 'out.pdf', tagged: true });");
  assert.ok(ok, 'still fires with checklist');
  assert.doesNotMatch(ok, /without tagged: true/);
});

test('Python fires only when PDF-gen indicators are present', () => {
  const ctx = runHook('/tmp/render.py', 'from weasyprint import HTML\nHTML(string=html).write_pdf("out.pdf")');
  assert.ok(ctx, 'weasyprint .py must fire');
  assert.match(ctx, /Tagged PDF output enabled/);
  assert.equal(runHook('/tmp/util.py', 'def add(a, b):\n    return a + b'), null, 'plain .py must stay silent');
});

// --- regression guards -------------------------------------------------------
test('CSS file still gets the CSS checklist, no PDF items', () => {
  const ctx = runHook('/tmp/style.css', '.btn { color: #333; }');
  assert.match(ctx, /Color contrast sufficient/);
  assert.doesNotMatch(ctx, /Tagged PDF/);
});

test('plain JS without UI or PDF indicators stays silent', () => {
  assert.equal(runHook('/tmp/math.js', 'export const add = (a, b) => a + b;'), null);
});
