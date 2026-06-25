#!/usr/bin/env node
// Beacon · semantic detector measurement — the held-out oracle for the two
// detectors that are NOT pattern-runtime records:
//   - WCAG 3.1.1  assessLang(declaredLang, text)         -> status
//   - WCAG 3.3.8  detectAuthBarriers / ...InSource(text) -> signals[]
//
// Both are analyzer functions over page text, so tools/measure-detectors.mjs
// (which runs declarative regex records) cannot score them. This harness calls
// the same pure functions static-audit ships and applies the SAME finding
// threshold: a finding is emitted only for band/status FLAG or REVIEW (PASS /
// INSUFFICIENT / UNMODELLED / NO_LANG / INFO emit nothing). So "fired" here ==
// "static-audit would surface a finding", and precision/recall match shipped
// behaviour.
//
// Corpus: corpus/holdout-lang.cases.json  -> detector 'lang'
//         corpus/holdout-auth.cases.json  -> detector 'auth'
//   lang case: { id, declaredLang, text, expect: ["html-lang-mismatch"]|[], note? }
//   auth case: { id, fileKind, content, expect: [authKey...]|[], note? }
// expect is the GROUND TRUTH of what SHOULD be flagged. expect:[] is a negative.
//
// Usage: node tools/measure-semantic.mjs [--json] [--selftest]
//        node tools/measure-semantic.mjs --min-precision P --min-recall R

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assessLang } from '../core/scripts/lang-detect.mjs';
import { detectAuthBarriers, detectAuthBarriersInSource } from '../core/scripts/auth-detect.mjs';

const FLAGGING = new Set(['FLAG', 'REVIEW']); // static-audit emits a finding only for these

// What static-audit would surface for one case, as a set of finding keys.
export function fired(c) {
  if (c.detector === 'lang') {
    const v = assessLang(c.declaredLang, c.text);
    return FLAGGING.has(v.status) ? ['html-lang-mismatch'] : [];
  }
  const fn = c.fileKind === 'html' ? detectAuthBarriers : detectAuthBarriersInSource;
  return fn(c.content).filter((s) => FLAGGING.has(s.band)).map((s) => s.key);
}

export function measureSemantic(cases) {
  const per = {};
  const errors = [];
  const bump = (id, k) => { (per[id] ??= { tp: 0, fp: 0, fn: 0 })[k]++; };
  for (const c of cases) {
    const det = c.detector;
    const got = new Set(fired(c));
    const expect = new Set(c.expect || []);
    const fp = [], fn = [];
    for (const id of got) { if (expect.has(id)) bump(det, 'tp'); else { bump(det, 'fp'); fp.push(id); } }
    for (const id of expect) { if (!got.has(id)) { bump(det, 'fn'); fn.push(id); } }
    if (fp.length || fn.length) errors.push({ case: c.id, fp, fn });
  }
  const withPR = (m) => ({
    ...m,
    precision: m.tp + m.fp === 0 ? null : m.tp / (m.tp + m.fp),
    recall: m.tp + m.fn === 0 ? null : m.tp / (m.tp + m.fn),
  });
  const perDetector = Object.fromEntries(
    Object.entries(per).sort(([a], [b]) => a.localeCompare(b)).map(([id, m]) => [id, withPR(m)]));
  const total = Object.values(per).reduce(
    (a, m) => ({ tp: a.tp + m.tp, fp: a.fp + m.fp, fn: a.fn + m.fn }), { tp: 0, fp: 0, fn: 0 });
  return { overall: withPR(total), perDetector, errors };
}

export function loadSemanticCorpus(dir) {
  const tag = { 'holdout-lang.cases.json': 'lang', 'holdout-auth.cases.json': 'auth' };
  const cases = [];
  for (const f of readdirSync(dir)) {
    if (!(f in tag)) continue;
    for (const c of JSON.parse(readFileSync(join(dir, f), 'utf8'))) cases.push({ ...c, detector: tag[f] });
  }
  return cases;
}

function selftest() {
  const HAN = '中文內容測試範例文字資料庫系統設計網頁'.repeat(20);
  const cases = [
    { detector: 'lang', id: 't/lang-tp', declaredLang: 'en', text: HAN, expect: ['html-lang-mismatch'] },
    { detector: 'lang', id: 't/lang-tn', declaredLang: 'en', text: 'a'.repeat(400), expect: [] },
    { detector: 'lang', id: 't/lang-fn', declaredLang: 'en', text: 'Ceci est un texte en langue française. '.repeat(20), expect: ['html-lang-mismatch'] },
    { detector: 'auth', id: 't/auth-tp', fileKind: 'html', content: '<input type="password" onpaste="return false">', expect: ['auth-password-paste-blocked'] },
    { detector: 'auth', id: 't/auth-tn', fileKind: 'html', content: '<div class="bg-recaptcha">decorative</div>', expect: [] },
  ];
  const r = measureSemantic(cases);
  const assert = (cond, msg) => { if (!cond) { console.error('SELFTEST FAIL: ' + msg); process.exit(1); } };
  // TP: en-declared Han content flags; TN: english passes; FN: latin-vs-latin blind spot misses French.
  assert(r.perDetector.lang.tp === 1, 'lang TP (en/Han) should fire');
  assert(r.perDetector.lang.fn === 1, 'lang FN (en/French) is the latin-vs-latin blind spot');
  assert(r.perDetector.lang.fp === 0, 'english on en should not fire');
  assert(r.perDetector.auth.tp === 1, 'password onpaste should flag');
  assert(r.perDetector.auth.fp === 0, 'bg-recaptcha css class must not false-match');
  console.log('selftest OK: lang', JSON.stringify(r.perDetector.lang), 'auth', JSON.stringify(r.perDetector.auth));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) { selftest(); process.exit(0); }
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const minP = flag('--min-precision') !== null ? Number(flag('--min-precision')) : null;
  const minR = flag('--min-recall') !== null ? Number(flag('--min-recall')) : null;

  const cases = loadSemanticCorpus(join(root, 'corpus'));
  const result = measureSemantic(cases);
  if (args.includes('--json')) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

  const fmt = (v) => (v === null ? ' n/a' : v.toFixed(2));
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Semantic detector measurement over ${cases.length} held-out cases\n`);
  console.log(`${pad('detector', 12)} ${pad('TP', 4)}${pad('FP', 4)}${pad('FN', 4)} P     R`);
  for (const [id, m] of Object.entries(result.perDetector))
    console.log(`${pad(id, 12)} ${pad(m.tp, 4)}${pad(m.fp, 4)}${pad(m.fn, 4)} ${fmt(m.precision)}  ${fmt(m.recall)}`);
  const o = result.overall;
  console.log(`${pad('OVERALL', 12)} ${pad(o.tp, 4)}${pad(o.fp, 4)}${pad(o.fn, 4)} ${fmt(o.precision)}  ${fmt(o.recall)}`);
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
      console.error(`\n✖ ${below.length} detector(s) below threshold: ${below.map(([id]) => id).join(', ')}`);
      process.exit(1);
    }
    console.log(`\n✔ all detectors meet P>=${minP ?? 'any'} / R>=${minR ?? 'any'}.`);
  }
}
