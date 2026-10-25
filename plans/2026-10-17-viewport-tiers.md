# Viewport tiers + automatic UI gate (2026-10-17)

User decisions (2026-10-16/17): three check levels; mobile emulation; L1 runs
automatically before an agent reports done; L2 runs before a commit; L3 only on
explicit `/beacon:inspect`. Fewer laptop/tablet widths, more phone widths.
Foldables: unfolded Galaxy Z Fold 6 only (Chrome DevTools EmulatedDevices.ts:
744x860, DPR 2.625); folded cover screens (344 on Fold 5) are covered by 320.
VR headsets: no extra viewport (browser windows there are tablet/desktop sized;
touch-target size already covers imprecise pointing).

## 1. Viewport matrix — `core/scripts/viewport-tiers.mjs` (new, in manifest SCRIPTS)

```js
export const VIEWPORT_TIERS = { quick: [...], feature: [...], full: [...] }
export function viewportsForLevel(level)   // throws on unknown level
export const LEVELS = ['quick', 'feature', 'full']
export function schemesForLevel(level)     // quick → ['light'], else ['light','dark']
```

Viewport shape: `{ label: 'WxH', name, width, height, emulate? }` where
`emulate = { isMobile, hasTouch, deviceScaleFactor, userAgent }`. Levels nest
(quick ⊂ feature ⊂ full), arrays sorted by width ascending so 320 stays at
index 0 of the full list (existing tests rely on it).

| level | label | name | emulate | source |
|---|---|---|---|---|
| quick | 360x780 | phone-android | yes, DPR 3, Android Chrome Mobile UA | Playwright Galaxy S24 |
| quick | 1280x900 | laptop | no | VALIDATION.md L0 recipe |
| feature | 320x720 | reflow-320 | **no** (WCAG 1.4.10 = 320 CSS px at 400% zoom, not a device) | existing tier2 |
| feature | 768x1024 | tablet | yes, DPR 2, iPad UA | Playwright iPad (gen 5) |
| full | 390x844 | phone-ios | yes, DPR 3, iPhone UA | Playwright iPhone 12 (height from device spec, not Playwright's 664) |
| full | 744x860 | fold-open | yes, DPR 2.625, Android UA | Chrome DevTools Galaxy Z Fold 6 unfolded |
| full | 844x390 | phone-landscape | yes, DPR 3, iPhone UA | 390x844 rotated |
| full | 1920x1080 | desktop | no | common desktop |

Take UA strings from Playwright's `deviceDescriptorsSource.json` (resolve via
`loadPlaywright` path or copy verbatim with a comment naming the device).

## 2. design-qa.mjs

- `--level quick|feature|full` (default `full`, so `/beacon:inspect` keeps today's
  behavior); `viewports` option still overrides.
- `DESIGN_QA_VIEWPORTS = viewportsForLevel('full')`.
- Page creation: `browser.newContext({ viewport, colorScheme, ...emulate })` →
  `context.newPage()`; close the context in `finally`. Keep `page.emulateMedia`
  if still needed for scheme.
- Output: `metadata.level`, `metadata.viewports` = labels, `ENGINE` →
  `beacon-design-qa@2`. Runs keep `viewport: label`.
- `classifySnapshot` unchanged.

## 3. tier2-audit.mjs

- `--level` (default `feature`); `TIER2_VIEWPORTS = viewportsForLevel('feature')`.
- Same newContext/emulate change. `DETECTOR_VERSION` → `beacon-tier2-audit@3`
  (touch-target findings change under mobile emulation).
- Fakes in `test/fake-playwright.mjs` and the inline fake in
  `test/tier2-audit.test.mjs` gain `newContext()` returning `{ newPage, close }`.

## 4. UI gate hook — `scripts/beacon-ui-gate.mjs` (hand-kept, next to the other hooks)

One script, dispatch on `hook_event_name` from stdin JSON. Exit 0 silently on
unparsable input, missing `cwd`, or non-git cwd. Never throw.

UI file predicate: same extension regex as `scripts/a11y-advisor-hook.mjs`
`UI_FILE_PATTERN` (copy it; comment pointing at the source). Skip paths under
`node_modules|reports|skills|commands|plugins|scripts|test`.

Changed UI files = `git status --porcelain` in `cwd` (tracked + untracked),
filtered by the predicate. Newest change = max mtime of those files.

Results = `<cwd>/reports/design-qa/*.json` whose `metadata.engine_fingerprint`
starts with `beacon-design-qa`; level from `metadata.level` (missing → `full`,
for pre-@2 files). A result "covers" a level when its level is ≥ required
(quick < feature < full) and its file mtime > newest UI change.

- **Stop** (required level `quick`): if `stop_hook_active` → exit 0. If no
  changed UI files → exit 0. If a covering result exists → exit 0. Else print
  `{"decision":"block","reason":"<msg>"}` and exit 0. `<msg>` lists up to 5
  changed files, the exact command
  `node <absolute path of design-qa.mjs next to this hook> --level quick --url <file-or-dev-url> --output reports/design-qa/quick-<YYYY-MM-DD>.json`,
  "fix blocked checks, then finish; if no page can be rendered, say so in the
  reply". ponytail: git-dirty scan, not transcript parsing; re-blocks once per
  turn while UI changes stay unverified, which is intended.
- **PreToolUse** with `tool_input.command` matching `/\bgit\s+commit\b/`
  (required level `feature`): same logic; on failure print
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<msg>"}}`
  with `--level feature`. Any other tool/command → exit 0.
- Script resolves its own directory with `import.meta.url`; no env vars needed.

`hooks/hooks.json`: add `Stop` (no matcher) and `PreToolUse` with matcher
`Bash` → `node ${CLAUDE_PLUGIN_ROOT}/scripts/beacon-ui-gate.mjs`.
Codex wiring is **out of scope** here (its plugin hook mechanism and shell tool
name are unverified); the script itself must not depend on anything
Claude-specific.

## 5. Docs (edit core/content, then `node build.mjs`)

- `core/content/inspect.md`: design-qa section → the three levels (table with
  trigger + viewports + checks), `/beacon:inspect` = `--level full` for both
  scripts; replace "320px and 1280px" (:144) and the 7-width list (:404).
- `core/content/guide.md` (:503, :516, :578, :707-741) and `advisor.md` (:127):
  replace width lists with the new matrix; smallest edit that keeps the text true.
- `ROADMAP.md:55`, `CHANGELOG.md` (Unreleased: viewport tiers, mobile emulation,
  engine bumps, UI gate hook).
- `VALIDATION.md`: under the L2 tier-2 section add a dated calibration note
  (engine @3, matrix, emulation, why 320 stays unemulated); note design-qa @2.
  Keep the 1.4.10 coverage rows as PARTIAL (no change in tier2).

## 6. Tests (write first, see them fail, then implement)

- `test/viewport-tiers.test.mjs`: nesting, 320 first in full, 1280x900 in every
  level, labels unique and equal `${w}x${h}`, every `emulate` has
  isMobile/hasTouch/userAgent (UA contains `Mobile` or `iPad`), unknown level throws,
  `schemesForLevel`.
- `test/design-qa.test.mjs`: width assertion → new full list; `--level quick`
  parses; metadata carries `level`.
- `test/tier2-audit.test.mjs`: keys for the feature set; fakes updated.
- `test/ui-gate-hook.test.mjs`: spawn the hook with stdin JSON against a temp
  git repo: (a) no UI change → no output; (b) changed `.html`, no result → block
  JSON with the command; (c) quick result newer → no output; (d) `stop_hook_active`
  → no output; (e) PreToolUse `git commit -m x` with only a quick result → deny;
  with a feature result → no output; (f) non-git cwd → no output.

## 7. Acceptance

- `node --test` all pass (541 today + new), `node build.mjs --check` clean,
  `git diff --check` clean.
- `node scripts/design-qa.mjs --level quick --url docs/index.html --output /tmp/dq.json`
  runs with a locally installed Chromium (see how `loadPlaywright` resolves;
  set `PLAYWRIGHT_BROWSERS_PATH` if needed) and the JSON lists exactly
  `360x780`, `1280x900`, light only.
- No commit, no push.
