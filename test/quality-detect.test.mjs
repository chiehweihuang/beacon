// Beacon · content-quality heuristics (alt 1.1.1 / link purpose 2.4.4 / label 4.1.2).
// All signals REVIEW. Tests the deterministic red-flags AND the false-positive
// guards (decorative alt, descriptive alt/links, name-overridden links).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { detectQualityFlags } from '../core/scripts/quality-detect.mjs';

const keys = (html) => detectQualityFlags(html).map((s) => s.key);
const has = (html, key) => keys(html).includes(key);

// --- alt quality ----------------------------------------------------------
test('generic placeholder alt is flagged', () => {
  assert.ok(has('<img src="x" alt="image">', 'quality-alt-generic'));
  assert.ok(has('<img src="x" alt="logo">', 'quality-alt-generic'));
});
test('filename-as-alt is flagged', () => {
  assert.ok(has('<img src="x" alt="DSC_0042.JPG">', 'quality-alt-filename'));
  assert.ok(has('<img src="x" alt="hero-banner.png">', 'quality-alt-filename'));
});
test('redundant "image of" prefix is flagged', () => {
  assert.ok(has('<img src="x" alt="Image of a sunset over the bay">', 'quality-alt-redundant'));
});
test('FP guard: empty alt (decorative) is NOT flagged', () => {
  assert.deepEqual(detectQualityFlags('<img src="x" alt="">'), []);
});
test('FP guard: a real descriptive alt is NOT flagged', () => {
  assert.deepEqual(detectQualityFlags('<img src="x" alt="Quarterly revenue rose 12% to 4.2M">'), []);
});

// --- link purpose ---------------------------------------------------------
test('generic link text is flagged (en + zh)', () => {
  assert.ok(has('<a href="/r">Read more</a>', 'quality-link-generic'));
  assert.ok(has('<a href="/r">click here</a>', 'quality-link-generic'));
  assert.ok(has('<a href="/r">更多</a>', 'quality-link-generic'));
});
test('FP guard: descriptive link text is NOT flagged', () => {
  assert.deepEqual(detectQualityFlags('<a href="/r">Read the 2026 accessibility report</a>'), []);
});
test('FP guard: generic visible text WITH aria-label override is NOT flagged', () => {
  assert.deepEqual(detectQualityFlags('<a href="/r" aria-label="Read the 2026 report">Read more</a>'), []);
});

// --- role-echo label ------------------------------------------------------
test('aria-label that just echoes the role is flagged', () => {
  assert.ok(has('<button aria-label="button">x</button>', 'quality-label-role-echo'));
});
test('FP guard: a meaningful aria-label is NOT flagged', () => {
  assert.equal(keys('<button aria-label="Close dialog">x</button>').filter((k) => k === 'quality-label-role-echo').length, 0);
});

// --- round-2 calibration fixes (FP/FN found on 36 real pages) -------------
// FP: aria-label="Menu" on a nav toggle is standard good practice, not a role echo.
test('FP guard: aria-label="Menu" on a nav button is NOT a role echo', () => {
  assert.equal(keys('<button aria-label="Menu" aria-expanded="false">x</button>').filter((k) => k === 'quality-label-role-echo').length, 0);
});
// FP: a link whose text is a code/element name ("<link>", "<details>") is meaningful.
test('FP guard: link text that is a code/element name is NOT generic', () => {
  assert.deepEqual(detectQualityFlags('<a href="/link"><code>&lt;link&gt;</code></a>'), []);
});
// FN: data-aria-label is NOT an accessible-name override; the generic link must still flag.
test('data-aria-label does NOT suppress a generic-link flag', () => {
  assert.ok(has('<a href="/r" data-aria-label="tracking">Read more</a>', 'quality-link-generic'));
});
// FN: common zh-Hant CTA not previously covered.
test('zh-Hant 了解更多 generic link is flagged', () => {
  assert.ok(has('<a href="/r">了解更多</a>', 'quality-link-generic'));
});

// --- black-box through static-audit --------------------------------------
function runScanner(html) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-quality-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [resolve(dirname(fileURLToPath(import.meta.url)), '..', 'core/scripts/static-audit.mjs'), '--scope', 'q-test', '--output', out, fixture], { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('static-audit emits quality-alt-filename as a review-bucket finding', () => {
  const audit = runScanner('<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x" alt="IMG_1234.jpg"></body></html>');
  const hit = audit.findings.filter((f) => f.key === 'quality-alt-filename');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].severity, 'tip');
});
