# Drift & target-registry harness (reference copies)

Live copies run from the local benchmark workspace (`beacon-benchmark-100/`, not in
this repo — snapshots and Lighthouse raw data stay local). Committed here so the
measurement infrastructure survives the machine.

| File | Role |
|---|---|
| `targets.mjs` | Target registry API: `select({role,tag,status})` + capture-outcome writeback; 3 consecutive failures auto-exclude a site (walled/dead) and prompt a same-band replacement. `targets.json` (local) is the single source of truth for all site lists. |
| `build-targets.mjs` | One-time migration that assembled `targets.json` from `raw/*-rec.json` + the 2026-07-05 capture outcomes + the drift/GT role sets. |
| `drift-capture.mjs` | Captures the registry's active drift subset with the pinned recipe and audits with the current engine. |
| `drift-weekly.mjs` | Weekly scheduled entry point (Windows Task Scheduler task `beacon-weekly-drift`, Mondays 10:00, catch-up on missed runs): capture → same-engine compare vs the previous weekly run → append `drift-history.jsonl` → prune run dirs beyond 8. |

The weekly job is pure measurement bookkeeping — no AI, no transmission; results
accumulate locally and feed VALIDATION.md's L0 error-bar series.
