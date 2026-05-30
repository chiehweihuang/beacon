# Phase A · Core Extraction + build.mjs · Design

**Date:** 2026-05-30
**Status:** design v2 — spike-validated (14/0) + codex-reviewed (must-fix items folded)
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

### Marker parser rules (build.mjs MUST enforce)

The marker mechanism is only safe if `build.mjs` treats markers as a strict
mini-grammar, not loose text substitution:

1. **A marker line is recognized only when the trimmed line equals exactly**
   `<!--@cc-->`, `<!--/@cc-->`, `<!--@codex-->`, or `<!--/@codex-->`. Anything
   else on the line means it is content, not a marker.
2. **Inside fenced code blocks (` ``` ` … ` ``` `) and inside the YAML
   frontmatter (the first `---` … `---` block), markers are NOT interpreted** —
   they pass through as literal content. This prevents a code sample or a
   frontmatter value that happens to contain `<!--@cc-->` from being treated as a
   build directive. `build.mjs` tracks fence and frontmatter state while scanning.
3. **No nesting, no interleaving.** A `@cc` block may not open inside another
   `@cc`/`@codex` block. `build.mjs` rejects (exits non-zero with the line number)
   any open-without-close, close-without-open, or nested/interleaved markers.
4. **Collision = hard fail.** If a content line outside a marker block would, when
   trimmed, equal a marker token (i.e. real content needs the literal string
   `<!--@cc-->`), the build fails loudly. Escape convention: write the token with a
   zero-width-safe placeholder documented in the build (e.g. `<!--@​cc-->`),
   or — preferred — never put marker-literal strings in content. This case is not
   expected today (no current content contains the tokens) but the build must
   detect it rather than silently mis-split.
5. **Reordered/duplicated blocks are named.** Where the same logical content
   appears twice (once per surface, as with the inspect Step 2 reorder), the core
   file carries a `<!-- DUP: <label> — edit both @cc and @codex copies -->` note
   adjacent to the pair, and the round-trip test asserts the pair stays in sync by
   label. This is the mitigation for the "edit one copy only" trap.

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
5. `--check` mode: build into a staging tree and diff against committed outputs;
   exit non-zero if any differ. This is the parity gate.

### Build via staging, not in-place (reduces repo-root mutation risk)

`build.mjs` always assembles into a temp **staging tree** first, then copies only
the declared GENERATED outputs into place. `--check` stops after the staging diff
(never writes to the repo). A real build writes the staged outputs over exactly
the manifest paths. Benefits: a build that errors mid-way never leaves the repo
root half-written; `--check` and a real build share one code path; nothing
outside the manifest is ever touched.

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

Each manifest entry carries ownership metadata so the build can reason about what
it owns: `{ out, src, kind: 'variant:cc' | 'variant:codex' | 'copy', overwrite }`.
`overwrite` is `true` for every generated output (build owns it); the build
refuses to write a path whose `overwrite` is not set, which is the guard against a
hand-kept file accidentally named like a generated one. `build.mjs` declares a
single `GENERATED` table — the only files it writes and the only files `--check`
compares:

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

**Unmapped core file = fail.** A `validate` step (folded into `--check`) walks
`core/content/*` and `core/scripts/*` and fails if any core file has no
corresponding GENERATED entry. This stops a newly-added core file from being
silently un-built (drift in the other direction).

**Orphan detection:** build flags any file whose name matches a GENERATED-output
pattern but whose `core/` source no longer exists (e.g. a content file removed
from core, its built output left behind). Default is **report-only and fail
`--check` / CI** — never auto-delete (deletion near hand-kept files is too risky).
Actual removal requires an explicit `--prune` flag the maintainer runs
deliberately.

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

**Post-normalization checks** (LF is generally safer than CRLF, but verify the
direction that can break):
- Smoke the 3 hook `.mjs` files after normalization — they are invoked as
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/<hook>.mjs`, so a `#!` shebang line is not
  the exec path, but confirm each still parses + runs and emits the expected
  stdout/stderr shape (the PostToolUse hook writes JSON `additionalContext`).
- Run one frontmatter parse/load check on a built command file after
  normalization — the no-header decision already showed frontmatter is sensitive,
  so confirm the `---` block still parses with LF endings.

## Migration safety

The hard constraint: the live v2.0.9 install must not break. A2 satisfies this
structurally (no load-path change) and the rollout enforces it procedurally:

1. **Content invariant (necessary, not sufficient).** At no step does the
   *content* of any committed CC output change. `build.mjs` reproduces the current
   committed files exactly (proven byte-identical by the spike). After introducing
   `core/` + `build.mjs`, running `node build.mjs` on a clean checkout MUST leave
   `git diff` empty (modulo the one-time CRLF commit). If it doesn't, the build is
   wrong — stop. **But empty git diff only proves the bytes match the repo; it does
   not prove Claude loads the same runtime surface.** That is what step 3 verifies.
2. **Load paths untouched.** `marketplace.json source: "./"`,
   `plugin.json skills: ["./commands/"]`, and `hooks.json`'s
   `${CLAUDE_PLUGIN_ROOT}/scripts/...` are never edited. `commands/`, `scripts/`,
   `hooks/`, `.claude-plugin/` stay at the repo root. **Caveat:** "paths unchanged"
   is not "install behavior unchanged" — marketplace packaging can include/exclude
   files by source layout, ignores, or cache state. Adding `core/`, `build.mjs`,
   `extract.mjs`, `test/`, and `adapters/` to the repo root means the installed
   package now carries extra dirs. Verify these don't change what the plugin loader
   picks up (it loads `./commands/` + `hooks.json` + `${CLAUDE_PLUGIN_ROOT}/scripts/`
   only, so extra dirs should be inert — but confirm in step 3, and add a
   `.gitattributes export-ignore` / marketplace-ignore for `core/`, `extract.mjs`,
   `test/` if the packaging includes everything).
3. **Live-install smoke test (from the actual installed location).**
   `${CLAUDE_PLUGIN_ROOT}` differs between a repo checkout, the plugin cache, and a
   marketplace install — so the smoke MUST run from where the plugin is actually
   installed, not from the repo. Before merge, on the installed copy:
   - **plugin discovery** from `.claude-plugin/` (the plugin appears + version)
   - **command loading** from `commands/` — run `/beacon:inspect` on a fixture and
     `/beacon:guide`
   - **all three hooks** fire via `${CLAUDE_PLUGIN_ROOT}/scripts/...`: SessionStart
     (governance injection), UserPromptSubmit (prompt gate), PostToolUse (advisor,
     by editing a UI file)
   - **copied shared scripts/references resolve** from the installed package path
     (e.g. `static-audit.mjs` runs, `generate-report.mjs` finds its inputs)
   - **two install modes:** a fresh install AND an upgrade over the existing
     v2.0.9 (the cache may preserve old package state).
   Acceptance: behavior identical to v2.0.9 in all of the above.

## Edit workflow after Phase A

- Edit shared knowledge / prose → edit `core/`, run `node build.mjs`, commit
  both the core change and the regenerated outputs.
- Edit adapter-specific behavior (a hook, the codex SKILL.md) → edit it directly;
  build leaves it alone.
- CI / pre-commit (future, optional): run `node build.mjs --check` to fail if
  outputs are stale relative to core.

## Testing

Named locations (under a new `test/` dir at repo root — inert to the plugin
loader, marketplace-ignored per Migration safety step 2):

- `test/marker-parser.test.mjs` — unit tests for the marker mini-grammar: fence /
  frontmatter pass-through, nesting/interleaving rejection, collision hard-fail,
  variant strip correctness.
- `test/build-manifest.test.mjs` — the GENERATED manifest: overwrite guard,
  unmapped-core-file fail, orphan report (no delete without `--prune`).
- `test/build-roundtrip.test.mjs` — the spike, committed: extract → build →
  byte-compare for all 3 content files + copy parity for references/scripts,
  plus the DUP-label sync assertion. Runs under `node --test`.
- `build.mjs --check` is the parity gate (CI / pre-commit).
- Manual **live-install smoke** (Migration safety step 3) is the migration
  acceptance test — run from the installed location, both install modes.

## Implementation notes (for the plan)

**Commit order** (each commit independently verifiable):
1. `.gitattributes` + CRLF→LF normalization ONLY (mechanical churn isolated; no
   logic). After this, the repo is LF and the byte-identity baseline is set.
2. Add `core/` + `extract.mjs` + `build.mjs` + `test/`, run `extract` then
   `build`. Expected: `git diff` empty (build reproduces the LF-normalized
   committed outputs). This commit proves the content invariant.
3. Tests + `--check` wiring (if not in commit 2) + the codex deploy note.
4. (Separate, gated) live-install smoke performed and recorded before merge.

**`extract.mjs` is kept, not deleted.** Its primary use is the one-time bootstrap
(commit 2), but it stays in the repo as a reproducible regeneration tool: if the
committed variants are ever edited directly (e.g. an emergency hotfix to
`commands/inspect.md`), `extract` can re-derive the marked core, and the
round-trip test can confirm nothing was lost.

**Generated outputs stay committed.** Because `marketplace.json source: "./"`
installs the repo as-is, the built `commands/`, `references/`, `scripts/`, and
`adapters/codex/*` outputs MUST remain committed — the plugin installs from git,
not from a build step. `core/` is the edit surface; the committed outputs are what
ships. (This is why "git diff empty after build" is the invariant, not "build
artifacts are gitignored.")

**Codex deploy step.** The build writes the codex adapter into `adapters/codex/`
in the repo, but the live Codex skill lives at `~/.codex/skills/beacon/`. Deploy
is a separate copy step (LF-normalized), the same surgical sync used in Phase B:
copy the changed `adapters/codex/` files to `~/.codex/skills/beacon/`. The plan
should provide a `deploy-codex` helper (or document the copy) and note it is
manual / out-of-CI (it writes to the user's home, not the repo).

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
