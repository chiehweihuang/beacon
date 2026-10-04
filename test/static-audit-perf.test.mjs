// Beacon · static-audit super-linear path regressions P1-P8 (perf audit 2026-10-04).
// Each input grew roughly 4x in scan time per doubling before its fix and took 6-15 s at
// this size; after the fix every one finishes well under the timeout. The assertions also
// pin the detector output on the adversarial page, so a fix that silently skips the work
// still fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');
const TIMEOUT = 4000;

function runScanner(html, { timeout = TIMEOUT } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-perf-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [SCANNER, '--scope', 'perf-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir, timeout,
    });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HEAD = '<!doctype html><html lang="en"><head><title>t</title><meta name="viewport" content="width=device-width"></head><body><main><h1>x</h1>';
const TAIL = '</main></body></html>';
const rep = (s, n) => s.repeat(n);
const count = (audit, key) => audit.findings.filter((f) => f.key === key).length;

test('P1: range lookups stay fast with thousands of masked ranges', () => {
  const audit = runScanner(HEAD + rep('<!-- c -->', 20000) + rep('<p>t</p>', 20000)
    + '<div style="display:none"><img src="h.png"></div><img src="v.png">' + TAIL);
  assert.equal(count(audit, 'image-alt-missing'), 1, 'only the visible image flags; the hidden one stays suppressed');
});

test('P2: motion selector reachability is computed once per token, not per rule', () => {
  const audit = runScanner(HEAD + '<style>' + rep('.zz{transition:transform .2s}', 6000)
    + '.yy{transition:transform .2s}</style>' + rep('<p class="a b">t</p>', 30000) + '<p class="yy">m</p>' + TAIL);
  assert.equal(count(audit, 'motion-reduced-motion-missing'), 1, 'the reachable .yy rule still counts as motion');
});

test('P3: outline:none scan does not walk back over the document per match', () => {
  const audit = runScanner(HEAD + rep('<style>.b:focus{outline:0}</style><p>t</p>', 6000)
    + '<style>:focus{outline:none}</style>' + TAIL);
  assert.equal(count(audit, 'focus-outline-removed'), 1, 'scoped .b:focus rules do not flag; the bare :focus rule does');
});

test('P3: inline outline:none with no rule braces anywhere finishes quickly and does not flag', () => {
  const audit = runScanner(HEAD + rep('<div style="outline:none">t</div>', 32000) + TAIL);
  assert.equal(count(audit, 'focus-outline-removed'), 0);
});

test('P4: minmax scan tests the min() escape once, not per match', () => {
  const css = rep('.g{grid-template-columns:minmax(10px,1fr)}', 16000);
  const withEscape = runScanner(HEAD + '<style>' + css + '.h{grid-template-columns:minmax(min(10px, 100%),1fr)}</style>' + TAIL);
  assert.equal(count(withEscape, 'fixed-minmax-overflow'), 0, 'a min(Npx, 100%) form anywhere suppresses the finding');
  const without = runScanner(HEAD + '<style>.g{grid-template-columns:minmax(10px,1fr)}</style>' + TAIL);
  assert.equal(count(without, 'fixed-minmax-overflow'), 1);
});

test('P5: unclosed <style> blocks stop the block scan instead of rescanning to EOF', () => {
  const audit = runScanner(HEAD + rep('<style>a{}', 24000) + TAIL);
  assert.equal(count(audit, 'meta-description-missing'), 1);
  assert.equal(count(audit, 'motion-reduced-motion-missing'), 0);
});

test('P5: unclosed <a> elements stop the link scan instead of rescanning to EOF', () => {
  const audit = runScanner(HEAD + '<a href="/i"></a>' + rep('<a href="#">t ', 36000) + TAIL);
  assert.equal(count(audit, 'link-name-missing'), 1, 'the closed empty link still flags');
});

test('P6: stray close tags do not search the whole open-element stack', () => {
  const audit = runScanner(HEAD + rep('<p>', 32000) + rep('</b>', 32000)
    + '<div style="display:none"><img src="h.png"></div><img src="v.png">' + TAIL);
  assert.equal(count(audit, 'image-alt-missing'), 1, 'hidden ranges still close correctly after the stray tags');
});

test('P7: a long hyphenated tag name with no > does not backtrack over every split', () => {
  const audit = runScanner(HEAD + '<img src="v.png">' + '<a' + rep('-a', 16000) + ' "' + TAIL);
  assert.equal(count(audit, 'image-alt-missing'), 1);
});

test('P8: many <img with no > before the end do not each scan to the end', () => {
  const audit = runScanner(HEAD + rep('<img src=x ', 16000) + TAIL);
  assert.equal(count(audit, 'image-alt-missing'), 1, 'the first <img> swallows the run up to the next >, exactly as before');
});

// Review round 1 (2026-10-05): the image-alt display:none exemption reads `[^"']*`, which can
// cross a `>` inside a quoted value. Cutting the text at the last `>` hid that exemption.
test('P8: image-alt keeps its display:none exemption when a quoted value holds the last >', () => {
  const audit = runScanner(HEAD + '<p>x</p></main></body></html><img src=a.png style="> display:none');
  assert.equal(count(audit, 'image-alt-missing'), 0, 'the full text still shows display:none after the quoted >');
});
test('P8: a file that ends inside many unclosed <img tags (no > after them) stays fast', () => {
  const audit = runScanner(HEAD + '<img src="v.png">' + TAIL + rep('<img src=x ', 16000));
  assert.equal(count(audit, 'image-alt-missing'), 1);
});
