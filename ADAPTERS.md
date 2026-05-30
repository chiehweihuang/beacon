# Beacon Adapters

Beacon's accessibility + AEO knowledge runs in more than one agent runtime.
Each runtime has different extension mechanics (Claude Code uses commands +
hooks; Codex uses a single `SKILL.md` + references; Copilot is future). This
file tracks how those surfaces relate, what is shared, what is deliberately
divergent, and what still needs reconciliation.

> **Phase status:** B (subdirectory adapters, manual sync). Phase A (extract a
> single `core/` + a `build.mjs` that assembles every adapter from it) is the
> planned successor. This file is the drift inventory that makes Phase A
> tractable — you cannot extract a clean core until you can see, side by side,
> exactly what is shared.

## Surfaces

| Surface | Lives in repo at | Deploys to | Extension mechanic |
|---|---|---|---|
| Claude Code (canonical) | repo root (`commands/`, `hooks/`, `scripts/`, `references/`, `.claude-plugin/`) | `~/.claude/plugins/cache/beacon/...` | `plugin.json` skills + PostToolUse / SessionStart / UserPromptSubmit hooks |
| Codex | `adapters/codex/` | `~/.codex/skills/beacon/` | single `SKILL.md` + on-demand `references/` loading; CLI helper scripts |
| Copilot | (not yet) | — | — |

The Claude Code layout at the repo root is the **canonical** source for shared
knowledge content during Phase B. The Codex adapter is canonical for
Codex-specific framing (goal/skill invocation, CLI helpers). Where the two
disagree on shared content, CC wins unless this file records otherwise.

## What is shared (Phase A core candidates)

These exist in both surfaces as hand-maintained copies. They are identical or
near-identical and should collapse into a single `core/` in Phase A.

| Content | CC location | Codex location | Status |
|---|---|---|---|
| WCAG criteria reference | `references/wcag-quick.md` | `adapters/codex/references/wcag-quick.md` | shared, keep in sync by hand |
| Component patterns | `references/patterns.md` | `adapters/codex/references/patterns.md` | shared |
| Legal brief (6 jurisdictions) | `references/legal-brief.md` | `adapters/codex/references/legal-brief.md` | shared |
| Disability categories | `references/disabilities.md` | `adapters/codex/references/disabilities.md` | shared |
| Case studies | `references/cases.md` | `adapters/codex/references/cases.md` | shared |
| Document a11y | `references/documents.md` | `adapters/codex/references/documents.md` | shared |
| Report generator | `scripts/generate-report.mjs` | `adapters/codex/scripts/generate-report.mjs` | **identical after CRLF normalization** — pure line-ending diff, not content drift |
| Inspect process prose | `commands/inspect.md` | `adapters/codex/references/beacon-inspect.md` | near-identical (codex port restructured commands → references) |
| Guide process prose | `commands/guide.md` | `adapters/codex/references/beacon-guide.md` | near-identical |
| Advisor process prose | `commands/advisor.md` | `adapters/codex/references/beacon-advisor.md` | near-identical |

## What is deliberately divergent (stays adapter-specific)

These are NOT drift to fix — they are runtime-specific by design. Phase A keeps
them in their respective `adapters/<surface>/`, not in `core/`.

| Item | Surface | Why it stays separate |
|---|---|---|
| `hooks/hooks.json` | CC only | Codex has no PostToolUse / SessionStart hook system |
| `scripts/a11y-advisor-hook.mjs` | CC only | PostToolUse hook: reads stdin hook payload, writes JSON `additionalContext`. Hook-shaped. |
| `scripts/beacon-prompt-gate.mjs` | CC only | UserPromptSubmit gate — proactive invocation, Claude-specific |
| `scripts/beacon-session-start.mjs` | CC only | SessionStart governance injection — Claude-specific |
| `adapters/codex/scripts/advisor.mjs` | Codex only | Same detection logic as the CC hook, but shaped as a standalone CLI (`node advisor.mjs <file>`, exit 2 on issues) because Codex invokes by command, not hook |
| `adapters/codex/references/goal-workflows.md` | Codex only | Codex's user interface is goals/skills, not slash commands — these are goal-phrasing patterns with no CC equivalent |
| `adapters/codex/references/repeat-testing.md` | Codex only | Codex repeat-testing flow (CLI helpers). The heavyweight externalized version of this concept is the separate `a11y-skill-workspace` improve pipeline. |

## Reconciliation log

Decisions about content that drifted and was pulled back across surfaces.

### 2026-05-28 · `static-audit.mjs` backported Codex → CC

- **Origin:** Codex adapter had `scripts/static-audit.mjs` (456-line deterministic Tier 1 static scanner producing `generate-report.mjs`-compatible JSON). CC had no equivalent — CC's inspect was purely agent-prose-driven (agent reads files, applies judgment, hand-writes `audit-results.json`).
- **Decision:** backport to CC as a shared core capability. A deterministic Tier 1 baseline benefits CC too — it gives the inspect skill a reproducible starting point the agent can run, then enrich with judgment. It also serves as a reference implementation of the `audit-results.json` schema (which ROADMAP notes is otherwise undocumented).
- **Landed:** `scripts/static-audit.mjs` (this branch). Verified: `static-audit.mjs → generate-report.mjs` chain produces a valid 134 KB report on a known-bad fixture (score 36, 19 findings).
- **Known duplication:** `static-audit.mjs` now exists in BOTH `scripts/` (CC) and `adapters/codex/scripts/` (Codex self-contained copy). This duplication is inherent to Phase B — the Codex adapter must be self-contained because it deploys to `~/.codex/skills/beacon/` where it cannot reach the repo's `scripts/`. Phase A's `build.mjs` resolves this: `static-audit.mjs` lives once in `core/scripts/` and is copied into each built adapter.
- **Not yet wired:** `scripts/static-audit.mjs` is present but not yet referenced from `commands/inspect.md`'s flow. Wiring it into Step 2 / Step 2a is a deliberate follow-up, sequenced AFTER PR #6 (`feat/inspect-step2-default-on`) merges, to avoid a conflicting edit to the same Step 2 region. Until wired, it is invocable manually: `node scripts/static-audit.mjs --scope "..." --output audit-results.json <paths>`.
- **Calibration note (non-blocking):** the deterministic script and agent-judgment Tier 1 can disagree on the same fixture (script found 19 findings / score 36 vs an agent's hand-audit of 13 findings / score 18 on bad-ecommerce). This agent-vs-script divergence is itself useful signal and is exactly what the `a11y-skill-workspace` pipeline is built to surface. Not reconciled here.

## Phase A — implemented (structure A2)

> Build it with `node build.mjs`; verify with `node build.mjs --check`;
> re-derive core from committed variants with `node extract.mjs`; deploy the
> codex adapter with `node tools/deploy-codex.mjs`. Tests: `node --test test/*.test.mjs`.

> Full design: `docs/superpowers/specs/2026-05-30-phase-a-core-extraction-design.md`
> (spike-validated 14/0). An earlier sketch here proposed an A3-style layout with
> CC moved under `adapters/claude-code/`. That was **rejected** in the design
> because changing `marketplace.json source` from `./` would move the install path
> and risk breaking the live v2.0.9 plugin. The chosen structure is **A2**: CC
> build outputs stay at the repo root, every load path unchanged.

Target structure (A2):

```
beacon/
  core/
    content/      guide.md, inspect.md, advisor.md (neutral prose, @cc/@codex markers)
    references/   wcag-quick, patterns, legal-brief, disabilities, cases, documents
    scripts/      static-audit.mjs, generate-report.mjs
  build.mjs       core -> every adapter, via an explicit GENERATED manifest
  extract.mjs     one-time bootstrap: committed variants -> marked core (LCS)

  commands/ references/ scripts/   BUILD OUTPUT at repo root (load paths UNCHANGED)
  scripts/{hook scripts} hooks/ .claude-plugin/   CC-only, hand-kept, build never touches
  adapters/codex/   beacon-*.md + shared refs/scripts BUILT; SKILL.md + goal-workflows
                    + repeat-testing + advisor.mjs hand-kept
```

`build.mjs` operates on an explicit `GENERATED` manifest (not whole directories)
because the output dirs mix generated and hand-kept files; it validates parity
with `--check` (build to temp, diff only the GENERATED set). See the design spec
for the manifest and the migration-safety invariant (build reproduces committed
outputs byte-identically; `git diff` empty after build).
