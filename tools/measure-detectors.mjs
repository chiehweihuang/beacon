#!/usr/bin/env node
// Beacon · detector measurement harness — the deterministic oracle.
//
// Given labelled corpus cases, runs the declarative records (core/patterns) through
// the shared pattern-runtime and reports per-detector + overall precision/recall
// (TP/FP/FN). This is the foundation every detector-calibration loop measures
// against, and a regression guard: run with --min-precision / --min-recall to exit
// non-zero when any detector drops below the bar.
//
// A case = { id, fileKind, content, expect: [detectorId...] } where `expect` is the
// GROUND TRUTH set of records that SHOULD fire. expect: [] is a negative case.
//   - fired ∧ expected   = TP
//   - fired ∧ ¬expected   = FP   (precision hit)
//   - ¬fired ∧ expected   = FN   (recall hit)
//
// Usage: node tools/measure-detectors.mjs [--min-precision P] [--min-recall R] [--json]

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanRecords, loadRecords } from '../core/scripts/pattern-runtime.mjs';

export function measure(records, cases) {
  const per = {};
  const errors = [];
  const bump = (id, k) => { (per[id] ??= { tp: 0, fp: 0, fn: 0 })[k]++; };
  for (const c of cases) {
    const fired = new Set(scanRecords(records, c.content, c.fileKind).findings.map((f) => f.id));
    const expect = new Set(c.expect || []);
    const fp = [], fn = [];
    for (const id of fired) {
      if (expect.has(id)) bump(id, 'tp');
      else { bump(id, 'fp'); fp.push(id); }
    }
    for (const id of expect) {
      if (!fired.has(id)) { bump(id, 'fn'); fn.push(id); }
    }
    if (fp.length || fn.length) errors.push({ case: c.id, fp, fn });
  }
  const withPR = (m) => ({
    ...m,
    precision: m.tp + m.fp === 0 ? null : m.tp / (m.tp + m.fp),
    recall: m.tp + m.fn === 0 ? null : m.tp / (m.tp + m.fn),
  });
  const perDetector = Object.fromEntries(
    Object.entries(per).sort(([a], [b]) => a.localeCompare(b)).map(([id, m]) => [id, withPR(m)]),
  );
  const total = Object.values(per).reduce(
    (a, m) => ({ tp: a.tp + m.tp, fp: a.fp + m.fp, fn: a.fn + m.fn }), { tp: 0, fp: 0, fn: 0 });
  return { overall: withPR(total), perDetector, errors };
}

// The lang (3.1.1) and auth (3.3.8) detectors are analyzer functions, not
// pattern-runtime records — their corpora are scored by tools/measure-semantic.mjs.
// Exclude them here so the pattern-runtime measurement is not polluted with cases
// no declarative record can fire on (they would all read as false negatives).
const SEMANTIC_CASES = new Set(['holdout-lang.cases.json', 'holdout-auth.cases.json']);

export function loadCorpus(dir) {
  const cases = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.cases.json') || SEMANTIC_CASES.has(f)) continue;
    const arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    cases.push(...arr);
  }
  return cases;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const minP = flag('--min-precision') !== null ? Number(flag('--min-precision')) : null;
  const minR = flag('--min-recall') !== null ? Number(flag('--min-recall')) : null;

  const records = loadRecords(join(root, 'core', 'patterns'));
  const cases = loadCorpus(join(root, 'corpus'));
  const result = measure(records, cases);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const fmt = (v) => (v === null ? ' n/a' : v.toFixed(2));
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Detector measurement over ${cases.length} corpus cases\n`);
  console.log(`${pad('detector', 42)} ${pad('TP', 4)}${pad('FP', 4)}${pad('FN', 4)} P     R`);
  for (const [id, m] of Object.entries(result.perDetector)) {
    console.log(`${pad(id, 42)} ${pad(m.tp, 4)}${pad(m.fp, 4)}${pad(m.fn, 4)} ${fmt(m.precision)}  ${fmt(m.recall)}`);
  }
  const o = result.overall;
  console.log(`${pad('OVERALL', 42)} ${pad(o.tp, 4)}${pad(o.fp, 4)}${pad(o.fn, 4)} ${fmt(o.precision)}  ${fmt(o.recall)}`);

  if (result.errors.length) {
    console.log('\nMisfires (loop targets):');
    for (const e of result.errors) {
      if (e.fp.length) console.log(`  FP  ${e.case}: ${e.fp.join(', ')}`);
      if (e.fn.length) console.log(`  FN  ${e.case}: ${e.fn.join(', ')}`);
    }
  }

  if (minP !== null || minR !== null) {
    const below = Object.entries(result.perDetector).filter(([, m]) =>
      (minP !== null && m.precision !== null && m.precision < minP) ||
      (minR !== null && m.recall !== null && m.recall < minR));
    if (below.length) {
      console.error(`\n✖ ${below.length} detector(s) below threshold (P>=${minP ?? 'any'}, R>=${minR ?? 'any'}): ${below.map(([id]) => id).join(', ')}`);
      process.exit(1);
    }
    console.log(`\n✔ all detectors meet P>=${minP ?? 'any'} / R>=${minR ?? 'any'}.`);
  }
}
