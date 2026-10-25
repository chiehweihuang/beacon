# Improvement loop, phase 1: zero-model material preparation (2026-10-25)

Implements OpenSpec change `automated-improvement-pipeline` tasks 2.1 to 2.5 as the
smallest loop that satisfies IC-01 to IC-08 with synthetic tests. No model calls, no
schedule changes, no network, no publishing. Design source: `openspec/changes/
automated-improvement-pipeline/design.md`; data contracts in the private run notes.

## Layout

- Code: `tools/improvement/` (ESM `.mjs`, no dependencies, Node >= 22.5 for `node:sqlite`
  is not needed here; use only `node:fs`, `node:path`, `node:crypto`, `node:child_process`,
  `node:zlib`). Not part of the plugin, not in `tools/manifest.mjs`.
- Tests: `test/improvement-*.test.mjs`, `node:test` + `node:assert/strict`, temp roots only.
- Every private thing is outside the repo and reached through one config file:

```json
{
  "ops": "/abs/ops-root (scripts + data; for runs always an isolated copy)",
  "state": "/abs/private/state", "evidence": "/abs/private/evidence",
  "beaconRepo": "/abs/beacon-checkout (scanner = core/scripts/static-audit.mjs)",
  "timeoutMs": 120000, "maxExamples": 5,
  "yume": { "repo": "/abs/akegarasu-no-yume", "store": "/abs/private/store",
            "actor": "beacon-improvement", "scope": "beacon-improvement",
            "command": ["python3", "-B", "-m", "akegarasu_no_yume"] },
  "publish": { "allow": ["core/**", "test/**", "openspec/**", "plans/**", "docs/**"],
               "denyRoots": ["<ops>", "<evidence>", "<state>", "<yume.store>"] }
}
```

`yume` and `publish` are optional; without them `record` and `publish` refuse with a
visible reason (not an error of the loop).

CLI: `node tools/improvement/cli.mjs <command> --config FILE [--candidate ID] [...]`.
Commands: `observe`, `select`, `prepare`, `reproduce`, `validate --worktree DIR [--patch FILE]
[--labels FILE] [--write-ops]`, `record`, `publish --manifest FILE --out DIR`, `status`, and
`run` (= observe, select, prepare, reproduce for one candidate; stops there because a fix
candidate is produced outside this phase). Exit codes: 0 ok, 2 refused/invalid input,
3 lock or conflict, 1 unexpected error. One JSON object on stdout.

## Candidate identity (IC-01)

Observation = one issue from `<ops>/quality/issues.json` (`signature`, `status`,
`last_seen`, `count_last`, `examples` ids) plus the `metadata.engine_fingerprint` set read
from the examples' stored reports. Candidate id =
`cand_` + first 16 hex of sha256 of `signature|last_seen|sorted example ids|sorted
fingerprints`. Same observation again: existing candidate reused, nothing rewritten.
New `last_seen` or examples: new candidate, `supersedes: <old id>`; old results kept.
`source_revision` = sha256 of the canonical observation JSON.

## Classes and ranking (select)

| class | signatures | rank |
|---|---|---|
| engine | `rules-diff:*` | 1 |
| timeout | `audit-timeout`, `baseline-timeout` | 2 |
| missing | `missing-report` | 3 |
| external | `capture:*`, `bot-protected` | excluded: not a Beacon defect; recorded with status `excluded` and reason |

Only issues with status `open` or `reproduced`. Within a rank, higher `count_last` first,
then signature order. Skip candidates already in a terminal or in-progress state
(`validated`, `awaiting-review`, `excluded`, `failed` with `retry_eligible:false`). Candidates
already `reproduced` or `candidate` are in hand (the fix is produced outside `run`) and are
not selected again.

Failed candidates never starve others. Every selectable candidate that is not `failed`
ranks before any retry-eligible `failed` one, regardless of class or count; among failed
ones, fewer `failure.attempts` first, then older `failure.at` first. Each infrastructure
failure of the same candidate increments `failure.attempts`; when it reaches
`config.maxRetries` (default 3) the failure becomes `retry_eligible:false` with `reason`
"retry cap reached after N attempts", so it leaves selection and stays visible in `status`.

## State (IC-03)

`<state>/candidates/<id>.json`, written atomically (`<file>.next` then rename):

```
{ id, signature, class, status, supersedes, observation:{date, examples, count, engine_fingerprints},
  source_revision, evidence:{dir, digest, files:[{path, sha256}]} | null,
  reproduction:{command, expected, actual, reproduced, at} | null,
  candidate_fix:{patch, sha256, notes} | null,
  validation:{...} | null, experience:{...} | null,
  receipts:[{action:'published'|'deployed', at, ref}],
  blocked:{reason, retry_eligible} | null,
  history:[{at, from, to, reason}] }
```

Statuses: `observed -> prepared -> reproduced -> candidate -> validated -> awaiting-review`,
plus `excluded`, `blocked`, `failed`. A transition needs its evidence: `prepared` needs
`evidence.digest`; `reproduced` needs `reproduction.reproduced === true` (false -> `blocked`
with reason, `retry_eligible:false`); `candidate` needs `candidate_fix`; `validated` needs
`validation.passed`; `awaiting-review` needs `validated` plus `experience.status` in
`recorded|skipped|failed` (failure is visible, not blocking). `published`/`deployed` are
receipts only, never statuses. Every command re-reads the state file first, verifies the
evidence digests when evidence exists (mismatch -> `evidence.invalid = true`, command
refuses with exit 2), and resumes idempotently: a step already done is reported, not redone.

Lock: `<state>/.lock` directory created with `mkdirSync` holding `{pid, started}`; held for
the whole command. Existing lock -> exit 3 with the holder shown. Stale (holder pid dead) is
reported, never stolen; `--break-stale-lock` is the only way, and it logs a receipt.

## Evidence freeze (prepare, IC-04)

For up to `maxExamples` example ids: copy `survey-audits/<id>.json`,
`survey-snapshots/<id>.html.gz`, `daily-history/<date>/<id>/result.json` and `before.json`
when present into `<evidence>/<id>/files/`. Write `evidence.json`:
`{candidate, source_digests:{<relative path>: sha256}, sampling:{rule:'first N examples',
n, of}, observations:[facts: counts, dates, fingerprints], interpretations:[class, hypothesis],
unknowns:['no independent label', ...], test_evidence:[]}`. Evidence digest = sha256 over
`evidence.json` and all file digests. Nothing in `evidence.json` may contain a URL or an
absolute path; ids only. Source files are never modified; a later digest mismatch marks the
candidate's evidence invalid.

## Reproduce (IC-02)

Per class, against the frozen files only, writing `reproduction` and `<evidence>/<id>/repro.sh`:

- engine: for each example, gunzip the snapshot to a temp file and run
  `node <beaconRepo>/core/scripts/static-audit.mjs --scope <url> --url <url> --date <stored
  metadata.date> --output <tmp>.json <tmp>.html` (url from the stored report's metadata; it
  stays in the private evidence dir, never in state). Compare the count of the targeted
  finding key (`rules-diff:<key>`) in stored vs fresh findings. Reproduced when any example
  differs. Record `{id, stored, fresh, engine_stored, engine_fresh}` per example.
  Premise: a `rules-diff` signature arises when the current engine disagrees with the stored
  report, so it reproduces only while the current engine differs from the report's engine.
  Same engine and equal counts -> `blocked` with reason `engine already aligned`
  (`retry_eligible:false`); that is the designed outcome, not a failure of the loop.
- timeout: run the scanner with `timeoutMs`; reproduced when it times out or exceeds
  `timeoutMs`; record wall ms.
- missing: reproduced when `survey-audits/<id>.json` is absent in `<ops>` and the frozen
  `result.json` has `outcome === 'ok'` and `auditFailed !== true` (a report should exist);
  otherwise blocked as a capture failure.

## Validate (IC-02, IC-04, IC-07)

`validate --worktree DIR [--patch FILE] [--labels FILE] [--write-ops]`:

1. `--patch` registers `candidate_fix` (sha256) and moves `reproduced -> candidate`.
2. target: rerun the reproduction with `<worktree>/core/scripts/static-audit.mjs`; engine
   class fixed when every example's fresh count equals the stored count; timeout fixed when
   within `timeoutMs`; missing class is not validated here (`target: 'not-applicable'`).
3. compatibility: for every frozen snapshot, candidate scanner output vs stored report,
   compared like scanner-regression (summary, findings, legal_risk, remediation, metadata
   minus `audit_methods`, location normalised to `<FILE>:<line>`); report `identical`,
   `different` with the differing finding keys, `errors`. This is compatibility evidence,
   never accuracy.
4. tests: `node --test` in the worktree, exit code recorded.
5. accuracy: `unknown` with reason `no independent labels` unless `--labels FILE` gives
   `{labels:[{id, key, verdict:'correct'|'incorrect', basis, by}]}`; then report agreement
   per key. Output of the same bytes as before is never reported as improved accuracy.

Locations are normalised before any comparison exactly as the ops scanner-regression does:
the file component becomes `<FILE>` for both `<file>:<line>` and bare `<file>` forms, so
the temporary page path never counts as a difference.

`passed` = target fixed, tests exit 0, compatibility errors 0, `candidate_fix.patch_bound`
not false, and every difference is explained: findings may differ only in the targeted key;
summary, legal_risk and remediation may differ only when findings differed in the targeted
key; metadata may differ only in `engine_fingerprint` and `tool_version` (`audit_methods`
is dropped); and when any count changed the fresh fingerprint must differ from the stored
one (the fix must bump `DETECTOR_VERSION`). Everything else is listed under `unexplained`
and blocks `validated`. `validation.engine` records worktree, git revision, scanner sha256
and fresh fingerprint (IC-02 traceability). A `missing`-class candidate refuses `--patch`
and `validate` (exit 2): it needs an operational fix, not an engine fix.
`--write-ops` (only on an isolated ops copy in tests) makes the applicable result
discoverable (IC-08): `node <ops>/triage-daily.mjs set <signature> reproduced --note
"improvement <id>: reproduced <date>; validation <passed|failed>"` and an atomic
`<ops>/quality/improvement/<id>.json` summary; the triage `set` call also regenerates
`<ops>/quality/STATUS.md`, so three files change. Without the flag nothing in `<ops>` changes.
The flag has no built-in check that `<ops>` is an isolated copy; the operator owns that.
SQLite is not written in this phase (db.mjs is an ops script outside this repo).

## Record (experience, IC-06)

Needs `yume` config; otherwise `experience = {status:'skipped', reason}`. The store is
provisioned by the operator (`init`, `upgrade --to 2`, `upgrade --to 3` are owner actions);
the loop only prechecks `status` for schema_version 3 and fails visibly otherwise. Each
candidate uses its own locator id, and the yume scope is `<config scope>:<slug(signature)>`:
candidates for the same signature share lessons and recall. `prepare --auto-split` runs with
`--max-experiences 1`, so every experience is its own queue packet and packets never mix.
`dream begin --max <yume.maxPackets, default 10>` may deliver several packets; the loop
dreams only the packet whose experience ids equal exactly this candidate's and then ends the
claim, which returns the other delivered packets to pending. If no delivered packet is ours,
the claim is ended at once and the result is `failed` with `packet_not_delivered` (retry
eligible; the owner drains the queue or raises `maxPackets`). Begin/end operation
ids carry an attempt counter kept in the experience object, and the cli passes the previous
experience object back in (`previous`), so a rerun confirms an earlier dream by replaying
`record --file` with the stored packet and claim ids; without stored ids a `nothing_to_dream`
or `claim_released` answer is `failed` with `no_dream_recorded`, never a success. Every subprocess
is `[...yume.command, '--store', store, ...args]` with `cwd = yume.repo`,
`PYTHONDONTWRITEBYTECODE=1`, 60 s timeout; stdout JSON parsed, stderr kept on failure.
Deterministic ids and operation ids from the candidate id (`exp_<hex>`, `evr_<hex>`,
`op_<id>_ingest|prepare|dream`, `drm_<hex>`, `lsn_<hex>`), so a rerun replays instead of
duplicating. Sequence: write `<evidence>/<id>/experience/evidence.txt` (ids, counts,
dates, fingerprints, validation summary; no URLs, no absolute paths), ingest file with
`local_map` relative to `--source-root <evidence>/<id>/experience`; `ingest --file`;
`prepare --auto-split --scope <scope> --question "<signature>: does the fix hold?"
--operation-id`; `dream begin --max 1 --actor-type agent --actor <actor>`; one dream record
(`packet_id`, `claim_id`, evidence ref re-cited with its `sha256:` revision, `disposition:
'propose'` with a candidate lesson only when `validation.passed`, else `'inconclusive'` with
no candidate, `limitations` naming what was not proven, `model: null`, `tokens: null`);
`record --file`; `dream end`. Never `decide`, never `--force`, never `recover`. Non-zero
exit at any step -> `experience = {status:'failed', step, exit, error, retry_eligible: exit
in [3,4]}`; nothing invented, state stays where it was. `status --pending` after a success
is stored as `experience.pending_candidates` for the owner to read.

## Publish boundary (IC-05)

`publish --manifest FILE --out DIR`: manifest `{candidate, files:[{from, to}]}`. Refuse
(exit 2, reasons listed) when: candidate status is not `awaiting-review` or
`review.approved_by` is missing (a human name written by the owner into the state file,
never by this tool); any `from` is under a `denyRoots` entry or outside `beaconRepo`;
any `to` does not match an `allow` glob; any file contains an absolute path under a deny
root. Otherwise copy into `<out>/` and write `<out>/manifest.json` with digests and a
`published` receipt. The tool never runs git, never touches schedules, never deploys.

## Tests to write first (one `node:test` file per area)

- `improvement-state.test.mjs`: atomic write, transition guards, lock contention (second
  process exit 3), stale lock reported not stolen, evidence digest mismatch refuses.
- `improvement-cycle.test.mjs`: synthetic ops root (targets.json, quality/issues.json with
  one of each class, survey-audits, gz snapshots, daily-history result.json) and a fake
  scanner script that reads an env knob to emit N findings of a key or to sleep; covers
  observe/select ranking and exclusion, candidate identity reuse and supersede, prepare
  digests and source immutability, reproduce red for engine/timeout/missing, interruption
  (env `IMPROVE_FAIL_AFTER_FILE=1` throws mid-prepare; rerun completes, no duplicates).
- `improvement-validate.test.mjs`: fake "fixed" scanner in a fake worktree with a
  `test/` that passes; target fixed, compatibility diff keys, unexplained diff blocks,
  accuracy unknown vs labelled, `--write-ops` writes only the two expected paths.
- `improvement-experience.test.mjs`: `yume.command` pointing at a fake CLI script that
  records argv and returns canned JSON or a chosen exit per step; asserts deterministic ids,
  replay safety, failure recorded without invented results, no `decide` ever invoked.
- `improvement-publish.test.mjs`: unapproved candidate refused, private file refused,
  disallowed path refused, approved and allowed staged with manifest; no git spawned.

## Out of scope here

Model runner, schedule wiring, SQLite writes, real yume store, real publication, and the
GAP-01 to 03 ops fixes (separate candidate patch).
