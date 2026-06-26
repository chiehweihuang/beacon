// Beacon · pattern-runtime (Step 3) — the interpreter reproduces every shipped
// web detector against the REAL core/patterns records. Each record must fire on
// its positive fixture and stay silent on its negative one through scanRecords().

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRecords, loadRecords, fileKindForExt } from '../core/scripts/pattern-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const records = loadRecords(join(ROOT, 'core', 'patterns'));

const firedIds = (content, fileKind) =>
  new Set(scanRecords(records, content, fileKind).findings.map((f) => f.id));

const CASES = [
  { id: 'web/click-handler-no-keyboard', fk: 'html',
    pos: "a;\nnode.addEventListener('click', fn);\nb;\n",
    neg: "node.addEventListener('click', fn);\nnode.addEventListener('keydown', fn);\n" },
  { id: 'web/div-span-onclick', fk: 'html',
    pos: '<div onClick={fn}>x</div>', neg: '<button onClick={fn}>x</button>' },
  { id: 'web/outline-none-without-focus-visible', fk: 'css',
    pos: '.b { outline: none; }', neg: '.b { outline: none; }\n.b:focus-visible { outline: 2px; }' },
  { id: 'web/aria-hidden-on-focusable', fk: 'html',
    pos: '<span aria-hidden="true"><a href="#">x</a></span>', neg: '<span aria-hidden="true">x</span>' },
  { id: 'web/fixed-minmax-reflow', fk: 'css',
    pos: '.g { grid-template-columns: minmax(200px, 1fr); }',
    neg: '.g { grid-template-columns: minmax(min(200px, 100%), 1fr); }' },
  { id: 'web/multiple-role-alert', fk: 'html',
    pos: '<div role="alert">a</div><div role="alert">b</div>', neg: '<div role="alert">a</div>' },
  { id: 'web/focus-without-focus-visible', fk: 'css',
    pos: '.b:focus { color: red; }', neg: '.b:focus { color: red; }\n.b:focus-visible { outline: 2px; }' },
  { id: 'web/positive-tabindex', fk: 'html',
    pos: '<div tabindex="3">x</div>', neg: '<div tabindex="0">x</div>' },
  { id: 'web/prescriptive-input-copy', fk: 'html',
    pos: '<p>Click here to start</p>', neg: '<p>Select start to begin</p>' },
  { id: 'pdf/untagged-library', fk: 'js',
    pos: "const d = new jsPDF(); d.save('a.pdf');", neg: 'const doc = new PDFDocument({ tagged: true });' },
  { id: 'pdf/print-to-pdf-untagged', fk: 'ts',
    pos: "await page.pdf({ path: 'o.pdf' });", neg: "await page.pdf({ tagged: true });" },
  { id: 'pdf/pdfkit-untagged', fk: 'js',
    pos: "const doc = new PDFDocument({ size: 'A4' });", neg: 'const doc = new PDFDocument({ tagged: true });' },
  { id: 'pdf/latex-no-metadata', fk: 'tex',
    pos: '\\documentclass{article}\\begin{document}hi\\end{document}',
    neg: '\\DocumentMetadata{lang=en}\n\\documentclass{article}\\begin{document}hi\\end{document}' },
];

for (const c of CASES) {
  test(`runtime · ${c.id} · fires on positive`, () => {
    assert.ok(firedIds(c.pos, c.fk).has(c.id), `expected ${c.id} to fire`);
  });
  test(`runtime · ${c.id} · silent on negative`, () => {
    assert.ok(!firedIds(c.neg, c.fk).has(c.id), `expected ${c.id} silent`);
  });
}

// regression (2.3 held-out FP fix): aria-hidden on an element already made inert
// with tabindex="-1" is the canonical remediation, not a focus trap — stay silent.
test('runtime · aria-hidden-on-focusable · silent when the focusable is tabindex="-1"', () => {
  assert.ok(!firedIds('<a href="/x" aria-hidden="true" tabindex="-1">x</a>', 'html').has('web/aria-hidden-on-focusable'));
});
// the real trap (focusable still in the tab order) must still fire.
test('runtime · aria-hidden-on-focusable · still fires on a focusable with no negative tabindex', () => {
  assert.ok(firedIds('<button aria-hidden="true">x</button>', 'html').has('web/aria-hidden-on-focusable'));
});

// (2.3 structural strip) prescriptive-input-copy / positive-tabindex no longer
// fire on text in comments or example-code blocks, but still fire on real copy /
// attributes and on user-facing string literals (innerHTML copy, Lit templates).
test('strip: prescriptive silent in a JS comment; fires on real copy + innerHTML string', () => {
  assert.ok(!firedIds('// see the "Click here to" wording note\nconst x = 1;', 'js').has('web/prescriptive-input-copy'));
  assert.ok(firedIds('<p>Click here to start</p>', 'html').has('web/prescriptive-input-copy'));
  assert.ok(firedIds("el.innerHTML = '<span>Tap to pay</span>';", 'js').has('web/prescriptive-input-copy'));
});
test('strip: positive-tabindex silent in <code>/comment; fires on a real attribute + Lit template', () => {
  assert.ok(!firedIds('<p>set <code>tabindex="5"</code> to reorder</p>', 'html').has('web/positive-tabindex'));
  assert.ok(!firedIds('// avoid tabindex="3" on non-interactive elements\nx;', 'ts').has('web/positive-tabindex'));
  assert.ok(firedIds('<div tabindex="3">x</div>', 'html').has('web/positive-tabindex'));
  assert.ok(firedIds('return html`<input tabindex="1">`;', 'ts').has('web/positive-tabindex'));
});

test('fileKindForExt maps jsx/tsx/vue/svelte to html, scss to css, mjs to js', () => {
  assert.equal(fileKindForExt('jsx'), 'html');
  assert.equal(fileKindForExt('.tsx'), 'html');
  assert.equal(fileKindForExt('scss'), 'css');
  assert.equal(fileKindForExt('mjs'), 'js');
  assert.equal(fileKindForExt('ts'), 'ts');
});

test('capture interpolation strips quotes/brackets and trims', () => {
  const f = scanRecords(records, '<p>Click here to start</p>', 'html')
    .findings.find((x) => x.id === 'web/prescriptive-input-copy');
  assert.ok(f && /\(Click here\)/.test(f.flag), f && f.flag);
});

test('an unknown matcher kind is skipped and reported, never thrown', () => {
  const r = [{ id: 'web/future', applies_to: { fileKinds: ['css'] }, matcher: { kind: 'ast', pattern: 'x' }, message: { flag: 'y' } }];
  const out = scanRecords(r, '.a {}', 'css');
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.unknownKinds, ['ast']);
});
