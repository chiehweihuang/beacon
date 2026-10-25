// Explicit opt-in probes: node --test ops-contract.probe.mjs.
// Synthetic acceptance probes. No live datasets, browser, network or schedules.
// Requires BEACON_OPS pointing at a copied operational-script directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

assert.ok(process.env.BEACON_OPS, 'BEACON_OPS must point at isolated operational scripts');
const ops = resolve(process.env.BEACON_OPS);
const { dailyRun } = await import(pathToFileURL(resolve(ops, 'daily-survey.mjs')));
const { triage, setStatus } = await import(pathToFileURL(resolve(ops, 'triage-daily.mjs')));
const json = (p, v) => writeFileSync(p, JSON.stringify(v));
function setup(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'beacon-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['home', 'survey-audits', 'survey-snapshots']) mkdirSync(resolve(root, dir));
  copyFileSync(resolve(ops, 'db.mjs'), resolve(root, 'db.mjs'));
  json(resolve(root, 'targets.json'), { targets: [{ id: 100000, url: 'https://synthetic.invalid', roles: ['survey'], status: 'active' }] });
  json(resolve(root, 'survey-queue.json'), { cursor: 0, queue: [] });
  writeFileSync(resolve(root, 'tranco-top1m.csv'), '');
  return root;
}
function sync(root) {
  const p = spawnSync(process.execPath, [resolve(root, 'db.mjs'), 'sync'], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, HOME: resolve(root, 'home') },
  });
  assert.equal(p.status, 0, p.stderr);
}
function query(root, sql) {
  const db = new DatabaseSync(resolve(root, 'beacon-lab.db'), { readOnly: true });
  try { return db.prepare(sql).all(); } finally { db.close(); }
}
const audit = async (_html, url, date) => ({ metadata: { url, date, engine_fingerprint: 'synthetic@1' }, summary: { overall_score: 80 }, findings: [] });
const options = root => ({ root, day: '2026-01-01', limits: { revisit: 1, retry: 0, fresh: 0 }, capture: async () => ({ outcome: 'ok', html: '<p>synthetic</p>' }), audit, sync: async () => sync(root) });

test('IC-08: daily result reaches registry and SQLite; sync replay does not duplicate rows', async t => {
  const root = setup(t);
  const state = await dailyRun(options(root));
  assert.equal(state.complete, true);
  assert.equal(JSON.parse(readFileSync(resolve(root, 'targets.json'))).targets[0].beacon_score, 80);
  const before = query(root, 'SELECT source, run, score FROM audits ORDER BY source');
  assert.equal(before.length, 2);
  sync(root);
  assert.deepEqual(query(root, 'SELECT source, run, score FROM audits ORDER BY source'), before);
});

test('GAP-01: SQLite preserves the audit date emitted by the scanner', async t => {
  const root = setup(t);
  await dailyRun(options(root));
  assert.deepEqual(query(root, 'SELECT date FROM audits').map(x => x.date), ['2026-01-01', '2026-01-01']);
});

test('GAP-02: repaired report is ingested after a malformed revision even if its mtime is retained', t => {
  const root = setup(t), file = resolve(root, 'survey-audits/100000.json');
  const report = score => ({ metadata: { date: '2026-01-01' }, summary: { overall_score: score }, findings: [] });
  json(file, report(20)); utimesSync(file, 1000, 1000); sync(root);
  writeFileSync(file, '{malformed'); utimesSync(file, 2000, 2000); sync(root);
  json(file, report(90)); utimesSync(file, 2000, 2000); sync(root);
  assert.equal(query(root, 'SELECT score FROM audits')[0].score, 90);
});

test('GAP-03: default triage catches an older completed day missed before the next day completed', t => {
  const root = setup(t);
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  for (const [day, outcome] of [['2026-01-01', 'failed'], ['2026-01-02', 'ok']]) {
    const dir = resolve(root, 'daily-history', day); mkdirSync(resolve(dir, '100000'), { recursive: true });
    json(resolve(dir, 'state.json'), { date: day, complete: true, entries: [{ id: 100000 }], outcomes: { [outcome]: 1 } });
    json(resolve(dir, '100000/result.json'), { outcome, reason: outcome === 'failed' ? 'dns' : null });
  }
  triage({ root });
  const issues = JSON.parse(readFileSync(resolve(root, 'quality/issues.json'))).issues;
  assert.ok(issues.some(x => x.signature === 'capture:dns'), 'missed completed day must remain discoverable');
});

test('legacy audit_date remains readable after date-field correction', t => {
  const root = setup(t);
  json(resolve(root, 'survey-audits/100000.json'), { metadata: { audit_date: '2025-12-31' }, summary: { overall_score: 70 }, findings: [] });
  sync(root);
  assert.equal(query(root, 'SELECT date FROM audits')[0].date, '2025-12-31');
});

test('database ingestion failure rolls back registry and audit replacements', t => {
  const root = setup(t), file = resolve(root, 'survey-audits/100000.json');
  json(file, { summary: { overall_score: 20 }, findings: [] }); utimesSync(file, 1000, 1000); sync(root);
  json(resolve(root, 'targets.json'), { targets: [{ id: 100000, url: 'https://changed.invalid' }] });
  json(file, { summary: { overall_score: 90 }, findings: [null] }); utimesSync(file, 2000, 2000);
  const result = spawnSync(process.execPath, [resolve(root, 'db.mjs'), 'sync'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, HOME: resolve(root, 'home') } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot read properties of null/);
  assert.equal(query(root, 'SELECT score FROM audits')[0].score, 20);
  assert.equal(query(root, 'SELECT url FROM targets')[0].url, 'https://synthetic.invalid');
});

test('GAP-03: interrupted backfill resumes and does not duplicate earlier issue history', t => {
  const root = setup(t);
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  for (const day of ['2026-01-01', '2026-01-02']) {
    const dir = resolve(root, 'daily-history', day); mkdirSync(resolve(dir, '100000'), { recursive: true });
    json(resolve(dir, 'state.json'), { date: day, complete: true, entries: [{ id: 100000 }], outcomes: { failed: 1 } });
  }
  const result = day => resolve(root, 'daily-history', day, '100000/result.json');
  json(result('2026-01-01'), { outcome: 'failed', reason: 'dns' });
  assert.throws(() => triage({ root }), /lacks/);
  json(result('2026-01-02'), { outcome: 'failed', reason: 'dns' });
  triage({ root }); triage({ root });
  const data = JSON.parse(readFileSync(resolve(root, 'quality/issues.json')));
  assert.equal(data.issues.find(x => x.signature === 'capture:dns').days_seen, 2);
  assert.deepEqual(data.processed_dates, ['2026-01-01', '2026-01-02']);
});

test('usage ledger mtime replay remains idempotent', t => {
  const root = setup(t), dir = resolve(root, 'home/.beacon'); mkdirSync(dir);
  json(resolve(dir, 'usage.jsonl'), { date: '2026-01-01', type: 'synthetic', score: 80 });
  sync(root); sync(root);
  assert.equal(query(root, 'SELECT COUNT(*) AS n FROM usage_ledger')[0].n, 1);
});

test('backfill does not invent past observations of reports missing today', t => {
  const root = setup(t);
  for (const day of ['2026-01-01', '2026-01-02']) {
    const dir = resolve(root, 'daily-history', day); mkdirSync(resolve(dir, '100000'), { recursive: true });
    json(resolve(dir, 'state.json'), { date: day, complete: true, entries: [{ id: 100000 }], outcomes: { ok: 1 } });
    json(resolve(dir, '100000/result.json'), { outcome: 'ok' });
  }
  triage({ root });
  const issue = JSON.parse(readFileSync(resolve(root, 'quality/issues.json'))).issues.find(x => x.signature === 'missing-report');
  assert.deepEqual(issue.history.map(x => x.date), ['2026-01-02']);
});

const dayFixture = (root, day, outcome, reason = null) => {
  const dir = resolve(root, 'daily-history', day); mkdirSync(resolve(dir, '100000'), { recursive: true });
  json(resolve(dir, 'state.json'), { date: day, complete: true, entries: [{ id: 100000 }], outcomes: { [outcome]: 1 } });
  if (outcome) json(resolve(dir, '100000/result.json'), { outcome, reason });
};
const issueOf = (root, sig) => JSON.parse(readFileSync(resolve(root, 'quality/issues.json'))).issues.find(x => x.signature === sig);

test('F1: a late-completing older day does not reopen an issue marked fixed', t => {
  const root = setup(t), out = resolve(root, 'quality');
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  dayFixture(root, '2026-01-01', 'failed', 'dns'); dayFixture(root, '2026-01-03', 'ok');
  triage({ root });
  setStatus({ out, signature: 'capture:dns', status: 'fixed', note: 'patched' });
  dayFixture(root, '2026-01-02', 'failed', 'dns');
  triage({ root });
  const issue = issueOf(root, 'capture:dns');
  assert.equal(issue.status, 'fixed');
  assert.deepEqual(issue.history.map(h => h.date), ['2026-01-01', '2026-01-02']);
});

test('F2: replay skips days with a daily snapshot, tolerates a broken middle day, still processes the newest', t => {
  const root = setup(t), out = resolve(root, 'quality');
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  dayFixture(root, '2026-01-01', 'ok'); dayFixture(root, '2026-01-03', 'ok');
  dayFixture(root, '2026-01-02', 'ok'); rmSync(resolve(root, 'daily-history/2026-01-02/100000/result.json'));
  mkdirSync(resolve(out, 'daily'), { recursive: true });
  json(resolve(out, 'daily/2026-01-01.json'), { sentinel: true });
  const r = triage({ root });
  assert.equal(r.date, '2026-01-03');
  assert.deepEqual(r.skipped, ['2026-01-02']);
  assert.deepEqual(JSON.parse(readFileSync(resolve(out, 'daily/2026-01-01.json'))), { sentinel: true });
  assert.deepEqual(JSON.parse(readFileSync(resolve(out, 'issues.json'))).processed_dates, ['2026-01-01', '2026-01-03']); // legacy snapshot day seeded; skipped day 01-02 absent
});

test('F3: markIngested stores the mtime observed before the read, not a later stat', t => {
  const root = setup(t), file = resolve(root, 'survey-audits/100000.json');
  json(file, { metadata: { date: '2026-01-01' }, summary: { overall_score: 50 }, findings: [] }); utimesSync(file, 1000, 1000);
  const preload = resolve(root, 'touch-after-read.mjs');
  writeFileSync(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const orig = fs.readFileSync;
fs.readFileSync = function (p, ...a) { const r = orig.call(this, p, ...a); if (String(p).includes('survey-audits')) fs.utimesSync(p, 5000, 5000); return r; };
syncBuiltinESMExports();`);
  const p = spawnSync(process.execPath, ['--import', preload, resolve(root, 'db.mjs'), 'sync'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, HOME: resolve(root, 'home') } });
  assert.equal(p.status, 0, p.stderr);
  assert.equal(query(root, 'SELECT mtime FROM ingested')[0].mtime, 1000 * 1000);
});

test('F4: a parsed report that is not a plain object is skipped like malformed JSON', t => {
  const root = setup(t), file = resolve(root, 'survey-audits/100000.json');
  for (const body of ['null', '[]', '"text"', '3']) {
    writeFileSync(file, body);
    sync(root);
    assert.equal(query(root, 'SELECT COUNT(*) AS n FROM audits')[0].n, 0, body);
    assert.equal(query(root, 'SELECT COUNT(*) AS n FROM ingested')[0].n, 0, body);
  }
});

test('F2b: once processed_dates exists, a daily snapshot without a processed entry is replayed', t => {
  const root = setup(t), out = resolve(root, 'quality');
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  dayFixture(root, '2026-01-01', 'ok');
  triage({ root });
  dayFixture(root, '2026-01-02', 'failed', 'dns'); dayFixture(root, '2026-01-03', 'ok');
  json(resolve(out, 'daily/2026-01-02.json'), { crashed: 'between writes' });
  triage({ root });
  assert.deepEqual(JSON.parse(readFileSync(resolve(out, 'issues.json'))).processed_dates, ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.deepEqual(issueOf(root, 'capture:dns').history.map(h => h.date), ['2026-01-02']);
});

test('M-3: CLI exits 4 when a day was skipped, still prints the newest result, exits 0 otherwise', t => {
  const root = setup(t), cli = resolve(ops, 'triage-daily.mjs');
  const run = () => spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8', timeout: 10000 });
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) dayFixture(root, d, 'ok');
  rmSync(resolve(root, 'daily-history/2026-01-02/100000/result.json'));
  const bad = run();
  assert.equal(bad.status, 4, bad.stderr);
  assert.equal(JSON.parse(bad.stdout).date, '2026-01-03');
  assert.deepEqual(JSON.parse(bad.stdout).skipped, ['2026-01-02']);
  assert.match(bad.stderr, /2026-01-02/);
  json(resolve(root, 'daily-history/2026-01-02/100000/result.json'), { outcome: 'ok' });
  assert.equal(run().status, 0);
});

test('F5: findings that is not an array, or summary that is not an object, is skipped as malformed', t => {
  const root = setup(t), file = resolve(root, 'survey-audits/100000.json');
  for (const body of [{ findings: {} }, { findings: 'x' }, { findings: null }, { summary: 'x' }, { summary: [] }, { summary: null }]) {
    json(file, body);
    sync(root);
    assert.equal(query(root, 'SELECT COUNT(*) AS n FROM audits')[0].n, 0, JSON.stringify(body));
    assert.equal(query(root, 'SELECT COUNT(*) AS n FROM ingested')[0].n, 0, JSON.stringify(body));
  }
});

test('F2c: legacy migration seeds processed_dates from existing daily snapshots; second run replays nothing', t => {
  const root = setup(t), out = resolve(root, 'quality'), cli = resolve(ops, 'triage-daily.mjs');
  const run = () => spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8', timeout: 10000 });
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) dayFixture(root, d, 'ok');
  mkdirSync(resolve(out, 'daily'), { recursive: true });
  for (const d of ['2026-01-01', '2026-01-02']) json(resolve(out, `daily/${d}.json`), { legacy: d });
  const bytes = d => readFileSync(resolve(out, `daily/${d}.json`), 'utf8');
  const processed = () => JSON.parse(readFileSync(resolve(out, 'issues.json'))).processed_dates;
  const all = ['2026-01-01', '2026-01-02', '2026-01-03'];
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(processed(), all);
  const snap = Object.fromEntries(all.map(d => [d, bytes(d)]));
  assert.equal(snap['2026-01-01'], JSON.stringify({ legacy: '2026-01-01' }));
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stderr, '');
  assert.deepEqual(processed(), all);
  for (const d of all) assert.equal(bytes(d), snap[d], d);
});

test('F2c: an explicit --date run on a legacy issues.json seeds processed_dates too', t => {
  const root = setup(t), out = resolve(root, 'quality'), cli = resolve(ops, 'triage-daily.mjs');
  json(resolve(root, 'survey-audits/100000.json'), { summary: {} });
  for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) dayFixture(root, d, 'ok');
  mkdirSync(resolve(out, 'daily'), { recursive: true });
  for (const d of ['2026-01-01', '2026-01-02']) json(resolve(out, `daily/${d}.json`), { legacy: d });
  const p = spawnSync(process.execPath, [cli, '--root', root, '--date', '2026-01-03'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(p.status, 0, p.stderr);
  assert.deepEqual(JSON.parse(readFileSync(resolve(out, 'issues.json'))).processed_dates, ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.equal(readFileSync(resolve(out, 'daily/2026-01-01.json'), 'utf8'), JSON.stringify({ legacy: '2026-01-01' }));
});
