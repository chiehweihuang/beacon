// Beacon · codex-side advisor (adapters/codex/scripts/advisor.mjs) — PDF parity.
// Black-box: run the hand-kept advisor CLI on temp fixtures and assert it now
// flags PDF-generation accessibility issues, mirroring the Claude-side hook.
// advisor.mjs is NOT build-generated, so there is no build step here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADVISOR = resolve(ROOT, 'adapters/codex/scripts/advisor.mjs');

// Run the advisor on one fixture file; return { out, code }. The CLI exits 2 when
// it found issues (execFileSync throws on non-zero), so capture both paths.
function runAdvisor(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-advisor-'));
  try {
    const f = join(dir, name);
    writeFileSync(f, content);
    try {
      const out = execFileSync('node', [ADVISOR, f], { encoding: 'utf8' });
      return { out, code: 0 };
    } catch (e) {
      return { out: String(e.stdout || ''), code: e.status };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('LaTeX source without \\DocumentMetadata is flagged with the PDF checklist', () => {
  const r = runAdvisor('report.tex', '\\documentclass{article}\\begin{document}hi\\end{document}');
  assert.match(r.out, /\(PDF output\)/);
  assert.match(r.out, /\\DocumentMetadata/);
  assert.match(r.out, /tagged PDF output enabled/);
  assert.equal(r.code, 2);
});

test('jsPDF in a .js file fires the no-tagged-support finding (no UI markers needed)', () => {
  const r = runAdvisor('invoice.js', "import { jsPDF } from 'jspdf'; const doc = new jsPDF(); doc.save('a.pdf');");
  assert.match(r.out, /cannot emit tagged/);
  assert.equal(r.code, 2);
});

test('page.pdf() without tagged:true warns; with tagged:true it does not', () => {
  const warn = runAdvisor('export.ts', "await page.pdf({ path: 'o.pdf', format: 'A4' });");
  assert.match(warn.out, /without tagged: true/);
  const ok = runAdvisor('export2.ts', "await page.pdf({ path: 'o.pdf', tagged: true });");
  assert.doesNotMatch(ok.out, /without tagged: true/);
  assert.match(ok.out, /tagged PDF output enabled/); // still gets the PDF checklist
});

test('WeasyPrint in a .py file is scanned (PDF-gen); a plain .py is not', () => {
  const pdf = runAdvisor('render.py', 'from weasyprint import HTML\nHTML(string=h).write_pdf("o.pdf")');
  assert.match(pdf.out, /\(PDF output\)/);
  assert.match(pdf.out, /tagged PDF output enabled/);
  // A plain .py is collected but skipped by scan() (not PDF-gen, not UI), so the
  // CLI prints nothing for it — the key invariant is it produces no PDF advisory.
  const plain = runAdvisor('util.py', 'def add(a, b):\n    return a + b\n');
  assert.doesNotMatch(plain.out, /PDF output|tagged PDF output/);
  assert.equal(plain.code, 0);
});

test('a CSS file still gets the CSS checklist, no PDF items', () => {
  const r = runAdvisor('s.css', '.btn { color: #333; }');
  assert.match(r.out, /contrast 4\.5:1/);
  assert.doesNotMatch(r.out, /tagged PDF output/);
});
