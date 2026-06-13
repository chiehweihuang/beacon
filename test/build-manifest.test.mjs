import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED } from '../tools/manifest.mjs';

test('GENERATED covers 3 content files x 2 surfaces = 6 variant entries', () => {
  const variants = GENERATED.filter((e) => e.kind.startsWith('variant:'));
  assert.equal(variants.length, 6);
});

test('GENERATED covers 6 references + 7 scripts x 2 surfaces = 26 copy entries', () => {
  const copies = GENERATED.filter((e) => e.kind === 'copy');
  assert.equal(copies.length, 26);
});

test('every GENERATED entry has out, src, kind, overwrite=true', () => {
  for (const e of GENERATED) {
    assert.equal(typeof e.out, 'string');
    assert.equal(typeof e.src, 'string');
    assert.match(e.kind, /^(variant:cc|variant:codex|copy)$/);
    assert.equal(e.overwrite, true);
  }
});

test('CC inspect maps to core/content/inspect.md as variant:cc', () => {
  const e = GENERATED.find((x) => x.out === 'commands/inspect.md');
  assert.ok(e);
  assert.equal(e.src, 'core/content/inspect.md');
  assert.equal(e.kind, 'variant:cc');
});

test('codex inspect maps to the same core src as variant:codex', () => {
  const e = GENERATED.find((x) => x.out === 'adapters/codex/references/beacon-inspect.md');
  assert.ok(e);
  assert.equal(e.src, 'core/content/inspect.md');
  assert.equal(e.kind, 'variant:codex');
});

test('no GENERATED out collides with a hand-kept file', () => {
  const handKept = new Set([
    'scripts/a11y-advisor-hook.mjs', 'scripts/beacon-prompt-gate.mjs', 'scripts/beacon-session-start.mjs',
    'hooks/hooks.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json',
    'adapters/codex/SKILL.md', 'adapters/codex/references/goal-workflows.md',
    'adapters/codex/references/repeat-testing.md', 'adapters/codex/scripts/advisor.mjs',
  ]);
  for (const e of GENERATED) assert.ok(!handKept.has(e.out), `collision: ${e.out}`);
});

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function checkExitCode() {
  try {
    execFileSync('node', ['build.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test('build --check passes on a clean tree', () => {
  assert.equal(checkExitCode(), 0);
});

test('build --check fails (exit 1) when a generated output is hand-edited, then passes after restore', () => {
  const target = resolve(ROOT, 'commands/advisor.md');
  const original = readFileSync(target, 'utf8');
  try {
    writeFileSync(target, original + '\n<!-- stale hand edit -->\n');
    assert.notEqual(checkExitCode(), 0, '--check should fail on a stale output');
  } finally {
    writeFileSync(target, original); // restore exactly
  }
  assert.equal(checkExitCode(), 0, '--check should pass again after restore');
});

import { mkdtempSync, mkdirSync, writeFileSync as wf, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { findOrphans, validateCoreMapping, GENERATED as GEN } from '../tools/manifest.mjs';

test('findOrphans reports outputs whose core source is missing (empty core/ = all orphaned)', () => {
  const fake = mkdtempSync(resolve(tmpdir(), 'beacon-orphan-'));
  try {
    // no core/ dir at all -> every GENERATED entry's src is missing -> all orphaned
    const orphans = findOrphans(fake);
    assert.equal(orphans.length, GEN.length, 'all outputs orphaned when core/ absent');
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
});

test('validateCoreMapping flags a core file with no GENERATED entry', () => {
  const fake = mkdtempSync(resolve(tmpdir(), 'beacon-unmapped-'));
  try {
    mkdirSync(resolve(fake, 'core/content'), { recursive: true });
    wf(resolve(fake, 'core/content/guide.md'), 'x');      // mapped (ok)
    wf(resolve(fake, 'core/content/stray.md'), 'x');      // NOT in manifest
    const errors = validateCoreMapping(fake);
    assert.ok(errors.some((e) => e.includes('core/content/stray.md')), `expected stray flagged, got: ${errors}`);
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
});
