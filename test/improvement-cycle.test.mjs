// Beacon · improvement loop cycle: observe, select, prepare, reproduce (IC-01, IC-02, IC-03, IC-04).
// Synthetic ops root + fake scanner only. Never touches real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { classify, planSelect } from '../tools/improvement/select.mjs';
import { shq } from '../tools/improvement/reproduce.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../tools/improvement/cli.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v)); };

export const scannerSrc = ({ n = 3, key = 'img-alt', extra = null } = {}) => `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2); const arg = (k) => a[a.indexOf(k) + 1];
const file = a[a.length - 1];
const n = Number(process.env.FAKE_N ?? ${n}); const sleep = Number(process.env.FAKE_SLEEP ?? 0);
setTimeout(() => {
  readFileSync(file);
  const findings = Array.from({ length: n }, (_, i) => ({ key: ${JSON.stringify(key)}, location: file + ':' + (i + 1) }));
  ${extra ? `findings.push({ key: ${JSON.stringify(extra)}, location: file + ':99' });` : ''}
  writeFileSync(arg('--output'), JSON.stringify({ metadata: { url: arg('--url'), date: arg('--date'), engine_fingerprint: 'fake@1', audit_methods: ['m' + Date.now()] },
    summary: { overall_score: 100 - n }, findings, legal_risk: {}, remediation: findings.map((f) => ({ key: f.key, location: f.location })) }));
}, sleep);
`;

const stored = (id, n, key = 'img-alt', date = '2026-10-20') => ({
  metadata: { url: `https://site-${id}.invalid/`, date, engine_fingerprint: 'fake@1', audit_methods: ['old'] },
  summary: { overall_score: 100 - n },
  findings: Array.from({ length: n }, (_, i) => ({ key, location: `/old/${id}.html:${i + 1}` })),
  legal_risk: {}, remediation: Array.from({ length: n }, (_, i) => ({ key, location: `/old/${id}.html:${i + 1}` })),
});

export function mkIssue(signature, count_last, examples, extra = {}) {
  return { signature, status: 'open', last_seen: '2026-10-20', count_last, examples, ...extra };
}

export function setup(t, { timeoutMs = 120000, maxExamples = 5, issues } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'improve-cycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ops = join(root, 'ops'), repo = join(root, 'repo');
  const date = '2026-10-20';
  for (const id of ['201', '202']) json(join(ops, 'survey-audits', `${id}.json`), stored(id, 2));
  json(join(ops, 'survey-audits', '203.json'), stored('203', 1, 'aria'));
  for (const id of ['201', '202', '203', '204']) {
    mkdirSync(join(ops, 'survey-snapshots'), { recursive: true });
    writeFileSync(join(ops, 'survey-snapshots', `${id}.html.gz`), gzipSync(`<p>page ${id}</p>`));
  }
  for (const [id, outcome] of [['201', 'ok'], ['202', 'ok'], ['203', 'ok'], ['204', 'ok'], ['205', 'ok'], ['206', 'failed']]) {
    json(join(ops, 'daily-history', date, id, 'result.json'), { outcome, auditFailed: false });
  }
  json(join(ops, 'daily-history', date, '201', 'before.json'), { before: true });
  json(join(ops, 'quality', 'issues.json'), {
    processed_dates: [date],
    issues: issues ?? [
      mkIssue('rules-diff:img-alt', 5, ['201', '202']),
      mkIssue('rules-diff:aria', 9, ['203']),
      mkIssue('audit-timeout', 4, ['204']),
      mkIssue('missing-report', 7, ['205']),
      mkIssue('capture:dns', 30, ['206']),
      mkIssue('bot-protected', 2, ['206'], { status: 'fixed' }),
    ],
  });
  mkdirSync(join(repo, 'core', 'scripts'), { recursive: true });
  writeFileSync(join(repo, 'core', 'scripts', 'static-audit.mjs'), scannerSrc());
  for (const d of ['state', 'evidence']) mkdirSync(join(root, d));
  const config = { ops, state: join(root, 'state'), evidence: join(root, 'evidence'), beaconRepo: repo, timeoutMs, maxExamples };
  const cfg = join(root, 'config.json');
  json(cfg, config);
  return { root, ops, repo, cfg, config };
}

export function cli(cfg, args, env = {}) {
  const p = spawnSync(process.execPath, [CLI, ...args, '--config', cfg], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 60000 });
  let out = null;
  try { out = JSON.parse(p.stdout); } catch { /* leave null */ }
  return { status: p.status, out, stderr: p.stderr };
}
export const cand = (config, signature) => {
  const dir = join(config.state, 'candidates');
  return readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .filter((c) => c.signature === signature).sort((a, b) => a.history[0].at.localeCompare(b.history[0].at))
    .at(-1);
};
export const files = (d) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name)).sort();

// ---- pure ------------------------------------------------------------------

test('classify: engine / timeout / missing / external / unclassified', () => {
  assert.deepEqual(['rules-diff:x', 'audit-timeout', 'baseline-timeout', 'missing-report', 'capture:dns', 'bot-protected', 'weird'].map(classify),
    ['engine', 'timeout', 'timeout', 'missing', 'external', 'external', null]);
});

test('planSelect: rank engine > timeout > missing, higher count first, then signature; external and unclassified excluded; settled skipped', () => {
  const c = (id, signature, count, status = 'observed', blocked = null) => ({ id, signature, status, blocked, class: classify(signature), observation: { count } });
  const plan = planSelect([
    c('a', 'missing-report', 99), c('b', 'audit-timeout', 1), c('c', 'rules-diff:z', 5), c('d', 'rules-diff:a', 5),
    c('e', 'rules-diff:m', 9), c('f', 'capture:dns', 50), c('g', 'weird', 1),
    c('h', 'rules-diff:done', 100, 'validated'), c('i', 'rules-diff:x', 100, 'failed', { reason: 'r', retry_eligible: false }),
    c('j', 'rules-diff:retry', 2, 'failed', { reason: 'r', retry_eligible: true }),
  ]);
  assert.deepEqual(plan.ranked.map((x) => x.id), ['e', 'd', 'c', 'b', 'a', 'j']);
  assert.deepEqual(plan.exclude.map((x) => x.id).sort(), ['f', 'g']);
  assert.match(plan.exclude.find((x) => x.id === 'f').reason, /not a Beacon defect/);
});

// ---- observe / select ------------------------------------------------------

test('observe: open/reproduced issues only; ids deterministic; same observation is reused without rewrite', (t) => {
  const s = setup(t);
  const r1 = cli(s.cfg, ['observe']);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r1.out.created.length, 5);
  const c = cand(s.config, 'rules-diff:img-alt');
  assert.match(c.id, /^cand_[0-9a-f]{16}$/);
  assert.equal(c.status, 'observed');
  assert.deepEqual(c.observation.engine_fingerprints, ['fake@1']);
  assert.equal(cand(s.config, 'bot-protected'), undefined);
  const file = join(s.config.state, 'candidates', `${c.id}.json`);
  const before = statSync(file).mtimeMs;
  const r2 = cli(s.cfg, ['observe']);
  assert.equal(r2.out.created.length, 0);
  assert.equal(r2.out.reused.length, 5);
  assert.equal(statSync(file).mtimeMs, before);
});

test('observe: a new last_seen supersedes the old candidate and keeps it untouched', (t) => {
  const s = setup(t);
  cli(s.cfg, ['observe']);
  const old = cand(s.config, 'rules-diff:img-alt');
  const issues = JSON.parse(readFileSync(join(s.ops, 'quality', 'issues.json')));
  issues.issues[0].last_seen = '2026-10-21';
  json(join(s.ops, 'quality', 'issues.json'), issues);
  const r = cli(s.cfg, ['observe']);
  assert.equal(r.out.created.length, 1);
  const fresh = r.out.created[0];
  assert.notEqual(fresh, old.id);
  const f = JSON.parse(readFileSync(join(s.config.state, 'candidates', `${fresh}.json`)));
  assert.equal(f.supersedes, old.id);
  assert.deepEqual(JSON.parse(readFileSync(join(s.config.state, 'candidates', `${old.id}.json`))), old);
});

test('select: ranks engine first by count, excludes external with a reason, ignores superseded', (t) => {
  const s = setup(t);
  cli(s.cfg, ['observe']);
  const r = cli(s.cfg, ['select']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(cand(s.config, 'rules-diff:aria').id, r.out.selected);
  assert.deepEqual(r.out.ranked.map((id) => JSON.parse(readFileSync(join(s.config.state, 'candidates', `${id}.json`))).signature),
    ['rules-diff:aria', 'rules-diff:img-alt', 'audit-timeout', 'missing-report']);
  const ex = cand(s.config, 'capture:dns');
  assert.equal(ex.status, 'excluded');
  assert.match(ex.blocked.reason, /not a Beacon defect/);
});

// ---- prepare ---------------------------------------------------------------

const prepared = (t, opts) => {
  const s = setup(t, opts);
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'rules-diff:img-alt');
  const r = cli(s.cfg, ['prepare', '--candidate', c.id]);
  return { s, c, r };
};

test('prepare: freezes files with digests, evidence.json has no URL or absolute path, source untouched', (t) => {
  const s = setup(t);
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'rules-diff:img-alt');
  const srcBefore = files(s.ops).map((f) => [f, sha(readFileSync(f))]);
  const r = cli(s.cfg, ['prepare', '--candidate', c.id]);
  assert.equal(r.status, 0, r.stderr);
  const after = cand(s.config, 'rules-diff:img-alt');
  assert.equal(after.status, 'prepared');
  assert.match(after.evidence.digest, /^[0-9a-f]{64}$/);
  const dir = join(s.config.evidence, c.id);
  for (const rel of ['survey-audits/201.json', 'survey-snapshots/201.html.gz', 'daily-history/2026-10-20/201/result.json', 'daily-history/2026-10-20/201/before.json', 'survey-audits/202.json']) {
    assert.ok(existsSync(join(dir, 'files', rel)), rel);
  }
  assert.equal(after.evidence.files.length, 7);
  const ev = readFileSync(join(dir, 'evidence.json'), 'utf8');
  assert.doesNotMatch(ev, /https?:\/\//);
  assert.ok(!ev.includes(s.root), 'no absolute path');
  const parsed = JSON.parse(ev);
  assert.deepEqual(Object.keys(parsed).sort(), ['candidate', 'interpretations', 'observations', 'sampling', 'source_digests', 'test_evidence', 'unknowns']);
  assert.ok(parsed.unknowns.some((u) => /no independent label/.test(u)));
  assert.deepEqual(files(s.ops).map((f) => [f, sha(readFileSync(f))]), srcBefore);
  const r2 = cli(s.cfg, ['prepare', '--candidate', c.id]);
  assert.equal(r2.out.already, true);
  assert.equal(cand(s.config, 'rules-diff:img-alt').evidence.digest, after.evidence.digest);
});

test('prepare: maxExamples limits the sample and records n of N', (t) => {
  const { s, c } = prepared(t, { maxExamples: 1 });
  const ev = JSON.parse(readFileSync(join(s.config.evidence, c.id, 'evidence.json'), 'utf8'));
  assert.deepEqual(ev.sampling, { rule: 'first N examples', n: 1, of: 2 });
  assert.ok(!existsSync(join(s.config.evidence, c.id, 'files', 'survey-audits', '202.json')));
});

test('prepare: interruption mid-copy is resumable, no duplicates or .next leftovers', (t) => {
  const s = setup(t);
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'rules-diff:img-alt');
  const bad = cli(s.cfg, ['prepare', '--candidate', c.id], { IMPROVE_FAIL_AFTER_FILE: '1' });
  assert.equal(bad.status, 1);
  assert.equal(cand(s.config, 'rules-diff:img-alt').status, 'observed');
  const ok = cli(s.cfg, ['prepare', '--candidate', c.id]);
  assert.equal(ok.status, 0, ok.stderr);
  const done = cand(s.config, 'rules-diff:img-alt');
  assert.equal(done.status, 'prepared');
  assert.equal(done.history.filter((h) => h.to === 'prepared').length, 1);
  assert.ok(files(s.config.evidence).every((f) => !f.endsWith('.next')));
  assert.equal(done.evidence.files.length, 7);
  assert.ok(!existsSync(join(s.config.state, '.lock')), 'lock released after failure');
});

test('evidence tamper: command refuses with exit 2 and marks evidence.invalid', (t) => {
  const { s, c } = prepared(t);
  writeFileSync(join(s.config.evidence, c.id, 'files', 'survey-audits', '201.json'), '{}');
  const r = cli(s.cfg, ['reproduce', '--candidate', c.id]);
  assert.equal(r.status, 2);
  assert.match(r.out.error, /evidence/);
  const after = cand(s.config, 'rules-diff:img-alt');
  assert.equal(after.evidence.invalid, true);
  assert.equal(after.status, 'prepared');
});

// ---- reproduce -------------------------------------------------------------

test('reproduce engine: stored 2 vs fresh 3 -> reproduced, per-example facts, repro.sh written', (t) => {
  const { s, c } = prepared(t);
  const r = cli(s.cfg, ['reproduce', '--candidate', c.id]);
  assert.equal(r.status, 0, r.stderr);
  const after = cand(s.config, 'rules-diff:img-alt');
  assert.equal(after.status, 'reproduced');
  assert.equal(after.reproduction.reproduced, true);
  assert.deepEqual(after.reproduction.actual.map((x) => [x.id, x.stored, x.fresh, x.engine_stored, x.engine_fresh]),
    [['201', 2, 3, 'fake@1', 'fake@1'], ['202', 2, 3, 'fake@1', 'fake@1']]);
  assert.ok(existsSync(join(s.config.evidence, c.id, 'repro.sh')));
  assert.doesNotMatch(JSON.stringify(after), /https?:\/\//);
  assert.equal(cli(s.cfg, ['reproduce', '--candidate', c.id]).out.already, true);
});

test('reproduce engine: fresh equals stored -> blocked, not retry eligible', (t) => {
  const { s, c } = prepared(t);
  const r = cli(s.cfg, ['reproduce', '--candidate', c.id], { FAKE_N: '2' });
  assert.equal(r.status, 0, r.stderr);
  const after = cand(s.config, 'rules-diff:img-alt');
  assert.equal(after.status, 'blocked');
  assert.equal(after.blocked.retry_eligible, false);
  assert.equal(after.reproduction.reproduced, false);
});

test('reproduce timeout: scanner slower than timeoutMs -> reproduced; fast scanner -> blocked', (t) => {
  const s = setup(t, { timeoutMs: 400 });
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'audit-timeout');
  cli(s.cfg, ['prepare', '--candidate', c.id]);
  const r = cli(s.cfg, ['reproduce', '--candidate', c.id], { FAKE_SLEEP: '3000' });
  assert.equal(r.status, 0, r.stderr);
  const after = cand(s.config, 'audit-timeout');
  assert.equal(after.status, 'reproduced');
  assert.ok(after.reproduction.actual[0].wall_ms >= 400);
  const s2 = setup(t, { timeoutMs: 5000 });
  cli(s2.cfg, ['observe']);
  const c2 = cand(s2.config, 'audit-timeout');
  cli(s2.cfg, ['prepare', '--candidate', c2.id]);
  cli(s2.cfg, ['reproduce', '--candidate', c2.id]);
  assert.equal(cand(s2.config, 'audit-timeout').status, 'blocked');
});

test('reproduce missing: report absent and result ok -> reproduced; failed capture -> blocked', (t) => {
  const s = setup(t);
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'missing-report');
  cli(s.cfg, ['prepare', '--candidate', c.id]);
  cli(s.cfg, ['reproduce', '--candidate', c.id]);
  assert.equal(cand(s.config, 'missing-report').status, 'reproduced');
  const s2 = setup(t);
  json(join(s2.ops, 'daily-history', '2026-10-20', '205', 'result.json'), { outcome: 'failed' });
  cli(s2.cfg, ['observe']);
  const c2 = cand(s2.config, 'missing-report');
  cli(s2.cfg, ['prepare', '--candidate', c2.id]);
  cli(s2.cfg, ['reproduce', '--candidate', c2.id]);
  const b = cand(s2.config, 'missing-report');
  assert.equal(b.status, 'blocked');
  assert.match(b.blocked.reason, /capture failure/);
});

test('run: observe, select, prepare, reproduce for one candidate and stops at reproduced', (t) => {
  const s = setup(t);
  const r = cli(s.cfg, ['run']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.candidate, cand(s.config, 'rules-diff:aria').id);
  assert.ok(['reproduced', 'blocked'].includes(cand(s.config, 'rules-diff:aria').status));
  assert.equal(cli(s.cfg, ['status']).out.candidates.length, 5);
});

// ---- review fixes: medium 3 / 4 / 5 -----------------------------------------

test('observe refuses ids, dates and signatures that are unsafe as paths or argv (exit 2)', (t) => {
  for (const bad of [
    mkIssue('rules-diff:img-alt', 5, ['../x']),
    mkIssue('rules-diff:img-alt', 5, ['201'], { last_seen: '2026-10-20/../..' }),
    mkIssue('rules-diff:img-alt; rm', 5, ['201']),
  ]) {
    const s = setup(t, { issues: [bad] });
    const r = cli(s.cfg, ['observe']);
    assert.equal(r.status, 2, JSON.stringify(bad));
    assert.equal(existsSync(join(s.config.state, 'candidates')), false);
  }
});

test('shq single-quotes and escapes embedded quotes; repro.sh quotes every interpolated value', (t) => {
  assert.equal(shq("a'b"), `'a'"'"'b'`);
  const { s, c } = prepared(t);
  cli(s.cfg, ['reproduce', '--candidate', c.id]);
  const sh = readFileSync(join(s.config.evidence, c.id, 'repro.sh'), 'utf8');
  assert.match(sh, /"\$tmp"\/'201\.html'/);
  assert.doesNotMatch(sh, /\$\{/);
});

test('a missing-class candidate refuses validate and --patch with exit 2 and stays reproduced', (t) => {
  const s = setup(t);
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'missing-report');
  cli(s.cfg, ['prepare', '--candidate', c.id]);
  cli(s.cfg, ['reproduce', '--candidate', c.id]);
  const wt = join(s.root, 'wt');
  mkdirSync(join(wt, 'core', 'scripts'), { recursive: true });
  writeFileSync(join(wt, 'core', 'scripts', 'static-audit.mjs'), scannerSrc());
  const patch = join(s.root, 'p.patch');
  writeFileSync(patch, 'x\n');
  const r = cli(s.cfg, ['validate', '--candidate', c.id, '--worktree', wt, '--patch', patch]);
  assert.equal(r.status, 2);
  assert.match(r.out.error, /operational fix/);
  assert.equal(cand(s.config, 'missing-report').status, 'reproduced');
  assert.equal(cand(s.config, 'missing-report').candidate_fix, null);
});

test('observe skips an invalid issue and lists it; exit 2 only when every issue is invalid or the file is malformed', (t) => {
  const s = setup(t, { issues: [mkIssue('rules-diff:img-alt', 5, ['201', '202']), mkIssue('rules-diff:bad', 5, ['../x'])] });
  const r = cli(s.cfg, ['observe']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.created.length, 1);
  assert.equal(r.out.invalid.length, 1);
  assert.equal(r.out.invalid[0].signature, 'rules-diff:bad');
  assert.match(r.out.invalid[0].reason, /example id/);
  const s2 = setup(t);
  writeFileSync(join(s2.ops, 'quality', 'issues.json'), '{not json');
  const r2 = cli(s2.cfg, ['observe']);
  assert.equal(r2.status, 2);
  assert.match(r2.out.error, /issues\.json/);
});

// ---- scanner infrastructure failure is failed, never a counts-equal verdict ----

const failedRepro = (t, breakScanner) => {
  const { s, c } = prepared(t);
  breakScanner(join(s.repo, 'core', 'scripts', 'static-audit.mjs'));
  const r = cli(s.cfg, ['reproduce', '--candidate', c.id]);
  return { s, c, r, after: cand(s.config, 'rules-diff:img-alt') };
};

for (const [name, brk] of [
  ['scanner missing', (f) => rmSync(f)],
  ['scanner exits 1', (f) => writeFileSync(f, 'process.stderr.write("boom https://x.invalid/p\\n"); process.exit(1);\n')],
]) {
  test(`reproduce engine: ${name} -> failed, retry eligible, no count comparison`, (t) => {
    const { r, after } = failedRepro(t, brk);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(after.status, 'failed');
    assert.equal(after.blocked, null);
    assert.equal(after.failure.step, 'reproduce');
    assert.equal(after.failure.retry_eligible, true);
    assert.ok(after.failure.error.length > 0);
    assert.equal(after.reproduction.reproduced, false);
    for (const a of after.reproduction.actual) { assert.equal(a.fresh, null); assert.ok(a.error); }
    assert.doesNotMatch(JSON.stringify(after), /https?:\/\//);
  });
}

test('reproduce: a failed (retry eligible) candidate reproduces once the scanner works again', (t) => {
  const { s, c, after } = failedRepro(t, (f) => rmSync(f));
  assert.equal(after.status, 'failed');
  writeFileSync(join(s.repo, 'core', 'scripts', 'static-audit.mjs'), scannerSrc());
  const r = cli(s.cfg, ['reproduce', '--candidate', c.id]);
  assert.equal(r.status, 0, r.stderr);
  const again = cand(s.config, 'rules-diff:img-alt');
  assert.equal(again.status, 'reproduced');
  assert.equal(again.failure, null);
});

// ---- R1: run must not starve behind a failed candidate -----------------------

test('run: a retry-eligible failed candidate is retried (exit 0), never refused by prepare', (t) => {
  const s = setup(t, { issues: [mkIssue('rules-diff:img-alt', 5, ['201', '202'])] });
  const scanner = join(s.repo, 'core', 'scripts', 'static-audit.mjs');
  const good = readFileSync(scanner, 'utf8');
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'rules-diff:img-alt');
  cli(s.cfg, ['prepare', '--candidate', c.id]);
  rmSync(scanner);
  assert.equal(cli(s.cfg, ['reproduce', '--candidate', c.id]).out.status, 'failed');
  const still = cli(s.cfg, ['run']);
  assert.equal(still.status, 0, JSON.stringify(still.out));
  assert.equal(still.out.status, 'failed');
  writeFileSync(scanner, good);
  const fixed = cli(s.cfg, ['run']);
  assert.equal(fixed.status, 0, JSON.stringify(fixed.out));
  assert.equal(fixed.out.status, 'reproduced');
});

test('run: a failed candidate that is not retry eligible is skipped, the next one proceeds', (t) => {
  const s = setup(t, { issues: [mkIssue('rules-diff:img-alt', 5, ['201', '202']), mkIssue('missing-report', 7, ['205'])] });
  cli(s.cfg, ['observe']);
  const c = cand(s.config, 'rules-diff:img-alt');
  const file = join(s.config.state, 'candidates', `${c.id}.json`);
  writeFileSync(file, JSON.stringify({ ...c, status: 'failed', blocked: null, failure: { step: 'reproduce', error: 'x', retry_eligible: false } }));
  const r = cli(s.cfg, ['run']);
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.candidate, cand(s.config, 'missing-report').id);
  assert.equal(r.out.status, 'reproduced');
});

// ---- R1 part 2: failed candidates yield to fresh ones; retry cap ---------------

test('planSelect: non-failed first regardless of class; failed by fewer attempts then older; reproduced/candidate are in hand', () => {
  const c = (id, signature, count, status = 'observed', failure = null) => ({ id, signature, status, blocked: null, failure, class: classify(signature), observation: { count } });
  const f = (attempts, at) => ({ step: 'reproduce', error: 'x', retry_eligible: true, attempts, at });
  const plan = planSelect([
    c('f2', 'rules-diff:z', 99, 'failed', f(2, '2026-10-20T00:00:00Z')),
    c('f1new', 'rules-diff:y', 99, 'failed', f(1, '2026-10-22T00:00:00Z')),
    c('f1old', 'rules-diff:x', 1, 'failed', f(1, '2026-10-21T00:00:00Z')),
    c('m', 'missing-report', 1), c('e', 'rules-diff:a', 1),
    c('rep', 'rules-diff:b', 50, 'reproduced'), c('cand', 'rules-diff:c', 50, 'candidate'),
  ]);
  assert.deepEqual(plan.ranked.map((x) => x.id), ['e', 'm', 'f1old', 'f1new', 'f2']);
});

const imgAltAndMissing = (t) => {
  const s = setup(t, { issues: [mkIssue('rules-diff:img-alt', 5, ['201', '202']), mkIssue('missing-report', 7, ['205'])] });
  const scanner = join(s.repo, 'core', 'scripts', 'static-audit.mjs');
  cli(s.cfg, ['observe']);
  const a = cand(s.config, 'rules-diff:img-alt');
  cli(s.cfg, ['prepare', '--candidate', a.id]);
  rmSync(scanner);
  cli(s.cfg, ['reproduce', '--candidate', a.id]);
  return { s, a };
};

test('run: a retry-eligible failed A does not starve B; A is retried once B is in hand', (t) => {
  const { s, a } = imgAltAndMissing(t);
  assert.equal(cand(s.config, 'rules-diff:img-alt').failure.attempts, 1);
  const r1 = cli(s.cfg, ['run']);
  assert.equal(r1.out.candidate, cand(s.config, 'missing-report').id);
  assert.equal(r1.out.status, 'reproduced');
  const r2 = cli(s.cfg, ['run']);
  assert.equal(r2.out.candidate, a.id);
  assert.equal(r2.out.status, 'failed');
  assert.equal(cand(s.config, 'rules-diff:img-alt').failure.attempts, 2);
});

test('run: the third failure of a candidate caps retries; it leaves selection and stays visible in status', (t) => {
  const s = setup(t, { issues: [mkIssue('rules-diff:img-alt', 5, ['201', '202'])] });
  rmSync(join(s.repo, 'core', 'scripts', 'static-audit.mjs'));
  for (let i = 0; i < 3; i++) assert.equal(cli(s.cfg, ['run']).status, 0);
  const a = cand(s.config, 'rules-diff:img-alt');
  assert.equal(a.status, 'failed');
  assert.equal(a.failure.attempts, 3);
  assert.equal(a.failure.retry_eligible, false);
  assert.match(a.failure.reason, /retry cap reached after 3 attempts/);
  const r = cli(s.cfg, ['run']);
  assert.equal(r.status, 0);
  assert.equal(r.out.candidate, null);
  const st = cli(s.cfg, ['status']).out.candidates.find((c) => c.id === a.id);
  assert.equal(st.status, 'failed');
});
