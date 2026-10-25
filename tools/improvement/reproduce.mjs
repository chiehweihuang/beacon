// Beacon · improvement loop reproduction (IC-02): re-run the scanner against the FROZEN
// evidence only. Shared scanner runner and frozen-example loader are reused by validate.mjs.
// Not a CLI. No network; the scanner is a local subprocess with a hard timeout.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { readJson, ImproveError } from './state.mjs';

export const scannerOf = (dir) => join(dir, 'core', 'scripts', 'static-audit.mjs');
export const targetKey = (signature) => signature.replace(/^rules-diff:/, '');
export const countKey = (report, key) => (report?.findings ?? []).filter((f) => f.key === key).length;

export function frozenExamples(config, candidate) {
  const root = join(config.evidence, candidate.id, 'files');
  const date = candidate.observation.date;
  const maybe = (p) => (existsSync(p) ? p : null);
  return candidate.observation.examples.slice(0, config.maxExamples ?? 5).map((id) => {
    const audit = maybe(join(root, 'survey-audits', `${id}.json`));
    const result = maybe(join(root, 'daily-history', date, id, 'result.json'));
    return {
      id, date,
      report: audit ? readJson(audit) : null,
      snapshot: maybe(join(root, 'survey-snapshots', `${id}.html.gz`)),
      result: result ? readJson(result) : null,
    };
  });
}

// Uses the stored metadata url/date when present; the url stays in the private evidence dir.
export function runScanner({ scanner, example, timeoutMs }) {
  const tmp = mkdtempSync(join(tmpdir(), 'improve-scan-'));
  try {
    const html = join(tmp, 'page.html'), out = join(tmp, 'out.json');
    writeFileSync(html, gunzipSync(readFileSync(example.snapshot)));
    const url = example.report?.metadata?.url ?? example.result?.url ?? 'https://example.invalid/';
    const date = example.report?.metadata?.date ?? example.date;
    const t0 = Date.now();
    const p = spawnSync(process.execPath, [scanner, '--scope', url, '--url', url, '--date', date, '--output', out, html],
      { cwd: tmp, encoding: 'utf8', timeout: timeoutMs });
    const wall_ms = Date.now() - t0;
    if (p.error?.code === 'ETIMEDOUT' || (p.status === null && p.signal)) return { ok: false, timedOut: true, wall_ms };
    if (p.status !== 0 || !existsSync(out)) return { ok: false, timedOut: false, wall_ms, error: `scanner exit ${p.status}: ${(p.stderr || '').trim().slice(0, 300).replace(/https?:\/\/\S+/gi, '<url>')}` };
    return { ok: true, timedOut: false, wall_ms, report: readJson(out) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export const shq = (s) => `'${String(s).replace(/'/g, `'"'"'`)}'`;

export function reproduce({ config, candidate, at }) {
  const scanner = scannerOf(config.beaconRepo);
  const timeoutMs = config.timeoutMs ?? 120000;
  const examples = frozenExamples(config, candidate);
  const base = { at };
  const failures = [];
  const script = ['#!/bin/sh', '# private: reproduces the scanner run against frozen evidence', 'set -eu', 'tmp=$(mktemp -d)'];
  let reproduced = false, actual = [], expected, reason = null, command;

  if (candidate.class === 'engine') {
    const key = targetKey(candidate.signature);
    command = 'node <beaconRepo>/core/scripts/static-audit.mjs --scope <url> --url <url> --date <date> --output <out> <snapshot>';
    expected = `fresh count of "${key}" equals stored count`;
    for (const ex of examples.filter((e) => e.snapshot && e.report)) {
      const r = runScanner({ scanner, example: ex, timeoutMs });
      const url = ex.report.metadata?.url ?? 'https://example.invalid/';
      script.push(`gunzip -c ${shq(ex.snapshot)} > "$tmp"/${shq(`${ex.id}.html`)}`,
        `node ${shq(scanner)} --scope ${shq(url)} --url ${shq(url)} --date ${shq(ex.report.metadata?.date ?? ex.date)} --output "$tmp"/${shq(`${ex.id}.json`)} "$tmp"/${shq(`${ex.id}.html`)}`);
      if (!r.ok) failures.push(r.timedOut ? 'scanner timed out' : r.error);
      actual.push(r.ok
        ? { id: ex.id, stored: countKey(ex.report, key), fresh: countKey(r.report, key), engine_stored: ex.report.metadata?.engine_fingerprint ?? null, engine_fresh: r.report.metadata?.engine_fingerprint ?? null }
        : { id: ex.id, stored: countKey(ex.report, key), fresh: null, error: r.timedOut ? 'timeout' : r.error });
    }
    reproduced = !failures.length && actual.some((a) => a.fresh !== a.stored);
    if (!actual.length) reason = 'no example has both a frozen snapshot and a stored report';
    else if (failures.length) reason = null;
    else if (!reproduced) reason = 'fresh counts equal stored counts for every example';
  } else if (candidate.class === 'timeout') {
    command = 'node <beaconRepo>/core/scripts/static-audit.mjs ... <snapshot> (limit timeoutMs)';
    expected = `scanner finishes within ${timeoutMs} ms`;
    for (const ex of examples.filter((e) => e.snapshot)) {
      const r = runScanner({ scanner, example: ex, timeoutMs });
      script.push(`gunzip -c ${shq(ex.snapshot)} > "$tmp"/${shq(`${ex.id}.html`)}`,
        `timeout ${Math.ceil(timeoutMs / 1000)} node ${shq(scanner)} --output "$tmp"/${shq(`${ex.id}.json`)} "$tmp"/${shq(`${ex.id}.html`)}`);
      if (r.error) failures.push(r.error);
      actual.push({ id: ex.id, wall_ms: r.wall_ms, timed_out: r.timedOut, error: r.error ?? null });
      if (r.timedOut || r.wall_ms > timeoutMs) { reproduced = true; break; }
    }
    if (!actual.length) reason = 'no frozen snapshot to run';
    else if (failures.length && !reproduced) reason = null;
    else if (!reproduced) reason = 'scanner finished within the limit on every example';
  } else if (candidate.class === 'missing') {
    command = 'check <ops>/survey-audits/<id>.json absent and frozen result.json outcome ok';
    expected = 'a report exists for a successful capture';
    for (const ex of examples) {
      const absent = !existsSync(join(config.ops, 'survey-audits', `${ex.id}.json`));
      const shouldExist = ex.result?.outcome === 'ok' && ex.result?.auditFailed !== true;
      actual.push({ id: ex.id, report_absent: absent, outcome: ex.result?.outcome ?? null, audit_failed: ex.result?.auditFailed ?? null });
      if (absent && shouldExist) reproduced = true;
    }
    if (!reproduced) reason = 'capture failure: no successful capture should have produced a report';
  } else {
    throw new ImproveError(`class ${candidate.class} has no reproduction`);
  }
  script.push('echo done');
  const failure = failures.length && !reproduced ? failures[0] : null;
  return { failure, reproduction: { command, expected, actual, reproduced, ...(reason ? { reason } : {}), ...base }, script: `${script.join('\n')}\n` };
}
