# Drift & target-registry harness (reference copies)

Live copies run from the local benchmark workspace (`beacon-benchmark-100/`, not in
this repo — snapshots and Lighthouse raw data stay local). Committed here so the
measurement infrastructure survives the machine.

| File | Role |
|---|---|
| `targets.mjs` | Target registry API: `select({role,tag,status})` + capture-outcome writeback; 3 consecutive failures auto-exclude a site (walled/dead) and prompt a same-band replacement. `targets.json` (local) is the single source of truth for all site lists. |
| `build-targets.mjs` | One-time migration that assembled `targets.json` from `raw/*-rec.json` + the 2026-07-05 capture outcomes + the drift/GT role sets. |
| `drift-capture.mjs` | Captures the registry's active drift subset with the pinned recipe and audits with the current engine. |
| `add-targets.mjs` | Candidate intake: given a JSON list of {url, band, tags}, probes each with the pinned capture recipe, runs Lighthouse (accessibility) for pairing data, and self-registers survivors (walled/dead attempts are recorded too). Used 2026-07-22 to grow the registry to 100 sites with new rtl / indic-sea / gov-form / legacy archetype bands (`candidates-2026-07-22.json`). |
| `probe-walled.mjs` | Monthly re-probe of excluded core sites (bot walls come and go); auto-recovery to active on success. Called by drift-weekly, self-filtering. |
| `source-targets.mjs` | Survey-tier candidate sourcing: downloads the Tranco top-1M research list, stratified deterministic sampling across rank bands, emits survey-queue.json (9,454 candidates built 2026-07-22, seed 20260722). |
| `survey-intake.mjs` | Nightly survey intake (Windows task `beacon-survey-intake`, 02:30, 300 sites/night): capture, gzipped snapshot, current-engine audit, self-registration with language tags. No Lighthouse at this tier. |
| `drift-weekly.mjs` | Weekly scheduled entry point (Windows Task Scheduler task `beacon-weekly-drift`, Mondays 10:00, catch-up on missed runs): capture → same-engine compare vs the previous weekly run → append `drift-history.jsonl` → prune run dirs beyond 8. |

Registry policy (config in targets.json): append-only — targets are never deleted, only classified by status; the core tier has an active floor (100) whose shortfall is listed in every weekly log for human replenishment; important targets (GT/drift members) are never suggested for replacement. Tiers: core (~100 curated, all roles) / survey (Tranco-sampled, engine-only, the road to 10,000). The weekly job is pure measurement bookkeeping — no AI, no transmission; results
accumulate locally and feed VALIDATION.md's L0 error-bar series.
