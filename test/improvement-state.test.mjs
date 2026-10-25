// Beacon · improvement loop state layer: atomic writes, transition guards, lock, evidence digests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  atomicWrite, newCandidate, transition, terminate, acquireLock, verifyEvidence, evidenceDigest, sha256,
} from '../tools/improvement/state.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../tools/improvement/cli.mjs');
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'improve-state-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const base = () => newCandidate({ id: 'cand_0123456789abcdef', signature: 'rules-diff:img-alt', cls: 'engine', supersedes: null, observation: { date: '2026-10-20', examples: ['201'], count: 3, engine_fingerprints: ['fake@1'] }, source_revision: 'r', at: 't0' });

test('atomicWrite replaces content and leaves no .next file', (t) => {
  const d = tmp(t), f = join(d, 'sub', 'a.json');
  atomicWrite(f, { a: 1 });
  atomicWrite(f, { a: 2 });
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { a: 2 });
  assert.deepEqual(readdirSync(join(d, 'sub')), ['a.json']);
});

test('transition: each step demands its evidence and returns a new object', () => {
  const c0 = base();
  assert.throws(() => transition(c0, 'prepared'), /evidence\.digest/);
  const c1 = transition({ ...c0, evidence: { dir: 'x', digest: 'd', files: [] } }, 'prepared', 'frozen', 't1');
  assert.equal(c0.status, 'observed');
  assert.equal(c1.status, 'prepared');
  assert.deepEqual(c1.history.at(-1), { at: 't1', from: 'observed', to: 'prepared', reason: 'frozen' });
  assert.throws(() => transition({ ...c1, reproduction: { reproduced: false } }, 'reproduced'), /reproduced === true/);
  const c2 = transition({ ...c1, reproduction: { reproduced: true } }, 'reproduced');
  assert.throws(() => transition(c2, 'candidate'), /candidate_fix/);
  const c3 = transition({ ...c2, candidate_fix: { patch: 'p', sha256: 's', notes: '' } }, 'candidate');
  assert.throws(() => transition({ ...c3, validation: { passed: false } }, 'validated'), /validation\.passed/);
  const c4 = transition({ ...c3, validation: { passed: true } }, 'validated');
  assert.throws(() => transition(c4, 'awaiting-review'), /experience\.status/);
  assert.throws(() => transition({ ...c4, experience: { status: 'pending' } }, 'awaiting-review'), /experience\.status/);
  for (const s of ['recorded', 'skipped', 'failed']) assert.equal(transition({ ...c4, experience: { status: s } }, 'awaiting-review').status, 'awaiting-review');
});

test('transition: no skipping, no going back, published/deployed are never statuses', () => {
  const c = base();
  assert.throws(() => transition({ ...c, validation: { passed: true } }, 'validated'), /illegal transition/);
  assert.throws(() => transition(c, 'published'), /illegal transition/);
  assert.throws(() => transition(c, 'deployed'), /illegal transition/);
  assert.throws(() => transition({ ...c, status: 'validated' }, 'observed'), /illegal transition/);
});

test('terminate: blocked/failed/excluded keep reason and retry flag; settled states cannot be terminated', () => {
  const b = terminate(base(), 'blocked', { reason: 'not reproduced', retry_eligible: false }, 't2');
  assert.equal(b.status, 'blocked');
  assert.deepEqual(b.blocked, { reason: 'not reproduced', retry_eligible: false });
  assert.equal(b.history.at(-1).to, 'blocked');
  assert.throws(() => terminate({ ...base(), status: 'validated' }, 'failed', { reason: 'x', retry_eligible: true }), /illegal/);
  assert.throws(() => terminate(base(), 'validated', { reason: 'x', retry_eligible: false }), /illegal/);
});

test('lock: second acquire is refused with the holder; release frees it', (t) => {
  const d = tmp(t);
  const l = acquireLock(d);
  assert.throws(() => acquireLock(d), (e) => e.exit === 3 && e.extra.holder.pid === process.pid && e.extra.stale === false);
  l.release();
  acquireLock(d).release();
});

test('lock: a second process gets exit 3 and the holder', (t) => {
  const d = tmp(t), cfg = join(d, 'config.json');
  for (const k of ['ops', 'state', 'evidence', 'repo']) mkdirSync(join(d, k));
  writeFileSync(cfg, JSON.stringify({ ops: join(d, 'ops'), state: join(d, 'state'), evidence: join(d, 'evidence'), beaconRepo: join(d, 'repo') }));
  const l = acquireLock(join(d, 'state'));
  const p = spawnSync(process.execPath, [CLI, 'select', '--config', cfg], { encoding: 'utf8' });
  l.release();
  assert.equal(p.status, 3);
  assert.equal(JSON.parse(p.stdout).holder.pid, process.pid);
});

test('lock: stale holder is reported, never stolen; --break-stale-lock removes it and logs a receipt', (t) => {
  const d = tmp(t);
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
  mkdirSync(join(d, '.lock'));
  writeFileSync(join(d, '.lock', 'holder.json'), JSON.stringify({ pid: Number(dead), started: 'long ago' }));
  assert.throws(() => acquireLock(d), (e) => e.exit === 3 && e.extra.stale === true);
  assert.ok(existsSync(join(d, '.lock')), 'stale lock must remain');
  const l = acquireLock(d, { breakStale: true });
  const receipt = JSON.parse(readFileSync(join(d, 'lock-receipts.jsonl'), 'utf8').trim());
  assert.equal(receipt.action, 'break-stale-lock');
  assert.equal(receipt.holder.pid, Number(dead));
  l.release();
});

test('lock: --break-stale-lock never breaks a live holder', (t) => {
  const d = tmp(t);
  const l = acquireLock(d);
  assert.throws(() => acquireLock(d, { breakStale: true }), (e) => e.exit === 3 && e.extra.stale === false);
  l.release();
});

test('verifyEvidence: intact passes; changed, missing and edited evidence.json are mismatches', (t) => {
  const d = tmp(t);
  mkdirSync(join(d, 'c', 'files'), { recursive: true });
  writeFileSync(join(d, 'c', 'files', 'a'), 'A');
  writeFileSync(join(d, 'c', 'files', 'b'), 'B');
  writeFileSync(join(d, 'c', 'evidence.json'), '{}');
  const files = [{ path: 'files/a', sha256: sha256('A') }, { path: 'files/b', sha256: sha256('B') }];
  const evidence = { dir: 'c', digest: evidenceDigest(sha256('{}'), files), files };
  assert.deepEqual(verifyEvidence(evidence, d), { ok: true, mismatches: [] });
  writeFileSync(join(d, 'c', 'files', 'a'), 'tampered');
  rmSync(join(d, 'c', 'files', 'b'));
  writeFileSync(join(d, 'c', 'evidence.json'), '{"x":1}');
  const r = verifyEvidence(evidence, d);
  assert.equal(r.ok, false);
  assert.deepEqual(r.mismatches.sort(), ['evidence.json', 'files/a', 'files/b']);
});
