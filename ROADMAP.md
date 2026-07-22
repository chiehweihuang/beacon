# Beacon Roadmap

Snapshot **2026-07-11**. Last released **v3.0.0**. Pattern Library v1.0 shipped in v2.2.0; v3.0.0 then replaced placeholder scoring with measured category states, coverage-aware scores, and a committed validation charter.

This file is the single place to see **where Beacon is, where it is heading, and how far the current work has got**. Glance here instead of watching individual commits. For internals see [ARCHITECTURE.md](./ARCHITECTURE.md); for skill behaviour see `commands/*.md`.

---

## Where Beacon is heading (active)

**The thesis (direction · this rarely changes).** Beacon is a distributed *signal* each developer or agent carries, not a central scanner like Lighthouse. The payoff is collective: stop AI from regenerating the **same** accessibility mistakes. To get there, detectors stop being hardcoded copies and become shared, contributable **data**.

**Current focus: validation.** The shared Pattern Library is shipped, the remaining aria-heading attribution gap is fixed in engine @8, and the next measurement work is to rerun ground truth for @8 and finish cross-machine score-drift measurement.

| Phase | When | What it delivers |
|---|---|---|
| **v1.0 · data-only** | now | One declarative pattern library; the CC hook and the codex advisor stop drifting by sharing one runtime. No contribution automation yet. |
| **v1.1 · contribution** | next (once a 2nd carrier exists) | Agent drafts a pattern → human approves → PR; CI schema-validates; independent-model review. Optional local "you fixed this before" memory. |
| **v2 · collective** | later | Cross-person aggregation of contributed patterns into a shared map (needs backend + consent). |

### Build progress · Pattern Library v1.0

Updated after each step. This is the live "how far have we got" line.

- [x] **Step 0**: Reconcile the two detector runtimes (CC hook + codex advisor) + characterization baseline · `test/detector-baseline.test.mjs` 52/52 green
- [x] **Step 1**: Declarative schema + 9 web records + validator (5 gates) · `test/patterns-schema.test.mjs` 11/11, full suite 236/236, `--check` clean
- [x] **Step 2**: Register `core/patterns/` in the build manifest so the records actually ship · build ships 48 outputs, `--check` clean
- [x] **Step 3**: Shared `core/scripts/pattern-runtime.mjs` interpreter (`regex` / `regex-guarded` / `regex-count`) · `test/pattern-runtime.test.mjs` 29/29
- [x] **Step 4**: Rewire BOTH runtimes to read the data (behaviour-preserving vs the Step 0 baseline) · baseline still 52/52
- [x] **Step 5**: Migrate the 4 PDF records; inline detectors removed from both runtimes · 13 records, full suite 265/265
- [x] **Step 6**: Ship the v1.0 data-only release · released in v2.2.0

**Deliberate behaviour changes in this initiative** (recorded so they are not mistaken for regressions): the CC hook gained `keydown|keyup` suppression on click handlers, a `<div>/<span> onClick` detector, a word-boundary on `outline`, and the tighter `min(Npx, 100%)` reflow guard; the codex advisor gained the `:focus`-without-`:focus-visible` detector and per-line `aria-hidden` scanning. The two runtimes are now behaviour-identical, locked by the Step 0 baseline.

---

## Current State (v2.0.8)

### Stable & in-production

- **Three skill pipeline**: `/beacon:guide` (pre-code) · `/beacon:advisor` (during code) · `/beacon:inspect` (post-code)
- **PostToolUse hook**: `scripts/a11y-advisor-hook.mjs` auto-triggers `/beacon:advisor` on edits to HTML/CSS/JSX/TSX/Vue/Svelte files
- **Proactive triggering**: SessionStart + UserPromptSubmit hooks (see `scripts/beacon-session-start.mjs`, `scripts/beacon-prompt-gate.mjs`) widen the advisor's invocation surface
- **Severity matrix**: rules-based classification with mandated severities for known WCAG criteria; reduces inter-auditor variance (`commands/inspect.md`)
- **Audit tiers**: Tier 1 static / Tier 2 live browser (Playwright + axe-core) / Tier 3 manual testing
- **Three-state verdict per check item**: `pass` / `fail` / `unverifiable` — prevents penalising CSR/SPA sites for things that genuinely cannot be confirmed from static HTML
- **Confidence-level system**: HIGH / MEDIUM / LOW based on CSR detection; LOW caps overall score at 60 and flags `requires_live_audit: true`
- **Pedagogical demo detection**: deliberately-bad examples in educational pages excluded from scoring

### Recently shipped (this iteration)

| Version | Commit | What |
|---------|--------|------|
| 2.0.3 | `1a842de` | **fix**: `escapeHtml` for all user-supplied report fields (previously only `code_before/after`) |
| 2.0.4 | `3babd88` | **feat**: Methodology & Limits tab + epistemic-honesty banner + bilingual content (zh-Hant + en) + light/dark/auto theme toggle |
| 2.0.5 | `2524783` | **feat**: animated tab hover + URL-slug default filename (`a11y-report-<host>-<slug>-<date>.html`) |
| 2.0.6 | `6c4d50b` | **feat**: full bilingual coverage (tabs, headings, table headers, verdict, score rings, comparison banner, finding labels, legal, remediation, empty states) + gold hover ring on tabs |
| 2.0.7 | `9904c68` | **refactor**: tone pass — `通過/PASS → 達到基準/Meets baseline`, `需改進/NEEDS WORK → 建議考慮改進/Consider improving`, etc. |
| 2.0.8 | `2c7c366` | **feat**: limits + recommended workflow embedded into `/beacon:guide` |

---

## Known Incomplete / Asymmetries

These are intentionally listed so contributors and auto-research loops can target them. Each entry is a sentence problem statement, not a prescription.

### Skill-level asymmetry

- The guide, advisor, inspect, and hook now share the same boundary: static guidance is a baseline, runtime behavior needs verification, and machine checks do not replace disabled-user testing. Keep this wording aligned when any surface changes.

### Report (HTML) edges

- **`buildScoreRing` label argument** is now a bilingual `<span>` pair, but a few SVG fallback paths might still hit it as plain text under uncommon JSON shapes. Not breaking anything observed, but worth fuzz-testing.
- **`buildLegalRiskHTML` keeps the legacy function/data key name** for backwards compatibility even though the rendered UI now says "Jurisdiction Context". A future schema version should rename the JSON surface from `legal_risk` to `jurisdiction_context` while preserving a migration path for old audit files.
- **Comparison banner** (when `--previous` is passed) has not been audited for tone — only its labels were i18n'd.
- **CSV / JSON export of audit results** does not exist. Currently only the rendered HTML report is the human-facing output; JSON is the source of truth but consumers have to parse it themselves.
- **`audit-results.json` schema is not formally documented**. Implicit schema lives in `commands/inspect.md` step 6 and in actual generated files. A JSON Schema document would help auto-research and tooling integration.

### AI agent / AEO

- **AEO sub-score is computed implicitly** (additive heuristics in `inspect.md` step 2a). It's adjacent to the main a11y score but the relationship is undocumented. Some audits might mix them.
- **`prefers-color-scheme: dark` detection** in the audited site doesn't yet feed back into a "this site does not natively support dark mode → expect mobile force-dark performance pain" finding type. Currently a tip-only signal.

### Hook layer

- **`scripts/beacon-prompt-gate.mjs`** and **`scripts/beacon-session-start.mjs`** make proactive invocation work; they have not been documented yet (only their existence is mentioned in commit messages).

### Internationalisation

- **Only ZH-Hant + EN**. Japanese (ja) is in the governance trigger list but no I18N strings exist for it. Korean, Spanish, etc. would be community contributions.
- **`I18N` table is in a single object in `scripts/generate-report.mjs`** (~120 lines). At present scale this is fine; if a third language gets added, splitting into per-language files becomes worth considering.

### Calibration data

- Coverage is now reported from the artifact as `coverage_percent`; retired fixed coverage splits and the uncommitted 44-site narrative are no longer used for current claims.

---

## Open Questions (Research Targets)

A 1000-loop auto research session can pick at any of these. They are listed in order of "if you only do one, do this":

1. ~~**Is the 30-40% / 60-70% split defensible across modern WCAG 2.2 criteria?**~~ Retired: current reports state measured `coverage_percent` instead of a fixed universal split.
2. ~~**Should `advisor.md` get the same limits-and-workflow treatment as `guide.md` and `inspect.md`?**~~ Resolved 2026-07-11 with a compact advisor-specific boundary section.
3. **Is the suggestion-toned vocabulary (Meets baseline / Consider improving / Priority review recommended) actually preferred by developers over the judgemental vocabulary (PASS / NEEDS WORK / FAIL)?** This is a UX-research question, not a technical one. A loop could survey existing literature on developer-tool tone or run a paper exercise.
4. **How does Beacon's positioning compare to Lighthouse, axe-core CLI, Pa11y, WebAIM WAVE, IBM Equal Access, and Deque axe DevTools?** Differentiation map. Each tool has different blind spots; Beacon's distinguishing claim is "epistemic honesty + bilingual + legal-per-jurisdiction".
5. **The "Common Misframings to Gently Counter" table** (in `guide.md`) has 6 rows. Each one is an opinion that could be supported by evidence. Which rows have the strongest supporting research? Which are conjecture and should be softened?
6. ~~**Should `inspect.md` and `advisor.md` skill prose be tone-passed** to match the report?~~ Resolved 2026-07-11, including the high-frequency hook output.
7. **Accessibility overlay claims** (AccessiBe, UserWay, EqualWeb): Beacon currently makes one passing critical remark in `guide.md`. Is that strong enough? Too strong? Cite source.
8. **Should there be a `/beacon:teach` skill** that's purely educational rather than action-oriented? When a user asks "what is WCAG 1.4.3 about" they don't necessarily want a finding or a guide — they want explanation. Currently this falls between the three skills.
9. **Performance of `generate-report.mjs` on large audits** (100+ findings, 10k+ DOM nodes): is the synchronous template-literal build the right approach, or does the file need streaming output for very large reports?
10. **Is the JSON schema stable enough** to encourage third-party tooling (CI integrations, dashboard aggregators)? If yes, publish a JSON Schema document and version the schema separately from the plugin.

---

## Possible Next Directions

These are speculation, not commitments. An auto-research loop might choose to evaluate or rule out any of them.

### Short-term (compatible with v2.0.x patch line)

- Tone-pass `commands/inspect.md` and `commands/advisor.md` to match `guide.md`
- Add limits-and-workflow section to `advisor.md` (mirror of `guide.md` 2.0.8 change)
- Soften legal risk-level uppercase badges
- Document the JSON schema as a separate `references/audit-results.schema.json`
- Embed citations into the methodology panel (axe-core team statement, WebAIM 2024 survey)

### Medium-term (likely a v2.1 or v2.2 minor)

- AEO sub-score becomes a separate, explicit metric with its own tab
- Comparison banner gets the same tone pass as the rest of the report
- Add Japanese (ja) translations to the I18N table to match the governance trigger languages
- Hook output (`a11y-advisor-hook.mjs`) gets tone pass
- CSV / Markdown export of findings (for ticket-import workflows)
- Severity badges become bilingual + tone-passed (currently they uppercase the JSON value directly)

### Long-term (possible v3.0)

- Multi-page audit aggregation (currently each audit is a single page)
- Direct integration with `axe-core` HTML reporter to leverage rather than reinvent its evidence-collection
- Real-user-testing protocol templates (questions to ask in a 30-min screen-reader walkthrough; the artefact `/beacon:guide` keeps pointing to but doesn't currently provide)
- A11y design tokens generator (`design-tokens.json`) that pre-validates contrast / motion / spacing before the design system is committed
- Public benchmark site list (the 44-site reference set could be open-sourced as a methodology artefact)

---

## How to Use This File

- **If you are a human contributor**: start with the "Known Incomplete" section. Pick anything that resonates.
- **If you are an auto-research loop**: pick one of the "Open Questions" as your goal. Each is bounded, has a clear "done" signal, and produces an artefact (a citation, a draft skill section, a comparison table) that can be merged back without re-doing the whole project.
- **If you are the human user (chiehweihuang)**: scan the "Asymmetries" section before deciding what to do next session. The asymmetries compound — if `advisor.md` falls further behind `guide.md` and `inspect.md`, the skill triad loses internal consistency.

When you finish a piece of work that updates this file, also update [ARCHITECTURE.md](./ARCHITECTURE.md) if you changed structure, and bump `.claude-plugin/plugin.json` per semver.
