import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { recordExperience, experienceIds, experienceScope, experienceLocator } from '../tools/improvement/experience.mjs';

const FAKE_CLI = `
import fs from 'node:fs';
import crypto from 'node:crypto';
const NL = String.fromCharCode(10);
const argv = process.argv.slice(2);
const i = argv.indexOf('--store');
const rest = argv.filter((_, k) => k !== i && k !== i + 1);
const flag = (n) => { const k = rest.indexOf(n); return k < 0 ? null : rest[k + 1]; };
const step = rest[0] === 'dream' ? 'dream-' + rest[1] : rest[0];
const entry = { argv, step, cwd: process.cwd(), py: process.env.PYTHONDONTWRITEBYTECODE };
const file = flag('--file');
if (file) entry.file = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(entry) + NL);
const SF = process.env.FAKE_STATE;
const st = fs.existsSync(SF) ? JSON.parse(fs.readFileSync(SF, 'utf8')) : { locators: {}, exps: {}, packets: [], claims: {}, ops: {}, dreams: {} };
const out = (code, obj) => { fs.writeFileSync(SF, JSON.stringify(st)); console.log(JSON.stringify(obj)); process.exit(code); };
const op = flag('--operation-id');
const remember = (res) => { if (op) st.ops[op] = res; return res; };
const h = (x) => crypto.createHash('sha256').update(x).digest('hex');
const queue = () => ({ pending: st.packets.filter((p) => p.state === 'pending').length, done: st.packets.filter((p) => p.state === 'done').length });
const render = (p) => ({ status: 'ready', packet: { id: p.id, experience_ids: p.exp }, material: { experiences: p.exp.map((id) => ({ id })) } });
if (process.env.FAKE_FAIL_STEP === step) {
  console.error('error: boom');
  if (process.env.FAKE_FAIL_CODE === 'none') process.exit(Number(process.env.FAKE_FAIL_EXIT || 2));
  out(Number(process.env.FAKE_FAIL_EXIT || 2), { error: process.env.FAKE_FAIL_CODE || 'bad_input' });
}
if (step === 'status' && !rest.includes('--pending')) {
  if (process.env.FAKE_STORE === 'missing') out(2, { error: 'store_missing' });
  out(0, { schema_version: Number(process.env.FAKE_FORMAT || 3), store: 'initialized', queue: queue() });
}
if (step === 'status') {
  out(0, { candidates: Object.values(st.dreams).filter((d) => d.candidate).map((d) => ({ lesson_id: d.candidate.id, dream_id: d.id })), queue: queue() });
}
if (step === 'ingest') {
  const root = flag('--source-root');
  for (const [loc, rel] of Object.entries(entry.file.local_map)) {
    if (st.locators[loc] && st.locators[loc] !== root) out(3, { error: 'id_conflict' });
    st.locators[loc] = root;
    fs.readFileSync(root + '/' + rel);
  }
  for (const e of entry.file.experiences) st.exps[e.id] = { scope: e.scope_id };
  const loc = Object.keys(entry.file.local_map)[0];
  const sha = h(fs.readFileSync(st.locators[loc] + '/' + entry.file.local_map[loc]));
  out(0, { status: 'ingested', experiences: entry.file.experiences.map((e) => ({ id: e.id })), refs: [{ locator_id: loc, source_revision: 'sha256:' + sha }] });
}
if (step === 'prepare') {
  if (op && st.ops[op]) out(0, st.ops[op]);
  const scope = flag('--scope');
  const held = new Set(st.packets.flatMap((p) => p.exp));
  const fresh = Object.keys(st.exps).filter((id) => st.exps[id].scope === scope && !held.has(id));
  if (!fresh.length) out(0, remember({ status: 'no_new_material', packet_ids: [] }));
  const per = Number(flag('--max-experiences') || 1000);
  const made = [];
  for (let k = 0; k < fresh.length; k += per) {
    const exp = fresh.slice(k, k + per);
    const p = { id: 'qpk_' + h(exp.join()).slice(0, 16), scope, exp, state: 'pending' };
    st.packets.push(p);
    made.push(p.id);
  }
  out(0, remember({ status: 'queued', packet_ids: made }));
}
if (step === 'dream-begin') {
  if (op && st.ops[op]) {
    const r = st.ops[op];
    if (st.claims[r.claim_id].state !== 'open') out(3, { error: 'claim_released' });
    out(0, r);
  }
  if (Object.values(st.claims).some((c) => c.state === 'open')) out(3, { error: 'dream_in_progress' });
  const ps = st.packets.filter((x) => x.state === 'pending').slice(0, Number(flag('--max') || 3));
  if (!ps.length) out(0, { status: 'nothing_to_dream' });
  const claim_id = 'clm_' + h(op || 'x').slice(0, 16);
  st.claims[claim_id] = { state: 'open', packets: ps.map((x) => x.id) };
  out(0, remember({ status: 'claimed', claim_id, packets: ps.map(render) }));
}
if (step === 'record') {
  const d = entry.file;
  const c = st.claims[d.claim_id];
  if (!c || c.state !== 'open') out(3, { error: 'claim_released' });
  if (st.ops[d.operation_id]) out(0, st.ops[d.operation_id]);
  const p = st.packets.find((x) => x.id === d.packet_id);
  if (!p || p.state !== 'pending' || !c.packets.includes(p.id)) out(2, { error: 'illegal_state' });
  st.dreams[d.id] = d;
  p.state = 'done';
  st.ops[d.operation_id] = { status: 'recorded' };
  out(0, st.ops[d.operation_id]);
}
if (step === 'dream-end') {
  const c = st.claims[flag('--claim')];
  if (!c || c.state !== 'open') out(3, { error: 'claim_released' });
  c.state = 'ended';
  out(0, remember({ status: 'ended' }));
}
out(2, { error: 'unexpected_step' });
`;

const ID_RE = /^(exp|evr|drm|lsn)_[a-z0-9]{12,32}$/;
const OP_RE = /^op_[a-z0-9_-]{6,64}$/;

const OPS = (c) => c.operations;
let tmp, log, config, stateFile;
const evOf = (id) => path.join(tmp, 'evidence', id);
const candidate = (over = {}) => ({
  id: 'cand_0123456789abcdef',
  signature: 'rules-diff:Image-Alt',
  class: 'engine',
  status: 'validated',
  observation: { date: '2026-10-20', examples: ['ex1', 'ex2'], count: 7, engine_fingerprints: ['fp-a', 'fp-b'] },
  validation: { passed: true, target: { status: 'fixed' }, accuracy: { status: 'unknown' } },
  ...over,
});
const A = candidate();
const B = candidate({ id: 'cand_bbbbbbbbbbbbbbbb', signature: 'rules-diff:Link-Name' });
const rec = (c, previous) => recordExperience({ config, candidate: c, evidenceDir: evOf(c.id), previous });
const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l)) : []);
const clearLog = () => fs.writeFileSync(log, '');
const readState = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const seed = (patch) => fs.writeFileSync(stateFile, JSON.stringify({ locators: {}, exps: {}, packets: [], claims: {}, ops: {}, dreams: {}, ...patch }));
const steps = () => calls().map((x) => x.step);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-exp-'));
  fs.writeFileSync(path.join(tmp, 'fake-yume.mjs'), FAKE_CLI);
  log = path.join(tmp, 'calls.log');
  stateFile = path.join(tmp, 'fake-state.json');
  fs.mkdirSync(path.join(tmp, 'yume-repo'));
  config = {
    yume: {
      repo: path.join(tmp, 'yume-repo'), store: path.join(tmp, 'store'), actor: 'beacon-improvement',
      scope: 'beacon-improvement', command: [process.execPath, path.join(tmp, 'fake-yume.mjs')],
    },
  };
  process.env.FAKE_LOG = log;
  process.env.FAKE_STATE = stateFile;
  for (const k of ['FAKE_FAIL_STEP', 'FAKE_FAIL_EXIT', 'FAKE_FAIL_CODE', 'FAKE_STORE', 'FAKE_FORMAT']) delete process.env[k];
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('records the full sequence with deterministic ids and never decides', async () => {
  const r = await rec(A);
  assert.equal(r.status, 'recorded');
  assert.equal(r.attempt, 1);
  assert.deepEqual(steps(), ['status', 'ingest', 'prepare', 'dream-begin', 'record', 'dream-end', 'status']);
  for (const x of calls()) {
    assert.equal(x.argv[0], '--store');
    assert.equal(x.argv[1], config.yume.store);
    assert.equal(x.cwd, fs.realpathSync(config.yume.repo));
    assert.equal(x.py, '1');
    assert.ok(!x.argv.some((a) => ['decide', 'forget', 'recover', 'retire', 'init', 'upgrade', '--force'].includes(a)), x.argv.join(' '));
  }
  for (const id of [r.ids.experience, r.ids.evidence, r.ids.dream, r.ids.lesson]) assert.match(id, ID_RE);
  for (const op of Object.values(OPS(r))) assert.match(op, OP_RE);
  assert.deepEqual(r.pending_candidates, [{ lesson_id: r.ids.lesson, dream_id: r.ids.dream }]);
  assert.deepEqual(r.queue, { pending: 0, done: 1 });
});

test('dream record is schema 3, per-candidate locator and scope, re-cites the stored revision', async () => {
  const r = await rec(A);
  const text = fs.readFileSync(path.join(evOf(A.id), 'experience', 'evidence.txt'));
  const sha = 'sha256:' + crypto.createHash('sha256').update(text).digest('hex');
  const c = calls();
  const ingest = c.find((x) => x.step === 'ingest');
  assert.equal(ingest.argv[ingest.argv.indexOf('--source-root') + 1], path.join(evOf(A.id), 'experience'));
  const loc = experienceLocator(A.id);
  assert.notEqual(loc, 'beacon-experience');
  assert.deepEqual(Object.keys(ingest.file.local_map), [loc]);
  assert.ok(Object.values(ingest.file.local_map).every((p) => !path.isAbsolute(p)));
  assert.equal(ingest.file.experiences[0].evidence_refs[0].locator_id, loc);
  const scope = experienceScope(config.yume.scope, A.signature);
  assert.match(scope, /^[a-z0-9][a-z0-9_.:-]{0,63}$/);
  const prep = c.find((x) => x.step === 'prepare');
  assert.ok(prep.argv.includes('--auto-split'));
  assert.equal(prep.argv[prep.argv.indexOf('--max-experiences') + 1], '1');
  assert.equal(prep.argv[prep.argv.indexOf('--scope') + 1], scope);
  assert.equal(prep.argv[prep.argv.indexOf('--question') + 1], 'rules-diff:Image-Alt: does the fix hold?');
  const begin = c.find((x) => x.step === 'dream-begin');
  assert.deepEqual(begin.argv.slice(begin.argv.indexOf('--max'), begin.argv.indexOf('--max') + 6),
    ['--max', '10', '--actor-type', 'agent', '--actor', 'beacon-improvement']);
  const d = c.find((x) => x.step === 'record').file;
  assert.equal(d.schema_version, 3);
  assert.equal(d.kind, 'dream');
  assert.equal(d.id, r.ids.dream);
  assert.equal(d.scope_id, scope);
  assert.equal(d.disposition, 'propose');
  assert.equal(d.model, null);
  assert.equal(d.tokens, null);
  assert.ok(d.limitations.length > 0);
  assert.equal(d.candidate.id, r.ids.lesson);
  assert.equal(d.candidate.evidence_refs[0].source_revision, sha);
  assert.equal(d.candidate.evidence_refs[0].locator_id, loc);
  assert.equal(d.claim_id, r.ids.claim_id);
  assert.equal(d.packet_id, r.ids.packet_id);
});

test('evidence text carries no url or absolute path and writes stay under experience/', async () => {
  await rec(A);
  const dir = path.join(evOf(A.id), 'experience');
  const text = fs.readFileSync(path.join(dir, 'evidence.txt'), 'utf8');
  assert.ok(!/https?:\/\//.test(text));
  assert.ok(!text.includes(tmp));
  assert.match(text, /ex1/);
  assert.match(text, /fp-a/);
  assert.deepEqual(fs.readdirSync(evOf(A.id)), ['experience']);
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.next')));
});

test('evidence text renders the real validation shape', async () => {
  const validation = {
    passed: true, target: { status: 'fixed', detail: [] },
    compatibility: { identical: ['a'], different: [{ id: 'b' }, { id: 'c' }], errors: [] },
    accuracy: { status: 'unknown' }, unexplained: [],
  };
  await rec(candidate({ validation }));
  const text = fs.readFileSync(path.join(evOf(A.id), 'experience', 'evidence.txt'), 'utf8');
  assert.match(text, /validation_target: fixed/);
  assert.match(text, /validation_compatibility: identical=1 different=2 errors=0/);
  assert.match(text, /validation_accuracy: unknown/);
});

test('unvalidated candidate yields inconclusive with no lesson candidate', async () => {
  const r = await rec(candidate({ validation: { passed: false } }));
  assert.equal(r.status, 'recorded');
  assert.equal(r.ids.lesson, null);
  const d = calls().find((x) => x.step === 'record').file;
  assert.equal(d.disposition, 'inconclusive');
  assert.ok(!('candidate' in d));
});

test('replay of a finished propose run is confirmed by our dream id; nothing is written again', async () => {
  const first = await rec(A);
  clearLog();
  const again = await rec(A);
  assert.equal(again.status, 'recorded');
  assert.equal(again.replayed, true);
  assert.deepEqual(again.ids.dream, first.ids.dream);
  assert.ok(!steps().some((s) => s === 'record' || s === 'dream-end'));
});

test('a finished inconclusive run cannot be confirmed and is not reported as a replay', async () => {
  const c = candidate({ validation: { passed: false } });
  await rec(c);
  const again = await rec(c);
  assert.equal(again.status, 'failed');
  assert.equal(again.error, 'no_dream_recorded');
  assert.equal(again.retry_eligible, true);
});

test('first-run nothing_to_dream is a failure, not a recorded result', async () => {
  const ids = experienceIds(A.id);
  seed({ exps: { [ids.experience]: { scope: experienceScope(config.yume.scope, A.signature) } }, packets: [{ id: 'qpk_done000000001', scope: 's', exp: [ids.experience], state: 'done' }] });
  const r = await rec(A);
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'no_dream_recorded');
  assert.equal(r.retry_eligible, true);
  assert.ok(!steps().includes('record'));
});

test('foreign pending packets ahead of ours are left pending; only ours is dreamed', async () => {
  seed({ packets: [
    { id: 'qpk_foreign0000001', scope: 'other', exp: ['exp_ffffffffffffffff'], state: 'pending' },
    { id: 'qpk_foreign0000002', scope: 'other', exp: ['exp_eeeeeeeeeeeeeeee'], state: 'pending' },
  ] });
  const r = await rec(A);
  assert.equal(r.status, 'recorded', JSON.stringify(r));
  const d = calls().find((x) => x.step === 'record').file;
  assert.equal(d.packet_id, r.ids.packet_id);
  assert.ok(!['qpk_foreign0000001', 'qpk_foreign0000002'].includes(d.packet_id));
  const left = readState().packets.filter((p) => p.state === 'pending').map((p) => p.id).sort();
  assert.deepEqual(left, ['qpk_foreign0000001', 'qpk_foreign0000002']);
  assert.equal(r.queue.pending, 2);
});

test('ours not delivered: claim released, packet_not_delivered, recoverable after draining', async () => {
  config.yume.maxPackets = 1;
  seed({ packets: [{ id: 'qpk_foreign0000001', scope: 'other', exp: ['exp_ffffffffffffffff'], state: 'pending' }] });
  const f = await rec(A);
  assert.equal(f.status, 'failed');
  assert.equal(f.step, 'dream-begin');
  assert.equal(f.error, 'packet_not_delivered');
  assert.equal(f.retry_eligible, true);
  assert.deepEqual(f.delivered_packets, ['qpk_foreign0000001']);
  assert.equal(f.queue.pending, 2);
  assert.ok(steps().includes('dream-end'));
  assert.ok(!steps().includes('record'));
  assert.equal(readState().packets.find((p) => p.id === 'qpk_foreign0000001').state, 'pending');
  // owner drains the foreign packet; the retry uses a fresh begin and succeeds
  const st = readState();
  st.packets.find((p) => p.id === 'qpk_foreign0000001').state = 'done';
  fs.writeFileSync(stateFile, JSON.stringify(st));
  const r = await rec(A, f);
  assert.equal(r.status, 'recorded', JSON.stringify(r));
  assert.equal(r.attempt, 2);
});

test('a packet that mixes ours with another experience is not ours', async () => {
  const ids = experienceIds(A.id);
  seed({
    exps: { [ids.experience]: { scope: 's' } },
    packets: [{ id: 'qpk_mixed0000000001', scope: 's', exp: [ids.experience, 'exp_ffffffffffffffff'], state: 'pending' }],
  });
  const r = await rec(A);
  assert.equal(r.error, 'packet_not_delivered');
  assert.ok(!steps().includes('record'));
});

test('crash after ingest does not wedge the same signature', async () => {
  const A2 = candidate({ id: 'cand_a2a2a2a2a2a2a2a2', supersedes: A.id });
  process.env.FAKE_FAIL_STEP = 'prepare';
  process.env.FAKE_FAIL_EXIT = '3';
  const crashed = await rec(A);
  assert.equal(crashed.step, 'prepare');
  delete process.env.FAKE_FAIL_STEP;
  const r2 = await rec(A2);
  assert.equal(r2.status, 'recorded', JSON.stringify(r2));
  const r1 = await rec({ ...A, experience: crashed });
  assert.equal(r1.status, 'recorded', JSON.stringify(r1));
  const b = await rec(B);
  assert.equal(b.status, 'recorded');
  assert.equal(readState().packets.filter((p) => p.state === 'pending').length, 0);
  assert.equal(b.pending_candidates.length, 3);
});

test('two candidates share one store: both recorded, both replay', async () => {
  const a = await rec(A);
  const b = await rec(B);
  assert.equal(a.status, 'recorded');
  assert.equal(b.status, 'recorded', JSON.stringify(b));
  assert.notEqual(a.ids.dream, b.ids.dream);
  clearLog();
  const a2 = await rec(A);
  const b2 = await rec(B);
  assert.deepEqual([a2.status, a2.replayed, b2.status, b2.replayed], ['recorded', true, 'recorded', true]);
  assert.equal(b2.pending_candidates.length, 2);
  assert.ok(!steps().includes('record'));
});

test('same signature shares a scope, different signatures do not', async () => {
  const sc = (sig) => experienceScope('beacon-improvement', sig);
  assert.equal(sc('rules-diff:Image-Alt'), 'beacon-improvement:rules-diff-image-alt');
  assert.equal(sc('rules-diff:Image-Alt'), sc('rules-diff:image_alt'));
  assert.notEqual(sc('rules-diff:Image-Alt'), sc('rules-diff:Link-Name'));
  assert.match(sc('x'.repeat(200)), /^[a-z0-9][a-z0-9_.:-]{0,63}$/);
  const A2 = candidate({ id: 'cand_a2a2a2a2a2a2a2a2', supersedes: A.id });
  await rec(A);
  const r2 = await rec(A2);
  assert.equal(r2.status, 'recorded', JSON.stringify(r2));
  const scopes = new Set(Object.values(readState().exps).map((e) => e.scope));
  assert.equal(scopes.size, 1);
});

test('a transient begin failure is retried with a fresh begin operation', async () => {
  process.env.FAKE_FAIL_STEP = 'dream-begin';
  process.env.FAKE_FAIL_EXIT = '3';
  process.env.FAKE_FAIL_CODE = 'dream_in_progress';
  const f = await rec(A);
  assert.equal(f.status, 'failed');
  assert.equal(f.step, 'dream-begin');
  assert.equal(f.attempt, 1);
  delete process.env.FAKE_FAIL_STEP;
  const r = await rec(A, f);
  assert.equal(r.status, 'recorded');
  assert.equal(r.attempt, 2);
  assert.notEqual(OPS(r).begin, OPS(f).begin);
});

for (const failing of ['record', 'dream-end']) {
  test(`failure at ${failing} keeps claim ids and the retry resumes without a new begin`, async () => {
    process.env.FAKE_FAIL_STEP = failing;
    process.env.FAKE_FAIL_EXIT = '4';
    const f = await rec(A);
    assert.equal(f.status, 'failed');
    assert.equal(f.step, failing);
    assert.match(f.ids.claim_id, /^clm_/);
    assert.match(f.ids.packet_id, /^qpk_/);
    delete process.env.FAKE_FAIL_STEP;
    clearLog();
    // the cli stores the failure on the candidate; previous defaults to candidate.experience
    const r = await rec({ ...A, experience: f });
    assert.equal(r.status, 'recorded');
    assert.ok(!steps().includes('dream-begin'));
    assert.ok(steps().includes('record'));
    assert.ok(steps().includes('dream-end'));
    assert.equal(r.ids.dream, experienceIds(A.id).dream);
    assert.equal(OPS(r).end, OPS(f).end);
    assert.ok(readState().dreams[r.ids.dream]);
  });
}

for (const [exit, retry] of [[2, false], [3, true], [4, true]]) {
  test(`failure at prepare exit ${exit} is recorded, retry_eligible=${retry}, nothing invented`, async () => {
    process.env.FAKE_FAIL_STEP = 'prepare';
    process.env.FAKE_FAIL_EXIT = String(exit);
    process.env.FAKE_FAIL_CODE = 'operation_conflict';
    const r = await rec(A);
    assert.equal(r.status, 'failed');
    assert.equal(r.step, 'prepare');
    assert.equal(r.exit, exit);
    assert.equal(r.error, 'operation_conflict');
    assert.equal(r.retry_eligible, retry);
    assert.equal(r.ids.dream, null);
    assert.equal(r.pending_candidates, undefined);
    assert.equal(steps().at(-1), 'prepare');
    assert.ok(!steps().includes('record'));
  });
}

test('failure with no json falls back to stderr text', async () => {
  process.env.FAKE_FAIL_STEP = 'ingest';
  process.env.FAKE_FAIL_CODE = 'none';
  const r = await rec(A);
  assert.equal(r.status, 'failed');
  assert.equal(r.step, 'ingest');
  assert.match(r.error, /boom/);
});

test('the loop never provisions the store; a store below format 3 or missing fails the precheck', async () => {
  process.env.FAKE_FORMAT = '2';
  let r = await rec(A);
  assert.deepEqual([r.status, r.step, r.error, r.retry_eligible], ['failed', 'precheck', 'store_format_2', false]);
  delete process.env.FAKE_FORMAT;
  process.env.FAKE_STORE = 'missing';
  r = await rec(A);
  assert.deepEqual([r.status, r.step, r.error, r.retry_eligible], ['failed', 'precheck', 'store_missing', false]);
  assert.deepEqual(steps(), ['status', 'status']);
});

test('missing command binary is a failed result, not a throw', async () => {
  config.yume.command = [path.join(tmp, 'does-not-exist')];
  const r = await rec(A);
  assert.equal(r.status, 'failed');
  assert.equal(r.exit, null);
  assert.equal(r.retry_eligible, false);
});

test('without yume config the experience is skipped with a reason', async () => {
  const r = await recordExperience({ config: {}, candidate: A, evidenceDir: evOf(A.id) });
  assert.equal(r.status, 'skipped');
  assert.match(r.reason, /yume/);
  assert.ok(!fs.existsSync(evOf(A.id)));
});
