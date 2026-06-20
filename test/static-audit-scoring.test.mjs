// Beacon Phase A · static-audit scoring + verdict-ownership tests (P1).
// Exercises the script as the SOLE author of audit-results.json: weighted overall,
// severity-penalty category formula, the severity matrix, --merge-findings ingestion,
// injectable date, and byte-identical reproducibility on an unchanged page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

// Mirrors CATEGORY_WEIGHTS in static-audit.mjs — the test fails loudly if the table drifts.
const WEIGHTS = { screenreader: 18, keyboard: 13, contrast: 13, forms: 13, responsive: 12, touch: 8, cognitive: 8, motion: 5, media: 5, agent: 5 };

const PAGE = `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
<link rel="canonical" href="https://example.com/page">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
</head><body><main><h1>x</h1><a href="/x">Home</a></main></body></html>`;

// Run the scanner; returns { audit, raw } where raw is the exact bytes written.
function run({ html = PAGE, args = [], env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-score-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [SCANNER, '--scope', 'score-test', '--output', out, ...args, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir, env: { ...process.env, ...env },
    });
    const raw = readFileSync(out, 'utf8');
    return { audit: JSON.parse(raw.replace(/\r\n?/g, '\n')), raw };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeFindings(findings) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-merge-'));
  const file = join(dir, 'findings.json');
  writeFileSync(file, JSON.stringify(findings));
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('overall is the WEIGHTED average of category scores, not a simple mean', () => {
  const { audit } = run({ args: ['--date', '2020-01-01'] });
  const cats = audit.summary.categories;
  const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const expected = Math.round(cats.reduce((s, c) => s + c.score * (WEIGHTS[c.id] || 0), 0) / weightSum);
  assert.equal(audit.summary.overall_score, expected, 'overall_score must equal the weighted average');
});

test('severity matrix is applied at the script (merged finding with no severity -> matrix)', () => {
  // 1.1.1 is mandated critical by the matrix; merged finding omits severity entirely.
  const { file, cleanup } = writeFindings([
    { category: 'screenreader', wcag: '1.1.1 Text Alternatives', title: 'merged alt finding', location: 'x.html:1' },
  ]);
  try {
    const { audit } = run({ args: ['--date', '2020-01-01', '--merge-findings', file] });
    const merged = audit.findings.filter((f) => f.title === 'merged alt finding');
    assert.equal(merged.length, 1, 'merged finding must appear in the artifact');
    assert.equal(merged[0].severity, 'critical', 'matrix mandates 1.1.1 = critical');
  } finally { cleanup(); }
});

// screenreader has scan passes (auditable > 0, base 100) so the severity penalty is
// observable above the empty-category floor.
test('severity penalty lowers the category score; more criticals lower it more', () => {
  const base = run({ args: ['--date', '2020-01-01'] }).audit.summary.categories.find((c) => c.id === 'screenreader').score;

  const one = writeFindings([{ category: 'screenreader', severity: 'critical', wcag: '4.1.2', title: 'f1', check: 'fail' }]);
  const two = writeFindings([
    { category: 'screenreader', severity: 'critical', wcag: '4.1.2', title: 'f1', check: 'fail' },
    { category: 'screenreader', severity: 'critical', wcag: '4.1.2', title: 'f2', check: 'fail' },
  ]);
  try {
    const s1 = run({ args: ['--date', '2020-01-01', '--merge-findings', one.file] }).audit.summary.categories.find((c) => c.id === 'screenreader').score;
    const s2 = run({ args: ['--date', '2020-01-01', '--merge-findings', two.file] }).audit.summary.categories.find((c) => c.id === 'screenreader').score;
    assert.ok(s1 < base, `one critical should lower screenreader score (${s1} < ${base})`);
    assert.ok(s2 < s1, `two criticals should lower it further (${s2} < ${s1})`);
  } finally { one.cleanup(); two.cleanup(); }
});

test('unverifiable (review) merged finding does NOT reduce the score', () => {
  const base = run({ args: ['--date', '2020-01-01'] }).audit.summary.categories.find((c) => c.id === 'screenreader').score;
  const rev = writeFindings([{ category: 'screenreader', severity: 'critical', wcag: '4.1.2', title: 'maybe', check: 'review' }]);
  try {
    const s = run({ args: ['--date', '2020-01-01', '--merge-findings', rev.file] }).audit.summary.categories.find((c) => c.id === 'screenreader').score;
    assert.equal(s, base, 'review-level finding must not penalise the score (three-state rule)');
  } finally { rev.cleanup(); }
});

test('--merge-findings validates input: invalid category is skipped, not crashed', () => {
  const { file, cleanup } = writeFindings([
    { category: 'not-a-real-category', wcag: '1.1.1', title: 'bogus' },
    { category: 'forms', severity: 'warning', wcag: '3.3.2', title: 'real one', check: 'fail' },
  ]);
  try {
    const { audit } = run({ args: ['--date', '2020-01-01', '--merge-findings', file] });
    assert.equal(audit.findings.filter((f) => f.title === 'bogus').length, 0, 'invalid-category finding is dropped');
    assert.equal(audit.findings.filter((f) => f.title === 'real one').length, 1, 'valid finding still merges');
  } finally { cleanup(); }
});

test('date is injectable: --date wins, SOURCE_DATE_EPOCH is honoured', () => {
  assert.equal(run({ args: ['--date', '2019-07-04'] }).audit.metadata.date, '2019-07-04');
  // 1577836800 = 2020-01-01T00:00:00Z
  assert.equal(run({ env: { SOURCE_DATE_EPOCH: '1577836800' } }).audit.metadata.date, '2020-01-01');
});

test('reproducible: two runs of the same page with a fixed date are byte-identical', () => {
  const a = run({ args: ['--date', '2020-01-01'] }).raw;
  const b = run({ args: ['--date', '2020-01-01'] }).raw;
  assert.equal(a, b, 'same page + fixed date must produce byte-identical audit-results.json');
});

test('P3: engine_fingerprint is stamped, well-formed, and deterministic', () => {
  const a = run({ args: ['--date', '2020-01-01'] }).audit.metadata.engine_fingerprint;
  const b = run({ args: ['--date', '2020-01-01'] }).audit.metadata.engine_fingerprint;
  assert.match(a, /^beacon-static-audit@\d+\+ruleset\.[0-9a-f]{12}$/, 'fingerprint = detector-version + ruleset hash');
  assert.equal(a, b, 'fingerprint must be deterministic across runs (it gates the reproducibility contract)');
});
