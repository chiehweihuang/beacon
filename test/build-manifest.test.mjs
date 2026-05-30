import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED } from '../tools/manifest.mjs';

test('GENERATED covers 3 content files x 2 surfaces = 6 variant entries', () => {
  const variants = GENERATED.filter((e) => e.kind.startsWith('variant:'));
  assert.equal(variants.length, 6);
});

test('GENERATED covers 6 references + 2 scripts x 2 surfaces = 16 copy entries', () => {
  const copies = GENERATED.filter((e) => e.kind === 'copy');
  assert.equal(copies.length, 16);
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
