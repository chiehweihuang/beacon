import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMarkers, buildVariant, assertNoStrayTokens, findDuplicatedLines } from '../tools/markers.mjs';

const core = [
  '# Title',
  'shared line',
  '<!--@cc-->',
  'cc-only line',
  '<!--/@cc-->',
  '<!--@codex-->',
  'codex-only line',
  '<!--/@codex-->',
  'trailing shared',
].join('\n');

test('buildVariant cc keeps cc-only, drops codex-only, strips markers', () => {
  assert.equal(buildVariant(core, 'cc'),
    ['# Title', 'shared line', 'cc-only line', 'trailing shared'].join('\n'));
});

test('buildVariant codex keeps codex-only, drops cc-only', () => {
  assert.equal(buildVariant(core, 'codex'),
    ['# Title', 'shared line', 'codex-only line', 'trailing shared'].join('\n'));
});

test('markers are interpreted INSIDE code fences (not passed through)', () => {
  const fenced = ['```bash', '<!--@cc-->', 'cc cmd', '<!--/@cc-->', '<!--@codex-->', 'codex cmd', '<!--/@codex-->', '```'].join('\n');
  assert.equal(buildVariant(fenced, 'cc'), ['```bash', 'cc cmd', '```'].join('\n'));
});

test('validateMarkers rejects nesting', () => {
  assert.throws(() => validateMarkers('<!--@cc-->\nx\n<!--@codex-->\ny\n<!--/@codex-->\n<!--/@cc-->'), /still open/);
});

test('validateMarkers rejects unclosed block', () => {
  assert.throws(() => validateMarkers('<!--@cc-->\nx'), /never closed/);
});

test('validateMarkers rejects close without open', () => {
  assert.throws(() => validateMarkers('<!--/@cc-->'), /without matching open/);
});

test('assertNoStrayTokens throws when a built output still has a marker', () => {
  assert.throws(() => assertNoStrayTokens('a\n<!--@cc-->\nb', 'x'), /stray marker/);
});

test('assertNoStrayTokens passes for clean output', () => {
  assert.doesNotThrow(() => assertNoStrayTokens('a\nb\nc', 'x'));
});

test('findDuplicatedLines reports content in both cc and codex blocks', () => {
  const dup = ['<!--@cc-->', 'A', 'B', '<!--/@cc-->', '<!--@codex-->', 'B', 'A', '<!--/@codex-->'].join('\n');
  assert.deepEqual(findDuplicatedLines(dup).sort(), ['A', 'B']);
});

test('findDuplicatedLines ignores explicitly annotated reordered duplicates', () => {
  const dup = [
    '<!--@cc-->',
    '<!--@duplicate-ok-->',
    'A',
    '<!--/@cc-->',
    '<!--@codex-->',
    '<!--@duplicate-ok-->',
    'A',
    '<!--/@codex-->',
  ].join('\n');
  assert.deepEqual(findDuplicatedLines(dup), []);
  assert.equal(buildVariant(dup, 'cc'), 'A');
  assert.equal(buildVariant(dup, 'codex'), 'A');
});

test('findDuplicatedLines still reports duplicates annotated on only one side', () => {
  const dup = [
    '<!--@cc-->',
    '<!--@duplicate-ok-->',
    'A',
    '<!--/@cc-->',
    '<!--@codex-->',
    'A',
    '<!--/@codex-->',
  ].join('\n');
  assert.deepEqual(findDuplicatedLines(dup), ['A']);
});

import { lcsMerge } from '../tools/lcs.mjs';

test('lcsMerge + buildVariant round-trip reproduces both inputs', () => {
  const cc = ['# Doc', 'one', 'two', 'cc-three', 'four'].join('\n');
  const codex = ['# Doc', 'one', 'two', 'codex-three', 'four'].join('\n');
  const core = lcsMerge(cc, codex);
  assert.equal(buildVariant(core, 'cc'), cc);
  assert.equal(buildVariant(core, 'codex'), codex);
});

test('lcsMerge on identical inputs yields zero markers', () => {
  const same = ['a', 'b', 'c'].join('\n');
  const core = lcsMerge(same, same);
  assert.equal(core, same);
  assert.equal(buildVariant(core, 'cc'), same);
});
