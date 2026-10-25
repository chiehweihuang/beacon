#!/usr/bin/env node
// Beacon · improvement loop CLI: zero-model material preparation for fix candidates.
// Observe quality issues, pick one, freeze evidence, reproduce, validate a supplied patch.
// Never calls a model, never runs git, never publishes or deploys by itself.
//
// Usage: node tools/improvement/cli.mjs <command> --config FILE [--candidate ID] [...]
//   observe | select | prepare | reproduce | status | run
//   validate --worktree DIR [--patch FILE] [--labels FILE] [--write-ops]
//   record
//   publish --manifest FILE --out DIR
//   --break-stale-lock   remove a lock whose holder pid is dead (logs a receipt)
// One JSON object on stdout. Exit: 0 ok, 2 refused/invalid input, 3 lock or conflict, 1 unexpected.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ImproveError, FLOW, acquireLock, fail, atomicWrite, listCandidates, loadCandidate, newCandidate, readJson,
  saveCandidate, sha256, terminate, transition, verifyEvidence,
} from './state.mjs';
import { buildObservation, candidateId, readIssues, sourceRevision, writeOps } from './ops.mjs';
import { classify, heads, planSelect } from './select.mjs';
import { freezeEvidence } from './evidence.mjs';
import { reproduce, scannerOf } from './reproduce.mjs';
import { accuracyOf, patchBound, validate } from './validate.mjs';

const BOOLEAN = new Set(['write-ops', 'break-stale-lock', 'pending']);

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new ImproveError(`unexpected argument ${rest[i]}`);
    const k = rest[i].slice(2);
    args[k] = BOOLEAN.has(k) ? true : rest[++i];
    if (args[k] === undefined) throw new ImproveError(`--${k} needs a value`);
  }
  return { command, args };
}

export function loadConfig(file) {
  if (!file || !existsSync(file)) throw new ImproveError('--config FILE is required and must exist');
  const c = readJson(file);
  for (const k of ['ops', 'state', 'evidence', 'beaconRepo']) {
    if (typeof c[k] !== 'string' || !isAbsolute(c[k])) throw new ImproveError(`config.${k} must be an absolute path`);
  }
  return { timeoutMs: 120000, maxExamples: 5, ...c };
}

const past = (c, status) => FLOW.indexOf(c.status) >= FLOW.indexOf(status);
const lazyMissing = (e, name) => e.code === 'ERR_MODULE_NOT_FOUND' && e.message.includes(`${name}.mjs`);

function getCandidate(ctx, id = ctx.args.candidate) {
  if (!id) throw new ImproveError('--candidate is required');
  const c = loadCandidate(ctx.config.state, id);
  if (c.evidence) {
    const v = c.evidence.invalid ? { ok: false, mismatches: ['(previously marked invalid)'] } : verifyEvidence(c.evidence, ctx.config.evidence);
    if (!v.ok) {
      if (!c.evidence.invalid) saveCandidate(ctx.config.state, { ...c, evidence: { ...c.evidence, invalid: true } });
      throw new ImproveError('evidence digest mismatch, evidence is invalid', 2, { mismatches: v.mismatches });
    }
  }
  return c;
}
const save = (ctx, c) => { saveCandidate(ctx.config.state, c); return c; };

// ---- commands --------------------------------------------------------------

function observe(ctx) {
  const { config, at } = ctx;
  const all = listCandidates(config.state);
  const out = { created: [], reused: [], superseded: [], invalid: [] };
  const open = readIssues(config.ops).filter((i) => ['open', 'reproduced'].includes(i.status));
  for (const issue of open) {
    let obs;
    try { obs = buildObservation(config.ops, issue); } catch (e) {
      if (!(e instanceof ImproveError)) throw e;
      out.invalid.push({ signature: String(issue.signature).slice(0, 80), reason: e.message });
      continue;
    }
    const id = candidateId(obs);
    const existing = all.find((c) => c.id === id);
    if (existing) { out.reused.push(id); continue; }
    const prev = heads(all).filter((c) => c.signature === obs.signature)
      .sort((a, b) => b.observation.date.localeCompare(a.observation.date) || a.id.localeCompare(b.id))[0];
    const c = newCandidate({
      id, signature: obs.signature, cls: classify(obs.signature), supersedes: prev?.id ?? null,
      observation: { date: obs.last_seen, examples: obs.examples, count: obs.count_last, engine_fingerprints: obs.fingerprints },
      source_revision: sourceRevision(obs), at,
    });
    save(ctx, c);
    all.push(c);
    out.created.push(id);
    if (prev) out.superseded.push({ id, supersedes: prev.id });
  }
  if (open.length && out.invalid.length === open.length) throw new ImproveError('every open issue is invalid', 2, { invalid: out.invalid });
  return out;
}

function select(ctx) {
  const plan = planSelect(heads(listCandidates(ctx.config.state)));
  const excluded = plan.exclude.map((x) => {
    const c = loadCandidate(ctx.config.state, x.id);
    save(ctx, terminate(c, 'excluded', { reason: x.reason, retry_eligible: false }, ctx.at));
    return x;
  });
  const ranked = plan.ranked.map((c) => c.id);
  if (ctx.args.candidate) {
    const c = loadCandidate(ctx.config.state, ctx.args.candidate);
    if (c.status === 'excluded') throw new ImproveError(`candidate is excluded: ${c.blocked?.reason}`);
    return { selected: c.id, ranked, excluded };
  }
  return { selected: ranked[0] ?? null, ranked, excluded };
}

function prepare(ctx) {
  const c = getCandidate(ctx);
  // evidence already frozen (and verified by getCandidate): idempotent whatever the status
  if (past(c, 'prepared') || c.evidence) return { candidate: c.id, status: c.status, already: true };
  if (c.status !== 'observed') throw new ImproveError(`cannot prepare a ${c.status} candidate`);
  const evidence = freezeEvidence({ config: ctx.config, candidate: c });
  const next = save(ctx, transition({ ...c, evidence }, 'prepared', 'evidence frozen', ctx.at));
  return { candidate: c.id, status: next.status, evidence: { digest: evidence.digest, files: evidence.files.length } };
}

function reproduceCmd(ctx) {
  let c = getCandidate(ctx);
  const retry = c.status === 'failed' && c.failure?.step === 'reproduce' && c.failure.retry_eligible;
  if (c.reproduction && !retry) return { candidate: c.id, status: c.status, already: true, reproduced: c.reproduction.reproduced };
  if (retry) c = { ...c, status: 'prepared', history: [...c.history, { at: ctx.at, from: 'failed', to: 'prepared', reason: 'retry reproduce' }] };
  if (c.status !== 'prepared') throw new ImproveError(`reproduce needs a prepared candidate, found ${c.status}`);
  const { reproduction, script, failure } = reproduce({ config: ctx.config, candidate: c, at: ctx.at });
  atomicWrite(join(ctx.config.evidence, c.id, 'repro.sh'), script);
  const withRepro = { ...c, reproduction };
  const next = save(ctx, failure
    ? fail(withRepro, { step: 'reproduce', error: failure, retry_eligible: true }, ctx.at, ctx.config.maxRetries ?? 3)
    : reproduction.reproduced
    ? transition({ ...withRepro, failure: null }, 'reproduced', 'reproduced against frozen evidence', ctx.at)
    : terminate({ ...withRepro, failure: null }, 'blocked', { reason: reproduction.reason, retry_eligible: false }, ctx.at));
  return { candidate: c.id, status: next.status, reproduced: reproduction.reproduced, ...(failure ? { failure: next.failure } : {}), ...(reproduction.reason ? { reason: reproduction.reason } : {}) };
}

function validateCmd(ctx) {
  const { args, config } = ctx;
  let c = getCandidate(ctx);
  if (c.class === 'missing') throw new ImproveError('a missing-report candidate needs an operational fix, not an engine fix; validate does not apply');
  if (!args.worktree) throw new ImproveError('--worktree DIR is required');
  const worktree = resolve(args.worktree);
  if (!existsSync(scannerOf(worktree))) throw new ImproveError('worktree has no core/scripts/static-audit.mjs');
  if (args.patch) {
    const patch = resolve(args.patch);
    if (!existsSync(patch)) throw new ImproveError('--patch file does not exist');
    const digest = sha256(readFileSync(patch));
    if (past(c, 'validated') && c.candidate_fix?.sha256 !== digest) throw new ImproveError(`candidate is ${c.status}; a different patch cannot be registered`);
    if (c.status === 'reproduced') c = save(ctx, transition({ ...c, candidate_fix: { patch, sha256: digest, notes: '' } }, 'candidate', 'patch registered', ctx.at));
    else if (c.status === 'candidate' && c.candidate_fix?.sha256 !== digest) c = save(ctx, { ...c, candidate_fix: { patch, sha256: digest, notes: '' }, validation: null });
  }
  if (past(c, 'validated')) {
    // labels arrive later: recompute only accuracy from the labels, no rescans
    if (args.labels && c.validation) {
      c = save(ctx, { ...c, validation: { ...c.validation, accuracy: accuracyOf(readJson(resolve(args.labels))) } });
    }
    const out = { candidate: c.id, status: c.status, already: true, validation: c.validation };
    // resume: the ops write is idempotent (same note, same summary file)
    if (args['write-ops'] && c.validation) out.ops = writeOps(config.ops, c, c.validation, c.observation.date);
    return out;
  }
  if (c.status !== 'candidate') throw new ImproveError(`validate needs a registered patch (--patch) on a reproduced candidate, found ${c.status}`);
  const labels = args.labels ? readJson(resolve(args.labels)) : null;
  const bound = patchBound(worktree, c.candidate_fix.patch);
  c = save(ctx, { ...c, candidate_fix: { ...c.candidate_fix, patch_bound: bound } });
  const validation = validate({ config, candidate: c, worktree, labels, at: ctx.at, patchBound: bound });
  const withV = { ...c, validation };
  const next = save(ctx, validation.passed ? transition(withV, 'validated', 'validation passed', ctx.at) : withV);
  const out = { candidate: c.id, status: next.status, validation };
  if (args['write-ops']) out.ops = writeOps(config.ops, next, validation, c.observation.date);
  return out;
}

async function recordCmd(ctx) {
  const { config } = ctx;
  const c = getCandidate(ctx);
  const retry = c.status === 'awaiting-review' && c.experience?.status === 'failed' && c.experience.retry_eligible;
  if (c.status === 'awaiting-review' && !retry) return { candidate: c.id, status: c.status, already: true, experience: c.experience };
  if (c.status !== 'validated' && !retry) throw new ImproveError(`record needs a validated candidate, found ${c.status}`);
  let experience;
  if (!config.yume) experience = { status: 'skipped', reason: 'no yume config' };
  else {
    let mod;
    try { mod = await import('./experience.mjs'); } catch (e) {
      if (!lazyMissing(e, 'experience')) throw e;
      return { candidate: c.id, status: c.status, persisted: false, experience: { status: 'skipped', reason: 'module missing' } };
    }
    experience = await mod.recordExperience({ config, candidate: c, evidenceDir: join(config.evidence, c.id), previous: c.experience ?? null });
  }
  const withE = { ...c, experience };
  const next = save(ctx, c.status === 'validated' ? transition(withE, 'awaiting-review', `experience ${experience.status}`, ctx.at) : withE);
  return { candidate: c.id, status: next.status, experience };
}

async function publishCmd(ctx) {
  const { config, args } = ctx;
  if (!config.publish) throw new ImproveError('publish is not configured (no publish section in config)');
  if (!args.manifest || !args.out) throw new ImproveError('--manifest FILE and --out DIR are required');
  const manifestSha = sha256(readFileSync(resolve(args.manifest)));
  const manifest = readJson(resolve(args.manifest));
  const c = getCandidate(ctx, manifest.candidate);
  const prior = c.receipts.find((x) => x.action === 'published' && x.manifest_sha256 === manifestSha);
  if (prior) return { candidate: c.id, published: true, replayed: true, receipt: prior };
  let mod;
  try { mod = await import('./publish.mjs'); } catch (e) {
    if (!lazyMissing(e, 'publish')) throw e;
    return { status: 'skipped', reason: 'module missing' };
  }
  const r = await mod.publish({ config, candidate: c, manifest, out: resolve(args.out) });
  if (!r.ok) throw new ImproveError('publish refused', 2, { reasons: r.reasons });
  const receipt = { ...r.receipt, manifest_sha256: manifestSha };
  save(ctx, { ...c, receipts: [...c.receipts, receipt] });
  return { candidate: c.id, published: true, receipt };
}

function statusCmd(ctx) {
  const { config, args } = ctx;
  const view = (c) => ({
    id: c.id, signature: c.signature, class: c.class, status: c.status, supersedes: c.supersedes, failure: c.failure ?? null,
    evidence_invalid: c.evidence ? (c.evidence.invalid === true || !verifyEvidence(c.evidence, config.evidence).ok) : false,
  });
  if (args.candidate) { const c = loadCandidate(config.state, args.candidate); return { candidate: c, ...view(c) }; }
  return { candidates: listCandidates(config.state).map(view) };
}

async function run(ctx) {
  const steps = { observe: observe(ctx) };
  steps.select = select(ctx);
  const id = steps.select.selected;
  if (!id) return { candidate: null, steps };
  const sub = { ...ctx, args: { ...ctx.args, candidate: id } };
  steps.prepare = prepare(sub);
  steps.reproduce = reproduceCmd(sub);
  return { candidate: id, status: loadCandidate(ctx.config.state, id).status, steps };
}

const COMMANDS = { observe, select, prepare, reproduce: reproduceCmd, validate: validateCmd, record: recordCmd, publish: publishCmd, status: statusCmd, run };

export async function main(argv) {
  let lock = null;
  try {
    const { command, args } = parseArgs(argv);
    if (!COMMANDS[command]) throw new ImproveError(`unknown command ${command ?? '(none)'}`);
    const config = loadConfig(args.config);
    const at = new Date().toISOString();
    if (command !== 'status') lock = acquireLock(config.state, { breakStale: args['break-stale-lock'] === true, at });
    const result = await COMMANDS[command]({ config, args, at });
    console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
    return 0;
  } catch (e) {
    const exit = e instanceof ImproveError ? e.exit : 1;
    console.log(JSON.stringify({ ok: false, error: e.message, ...(e instanceof ImproveError ? e.extra : {}) }, null, 2));
    return exit;
  } finally {
    lock?.release();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
