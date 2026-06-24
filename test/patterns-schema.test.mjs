// Beacon · pattern-library schema validation (Step 1).
// Locks: (a) the shipped core/patterns/*.json validate clean, and (b) each of
// the five gates rejects the malformed record it is meant to catch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecords, loadAndValidate } from '../tools/validate-patterns.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = { '2.4.7': { level: 'AA', title: 'Focus Visible' } };

function valid() {
  return {
    id: 'web/sample-rule',
    schema_version: 1,
    band: 'FLAG',
    wcag: { sc: '2.4.7', level: 'AA', title: 'Focus Visible' },
    applies_to: { fileKinds: ['css'] },
    matcher: { kind: 'regex', pattern: 'outline\\s*:\\s*none' },
    message: { flag: 'outline:none with no companion; focus may be invisible' },
    fix: {
      hint: 'Add a :focus-visible rule.',
      example: { before: '.btn { outline: none; }', after: '.btn:focus-visible { outline: 2px solid; }' },
    },
    false_positive_notes: [],
  };
}

const errs = (r) => validateRecords(Array.isArray(r) ? r : [r], CATALOG);

test('the inline valid base record passes', () => {
  assert.deepEqual(errs(valid()), []);
});

test('shipped core/patterns validate clean (all 13 records)', () => {
  const { errors, count } = loadAndValidate(ROOT);
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(count, 13);
});

test('gate: schema — missing wcag is rejected', () => {
  const r = valid(); delete r.wcag;
  assert.match(errs(r).join('\n'), /wcag object required/);
});

test('gate: regex — an uncompilable pattern is rejected', () => {
  const r = valid(); r.matcher.pattern = '(';
  assert.match(errs(r).join('\n'), /does not compile/);
});

test('gate: identity — a non-namespaced id is rejected', () => {
  const r = valid(); r.id = 'not_namespaced';
  assert.match(errs(r).join('\n'), /not namespaced/);
});

test('gate: identity — a duplicate id is rejected', () => {
  assert.match(errs([valid(), valid()]).join('\n'), /duplicate id/);
});

test('gate: wcag — an sc absent from the catalog is rejected', () => {
  const r = valid(); r.wcag.sc = '9.9.9';
  assert.match(errs(r).join('\n'), /not in catalog/);
});

test('gate: wcag — a level that disagrees with the catalog is rejected', () => {
  const r = valid(); r.wcag.level = 'A';
  assert.match(errs(r).join('\n'), /do not match catalog/);
});

test('gate: claim — an over-claim phrase in the flag is rejected', () => {
  const r = valid(); r.message.flag = 'this makes the page fully accessible';
  assert.match(errs(r).join('\n'), /banned over-claim/);
});

test('gate: claim — a REVIEW flag without a hedge token is rejected', () => {
  const r = valid(); r.band = 'REVIEW'; r.message.flag = 'outline has no companion';
  assert.match(errs(r).join('\n'), /must start with a hedge token/);
});

test('gate: leak — a client-looking identifier in the example is rejected', () => {
  const r = valid(); r.fix.example.after = '<CheckoutButton onClick={fn} />';
  assert.match(errs(r).join('\n'), /non-generic identifier/);
});
