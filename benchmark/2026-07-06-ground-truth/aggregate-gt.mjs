// Aggregate the verified ground-truth inventories into per-tool precision/recall.
// Input: inventories.json (array of per-site finals from the workflow).
// Pattern-level = each distinct violation pattern counts once; instance-level = weighted
// by `count`. FP lists are pattern-level (weight 1).
//
// Engine selection: default @4 (historical mapping: `beacon` / `beacon_fp` fields,
// entries later added by the @6 re-map excluded so the published @4 numbers stay
// reproducible). `--engine 6` reads the re-mapped `beacon_v6` / `beacon_fp_v6` fields,
// includes `added:` entries, and writes pr-analysis-v6.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)));
const ENGINE = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : '4';
const BEACON_FIELD = ENGINE === '6' ? 'beacon_v6' : 'beacon';
const FP_FIELD = ENGINE === '6' ? 'beacon_fp_v6' : 'beacon_fp';
const OUT_FILE = ENGINE === '6' ? 'pr-analysis-v6.json' : 'pr-analysis.json';
const allSites = JSON.parse(readFileSync(resolve(DIR, 'inventories.json'), 'utf8'));
const sites = allSites.map((s) => ({
  ...s,
  violations: (s.violations || []).filter((v) => ENGINE === '6' || !v.added),
}));

const CRITERIA = ['image-alt', 'link-name', 'button-name', 'frame-title', 'input-label', 'heading-order', 'list-structure', 'html-lang', 'document-title', 'meta-viewport-zoom'];
const TOOLS = ['beacon', 'lighthouse'];

function blank() {
  return { tp: 0, fn: 0, oos: 0, fp: 0, tp_w: 0, fn_w: 0, oos_w: 0 };
}

const per = {};
for (const t of TOOLS) { per[t] = { total: blank() }; for (const c of CRITERIA) per[t][c] = blank(); }

const statusOf = (v, t) => (t === 'beacon' ? v[BEACON_FIELD] : v[t]);

for (const s of sites) {
  for (const v of s.violations || []) {
    const w = Math.max(1, v.count || 1);
    for (const t of TOOLS) {
      const cell = per[t][v.criterion] || (per[t][v.criterion] = blank());
      const tot = per[t].total;
      const st = statusOf(v, t);
      if (st === 'flagged') { cell.tp++; tot.tp++; cell.tp_w += w; tot.tp_w += w; }
      else if (st === 'missed') { cell.fn++; tot.fn++; cell.fn_w += w; tot.fn_w += w; }
      else { cell.oos++; tot.oos++; cell.oos_w += w; tot.oos_w += w; }
    }
  }
  per.beacon.total.fp += (s[FP_FIELD] || []).length;
  per.lighthouse.total.fp += (s.lighthouse_fp || []).length;
}

const r2 = (x) => Math.round(x * 1000) / 1000;
function metrics(c) {
  const precision = c.tp + c.fp > 0 ? r2(c.tp / (c.tp + c.fp)) : null;
  const recallInScope = c.tp + c.fn > 0 ? r2(c.tp / (c.tp + c.fn)) : null;
  const recallOverall = c.tp + c.fn + c.oos > 0 ? r2(c.tp / (c.tp + c.fn + c.oos)) : null;
  return { ...c, precision, recall_in_scope: recallInScope, recall_incl_out_of_scope: recallOverall };
}

const out = {
  n_sites: sites.length,
  n_violation_patterns: sites.reduce((n, s) => n + (s.violations || []).length, 0),
  n_violation_instances: sites.reduce((n, s) => n + (s.violations || []).reduce((m, v) => m + Math.max(1, v.count || 1), 0), 0),
  tools: {},
};
for (const t of TOOLS) {
  out.tools[t] = { total: metrics(per[t].total) };
  for (const c of CRITERIA) if (per[t][c].tp + per[t][c].fn + per[t][c].oos + per[t][c].fp > 0) out.tools[t][c] = metrics(per[t][c]);
}

// Per-site table for the report.
out.engine = ENGINE;
out.per_site = sites.map((s) => ({
  idx: s.idx,
  violations: (s.violations || []).length,
  beacon_tp: (s.violations || []).filter((v) => statusOf(v, 'beacon') === 'flagged').length,
  beacon_missed: (s.violations || []).filter((v) => statusOf(v, 'beacon') === 'missed').length,
  beacon_fp: (s[FP_FIELD] || []).length,
  lh_tp: (s.violations || []).filter((v) => v.lighthouse === 'flagged').length,
  lh_missed: (s.violations || []).filter((v) => v.lighthouse === 'missed').length,
  lh_fp: (s.lighthouse_fp || []).length,
}));

writeFileSync(resolve(DIR, OUT_FILE), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ n_sites: out.n_sites, patterns: out.n_violation_patterns, instances: out.n_violation_instances, beacon: out.tools.beacon.total, lighthouse: out.tools.lighthouse.total }, null, 2));
