// Beacon · improvement loop state layer (IC-03): atomic writes, guarded transitions,
// single-writer lock, evidence digest verification. Pure helpers + small fs wrappers.
//
// Not a CLI. Used by cli.mjs. See plans/2026-10-25-improvement-loop.md.

import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, rmSync, appendFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export class ImproveError extends Error {
  constructor(message, exit = 2, extra = {}) { super(message); this.exit = exit; this.extra = extra; }
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export const sha256File = (p) => sha256(readFileSync(p));
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function atomicWrite(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const next = `${file}.next`;
  writeFileSync(next, typeof data === 'string' || Buffer.isBuffer(data) ? data : `${JSON.stringify(data, null, 2)}\n`);
  renameSync(next, file);
}

// ---- candidates ------------------------------------------------------------

export function newCandidate({ id, signature, cls, supersedes, observation, source_revision, at }) {
  return {
    id, signature, class: cls, status: 'observed', supersedes: supersedes ?? null,
    observation, source_revision, evidence: null, reproduction: null, candidate_fix: null,
    validation: null, experience: null, receipts: [], blocked: null, failure: null,
    history: [{ at, from: null, to: 'observed', reason: 'observed' }],
  };
}

export const FLOW = ['observed', 'prepared', 'reproduced', 'candidate', 'validated', 'awaiting-review'];
const EXPERIENCE_DONE = new Set(['recorded', 'skipped', 'failed']);
const GUARDS = {
  prepared: (c) => (c.evidence?.digest ? null : 'prepared needs evidence.digest'),
  reproduced: (c) => (c.reproduction?.reproduced === true ? null : 'reproduced needs reproduction.reproduced === true'),
  candidate: (c) => (c.candidate_fix ? null : 'candidate needs candidate_fix'),
  validated: (c) => (c.validation?.passed === true ? null : 'validated needs validation.passed'),
  'awaiting-review': (c) => (EXPERIENCE_DONE.has(c.experience?.status) ? null : 'awaiting-review needs experience.status recorded|skipped|failed'),
};

export function transition(c, to, reason = '', at = new Date().toISOString()) {
  const i = FLOW.indexOf(c.status), j = FLOW.indexOf(to);
  if (i < 0 || j !== i + 1) throw new ImproveError(`illegal transition ${c.status} -> ${to}`);
  const bad = GUARDS[to](c);
  if (bad) throw new ImproveError(bad);
  return { ...c, status: to, history: [...c.history, { at, from: c.status, to, reason }] };
}

const SETTLED = new Set(['validated', 'awaiting-review', 'excluded', 'blocked', 'failed']);
export function terminate(c, to, { reason, retry_eligible }, at = new Date().toISOString()) {
  if (!['excluded', 'blocked', 'failed'].includes(to) || SETTLED.has(c.status)) {
    throw new ImproveError(`illegal transition ${c.status} -> ${to}`);
  }
  return {
    ...c, status: to, blocked: { reason, retry_eligible: Boolean(retry_eligible) },
    history: [...c.history, { at, from: c.status, to, reason }],
  };
}

// Infrastructure failure (scanner missing, spawn error, bad output): not a verdict about the defect.
export function fail(c, { step, error, retry_eligible }, at = new Date().toISOString(), maxRetries = 3) {
  if (SETTLED.has(c.status)) throw new ImproveError(`illegal transition ${c.status} -> failed`);
  const attempts = (c.failure?.attempts ?? 0) + 1;
  const capped = attempts >= maxRetries;
  const failure = { step, error, retry_eligible: Boolean(retry_eligible) && !capped, attempts, at };
  if (capped && retry_eligible) failure.reason = `retry cap reached after ${attempts} attempts`;
  return { ...c, status: 'failed', blocked: null, failure, history: [...c.history, { at, from: c.status, to: 'failed', reason: `${step}: ${error}` }] };
}

export const candidateFile = (stateDir, id) => join(stateDir, 'candidates', `${id}.json`);
export const loadCandidate = (stateDir, id) => {
  const f = candidateFile(stateDir, id);
  if (!existsSync(f)) throw new ImproveError(`unknown candidate ${id}`);
  return readJson(f);
};
export const saveCandidate = (stateDir, c) => atomicWrite(candidateFile(stateDir, c.id), c);
export const listCandidates = (stateDir) => {
  const d = join(stateDir, 'candidates');
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(d, f))) : [];
};

// ---- lock ------------------------------------------------------------------

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

export function acquireLock(stateDir, { breakStale = false, at = new Date().toISOString() } = {}) {
  mkdirSync(stateDir, { recursive: true });
  const dir = join(stateDir, '.lock');
  try {
    mkdirSync(dir);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let holder = null;
    try { holder = readJson(join(dir, 'holder.json')); } catch { /* lock created, holder not yet written */ }
    const stale = holder ? !alive(holder.pid) : false;
    if (stale && breakStale) {
      appendFileSync(join(stateDir, 'lock-receipts.jsonl'), `${JSON.stringify({ action: 'break-stale-lock', at, holder })}\n`);
      rmSync(dir, { recursive: true, force: true });
      return acquireLock(stateDir, { at });
    }
    throw new ImproveError(stale ? 'stale lock found, not stolen (use --break-stale-lock)' : 'state is locked', 3, { holder, stale });
  }
  writeFileSync(join(dir, 'holder.json'), JSON.stringify({ pid: process.pid, started: at }));
  return { release: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---- evidence digests ------------------------------------------------------

export const evidenceDigest = (evidenceJsonSha, files) =>
  sha256([`evidence.json:${evidenceJsonSha}`, ...files.map((f) => `${f.path}:${f.sha256}`).sort()].join('\n'));

export function verifyEvidence(evidence, evidenceRoot) {
  const dir = join(evidenceRoot, evidence.dir);
  const mismatches = [];
  const shaOrNull = (rel) => { try { return sha256File(join(dir, rel)); } catch { return null; } };
  const ej = shaOrNull('evidence.json');
  // evidence.json is hashed into the digest only, so an edit shows up as a digest mismatch
  if (ej === null || evidenceDigest(ej, evidence.files) !== evidence.digest) mismatches.push('evidence.json');
  for (const f of evidence.files) if (shaOrNull(f.path) !== f.sha256) mismatches.push(f.path);
  return { ok: mismatches.length === 0, mismatches };
}
