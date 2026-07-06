// Beacon validation charter L0 — golden test vectors (see VALIDATION.md).
// Same committed input MUST produce the same committed output on every OS and Node
// version: any diff is either cross-machine nondeterminism (a bug) or an intentional
// scoring change (regenerate with `node test/golden/regen.mjs` and explain the diff).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');
const GOLDEN = resolve(ROOT, 'test/golden');

for (const name of ['clean', 'dirty']) {
  test(`golden vector "${name}" reproduces its committed expected artifact`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'beacon-golden-'));
    try {
      const out = join(dir, 'audit.json');
      execFileSync('node', [SCANNER, '--scope', 'golden', '--date', '2020-01-01', '--output', out, `test/golden/${name}.html`], { cwd: ROOT, stdio: 'pipe' });
      const actual = JSON.parse(readFileSync(out, 'utf8'));
      const expected = JSON.parse(readFileSync(resolve(GOLDEN, `${name}.expected.json`), 'utf8'));
      assert.deepEqual(actual, expected, `${name}: engine output drifted from the committed golden`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('golden "clean" is actually clean and golden "dirty" is actually dirty', () => {
  const clean = JSON.parse(readFileSync(resolve(GOLDEN, 'clean.expected.json'), 'utf8'));
  const dirty = JSON.parse(readFileSync(resolve(GOLDEN, 'dirty.expected.json'), 'utf8'));
  assert.equal(clean.summary.overall_score, 100, 'clean fixture must pin the reachable top');
  assert.equal(clean.summary.total_findings, 0);
  assert.ok(dirty.summary.overall_score < 50, `dirty fixture must pin the fail band (got ${dirty.summary.overall_score})`);
  assert.ok(dirty.summary.critical >= 3, 'dirty fixture must carry criticals');
});
