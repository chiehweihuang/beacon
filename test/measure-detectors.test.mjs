// Beacon · measurement harness (the deterministic oracle) — verify the
// precision/recall math is correct, and that it runs on the real corpus and
// surfaces both error kinds (FP and FN).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, loadCorpus } from '../tools/measure-detectors.mjs';
import { loadRecords } from '../core/scripts/pattern-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('precision/recall math: one TP, one FP, one FN, one TN -> P=0.5 R=0.5', () => {
  const recs = [{ id: 'x/bad', applies_to: { fileKinds: ['css'] }, matcher: { kind: 'regex', pattern: 'BAD' }, message: { flag: 'bad' } }];
  const cases = [
    { id: 'tp', fileKind: 'css', content: 'BAD', expect: ['x/bad'] },
    { id: 'fp', fileKind: 'css', content: 'BAD', expect: [] },
    { id: 'fn', fileKind: 'css', content: 'ok', expect: ['x/bad'] },
    { id: 'tn', fileKind: 'css', content: 'ok', expect: [] },
  ];
  const r = measure(recs, cases);
  assert.deepEqual({ tp: r.overall.tp, fp: r.overall.fp, fn: r.overall.fn }, { tp: 1, fp: 1, fn: 1 });
  assert.equal(r.overall.precision, 0.5);
  assert.equal(r.overall.recall, 0.5);
  assert.equal(r.perDetector['x/bad'].precision, 0.5);
  assert.equal(r.errors.length, 2); // the fp case and the fn case
});

test('precision is null when nothing is predicted; recall null when no positives exist', () => {
  const recs = [{ id: 'x/bad', applies_to: { fileKinds: ['css'] }, matcher: { kind: 'regex', pattern: 'BAD' }, message: { flag: 'bad' } }];
  const r = measure(recs, [{ id: 'tn', fileKind: 'css', content: 'ok', expect: [] }]);
  assert.equal(r.overall.tp, 0);
  assert.equal(r.overall.precision, null);
  assert.equal(r.overall.recall, null);
});

test('runs on the real records + corpus and surfaces both FP and FN', () => {
  const records = loadRecords(join(ROOT, 'core', 'patterns'));
  const r = measure(records, loadCorpus(join(ROOT, 'corpus')));
  assert.ok(r.overall.tp > 0, 'should have true positives on the calibration set');
  assert.ok(r.overall.fp > 0, 'fp-modes corpus must surface at least one false positive');
  assert.ok(r.overall.fn > 0, 'fp-modes corpus must surface at least one false negative');
  // the documented modes must show up where expected
  assert.ok(r.perDetector['web/prescriptive-input-copy'].fp > 0);
  assert.ok(r.perDetector['web/fixed-minmax-reflow'].fn > 0);
});
