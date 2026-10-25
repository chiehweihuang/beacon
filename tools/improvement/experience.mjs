// Experience recording (IC-06): drives the yume CLI for one candidate.
// Known limits:
//  - A replay of an inconclusive dream cannot be confirmed: status --pending shows only
//    proposed lessons, so it returns no_dream_recorded.
//  - A record replay on an already ended claim is untested on the real CLI; confirmation
//    there relies on our dream id appearing in status --pending.
// Writes only under <evidenceDir>/experience/. Never writes candidate state.
// Never calls decide / forget / recover / retire, never passes --force.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 60_000;
const slug = (s, max = 60) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/, '');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ponytail: ids are hex slices of sha256(candidate id + tag); 16 hex fits yume's 12..32 rule.
const hex = (id, tag) => sha(`${id}|${tag}`).slice(0, 16);

export function experienceIds(candidateId) {
  return {
    experience: `exp_${hex(candidateId, 'exp')}`,
    evidence: `evr_${hex(candidateId, 'evr')}`,
    dream: `drm_${hex(candidateId, 'drm')}`,
    lesson: `lsn_${hex(candidateId, 'lsn')}`,
  };
}

// begin/end carry an attempt counter so a retry after a released claim is a fresh operation.
export function experienceOperations(candidateId, attempt = 1) {
  const op = (s) => `op_${candidateId}_${s}`;
  return { ingest: op('ingest'), prepare: op('prepare'), begin: op(`begin${attempt}`), dream: op('dream'), end: op(`end${attempt}`) };
}

// One locator per candidate (yume pins a locator to its first source root). One scope per
// signature: candidates of a signature share recall, different signatures never share a packet.
export const experienceScope = (scope, signature) => {
  const room = Math.max(1, 64 - scope.length - 1);
  return `${scope}:${slug(signature, room)}`;
};
export const experienceLocator = (candidateId) => `beacon-${hex(candidateId, 'loc')}`;

function atomicWrite(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.next`, body);
  fs.renameSync(`${file}.next`, file);
}

function run(yume, args) {
  const [cmd, ...head] = yume.command;
  return new Promise((resolve) => {
    execFile(cmd, [...head, '--store', yume.store, ...args], {
      cwd: yume.repo, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }, (err, stdout, stderr) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* stderr is used instead */ }
      const exit = err ? (typeof err.code === 'number' ? err.code : null) : 0;
      resolve({ exit, json, stderr: (stderr || '').trim(), spawnError: err && exit === null ? err.message : null });
    });
  });
}

// validate() returns {status} objects; older shapes were plain strings.
const label = (x) => (typeof x === 'string' ? x : typeof x?.status === 'string' ? x.status : 'unknown');
const compat = (c) => (c
  ? `identical=${c.identical?.length ?? 0} different=${c.different?.length ?? 0} errors=${c.errors?.length ?? 0}`
  : 'unknown');

function evidenceText(c) {
  const o = c.observation ?? {};
  const v = c.validation ?? {};
  return [
    `candidate: ${c.id}`,
    `signature: ${c.signature}`,
    `class: ${c.class ?? 'unknown'}`,
    `observed: ${o.date ?? 'unknown'}`,
    `count: ${o.count ?? 'unknown'}`,
    `examples: ${(o.examples ?? []).join(', ')}`,
    `engine_fingerprints: ${(o.engine_fingerprints ?? []).join(', ')}`,
    `validation_passed: ${v.passed === true ? 'yes' : v.passed === false ? 'no' : 'unknown'}`,
    `validation_target: ${label(v.target)}`,
    `validation_compatibility: ${compat(v.compatibility)}`,
    `validation_accuracy: ${label(v.accuracy)}`,
    '',
  ].join('\n');
}


export async function recordExperience({ config, candidate, evidenceDir, previous }) {
  const yume = config?.yume;
  if (!yume?.command?.length || !yume.store || !yume.repo) {
    return { status: 'skipped', reason: 'yume is not configured (repo, store, command)' };
  }
  // previous: the experience object persisted on the candidate by an earlier failed attempt.
  const prev = (previous ?? candidate.experience)?.status === 'failed' ? (previous ?? candidate.experience) : null;
  const resume = prev?.ids?.claim_id && prev?.ids?.packet_id ? prev.ids : null;
  const attempt = resume ? (prev.attempt ?? 1) : prev ? (prev.attempt ?? 1) + 1 : 1;
  const baseIds = experienceIds(candidate.id);
  const ops = experienceOperations(candidate.id, attempt);
  const actor = yume.actor ?? 'beacon-improvement';
  const scope = experienceScope(yume.scope ?? 'beacon-improvement', candidate.signature);
  const locator = experienceLocator(candidate.id);
  const dir = path.join(evidenceDir, 'experience');
  const ctx = { ids: { ...baseIds, dream: null, lesson: null, packet_id: null, claim_id: null } };
  const failure = (step, r, extra = {}) => ({
    status: 'failed', step, exit: r.exit,
    error: r.json?.error ?? r.spawnError ?? (r.stderr.slice(0, 300) || `exit ${r.exit}`),
    retry_eligible: r.exit === 3 || r.exit === 4,
    attempt, ids: ctx.ids, operations: ops,
    ...extra,
  });
  const synthetic = (step, error, retry, extra) => failure(step, { exit: null, json: { error }, stderr: '' }, { retry_eligible: retry, ...extra });

  // The store is provisioned by its owner; the loop only checks it.
  const pre = await run(yume, ['status']);
  if (pre.json?.schema_version !== undefined && pre.json.schema_version !== 3) {
    return synthetic('precheck', `store_format_${pre.json.schema_version}`, false);
  }
  if (pre.exit !== 0 || pre.json?.store !== 'initialized' || pre.json?.schema_version !== 3) {
    return synthetic('precheck', 'store_missing', false);
  }

  const text = evidenceText(candidate);
  if (/https?:\/\//.test(text) || /(^|[\s:=])\/[\w.-]+\//.test(text)) {
    return synthetic('evidence', 'evidence_contains_url_or_path', false);
  }
  atomicWrite(path.join(dir, 'evidence.txt'), text);
  const revision = `sha256:${sha(text)}`;
  const when = `${candidate.observation?.date ?? '1970-01-01'}T00:00:00+00:00`;
  const writer = { actor_type: 'agent', name: actor, machine: 'local' };
  const step = async (name, args) => {
    const r = await run(yume, args);
    return r.exit === 0 ? { ok: true, r } : { ok: false, fail: failure(name, r) };
  };

  const ref = { id: baseIds.evidence, source_revision: 'local-digest', locator_id: locator, availability: 'available' };
  const exp = {
    schema_version: 1, id: baseIds.experience, operation_id: ops.ingest, created_at: when, writer, kind: 'experience',
    scope_id: scope, event_time: when, recorded_at: when,
    summary: `Improvement candidate ${candidate.id} for ${candidate.signature}`,
    evidence_refs: [ref],
    claims: [{ type: 'observation', text: `Scanner issue ${candidate.signature} was observed and processed by the improvement loop.`, evidence_ref_ids: [ref.id] }],
  };
  const ingestFile = path.join(dir, 'ingest.json');
  atomicWrite(ingestFile, JSON.stringify({ experiences: [exp], local_map: { [locator]: 'evidence.txt' } }));

  let s = await step('ingest', ['ingest', '--file', ingestFile, '--source-root', dir]);
  if (!s.ok) return s.fail;
  // Prefer the revision yume stored; fall back to the digest of the file it read.
  const stored = JSON.stringify(s.r.json ?? {}).match(/sha256:[0-9a-f]{64}/)?.[0] ?? revision;

  const question = `${candidate.signature}: does the fix hold?`;
  s = await step('prepare', ['prepare', '--auto-split', '--max-experiences', '1', '--scope', scope, '--question', question, '--operation-id', ops.prepare]);
  if (!s.ok) return s.fail;

  const who = ['--actor-type', 'agent', '--actor', actor];
  const endClaim = (claimId) => run(yume, ['dream', 'end', '--claim', claimId, ...who, '--operation-id', ops.end]);
  const passed = candidate.validation?.passed === true;
  const lessonId = passed ? baseIds.lesson : null;
  const pendingNow = async () => {
    const p = await run(yume, ['status', '--pending']);
    return p.exit === 0 ? { rows: p.json?.candidates ?? [], queue: p.json?.queue ?? null } : { fail: failure('status', p) };
  };
  // A proposed lesson is the only thing status can show for a dream; inconclusive ones cannot be confirmed.
  const confirmByPending = async () => {
    const p = await pendingNow();
    if (p.fail) return p;
    return { ...p, ok: passed && p.rows.some((c) => c.dream_id === baseIds.dream) };
  };
  const recorded = (replayed, p) => ({
    status: 'recorded', replayed, attempt, ids: { ...baseIds, lesson: lessonId, packet_id: ctx.ids.packet_id, claim_id: ctx.ids.claim_id },
    operations: ops, pending_candidates: p.rows, queue: p.queue,
  });

  let claimId; let packetId;
  if (resume) {
    ({ claim_id: claimId, packet_id: packetId } = resume);
  } else {
    const maxPackets = yume.maxPackets ?? 10;
    const begin = await run(yume, ['dream', 'begin', '--max', String(maxPackets), ...who, '--operation-id', ops.begin]);
    const done = begin.json?.error === 'claim_released' || begin.json?.status === 'nothing_to_dream';
    if (begin.exit !== 0 && !done) return failure('dream-begin', begin);
    if (done) {
      const c = await confirmByPending();
      if (c.fail) return c.fail;
      return c.ok ? recorded(true, c) : synthetic('dream-begin', 'no_dream_recorded', true);
    }
    const claim = begin.json;
    if (!claim?.claim_id || !Array.isArray(claim.packets)) return synthetic('dream-begin', 'claim_without_packet', false);
    // one experience per packet: ours is the delivered packet whose experience ids equal exactly {ours}
    const idsOf = (x) => x.packet?.experience_ids ?? (x.material?.experiences ?? []).map((e) => e.id);
    const pkt = claim.packets.find((x) => { const o = idsOf(x); return o.length === 1 && o[0] === baseIds.experience; });
    if (!pkt) {
      const delivered = claim.packets.map((x) => x.packet?.id ?? x.packet_id ?? null);
      const rel = await endClaim(claim.claim_id);
      const q = await pendingNow();
      return synthetic('dream-begin', 'packet_not_delivered', true, { claim_id: claim.claim_id, delivered_packets: delivered, released: rel.exit === 0, queue: q.queue ?? null });
    }
    claimId = claim.claim_id; packetId = pkt.packet.id;
  }
  ctx.ids.claim_id = claimId; ctx.ids.packet_id = packetId;

  const dream = {
    schema_version: 3, id: baseIds.dream, operation_id: ops.dream, created_at: when, writer, kind: 'dream',
    scope_id: scope, question, packet_id: packetId, claim_id: claimId,
    experience_ids: [baseIds.experience], prior_lesson_ids: [], outcome_ids: [],
    disposition: passed ? 'propose' : 'inconclusive',
    rationale: passed
      ? 'Validation passed on compatibility evidence for the targeted finding.'
      : 'Validation has not passed; no lesson is proposed.',
    counterevidence: [],
    limitations: [
      'Compatibility with stored reports is not accuracy; no independent labels were used unless stated in the evidence.',
      'Effectiveness on live traffic is not proven.',
    ],
    model: null, effort: null, tokens: null, duration_s: null,
  };
  if (passed) {
    dream.candidate = {
      id: lessonId, scope_id: scope, target_id: `behavior:${slug(candidate.signature)}`, target_revision: null,
      statement: `For ${candidate.signature}, reproduce against frozen evidence before changing the scanner.`,
      applies_when: 'The same scanner issue signature is observed again.',
      does_not_apply_when: 'The issue is caused by external capture failure.',
      suggested_action: 'Reproduce on frozen snapshots, then compare candidate scanner output with stored reports.',
      revisit_when: 'Independent labels contradict the validated behavior.',
      evidence_refs: [{ ...ref, source_revision: stored }], supersedes_ids: [],
    };
  }
  const dreamFile = path.join(dir, 'dream.json');
  atomicWrite(dreamFile, JSON.stringify(dream));
  const rr = await run(yume, ['record', '--file', dreamFile]);
  if (rr.exit !== 0) {
    if (resume && rr.json?.error === 'claim_released') {
      // the claim already ended: the dream is real only if the store shows it
      const c = await confirmByPending();
      if (c.fail) return c.fail;
      if (c.ok) return recorded(true, c);
      return synthetic('record', 'no_dream_recorded', false);
    }
    return failure('record', rr);
  }
  ctx.ids.dream = baseIds.dream; ctx.ids.lesson = lessonId;
  const er = await endClaim(claimId);
  // On a resume the claim may already be ended; the dream is recorded either way.
  if (er.exit !== 0 && !(resume && er.json?.error === 'claim_released')) return failure('dream-end', er);

  const p = await pendingNow();
  if (p.fail) return p.fail;
  return recorded(false, p);
}
