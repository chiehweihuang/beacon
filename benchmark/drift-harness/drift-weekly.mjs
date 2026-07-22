// Weekly capture-drift measurement (VALIDATION.md L0). Scheduled via Windows Task
// Scheduler ("beacon-weekly-drift"); no AI involved — pure measurement bookkeeping.
//
//   node drift-weekly.mjs
//
// Captures the 13-site subset into run-YYYY-MM-DD-weekly/, audits with the CURRENT
// engine, compares against the most recent prior weekly run (only when the engine
// fingerprint matches — engine deltas are not capture drift), appends one line to
// drift-history.jsonl, and prunes weekly run dirs beyond the newest 8.
import { readFileSync, readdirSync, appendFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewReport } from './targets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const DATE = new Date().toISOString().slice(0, 10);
const RUN = `run-${DATE}-weekly`;
const COMPARE = 'C:/Code/personal/beacon/tools/drift-compare.mjs';

const priorRuns = readdirSync(ROOT)
  .filter((d) => /^run-\d{4}-\d{2}-\d{2}-weekly$/.test(d) && d !== RUN && existsSync(resolve(ROOT, d, 'results.json')))
  .sort();

execFileSync('node', [resolve(ROOT, 'drift-capture.mjs'), '--run', RUN, '--date', DATE], { stdio: 'inherit' });

const entry = { date: DATE, run: RUN, compared_to: null, engine: null, drift: null, note: null };
try {
  const cur = JSON.parse(readFileSync(resolve(ROOT, RUN, 'results.json'), 'utf8'));
  entry.engine = cur.find((r) => r.engine)?.engine ?? null;
  const prior = priorRuns.at(-1);
  if (prior) {
    const prev = JSON.parse(readFileSync(resolve(ROOT, prior, 'results.json'), 'utf8'));
    const prevEngine = prev.find((r) => r.engine)?.engine ?? null;
    if (prevEngine === entry.engine) {
      const out = execFileSync('node', [COMPARE, resolve(ROOT, prior, 'results.json'), resolve(ROOT, RUN, 'results.json')], { encoding: 'utf8' });
      entry.compared_to = prior;
      entry.drift = JSON.parse(out);
    } else {
      entry.note = `engine changed (${prevEngine} -> ${entry.engine}); capture-drift comparison skipped this week`;
    }
  } else {
    entry.note = 'first weekly run; nothing to compare';
  }
} catch (e) {
  entry.note = `comparison failed: ${String(e.message).slice(0, 200)}`;
}
// Re-probe stale walled/dead core sites (self-filtering; usually a no-op), then
// attach the core-tier review so every weekly log line carries registry health.
try {
  execFileSync('node', [resolve(ROOT, 'probe-walled.mjs')], { stdio: 'inherit', timeout: 15 * 60000 });
} catch (e) {
  console.error('probe-walled failed:', String(e.message).slice(0, 120));
}
const review = reviewReport();
entry.registry = { core_active: review.core_active, core_total: review.core_total, shortfall: review.shortfall };
if (review.shortfall > 0) {
  console.log(`REGISTRY SHORTFALL: core active ${review.core_active} < floor ${review.floor} — replacement candidates needed for:`);
  for (const i of review.inactive.filter((x) => !x.important)) console.log(`  - [${i.status}] (${i.band}) ${i.url}`);
  for (const i of review.inactive.filter((x) => x.important)) console.log(`  - [${i.status}] (${i.band}) ${i.url}  << IMPORTANT: keep, do not replace`);
}
appendFileSync(resolve(ROOT, 'drift-history.jsonl'), JSON.stringify(entry) + '\n');

// prune: keep the newest 8 weekly run dirs (history log keeps the numbers forever)
const all = readdirSync(ROOT).filter((d) => /^run-\d{4}-\d{2}-\d{2}-weekly$/.test(d)).sort();
for (const d of all.slice(0, Math.max(0, all.length - 8))) rmSync(resolve(ROOT, d), { recursive: true, force: true });

console.log(`weekly drift logged: ${JSON.stringify({ date: entry.date, compared_to: entry.compared_to, p95: entry.drift?.score_delta?.p95_abs ?? null, note: entry.note })}`);

try { execFileSync('node', [resolve(ROOT, 'db.mjs'), 'sync'], { stdio: 'pipe', timeout: 300000 }); console.log('db synced'); } catch (e) { console.error('db sync failed:', String(e.message).slice(0, 100)); }

try { execFileSync('node', [resolve(ROOT, 'ingest-reports.mjs')], { stdio: 'inherit', timeout: 120000 }); } catch (e) { console.error('report ingest failed:', String(e.message).slice(0, 80)); }
