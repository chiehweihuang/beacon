// Beacon · improvement loop validation (IC-02, IC-04, IC-07, IC-08): target fix, compatibility,
// tests, accuracy-unknown, opt-in ops write. Synthetic ops + fake "fixed" worktree only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { normalizeReport, compareReports } from '../tools/improvement/validate.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../tools/improvement/cli.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v)); };

const scannerSrc = ({ n = 3, extra = null, fp = 'fake@1', legal = false, meta = false } = {}) => `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const a = process.argv.slice(2); const arg = (k) => a[a.indexOf(k) + 1];
const file = a[a.length - 1];
const findings = Array.from({ length: ${n} }, (_, i) => ({ key: 'img-alt', location: file + ':' + (i + 1) }));
${extra ? `findings.push({ key: ${JSON.stringify(extra)}, location: file + ':99' });` : ''}
writeFileSync(arg('--output'), JSON.stringify({ metadata: { url: arg('--url'), date: arg('--date'), engine_fingerprint: ${JSON.stringify(fp)}, audit_methods: ['m' + Date.now()]${meta ? ", foo: 'bar'" : ''} },
  summary: { overall_score: 100 - ${n} }, findings, legal_risk: ${legal ? "{ x: 1 }" : '{}'}, remediation: findings.map((f) => ({ key: f.key, location: f.location })) }));
`;
const stored = (id, n) => ({
  metadata: { url: `https://site-${id}.invalid/`, date: '2026-10-20', engine_fingerprint: 'fake@1', audit_methods: ['old'] },
  summary: { overall_score: 100 - n },
  findings: Array.from({ length: n }, (_, i) => ({ key: 'img-alt', location: `/old/${id}.html:${i + 1}` })),
  legal_risk: {}, remediation: Array.from({ length: n }, (_, i) => ({ key: 'img-alt', location: `/old/${id}.html:${i + 1}` })),
});
const tree = (d) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
  .map((e) => { const p = join(e.parentPath, e.name); return [p, sha(readFileSync(p))]; }).sort();

function cli(cfg, args, env = {}) {
  const p = spawnSync(process.execPath, [CLI, ...args, '--config', cfg], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 90000 });
  let out = null;
  try { out = JSON.parse(p.stdout); } catch { /* null */ }
  return { status: p.status, out, stderr: p.stderr };
}

// Reaches status "reproduced": stored 2 findings, repo scanner emits 3.
function setup(t, { fixed = { n: 2 }, testBody = '', unbound = false, git = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'improve-validate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ops = join(root, 'ops'), repo = join(root, 'repo'), wt = join(root, 'wt');
  for (const id of ['201', '202']) {
    json(join(ops, 'survey-audits', `${id}.json`), stored(id, 2));
    mkdirSync(join(ops, 'survey-snapshots'), { recursive: true });
    writeFileSync(join(ops, 'survey-snapshots', `${id}.html.gz`), gzipSync(`<p>${id}</p>`));
    json(join(ops, 'daily-history', '2026-10-20', id, 'result.json'), { outcome: 'ok' });
  }
  json(join(ops, 'quality', 'issues.json'), { processed_dates: [], issues: [{ signature: 'rules-diff:img-alt', status: 'open', last_seen: '2026-10-20', count_last: 5, examples: ['201', '202'] }] });
  writeFileSync(join(ops, 'triage-daily.mjs'), `import { readFileSync, writeFileSync } from 'node:fs';
const [, , , sig, status, , note] = process.argv; const f = 'quality/issues.json';
const d = JSON.parse(readFileSync(f)); const i = d.issues.find((x) => x.signature === sig); i.status = status; i.note = note;
writeFileSync(f, JSON.stringify(d));\n`);
  for (const [dir, src] of [[repo, scannerSrc({ n: 3 })], [wt, scannerSrc(fixed)]]) {
    mkdirSync(join(dir, 'core', 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'core', 'scripts', 'static-audit.mjs'), src);
  }
  mkdirSync(join(wt, 'test'));
  writeFileSync(join(wt, 'test', 'smoke.test.mjs'), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('smoke', () => { ${testBody} assert.ok(true); });\n`);
  for (const d of ['state', 'evidence']) mkdirSync(join(root, d));
  const config = { ops, state: join(root, 'state'), evidence: join(root, 'evidence'), beaconRepo: repo, timeoutMs: 20000, maxExamples: 5 };
  const cfg = join(root, 'config.json');
  json(cfg, config);
  // The worktree already contains FIX.txt; a patch adding it is "bound" (git apply -R --check passes).
  writeFileSync(join(wt, 'FIX.txt'), 'fixed\n');
  const patch = join(root, 'fix.patch');
  const name = unbound ? 'OTHER.txt' : 'FIX.txt';
  writeFileSync(patch, `diff --git a/${name} b/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/${name}\n@@ -0,0 +1 @@\n+fixed\n`);
  if (git) {
    const g = (...a) => spawnSync('git', ['-C', wt, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
    g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'wt');
  }
  cli(cfg, ['observe']);
  const id = JSON.parse(readFileSync(join(config.state, 'candidates', readdirSync(join(config.state, 'candidates'))[0]))).id;
  cli(cfg, ['prepare', '--candidate', id]);
  assert.equal(cli(cfg, ['reproduce', '--candidate', id]).status, 0);
  return { root, ops, wt, cfg, config, id, patch };
}
const state = (s) => JSON.parse(readFileSync(join(s.config.state, 'candidates', `${s.id}.json`), 'utf8'));
const validate = (s, extra = [], env) => cli(s.cfg, ['validate', '--candidate', s.id, '--worktree', s.wt, '--patch', s.patch, ...extra], env);

// ---- pure ------------------------------------------------------------------

test('normalizeReport: location becomes <FILE>:line and audit_methods is ignored', () => {
  const n = normalizeReport({ metadata: { a: 1, audit_methods: ['x'] }, findings: [{ key: 'k', location: '/tmp/abc/page.html:7' }], remediation: [{ key: 'k', location: '/other/p.html:7' }], extra: 1 });
  assert.deepEqual(n.metadata, { a: 1 });
  assert.equal(n.findings[0].location, '<FILE>:7');
  assert.equal(n.remediation[0].location, '<FILE>:7');
  assert.equal('extra' in n, false);
});

test('compareReports: identical, and different with the differing finding keys', () => {
  const a = stored('1', 2);
  assert.deepEqual(compareReports(a, { ...stored('1', 2), metadata: { ...a.metadata, audit_methods: ['z'] } }), { identical: true, keys: [], fields: [], metaKeys: [], countChanged: false });
  const b = stored('1', 3);
  const r = compareReports(a, b);
  assert.equal(r.identical, false);
  assert.deepEqual(r.keys, ['img-alt']);
  assert.ok(r.fields.includes('findings'));
  assert.equal(r.countChanged, true);
});

test('normalizeReport/compareReports: bare <file> locations (no line) normalise like <file>:<line>', () => {
  const mk = (file) => ({ metadata: {}, summary: {}, findings: [{ key: 'document-title-missing', location: file }, { key: 'k', location: `${file}:4` }], legal_risk: {}, remediation: [{ key: 'document-title-missing', location: file }] });
  const n = normalizeReport(mk('survey-snapshots/201.html'));
  assert.deepEqual(n.findings.map((f) => f.location), ['<FILE>', '<FILE>:4']);
  assert.deepEqual(compareReports(mk('survey-snapshots/201.html'), mk('page.html')), { identical: true, keys: [], fields: [], metaKeys: [], countChanged: false });
});

test('compareReports: metadata key differences are listed by name', () => {
  const a = stored('1', 1), b = { ...a, metadata: { ...a.metadata, engine_fingerprint: 'fake@2', foo: 1 } };
  assert.deepEqual(compareReports(a, b).metaKeys, ['engine_fingerprint', 'foo']);
});

// ---- validate --------------------------------------------------------------

test('validate: fixed scanner passes; target fixed, compatibility identical, tests 0, accuracy unknown', (t) => {
  const s = setup(t);
  const r = validate(s);
  assert.equal(r.status, 0, r.stderr);
  const c = state(s);
  assert.equal(c.status, 'validated');
  assert.equal(c.candidate_fix.sha256, sha(readFileSync(s.patch)));
  const v = c.validation;
  assert.equal(v.passed, true);
  assert.equal(v.target.status, 'fixed');
  assert.deepEqual(v.compatibility.identical, ['201', '202']);
  assert.deepEqual(v.compatibility.different, []);
  assert.equal(v.compatibility.errors.length, 0);
  assert.equal(v.tests.exit, 0);
  assert.deepEqual(v.accuracy, { status: 'unknown', reason: 'no independent labels' });
  assert.equal(v.comparison.same_snapshot_across_engines, 'done');
  assert.match(v.comparison.same_engine_across_snapshots, /^unverified: website-change comparison/);
  assert.deepEqual(v.unexplained, []);
  assert.doesNotMatch(JSON.stringify(c), /https?:\/\//);
  const again = validate(s);
  assert.equal(again.out.already, true);
});

test('validate: an untargeted differing key is unexplained and blocks validated', (t) => {
  const s = setup(t, { fixed: { n: 2, extra: 'other' } });
  const r = validate(s);
  assert.equal(r.status, 0, r.stderr);
  const c = state(s), v = c.validation;
  assert.equal(c.status, 'candidate');
  assert.equal(v.passed, false);
  assert.equal(v.target.status, 'fixed');
  assert.deepEqual(v.compatibility.different.map((d) => [d.id, d.keys]), [['201', ['other']], ['202', ['other']]]);
  assert.deepEqual(v.unexplained, ['other', 'field:remediation', 'engine fingerprint unchanged despite behavior change']);
});

test('validate: target not fixed (fresh count still differs) fails', (t) => {
  const s = setup(t, { fixed: { n: 3 } });
  validate(s);
  const v = state(s).validation;
  assert.equal(v.target.status, 'not-fixed');
  assert.equal(v.passed, false);
  // findings differ only in the targeted key: summary and remediation follow, so they are explained;
  // the counts changed under an unchanged fingerprint, which is the only unexplained item
  assert.deepEqual(v.compatibility.different[0].unexplained, ['engine fingerprint unchanged despite behavior change']);
  assert.ok(v.compatibility.different[0].explained.length > 0);
});

test('validate: failing worktree tests fail validation and record the exit code', (t) => {
  const s = setup(t, { testBody: 'assert.equal(1, 2);' });
  validate(s);
  const v = state(s).validation;
  assert.notEqual(v.tests.exit, 0);
  assert.equal(v.passed, false);
  assert.equal(v.target.status, 'fixed');
});

test('validate: labels report agreement per key; without labels accuracy stays unknown', (t) => {
  const s = setup(t);
  const labels = join(s.root, 'labels.json');
  json(labels, { labels: [
    { id: '201', key: 'img-alt', verdict: 'correct', basis: 'manual', by: 'owner' },
    { id: '202', key: 'img-alt', verdict: 'incorrect', basis: 'manual', by: 'owner' },
  ] });
  validate(s, ['--labels', labels]);
  const a = state(s).validation.accuracy;
  assert.equal(a.status, 'labelled');
  assert.deepEqual(a.keys['img-alt'], { n: 2, correct: 1, incorrect: 1, agreement: 0.5 });
  assert.equal('improved' in a, false);
});

test('validate: refuses without a registered patch, or a worktree without the scanner (exit 2)', (t) => {
  const s = setup(t);
  assert.equal(cli(s.cfg, ['validate', '--candidate', s.id, '--worktree', s.wt]).status, 2);
  assert.equal(state(s).status, 'reproduced');
  const r = cli(s.cfg, ['validate', '--candidate', s.id, '--worktree', join(s.root, 'nowhere'), '--patch', s.patch]);
  assert.equal(r.status, 2);
});

test('--write-ops changes exactly the triage issues file and the improvement summary; default changes nothing', (t) => {
  const s = setup(t);
  const before = tree(s.ops);
  validate(s, [], {});
  assert.deepEqual(tree(s.ops), before);
  const s2 = setup(t);
  const b2 = new Map(tree(s2.ops));
  const r = validate(s2, ['--write-ops']);
  assert.equal(r.status, 0, r.stderr);
  const changed = tree(s2.ops).filter(([p, h]) => b2.get(p) !== h).map(([p]) => p.slice(s2.ops.length + 1));
  assert.deepEqual(changed, [`quality/improvement/${s2.id}.json`, 'quality/issues.json']);
  const issue = JSON.parse(readFileSync(join(s2.ops, 'quality', 'issues.json'))).issues[0];
  assert.equal(issue.status, 'reproduced');
  assert.match(issue.note, new RegExp(`improvement ${s2.id}: reproduced 2026-10-20; validation passed`));
});

// ---- record without yume -> awaiting-review --------------------------------

test('record: needs validated; without yume config experience is skipped visibly and the candidate awaits review', (t) => {
  const s = setup(t);
  assert.equal(cli(s.cfg, ['record', '--candidate', s.id]).status, 2);
  validate(s);
  const r = cli(s.cfg, ['record', '--candidate', s.id]);
  assert.equal(r.status, 0, r.stderr);
  const c = state(s);
  assert.equal(c.status, 'awaiting-review');
  assert.equal(c.experience.status, 'skipped');
  assert.match(c.experience.reason, /yume/);
  assert.equal(cli(s.cfg, ['record', '--candidate', s.id]).out.already, true);
});

test('publish: without a publish config the loop refuses visibly (exit 2), state unchanged', (t) => {
  const s = setup(t);
  const manifest = join(s.root, 'm.json');
  json(manifest, { candidate: s.id, files: [] });
  const r = cli(s.cfg, ['publish', '--manifest', manifest, '--out', join(s.root, 'out')]);
  assert.equal(r.status, 2);
  assert.match(r.out.error, /publish/);
  assert.deepEqual(state(s).receipts, []);
});

// ---- review fixes: I5 / I6 / medium ------------------------------------------

test('I5: a legal_risk-only difference is unexplained and blocks; an unknown metadata key too', (t) => {
  const s = setup(t, { fixed: { n: 2, legal: true } });
  validate(s);
  const v = state(s).validation;
  assert.deepEqual(v.unexplained, ['field:legal_risk']);
  assert.equal(v.passed, false);
  const s2 = setup(t, { fixed: { n: 2, meta: true } });
  validate(s2);
  assert.deepEqual(state(s2).validation.unexplained, ['metadata:foo']);
});

test('I5: an engine_fingerprint change alone is explained and does not block', (t) => {
  const s = setup(t, { fixed: { n: 2, fp: 'fake@2' } });
  validate(s);
  const c = state(s);
  assert.equal(c.validation.passed, true);
  assert.deepEqual(c.validation.compatibility.different.map((d) => [d.id, d.unexplained]), [['201', []], ['202', []]]);
  assert.ok(c.validation.compatibility.different[0].explained.some((e) => /engine_fingerprint/.test(e)));
  assert.equal(c.validation.engine.fresh_engine_fingerprint, 'fake@2');
});

test('I6: validation records worktree, git revision, scanner hash and fresh fingerprint', (t) => {
  const s = setup(t, { git: true });
  validate(s);
  const e = state(s).validation.engine;
  assert.equal(e.worktree, s.wt);
  assert.equal(e.git_rev, spawnSync('git', ['-C', s.wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim());
  assert.equal(e.scanner_sha256, sha(readFileSync(join(s.wt, 'core', 'scripts', 'static-audit.mjs'))));
  assert.equal(e.fresh_engine_fingerprint, 'fake@1');
  const s2 = setup(t);
  validate(s2);
  assert.equal(state(s2).validation.engine.git_rev, null);
});

test('I6: patch_bound is true when the worktree contains the patch, false blocks validation', (t) => {
  const s = setup(t);
  validate(s);
  assert.equal(state(s).candidate_fix.patch_bound, true);
  const s2 = setup(t, { unbound: true });
  validate(s2);
  const c = state(s2);
  assert.equal(c.candidate_fix.patch_bound, false);
  assert.equal(c.validation.target.status, 'fixed');
  assert.equal(c.validation.passed, false);
  assert.equal(c.status, 'candidate');
});

test('M1: --write-ops on an already validated candidate performs the ops write', (t) => {
  const s = setup(t);
  validate(s);
  const before = new Map(tree(s.ops));
  const r = validate(s, ['--write-ops']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.already, true);
  const changed = tree(s.ops).filter(([p, h]) => before.get(p) !== h).map(([p]) => p.slice(s.ops.length + 1));
  assert.deepEqual(changed, [`quality/improvement/${s.id}.json`, 'quality/issues.json']);
  const snap = tree(s.ops);
  validate(s, ['--write-ops']);
  assert.deepEqual(tree(s.ops), snap);
});

test('M2: publish replays a receipt with the same manifest instead of publishing again', (t) => {
  const s = setup(t);
  validate(s);
  cli(s.cfg, ['record', '--candidate', s.id]);
  const file = join(s.config.state, 'candidates', `${s.id}.json`);
  json(file, { ...state(s), review: { approved_by: 'owner' } });
  json(s.cfg, { ...s.config, publish: { allow: ['core/**'], denyRoots: ['<ops>', '<evidence>', '<state>'] } });
  const manifest = join(s.root, 'm.json');
  json(manifest, { candidate: s.id, files: [{ from: 'core/scripts/static-audit.mjs', to: 'core/audit.mjs' }] });
  const out = join(s.root, 'out');
  const r1 = cli(s.cfg, ['publish', '--manifest', manifest, '--out', out]);
  assert.equal(r1.status, 0, r1.stderr);
  const out2 = join(s.root, 'out2');
  const r2 = cli(s.cfg, ['publish', '--manifest', manifest, '--out', out2]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(r2.out.replayed, true);
  assert.equal(state(s).receipts.length, 1);
  assert.equal(readdirSync(s.root).includes('out2'), false, 'nothing copied on replay');
});

test('D3: --labels on an already validated candidate recomputes only accuracy, same shape as first time', (t) => {
  const s = setup(t);
  validate(s);
  const first = state(s).validation;
  const labels = join(s.root, 'labels.json');
  json(labels, { labels: [
    { id: '201', key: 'img-alt', verdict: 'correct', basis: 'manual', by: 'owner' },
    { id: '202', key: 'img-alt', verdict: 'incorrect', basis: 'manual', by: 'owner' },
  ] });
  const r = validate(s, ['--labels', labels]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.already, true);
  const v = state(s).validation;
  assert.deepEqual(v.accuracy.keys['img-alt'], { n: 2, correct: 1, incorrect: 1, agreement: 0.5 });
  assert.deepEqual({ ...v, accuracy: null }, { ...first, accuracy: null });
  assert.deepEqual(r.out.validation.accuracy, v.accuracy);
  // same result as labelling on the first validation
  const s2 = setup(t);
  validate(s2, ['--labels', labels]);
  assert.deepEqual(state(s2).validation.accuracy, v.accuracy);
  // replay with --write-ops after labels still writes the two ops paths
  assert.equal(validate(s, ['--labels', labels, '--write-ops']).out.ops.summary, `quality/improvement/${s.id}.json`);
});
