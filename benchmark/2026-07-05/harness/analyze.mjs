// Paired analysis for the 2026-07-05 benchmark run: Beacon@3 vs Lighthouse a11y.
// Reads run-2026-07-05/results.json, prints a markdown summary, writes analysis.json.
// Framing: Lighthouse is a CONCURRENT-VALIDITY reference (axe subset), not ground truth.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = resolve(dirname(fileURLToPath(import.meta.url)), 'run-2026-07-05');
const rows = JSON.parse(readFileSync(resolve(RUN, 'results.json'), 'utf8'));

const WEIGHTS = { screenreader: 18, keyboard: 13, contrast: 13, forms: 13, responsive: 12, touch: 8, cognitive: 8, motion: 5, media: 5, agent: 5 };

function ranks(xs) {
  const sorted = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[sorted[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}

const spearman = (a, b) => pearson(ranks(a), ranks(b));

function overallWith(cats, weights) {
  let num = 0, den = 0;
  for (const [id, c] of Object.entries(cats)) {
    if (c.state !== 'scored') continue;
    const w = weights[id] ?? 0;
    num += c.score * w;
    den += w;
  }
  return den ? Math.round(num / den) : null;
}

const paired = rows.filter((r) => r.lh_ok && r.lh_a11y != null && r.capture === 'ok' && r.beacon_overall != null);
const lh = paired.map((r) => r.lh_a11y);
const bc = paired.map((r) => r.beacon_overall);

const out = { n_total: rows.length, n_paired: paired.length };
out.spearman_all = +spearman(bc, lh).toFixed(3);
out.pearson_all = +pearson(bc, lh).toFixed(3);

// Coverage tiers
for (const label of ['cov>=60', 'cov40-59']) {
  const sub = paired.filter((r) => label === 'cov>=60' ? r.coverage_percent >= 60 : r.coverage_percent >= 40 && r.coverage_percent < 60);
  out[label] = sub.length >= 5
    ? { n: sub.length, spearman: +spearman(sub.map((r) => r.beacon_overall), sub.map((r) => r.lh_a11y)).toFixed(3) }
    : { n: sub.length, spearman: null };
}

// Weight sensitivity: current vs equal weights, same scored categories.
const eq = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 1]));
const bcEq = paired.map((r) => overallWith(r.categories, eq));
out.spearman_equal_weights = +spearman(bcEq, lh).toFixed(3);

// Per-band means
out.bands = {};
for (const band of [...new Set(paired.map((r) => r.band))]) {
  const sub = paired.filter((r) => r.band === band);
  out.bands[band] = {
    n: sub.length,
    lh_a11y_avg: Math.round(sub.reduce((s, r) => s + r.lh_a11y, 0) / sub.length),
    beacon_avg: Math.round(sub.reduce((s, r) => s + r.beacon_overall, 0) / sub.length),
    coverage_avg: Math.round(sub.reduce((s, r) => s + r.coverage_percent, 0) / sub.length),
  };
}

// Beacon band distribution (score_bands: >=90 pass, >=50 needs-work, else fail)
out.beacon_band_counts = {
  pass: paired.filter((r) => r.beacon_overall >= 90).length,
  needs_work: paired.filter((r) => r.beacon_overall >= 50 && r.beacon_overall < 90).length,
  fail: paired.filter((r) => r.beacon_overall < 50).length,
};
out.capture_failures = rows.filter((r) => r.capture !== 'ok').map((r) => ({ idx: r.idx, url: r.url, capture: r.capture }));

writeFileSync(resolve(RUN, 'analysis.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
