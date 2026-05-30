# Phase A · Core Extraction + build.mjs · Design

**Date:** 2026-05-30
**Status:** design (spike-validated, awaiting plan)
**Lineage:** `ADAPTERS.md` (Phase B drift inventory) → this spec.

## Goal

Eliminate the hand-sync drift between Beacon's two runtime surfaces (Claude
Code plugin + Codex skill) by extracting one canonical `core/` and a `build.mjs`
that regenerates each adapter from it. The migration must not change what the
live v2.0.9 Claude Code plugin installs or how it loads — a hard constraint.

## Decision: structure A2 (neutral core, build outputs to repo root)

Chosen over A1 (CC-canonical, generate codex) and A3 (full monorepo with
`marketplace.json source` change). A2 keeps every load path unchanged while
giving a runtime-neutral core that a future Copilot adapter can derive from
without being shaped by CC's command format.

```
beacon/
  core/                          # single source of truth
    content/
      guide.md  inspect.md  advisor.md     # neutral prose with @cc / @codex markers
    references/
      wcag-quick.md  patterns.md  legal-brief.md
      disabilities.md  cases.md  documents.md
    scripts/
      static-audit.mjs  generate-report.mjs
  build.mjs                      # core -> every adapter
  extract.mjs                    # one-time bootstrap: committed variants -> marked core

  # Claude Code plugin (build outputs land at repo root — load paths UNCHANGED)
  commands/{guide,inspect,advisor}.md          # BUILD OUTPUT (@cc kept, @codex stripped)
  references/*                                  # BUILD OUTPUT (copy of core/references)
  scripts/{static-audit,generate-report}.mjs   # BUILD OUTPUT (copy of core/scripts)
  scripts/{a11y-advisor-hook,beacon-prompt-gate,beacon-session-start}.mjs  # CC-only, hand-kept
  hooks/hooks.json                             # CC-only, hand-kept
  .claude-plugin/{plugin,marketplace}.json     # UNCHANGED

  # Codex adapter (build outputs under adapters/codex)
  adapters/codex/
    SKILL.md                                   # codex-only, hand-kept
    references/beacon-{guide,inspect,advisor}.md   # BUILD OUTPUT (@codex kept, @cc stripped)
    references/{wcag-quick,patterns,...}.md        # BUILD OUTPUT (copy of core/references)
    references/{goal-workflows,repeat-testing}.md  # codex-only, hand-kept
    scripts/{static-audit,generate-report}.mjs     # BUILD OUTPUT (copy of core/scripts)
    scripts/advisor.mjs                            # codex-only, hand-kept (CLI form)
```

### core vs adapter-specific boundary

| In `core/` (shared, built into every adapter) | Adapter-specific (hand-kept, build never touches) |
|---|---|
| `content/{guide,inspect,advisor}.md` prose | CC: `hooks/hooks.json` + 3 hook scripts (`a11y-advisor-hook`, `beacon-prompt-gate`, `beacon-session-start`) |
| `references/*` (6 knowledge files) | CC: `.claude-plugin/{plugin,marketplace}.json` |
| `scripts/{static-audit,generate-report}.mjs` | Codex: `SKILL.md`, `goal-workflows.md`, `repeat-testing.md`, `advisor.mjs` (CLI) |

Rationale for each adapter-specific item is in `ADAPTERS.md` ("What is
deliberately divergent"). These are runtime-mechanic differences (hooks vs CLI,
plugin manifest vs skill entry), not drift.

## The marker mechanism (spike-validated)

Shared prose is ~98% identical across surfaces; the small per-surface deltas
(advisor: 0 lines, guide: 1, inspect: ~10) are expressed inline in the core
content file using block markers on their own lines:

```
<!--@cc-->
Appended to `~/.claude/a11y-audit-stats.jsonl`. No code, no paths, no project names.
<!--/@cc-->
<!--@codex-->
Append only to a local private stats file if the user explicitly opts in. No code, no paths, no project names.
<!--/@codex-->
```

- **build CC variant** = drop `@codex` blocks (markers + content), strip `@cc`
  marker lines (keep their content).
- **build codex variant** = drop `@cc` blocks, strip `@codex` marker lines, write
  as `beacon-<name>.md`.

`extract.mjs` bootstraps the core files: it takes the two committed variants and
LCS-merges them into one marked core (common lines plain, CC-only runs wrapped
in `@cc`, codex-only runs in `@codex`).

**Non-swap deltas (reordering).** Not every delta is a clean 1:1 line swap — the
`inspect` pair includes a *reordered* Step 2 tool block (the same lines in a
different order across surfaces). LCS handles this correctly by representing the
reorder as a CC-only run (the block in CC's order) plus a codex-only run (the
block in codex's order); the spike confirmed `inspect` round-trips byte-identical
(30 marker lines, 4 hunks). The consequence to know: reordered content appears
*twice* in the marked core (once per `@cc`/`@codex` block), so a future edit to
that shared-but-reordered content must be applied in both blocks. This is rare
(one block today) and visible in the markers; if it becomes common, that section
is a candidate to converge to a single order so it can drop back to plain shared
text.

### Validation (spike, 2026-05-30)

A non-destructive spike read the committed CC + codex variants, extracted a
marked core via LCS, rebuilt both variants, and compared byte-for-byte
(CRLF-normalized):

```
guide   CC + codex round-trip : PASS  (core 690L, 4 marker lines)
inspect CC + codex round-trip : PASS  (core 721L, 30 marker lines)
advisor CC + codex round-trip : PASS  (core 147L, 0 markers)
6 references + 2 scripts       : PASS  (CC == codex content already)
RESULT: 14 pass / 0 fail
```

This proves the load-bearing claim: one marked core regenerates both surfaces
byte-identically. Extraction is mechanical (LCS), not hand-authored.

## build.mjs

Responsibilities:
1. For each `core/content/<name>.md`: write `commands/<name>.md` (CC variant) and
   `adapters/codex/references/beacon-<name>.md` (codex variant).
2. Copy `core/references/*` → `references/*` and → `adapters/codex/references/*`.
3. Copy `core/scripts/*` → `scripts/*` and → `adapters/codex/scripts/*`.
4. Never touch adapter-specific hand-kept files.
5. `--check` mode: build into memory/temp and diff against committed outputs;
   exit non-zero if any differ. This is the parity gate.

### Generated-file manifest (the crux — output dirs are mixed)

`commands/`, `scripts/`, and `adapters/codex/references/` and
`adapters/codex/scripts/` each contain BOTH build-generated files AND hand-kept
adapter-specific files. `scripts/` holds 2 generated (`static-audit`,
`generate-report`) next to 3 hand-kept CC hooks (`a11y-advisor-hook`,
`beacon-prompt-gate`, `beacon-session-start`); `adapters/codex/references/` holds
generated `beacon-*` + 6 shared next to hand-kept `goal-workflows`,
`repeat-testing`. Therefore `build.mjs` MUST NOT operate on whole directories —
it operates on an explicit manifest of exactly the files it owns. Whole-dir copy
or whole-dir `--check` diff would either clobber hand-kept files or false-fail
parity on them.

`build.mjs` declares a single `GENERATED` table — the only files it writes and
the only files `--check` compares:

```
GENERATED = [
  // CC plugin (repo root)
  { out: 'commands/guide.md',     src: 'core/content/guide.md',   kind: 'variant:cc' },
  { out: 'commands/inspect.md',   src: 'core/content/inspect.md', kind: 'variant:cc' },
  { out: 'commands/advisor.md',   src: 'core/content/advisor.md', kind: 'variant:cc' },
  { out: 'references/<f>.md',      src: 'core/references/<f>.md',  kind: 'copy' },   // 6 files
  { out: 'scripts/static-audit.mjs',    src: 'core/scripts/static-audit.mjs',    kind: 'copy' },
  { out: 'scripts/generate-report.mjs', src: 'core/scripts/generate-report.mjs', kind: 'copy' },
  // Codex adapter
  { out: 'adapters/codex/references/beacon-guide.md',   src: 'core/content/guide.md',   kind: 'variant:codex' },
  { out: 'adapters/codex/references/beacon-inspect.md', src: 'core/content/inspect.md', kind: 'variant:codex' },
  { out: 'adapters/codex/references/beacon-advisor.md', src: 'core/content/advisor.md', kind: 'variant:codex' },
  { out: 'adapters/codex/references/<f>.md',  src: 'core/references/<f>.md', kind: 'copy' },  // 6 files
  { out: 'adapters/codex/scripts/static-audit.mjs',    src: 'core/scripts/static-audit.mjs',    kind: 'copy' },
  { out: 'adapters/codex/scripts/generate-report.mjs', src: 'core/scripts/generate-report.mjs', kind: 'copy' },
]
```

Everything NOT in this table is HAND-KEPT and build never reads, writes, or
checks it: `scripts/{a11y-advisor-hook,beacon-prompt-gate,beacon-session-start}.mjs`,
`hooks/`, `.claude-plugin/`, `adapters/codex/SKILL.md`,
`adapters/codex/references/{goal-workflows,repeat-testing}.md`,
`adapters/codex/scripts/advisor.mjs`.

**Orphan detection:** build also flags (does NOT auto-delete) any file whose name
matches a GENERATED-output pattern but whose `core/` source no longer exists
(e.g. a content file removed from core but its built output left behind). The
maintainer resolves orphans by hand — auto-deletion near hand-kept files is too
risky.

**No GENERATED header in outputs.** An earlier idea injected a
`<!-- GENERATED — edit core -->` banner into each built file. Dropped, for two
reasons: (1) CC command files begin with `---` YAML frontmatter, and a leading
HTML comment would push `---` off line 1 and break the skill loader's frontmatter
detection; (2) any injected banner breaks the byte-identity invariant the spike
proved against the current committed files. Marker-rot (someone editing a built
output instead of `core/`) is instead caught by the `--check` parity gate (run
before commit / in CI), backed by the workflow documentation and this manifest.
The byte-identity baseline stays "current committed files, modulo the one-time
CRLF→LF normalization commit" — no header caveat.

### Line-ending policy

Committed files currently have CRLF. The spike compared CRLF-normalized. The
build must pick one policy. **Decision: build writes LF, and a `.gitattributes`
normalizes the repo** (`*.md text eol=lf`, `*.mjs text eol=lf`). The first build
produces a one-time CRLF→LF normalization diff (its own commit, separate from
logic). Rationale: the Codex deploy target already wants LF; LF is the portable
default; standardizing removes the CRLF-vs-LF false-diff noise that recurred
throughout Phase B.

## Migration safety

The hard constraint: the live v2.0.9 install must not break. A2 satisfies this
structurally (no load-path change) and the rollout enforces it procedurally:

1. **Content invariant.** At no step does the *content* of any committed CC
   output change. `build.mjs` reproduces the current committed files exactly
   (proven byte-identical by the spike). After introducing `core/` + `build.mjs`,
   running `node build.mjs` on a clean checkout MUST leave `git diff` empty
   (modulo the one-time CRLF commit). If it doesn't, the build is wrong — stop.
2. **Load paths untouched.** `marketplace.json source: "./"`,
   `plugin.json skills: ["./commands/"]`, and `hooks.json`'s
   `${CLAUDE_PLUGIN_ROOT}/scripts/...` are never edited. `commands/`, `scripts/`,
   `hooks/`, `.claude-plugin/` stay at the repo root.
3. **Live-install smoke test.** Before merge: install the plugin from the branch
   (or copy to the plugin cache), run `/beacon:inspect` on a fixture, and trigger
   the PostToolUse advisor hook by editing a UI file. Confirm identical behavior
   to v2.0.9.

## Edit workflow after Phase A

- Edit shared knowledge / prose → edit `core/`, run `node build.mjs`, commit
  both the core change and the regenerated outputs.
- Edit adapter-specific behavior (a hook, the codex SKILL.md) → edit it directly;
  build leaves it alone.
- CI / pre-commit (future, optional): run `node build.mjs --check` to fail if
  outputs are stale relative to core.

## Testing

- The validation spike becomes a committed test (`test/build-roundtrip.test.mjs`
  or similar): extract → build → byte-compare for all content files + copy
  parity. Runs under `node --test`.
- `build.mjs --check` as the parity gate.
- Manual live-install smoke (step 3 above) as the migration acceptance test.

## Out of scope

- Copilot adapter (Phase A leaves `adapters/` ready; the actual Copilot wrapper
  is later work).
- Wiring `static-audit.mjs` deeper into the inspect flow beyond what PR #8 did.
- Any change to scoring, references content, or skill behavior — this is a
  pure structural refactor; outputs are byte-identical.

## Acknowledged risks

- **Live-install migration is unverified until step 3.** The spike de-risked the
  merge/split algorithm, not the production plugin load. The plan must run the
  live-install smoke before merge.
- **CRLF normalization churn.** The one-time LF commit touches many files; it is
  isolated to its own commit so it doesn't obscure logic changes.
- **Marker rot.** If someone edits a built output (`commands/inspect.md`) directly
  instead of `core/`, the next build silently overwrites it. Mitigation: the
  `--check` parity gate (run before commit / in CI) fails when a built output
  diverges from what `core/` would regenerate, catching the stale hand-edit. (A
  GENERATED banner in each output was considered and rejected — it would break CC
  frontmatter detection and the byte-identity invariant; see build.mjs.)
- **Mixed output directories.** `commands/`, `scripts/`, and the codex
  `references/`/`scripts/` dirs each hold both generated and hand-kept files.
  `build.mjs` must drive off the explicit GENERATED manifest, never whole-dir
  operations, or it will clobber hand-kept files or false-fail parity on them.
