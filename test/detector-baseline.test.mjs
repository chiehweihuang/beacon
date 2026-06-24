// Beacon · Step 0 detector baseline — characterization tests that LOCK the
// reconciled behavior of every advisor detector across BOTH runtimes
// (the Claude-side PostToolUse hook AND the codex CLI advisor) before the
// pattern library externalization (Step 4) touches them.
//
// Why this file exists: a11y-advisor-hook.test.mjs covers ZERO of the web
// detectors, so "existing tests pass" proved nothing about the 8+ web rules.
// Each detector must FIRE on a positive fixture and stay SILENT on a negative
// one, in BOTH runtimes. The two runtimes word their messages differently, so
// hookRe / codexRe identify the same detector in each runtime's output.
//
// Reconciled decisions encoded here (the deliberate, reviewed behavior merge):
//   - click handler: suppressed by a nearby <button>/role=button OR keydown|keyup
//   - <div>/<span> onClick: flagged in BOTH runtimes
//   - outline:none/0: word-boundary form (none|0)\b in BOTH
//   - aria-hidden on focusable: per-line scan in BOTH (catches cross-element same line)
//   - minmax(Npx): suppressed only by the exact min(Npx, 100%) companion in BOTH
//   - :focus without :focus-visible: flagged in BOTH

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = resolve(ROOT, 'scripts/a11y-advisor-hook.mjs');
const ADVISOR = resolve(ROOT, 'adapters/codex/scripts/advisor.mjs');

function runHook(name, content) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: `/tmp/${name}`, content } }),
    encoding: 'utf8',
  });
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
}

function runAdvisor(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-baseline-'));
  try {
    const f = join(dir, name);
    writeFileSync(f, content);
    try {
      return execFileSync('node', [ADVISOR, f], { encoding: 'utf8' });
    } catch (e) {
      return String(e.stdout || ''); // advisor exits 2 when it finds issues
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DETECTORS = [
  {
    id: 'click-handler-no-keyboard',
    file: 'evt.jsx',
    pos: "const a = 1;\nnode.addEventListener('click', handle);\nconst b = 2;\n",
    neg: "node.addEventListener('click', handle);\nnode.addEventListener('keydown', handle);\n",
    hookRe: /click handler on a non-button/,
    codexRe: /click handler on a non-button/,
  },
  {
    id: 'div-span-onclick',
    file: 'btn.jsx',
    pos: '<div onClick={save}>Save</div>\n',
    neg: '<button onClick={save}>Save</button>\n',
    hookRe: /onClick on a <div>\/<span>/,
    codexRe: /onClick on a <div>\/<span>/,
  },
  {
    id: 'outline-none',
    file: 'a.css',
    pos: '.btn { outline: none; }\n',
    neg: '.btn { outline: none; }\n.btn:focus-visible { outline: 2px solid; }\n',
    hookRe: /outline:none\/0 with no :focus-visible/,
    codexRe: /outline:none\/0 with no :focus-visible/,
  },
  {
    id: 'aria-hidden-focusable',
    file: 'a.html',
    pos: '<span aria-hidden="true"><a href="#">link</a></span>\n',
    neg: '<span aria-hidden="true">text only</span>\n',
    hookRe: /aria-hidden="true" also contains a focusable/,
    codexRe: /aria-hidden="true" also contains a focusable/,
  },
  {
    id: 'fixed-minmax',
    file: 'g.css',
    pos: '.g { grid-template-columns: minmax(200px, 1fr); }\n',
    neg: '.g { grid-template-columns: minmax(min(200px, 100%), 1fr); }\n',
    hookRe: /with a fixed minimum/,
    codexRe: /with a fixed minimum/,
  },
  {
    id: 'multiple-role-alert',
    file: 'al.html',
    pos: '<div role="alert">a</div>\n<div role="alert">b</div>\n',
    neg: '<div role="alert">only one</div>\n',
    hookRe: /More than one role="alert"/,
    codexRe: /More than one role="alert"/,
  },
  {
    id: 'focus-without-focus-visible',
    file: 'f.css',
    pos: '.btn:focus { color: red; }\n',
    neg: '.btn:focus { color: red; }\n.btn:focus-visible { outline: 2px solid; }\n',
    hookRe: /Pair :focus-visible with :focus/,
    codexRe: /Pair :focus-visible with :focus/,
  },
  {
    id: 'positive-tabindex',
    file: 't.html',
    pos: '<div tabindex="3">x</div>\n',
    neg: '<div tabindex="0">x</div>\n',
    hookRe: /Positive tabindex/,
    codexRe: /Positive tabindex/,
  },
  {
    id: 'prescriptive-input-copy',
    file: 'c.html',
    pos: '<p>Click here to continue</p>\n',
    neg: '<p>Select an option to continue</p>\n',
    hookRe: /Input-method-specific copy \(/,
    codexRe: /Input-method-specific copy \(/,
  },
  // ── PDF detectors (already identical in both runtimes; locked for parity) ──
  {
    id: 'pdf-untagged-lib',
    file: 'inv.js',
    pos: "import { jsPDF } from 'jspdf'; const d = new jsPDF(); d.save('a.pdf');\n",
    neg: 'const doc = new PDFDocument({ tagged: true });\n',
    hookRe: /cannot emit tagged/,
    codexRe: /cannot emit tagged/,
  },
  {
    id: 'pdf-pagepdf-untagged',
    file: 'exp.ts',
    pos: "await page.pdf({ path: 'o.pdf', format: 'A4' });\n",
    neg: "await page.pdf({ path: 'o.pdf', tagged: true });\n",
    hookRe: /without tagged: true/,
    codexRe: /without tagged: true/,
  },
  {
    id: 'pdf-pdfkit-untagged',
    file: 'doc.js',
    pos: "const doc = new PDFDocument({ size: 'A4' });\n",
    neg: 'const doc = new PDFDocument({ tagged: true });\n',
    hookRe: /PDFKit document without/,
    codexRe: /PDFKit document without/,
  },
  {
    id: 'pdf-latex-no-metadata',
    file: 'r.tex',
    pos: '\\documentclass{article}\\begin{document}hi\\end{document}\n',
    neg: '\\DocumentMetadata{lang=en, tagging=on}\n\\documentclass{article}\\begin{document}hi\\end{document}\n',
    hookRe: /\\DocumentMetadata/,
    codexRe: /\\DocumentMetadata/,
  },
];

for (const d of DETECTORS) {
  test(`hook · ${d.id} · fires on positive`, () => {
    assert.match(runHook(d.file, d.pos), d.hookRe);
  });
  test(`hook · ${d.id} · silent on negative`, () => {
    assert.doesNotMatch(runHook(d.file, d.neg), d.hookRe);
  });
  test(`codex · ${d.id} · fires on positive`, () => {
    assert.match(runAdvisor(d.file, d.pos), d.codexRe);
  });
  test(`codex · ${d.id} · silent on negative`, () => {
    assert.doesNotMatch(runAdvisor(d.file, d.neg), d.codexRe);
  });
}
