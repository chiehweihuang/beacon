// Beacon · improvement loop ops adapter: read quality issues, build observations and
// candidate identity (IC-01), publish validation results back to ops (IC-08).
// Not a CLI. Reads <ops> only; writes <ops> only through writeOps (opt-in).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWrite, readJson, sha256, ImproveError } from './state.mjs';

export function readIssues(ops) {
  const f = join(ops, 'quality', 'issues.json');
  if (!existsSync(f)) throw new ImproveError('ops has no quality/issues.json');
  let data;
  try { data = readJson(f); } catch (e) { throw new ImproveError(`quality/issues.json is malformed: ${e.message}`); }
  if (!Array.isArray(data?.issues)) throw new ImproveError('quality/issues.json has no issues array');
  return data.issues;
}

const idOf = (e) => String(e !== null && typeof e === 'object' ? e.id : e);

// issues.json is a system boundary: its values become paths and argv later.
function checkIssue(issue, examples) {
  const bad = [];
  if (!/^[a-z0-9:_-]+$/i.test(String(issue.signature))) bad.push('signature');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(issue.last_seen))) bad.push('last_seen');
  if (!examples.every((id) => /^\d+$/.test(id))) bad.push('example id');
  if (bad.length) throw new ImproveError(`issues.json has an unsafe ${bad.join(', ')} in issue ${JSON.stringify(String(issue.signature)).slice(0, 60)}`);
}

export function buildObservation(ops, issue) {
  const examples = (issue.examples ?? []).map(idOf).sort();
  checkIssue(issue, examples);
  const fingerprints = new Set();
  for (const id of examples) {
    const f = join(ops, 'survey-audits', `${id}.json`);
    if (!existsSync(f)) continue;
    try { const fp = readJson(f).metadata?.engine_fingerprint; if (fp) fingerprints.add(String(fp)); } catch { /* unreadable report: no fingerprint */ }
  }
  return {
    signature: issue.signature, status: issue.status, last_seen: issue.last_seen,
    count_last: issue.count_last ?? 0, examples, fingerprints: [...fingerprints].sort(),
  };
}

export const candidateId = (o) =>
  `cand_${sha256([o.signature, o.last_seen, o.examples.join(','), o.fingerprints.join(',')].join('|')).slice(0, 16)}`;
export const sourceRevision = (o) => sha256(JSON.stringify(o));

// IC-08: make the result discoverable by the existing triage and a per-candidate summary.
// Only runs on explicit --write-ops; SQLite is not touched in this phase.
export function writeOps(ops, candidate, validation, date) {
  const verdict = validation.passed ? 'passed' : 'failed';
  const note = `improvement ${candidate.id}: reproduced ${date}; validation ${verdict}`;
  const p = spawnSync(process.execPath, [join(ops, 'triage-daily.mjs'), 'set', candidate.signature, 'reproduced', '--note', note],
    { cwd: ops, encoding: 'utf8', timeout: 60000 });
  if (p.status !== 0) throw new ImproveError(`triage-daily set failed (${p.status}): ${p.stderr.trim()}`, 1);
  const summary = join(ops, 'quality', 'improvement', `${candidate.id}.json`);
  atomicWrite(summary, {
    candidate: candidate.id, signature: candidate.signature, class: candidate.class, status: candidate.status,
    reproduced: candidate.reproduction?.reproduced ?? null, validation: { passed: validation.passed, target: validation.target.status, tests: validation.tests, accuracy: validation.accuracy.status },
    note,
  });
  return { triage: note, summary: `quality/improvement/${candidate.id}.json` };
}
