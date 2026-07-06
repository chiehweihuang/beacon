// Beacon validation charter L0 — drift comparison (see VALIDATION.md).
// Compares two benchmark results.json files (same site list, different run: another
// day, another machine, or another engine) and prints the drift distribution.
//
//   node tools/drift-compare.mjs <baseline-results.json> <candidate-results.json>
//
// Use it for: temporal baseline (same machine, days apart), cross-machine experiments
// (same hour, two machines), and engine-version deltas. Exit code 0 always — this is a
// measurement, not a gate; the numbers go into the report/error bar.

import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('usage: node tools/drift-compare.mjs <baseline.json> <candidate.json>'); process.exit(1); }

const load = (p) => new Map(JSON.parse(readFileSync(p, 'utf8')).map((r) => [r.idx, r]));
const base = load(a);
const cand = load(b);

const deltas = [];
const flips = [];
const statusChanges = [];
const bandOf = (s) => (s >= 90 ? 'pass' : s >= 50 ? 'needs-work' : 'fail');

for (const [idx, r0] of base) {
  const r1 = cand.get(idx);
  if (!r1) { statusChanges.push(`${idx}: missing in candidate`); continue; }
  if (r0.capture !== r1.capture) { statusChanges.push(`${idx}: capture ${r0.capture} -> ${r1.capture}`); continue; }
  if (r0.beacon_overall == null || r1.beacon_overall == null) continue;
  const d = r1.beacon_overall - r0.beacon_overall;
  deltas.push({ idx, url: r0.url, d, cov: (r1.coverage_percent ?? 0) - (r0.coverage_percent ?? 0) });
  if (bandOf(r0.beacon_overall) !== bandOf(r1.beacon_overall)) flips.push(`${idx}: ${r0.beacon_overall} -> ${r1.beacon_overall} (${bandOf(r0.beacon_overall)} -> ${bandOf(r1.beacon_overall)}) ${r0.url}`);
}

const abs = deltas.map((x) => Math.abs(x.d)).sort((x, y) => x - y);
const q = (p) => abs.length ? abs[Math.min(abs.length - 1, Math.floor(p * abs.length))] : null;

console.log(JSON.stringify({
  n_compared: deltas.length,
  score_delta: { median_abs: q(0.5), p95_abs: q(0.95), max_abs: abs.at(-1) ?? null },
  band_flips: flips.length,
  coverage_shifts: deltas.filter((x) => x.cov !== 0).length,
  status_changes: statusChanges,
  flips,
  worst: deltas.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5).map((x) => `${x.idx}: ${x.d > 0 ? '+' : ''}${x.d} ${x.url}`),
}, null, 2));
