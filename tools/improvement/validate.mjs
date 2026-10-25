// Beacon · improvement loop validation (IC-02, IC-04, IC-07): target fix, compatibility
// against stored reports, worktree tests, accuracy (unknown unless independently labelled).
// Not a CLI. Compatibility evidence is never reported as accuracy.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { sha256 } from './state.mjs';
import { countKey, frozenExamples, runScanner, scannerOf, targetKey } from './reproduce.mjs';

const FIELDS = ['metadata', 'summary', 'findings', 'legal_risk', 'remediation'];
// Same idea as the ops scanner-regression (not readable from this repo, so re-implemented, not
// copied): the file component of a location is replaced by <FILE>, with or without ":<line>".
// static-audit emits bare "<file>" for some keys (title, landmark, headings), and the rerun scans
// a temp page whose name never matches the stored one.
const loc = (items) => (items ?? []).map((x) => (typeof x?.location === 'string'
  ? { ...x, location: x.location.replace(/^(.*?)(:\d+)?$/, (_, _f, line) => `<FILE>${line ?? ''}`) } : x));
const META_ALLOWED = new Set(['engine_fingerprint', 'tool_version']);
const FOLLOWS_TARGET = new Set(['summary', 'legal_risk', 'remediation']);

export function normalizeReport(r) {
  const { audit_methods: _drop, ...metadata } = r.metadata ?? {};
  return { metadata, summary: r.summary, findings: loc(r.findings), legal_risk: r.legal_risk, remediation: loc(r.remediation) };
}

export function compareReports(stored, fresh) {
  const a = normalizeReport(stored), b = normalizeReport(fresh);
  const fields = FIELDS.filter((f) => !isDeepStrictEqual(a[f], b[f]));
  const keys = [...new Set([...a.findings, ...b.findings].map((f) => f.key))]
    .filter((k) => !isDeepStrictEqual(a.findings.filter((f) => f.key === k), b.findings.filter((f) => f.key === k))).sort();
  const metaKeys = [...new Set([...Object.keys(a.metadata), ...Object.keys(b.metadata)])]
    .filter((k) => !isDeepStrictEqual(a.metadata[k], b.metadata[k])).sort();
  const n = (r, k) => r.findings.filter((f) => f.key === k).length;
  const countChanged = [...new Set([...a.findings, ...b.findings].map((f) => f.key))].some((k) => n(a, k) !== n(b, k));
  return { identical: fields.length === 0, keys, fields, metaKeys, countChanged };
}

// I5: what a difference may be explained by. Findings may differ only in the targeted key;
// summary/legal_risk/remediation only follow a targeted-key change; metadata only in
// engine_fingerprint/tool_version.
export function explainDiff(c, targeted) {
  const explained = [], unexplained = [];
  for (const k of c.keys) (k === targeted ? explained : unexplained).push(k === targeted ? `finding key ${k} (targeted)` : k);
  const followsTarget = targeted !== null && c.keys.includes(targeted);
  for (const f of c.fields.filter((x) => FOLLOWS_TARGET.has(x))) {
    if (followsTarget) explained.push(`${f} follows targeted key`); else unexplained.push(`field:${f}`);
  }
  for (const m of c.metaKeys) {
    if (META_ALLOWED.has(m)) explained.push(`metadata ${m}`); else unexplained.push(`metadata:${m}`);
  }
  return { explained, unexplained };
}

// I6: true when the worktree already contains the patch (reverse apply would succeed).
export function patchBound(worktree, patch) {
  const p = spawnSync('git', ['-C', worktree, 'apply', '--check', '-R', patch], { encoding: 'utf8' });
  return p.error ? null : p.status === 0;
}

function engineInfo(worktree, scanner, fresh) {
  const g = spawnSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return {
    worktree, git_rev: !g.error && g.status === 0 ? g.stdout.trim() : null,
    scanner_sha256: sha256(readFileSync(scanner)), fresh_engine_fingerprint: fresh,
  };
}

export function accuracyOf(labels) {
  if (!labels) return { status: 'unknown', reason: 'no independent labels' };
  const keys = {};
  for (const l of labels.labels ?? []) {
    const k = (keys[l.key] ??= { n: 0, correct: 0, incorrect: 0 });
    k.n++;
    k[l.verdict === 'correct' ? 'correct' : 'incorrect']++;
  }
  for (const k of Object.values(keys)) k.agreement = k.correct / k.n;
  return { status: 'labelled', keys };
}

export function runWorktreeTests(worktree) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // otherwise a nested `node --test` runs as a child reporter and can report 0 without testing
  const p = spawnSync(process.execPath, ['--test'], { cwd: worktree, env, encoding: 'utf8', timeout: 600000 });
  return { exit: p.status ?? -1 };
}

export function validate({ config, candidate, worktree, labels, at, patchBound: bound = null }) {
  const scanner = scannerOf(worktree);
  const timeoutMs = config.timeoutMs ?? 120000;
  const runs = frozenExamples(config, candidate).filter((e) => e.snapshot)
    .map((ex) => ({ ex, run: runScanner({ scanner, example: ex, timeoutMs }) }));

  const key = targetKey(candidate.signature);
  let target;
  if (candidate.class === 'engine') {
    const rows = runs.filter((r) => r.ex.report).map(({ ex, run }) => (run.ok
      ? { id: ex.id, stored: countKey(ex.report, key), fresh: countKey(run.report, key) }
      : { id: ex.id, error: run.timedOut ? 'timeout' : run.error }));
    target = { status: rows.length && rows.every((r) => r.fresh !== undefined && r.fresh === r.stored) ? 'fixed' : 'not-fixed', detail: rows };
  } else if (candidate.class === 'timeout') {
    const rows = runs.map(({ ex, run }) => ({ id: ex.id, wall_ms: run.wall_ms, timed_out: run.timedOut }));
    target = { status: rows.length && rows.every((r) => !r.timed_out && r.wall_ms <= timeoutMs) ? 'fixed' : 'not-fixed', detail: rows };
  } else {
    target = { status: 'not-applicable', detail: [], reason: `class ${candidate.class} is not validated by scanner rerun` };
  }

  const targeted = candidate.class === 'engine' ? key : null;
  const compatibility = { identical: [], different: [], errors: [] };
  for (const { ex, run } of runs.filter((r) => r.ex.report)) {
    if (!run.ok) { compatibility.errors.push({ id: ex.id, error: run.timedOut ? 'timeout' : run.error }); continue; }
    const c = compareReports(ex.report, run.report);
    if (c.identical) { compatibility.identical.push(ex.id); continue; }
    const e = explainDiff(c, targeted);
    // a behaviour change must come with a new engine fingerprint (DETECTOR_VERSION bump)
    if (c.countChanged && ex.report.metadata?.engine_fingerprint === run.report.metadata?.engine_fingerprint) {
      e.unexplained.push('engine fingerprint unchanged despite behavior change');
    }
    compatibility.different.push({ id: ex.id, keys: c.keys, fields: c.fields, ...e });
  }
  const unexplained = [...new Set(compatibility.different.flatMap((d) => d.unexplained))];
  const fresh = runs.find((r) => r.run.ok)?.run.report.metadata?.engine_fingerprint ?? null;
  const tests = runWorktreeTests(worktree);
  const accuracy = accuracyOf(labels);
  const passed = target.status === 'fixed' && tests.exit === 0 && compatibility.errors.length === 0 && unexplained.length === 0 && bound !== false;
  const comparison = {
    same_snapshot_across_engines: 'done',
    same_engine_across_snapshots: 'unverified: website-change comparison is produced by the daily survey, not by this phase',
  };
  return { passed, at, target, compatibility, comparison, tests, accuracy, unexplained, engine: engineInfo(worktree, scanner, fresh) };
}
