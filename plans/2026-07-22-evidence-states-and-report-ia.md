# Plan — thin-evidence states (engine @9) + report IA redesign (v3.2.0)

Written 2026-07-22 at the end of the v3.1.0 session; the executing session should read
this file top-to-bottom before touching code. Origin: reviewing the dense rakuten
specimen, the user hit two naked "0" rings (responsive, motion) that each rode on a
SINGLE failed check, indistinguishable from a six-check "100" — the known
"small-denominator category" gap surfacing in the UI. Decision: fix the semantics
(workstream A) and rebuild the report's information architecture (workstream B),
release together as v3.2.0.

Working discipline for the executing session: implementation goes to subagents
(genen/sonnet; haiku for mechanical steps); hakuso gates every scoring-affecting or
user-facing diff; the main loop only decomposes, arbitrates, and reports. Canonical
sources live in `core/` — always `node build.mjs` after edits, bare `node --test`
(never with a dir argument), `node build.mjs --check` before commit. Push via
`gh auth switch --user chiehweihuang` in the same Bash call.

---

## Workstream A — thin-evidence category state (engine @9, score-affecting)

**Problem**: a scored category with 1 fail / 0 passes renders score 0; 1-2 checks is a
coin-flip denominator presented with the same confidence as a 6-check 100. Violates
the four-state philosophy (absence/thinness of evidence should be a STATE, not a
number).

**Design (proposed, confirm with user only if changing)**:
- New category state `insufficient-evidence`: applies when a category would be
  `scored` but `pass + fail < 3` total machine checks.
- Behavior: score null, findings still listed in full, category exits the scoring
  denominator (existing renormalization machinery), weight redistributed. Coverage
  percent drops accordingly — honesty preserved.
- Life-safety gate unaffected (it operates on confirmed findings, not category
  scores). Review-only categories keep `not-machine-checkable`.
- Threshold N=3 is a calibration decision — record it as such in VALIDATION.md L2
  (like the severity repeat-cap), revisitable with data.

**Steps** (genen work order, TDD):
1. Failing tests first: state assignment at 0/1/2/3 checks boundary; renormalization
   with 1..k insufficient categories; monotonicity properties still hold; life-safety
   gate unaffected; findings still emitted.
2. Implement in `core/scripts/static-audit.mjs` (`scoreCategory` region, ~L1030);
   bump `DETECTOR_VERSION` → `beacon-static-audit@9`.
3. Report renderer: render the new state as a text badge like the other states
   (mostly free — badge machinery exists); ring shows state, never a number.
4. Golden regen (`node test/golden/regen.mjs`) — expect dirty.html deltas ONLY where
   its categories are thin; every changed line must be explainable; clean stays 100.
5. Full validation cycle per VALIDATION.md release gate:
   - bare `node --test`, `build --check`, `measure-semantic` gate;
   - benchmark rerun: `cp run-2026-07-05/results.json run-2026-07-05/results-engine8.json`
     FIRST, then `--audit-only` + `analyze.mjs`; record Spearman + score-delta
     distribution (drift-compare engine8 vs new) in CHANGELOG — overall scores WILL
     move on sites whose thin categories exit the denominator (rakuten 40 → expect up);
   - GT re-verify is category-level-neutral (finding emission unchanged) — confirm
     mechanically with the retention checker pattern from the 07-22 session
     (agent-matched lines live in `beacon-benchmark-100/gt-remap-6/verdicts.json`);
   - VALIDATION.md: measured-state row for @9 + the L2 note for the N=3 calibration.
6. hakuso gate on the diff (empirical probes: craft fixtures at the 2-check and
   3-check boundary; verify a page whose ONLY failing category becomes
   insufficient-evidence doesn't inflate to a misleading high overall — decide and
   test what overall/coverage look like in that edge).

## Workstream B — report information architecture redesign (presentation)

**User's stated pains** (2026-07-22): visual polish below consultant-grade; weak
mobile experience; remediation workflow too far from the findings; naked numbers
without "why". Audience: BOTH developers and non-technical clients in one document.
Scope decision: IA re-layout (not just visual refresh, not full interaction rewrite).

**Hard requirements from the user's standing preferences**: light mode default with
dark following the system; body text ≥16px; explicit CJK-safe font stacks everywhere
including code blocks (PMingLiU must be impossible); full-width punctuation in zh
text; bilingual (zh/en) as today.

**New reading flow (IA spec to mock up)**:
1. **Hero** = decision layer: overall score WITH coverage and evidence framing, the
   honesty line, and — the key addition — **"fix these next": the top 3 remediation
   actions** chosen by severity × instance count × effort heuristic. A reader who
   stops after one screen still knows what to do.
2. **Category layer**: rings → evidence-aware cards. Every card carries: score OR
   state badge, evidence base ("based on N checks"), one-line dominant cause
   ("viewport not declared"), and for crushed scores the tension made visible
   (screenreader: "87% pass rate; score 3 driven by severity penalties on 133
   confirmed findings"). Thin/insufficient categories visually recessive. Card click
   → that category's findings.
3. **Findings layer**: grouped by FIX ACTION (one group per finding key/pattern, so
   "add alt text to 88 images" is one actionable unit, not 88 rows), each group with
   affected-user statement, code diff, file:line list, jurisdictions. Severity order;
   per-category filter chips (existing disclosure controls evolve into this).
4. **Client layer**: a print-friendly executive summary section (plain-language
   findings, jurisdiction exposure, remediation priorities) rather than a JS mode
   toggle — CSS print styles + a visible section; zero added interaction surface.
5. Mobile-first: the @8 in-viewport card work extends to the whole document; tables
   scroll inside their own containers only.

**Process** (order matters):
1. **Static mockup FIRST**: one self-contained HTML mock of the new IA populated with
   the real rakuten @8 data (dense case) — built by a frontend-capable subagent;
   reviewed by the user BEFORE any generator work. Iterate on the mock, not the
   generator. (The 07-22 specimen lives at the scratchpad path in the handoff; easier:
   regenerate from `beacon-benchmark-100/run-2026-07-05/audits/97.json`.)
2. After user approval: genen implements in `core/scripts/generate-report.mjs`
   (currently ~2,400 lines; split inline CSS/JS into `core/scripts/report-assets/`
   ONLY if the build's marker grammar supports it cleanly — do not invent a new build
   mechanism for this).
3. Verification: regenerate the three specimens (clean / dirty / rakuten); run the
   engine ON the generated report page (it should stay clean under its own scanner);
   mobile + desktop screenshots at 320/768/1280 via a plain Playwright script (browser
   MCP is deliberately off on this machine — use a script, not the MCP); hakuso gate
   with the a11y checklist (contrast tokens, focus, reduced-motion, print styles).
4. `docs/make-demos.mjs` regen (nav injection must survive), landing badge re-verify
   (35% coverage claim may CHANGE if A shifts landing categories — re-audit and update
   the badge text if needed).

## Release

- One release: **v3.2.0** (A is score-affecting → minor per the 3.0.0 precedent of
  reserving major for semantic overhauls; document the score movement prominently).
- CHANGELOG: A's measured numbers (Spearman, score-delta distribution, the N=3
  calibration note) + B's IA change summary.
- After release: plugin cache update + one real inspect; landing/README claims
  re-checked (the "0.979" GT number on the landing page is @6/@7-era — landing says
  "Beacon 3.0"; after @9 decide whether to refresh the public table to 1.000/0.727
  with the @8 study link).

## Open items deliberately NOT in this plan

Two-machine error bar (needs yatagarasu-aw authorization); telemetry consent
scaffolding + missed-case report form (user has the design, next batch); survey-tier
FP-mining round (fires when the 10k queue finishes, ~1 month); methodology review
items #9/#13/#14/#12; first-skip-only heading ceiling.
