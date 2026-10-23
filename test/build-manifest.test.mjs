import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED } from '../tools/manifest.mjs';

test('GENERATED covers 3 content files x 2 surfaces = 6 variant entries', () => {
  const variants = GENERATED.filter((e) => e.kind.startsWith('variant:'));
  assert.equal(variants.length, 6);
});

test('GENERATED covers 8 references + 19 scripts + 3 patterns x 2 surfaces = 60 copy entries', () => {
  const copies = GENERATED.filter((e) => e.kind === 'copy');
  assert.equal(copies.length, 60);
});

test('every GENERATED entry has out, src, kind, overwrite=true', () => {
  for (const e of GENERATED) {
    assert.equal(typeof e.out, 'string');
    assert.equal(typeof e.src, 'string');
    assert.match(e.kind, /^(variant:cc|variant:codex|copy|codex-plugin-manifest)$/);
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

test('codex plugin manifest version is sourced from the canonical CC plugin.json', () => {
  const e = GENERATED.find((x) => x.out === 'adapters/codex/.codex-plugin/plugin.json');
  assert.ok(e);
  assert.equal(e.src, '.claude-plugin/plugin.json');
  assert.equal(e.kind, 'codex-plugin-manifest');
});

test('SKILL.md mentions every generated codex reference file (catches drift when core/content adds/removes a reference)', () => {
  const skillPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'adapters/codex/skills/beacon/SKILL.md');
  const skill = readFileSync(skillPath, 'utf8');
  const refOuts = GENERATED
    .filter((e) => e.out.startsWith('adapters/codex/references/') && e.out.endsWith('.md'))
    .map((e) => e.out.replace('adapters/codex/', ''));
  for (const ref of refOuts) {
    assert.ok(skill.includes(ref), `SKILL.md does not mention ${ref} — update it when core/content changes the reference set`);
  }
});

test('.agents/plugins/marketplace.json exists and points the beacon plugin at adapters/codex', () => {
  const mktPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.agents/plugins/marketplace.json');
  const mkt = JSON.parse(readFileSync(mktPath, 'utf8')); // throws if missing/renamed — that's the guard
  const plugin = mkt.plugins.find((p) => p.name === 'beacon');
  assert.ok(plugin, 'no "beacon" plugin entry in .agents/plugins/marketplace.json');
  assert.equal(plugin.source.path, './adapters/codex');
});

test('no GENERATED out collides with a hand-kept file', () => {
  const handKept = new Set([
    'scripts/a11y-advisor-hook.mjs', 'scripts/beacon-prompt-gate.mjs', 'scripts/beacon-session-start.mjs',
    'hooks/hooks.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json',
    'adapters/codex/skills/beacon/SKILL.md', 'adapters/codex/references/goal-workflows.md',
    'adapters/codex/references/repeat-testing.md', 'adapters/codex/scripts/advisor.mjs',
    '.agents/plugins/marketplace.json',
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

test('build --check fails when the CC version bumps without regenerating the codex plugin manifest, then passes after rebuild', () => {
  const versionFile = resolve(ROOT, '.claude-plugin/plugin.json');
  const original = readFileSync(versionFile, 'utf8');
  // ponytail: a killed test run (process killed mid-test, before `finally` below runs) can
  // leave the sentinel version written with no real original left to restore to — `original`
  // read above would just be the poisoned value. Fail loudly instead of silently "restoring"
  // to 999.999.999; a real crash-safe restore (temp-file swap, exit handler) is overkill for
  // one test fixture when `git checkout` fixes it in one command.
  if (JSON.parse(original).version === '999.999.999') {
    throw new Error(`${versionFile} is stuck at the test sentinel version 999.999.999 (a previous test run was likely killed mid-test). Run: git checkout -- ${versionFile}`);
  }
  try {
    const bumped = JSON.stringify({ ...JSON.parse(original), version: '999.999.999' }, null, 2) + '\n';
    writeFileSync(versionFile, bumped); // canonical version moves; codex plugin.json is now stale
    assert.notEqual(checkExitCode(), 0, '--check should fail: codex plugin manifest version no longer matches canonical');
  } finally {
    writeFileSync(versionFile, original); // restore exactly
  }
  assert.equal(checkExitCode(), 0, '--check should pass again once the canonical version is restored');
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
