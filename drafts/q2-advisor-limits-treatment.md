# ROADMAP Open Question 2 — Should `advisor.md` Get the Limits-and-Workflow Treatment?

Research artefact. Auto-research deep-research pass, 2026-05-21.
Status: draft proposal. Does not edit `advisor.md`; proposes a section to add.

---

## 1. Verdict

**Yes — but not the same 6-section template `guide.md` uses.**

`advisor.md` should receive a limits-and-boundary pass, because the ROADMAP
asymmetry is real (see §2) and the cost of leaving it out is the skill triad
losing internal consistency. But it should be **one compact section, not six
subsections**, and it should be framed for the **hook context** rather than
the interactive-consultation context. The reasons are argued in §4.

---

## 2. The Asymmetry Is Real — and Smaller Than ROADMAP Implies

ROADMAP line 41 says advisor "has not received the limits-and-workflow
treatment that `guide.md` and `inspect.md` got." Reading the actual files,
that claim is **half right**:

- **`guide.md` genuinely has the treatment.** Lines 39–117 are a single
  contiguous block, `## Limits of This Guide & Recommended Workflow`, with
  six `###` subsections: What This Guide Is Well-Suited For / Where This Guide
  Has Less Visibility / Recommended Accessibility Workflow / What to Surface
  Proactively / Common Misframings to Gently Counter / Calibration Against the
  Inspect Tier System (verified via heading grep).

- **`inspect.md` does NOT have a contiguous block.** Its "limits" content is
  *distributed*, not sectioned: the `~30-40%` line (inspect.md:70), the
  three-state `unverifiable` model (inspect.md:29, 346–348), the Tier 1/2/3
  coverage table (inspect.md:76–94), the confidence-level table
  (inspect.md:197–203), and the accessibility-statement "Known Limitations"
  template (inspect.md:545). There is no `## Limits ...` heading anywhere in
  the file (heading grep confirms).

So the precise state is: **only `guide.md` has the named 6-section block.**
`inspect.md`'s honesty is structural (baked into its scoring model) rather
than prose-sectioned. This matters for the design decision — it means there is
**no single "Beacon limits template"** that advisor must conform to. The
correct target is *symmetry of intent* (every skill acknowledges its
boundary), not *symmetry of layout*.

Independent confirmation that `advisor.md` currently lacks any boundary
framing: a grep of `advisor.md` for `limit|cannot|workflow|real.user|
30-40|60-70` returns **zero matches**. The closest thing is the Tier-system
row inside `guide.md`'s calibration table (guide.md:112), which describes
advisor from the *outside*: "Real-time checks on code edits via PostToolUse
hook / [cannot] Verify runtime behaviour, dynamic interactions." Advisor never
says this about itself. That outside-in description is, usefully, a ready-made
seed for advisor's own boundary statement.

---

## 3. What Makes the Advisor Context Different

Five concrete, file-grounded differences between advisor and guide drive the
shape decision.

| # | Property | `guide.md` | `advisor.md` | Source |
|---|----------|-----------|--------------|--------|
| 1 | Primary invocation | Description-triggered, interactive consultation | **PostToolUse hook**, auto-fires on every UI-file Edit/Write | advisor.md:11–13; ARCHITECTURE.md:30, 279–283 |
| 2 | When the user reads it | Sat down to "design X", attention available | Mid-edit, attention is on the code, not on Beacon | ARCHITECTURE.md:336–341 |
| 3 | Output budget | Long-form: 684 lines, full pattern catalog | Token-metered per-issue: `~30/issue` (expert) to `~90/issue` (lead) | advisor.md:24–32 |
| 4 | Output channel | The skill prose itself is the deliverable | The *hook script* emits the runtime checklist; `advisor.md` is the reference layer behind it | hook.mjs:7, 195–202; advisor.md:9–13 |
| 5 | Cadence | Once per design decision | Once per file save — high frequency, repetition fatigue is a real cost | ARCHITECTURE.md:283, 293 |

The decisive ones are #3 and #5. `guide.md`'s 6-section block is ~80 lines of
prose. That is affordable in a 684-line consultation skill a user opened
deliberately. The same 80 lines inside advisor — a skill whose entire design
ethos is per-issue token budgets (advisor.md:26–32) and "If clean, proceed
silently" (hook.mjs:191) — would be **tonally self-contradicting**. A skill
that bills itself at 30 tokens/issue cannot carry an 80-line meta-essay about
its own epistemics.

There is also a **division-of-labour** point (#4). The thing the *developer
actually sees in real time* is the hook script's stdout, not `advisor.md`.
`advisor.md` is the reference layer loaded when the agent wants "the full
reference material beyond what the hook provides" (advisor.md:2). So advisor's
limits section has two distinct jobs, and they should be visibly separated:

- **(a) State advisor's own boundary** — what real-time static-pattern
  checking structurally cannot see. This belongs in `advisor.md` prose.
- **(b) Tell the agent how to phrase that boundary in hook-triggered output** —
  so the boundary actually reaches the developer in the terse channel, not
  just the reference layer. This is a short directive, not an essay.

`guide.md`'s template has no equivalent of (b) because guide has no hook
channel — guide's prose *is* its output. This alone justifies a different
shape.

---

## 4. Why a Different Shape — Argued Explicitly

The question asks specifically whether the hook context warrants a different
shape. It does. Three arguments, strongest first.

### 4.1 Budget contradiction (decisive)

Copy-pasting guide's 6 subsections would import ~80 lines of prose into a
skill defined by token thrift (advisor.md:24–32, the audience-mode budget
table). The medium would contradict the message. The limits section must
itself obey advisor's economy: terse, scannable, no long ordered workflow.

### 4.2 The audiences differ

`guide.md`'s "Recommended Accessibility Workflow" (guide.md:68–79) is a 7-step
program: talk to disabled users, hire disabled people, walk the keyboard flow,
screen-reader walkthrough, run inspect, iterate. That is **org-level process
advice** appropriate when someone is *planning* a build. The advisor fires
when someone *already has their hands in a file*. Telling a developer mid-save
to "hire disabled people on your team" is the right idea at the wrong moment;
it will be skipped as noise. Advisor's workflow guidance should instead be
**one forward pointer**: this real-time check is not the audit — run
`/beacon:inspect` before ship, and that is still not real-user testing.
guide.md:115–117 already models this "suggest the next phase" closer; advisor
should do the same thing in one sentence, not seven steps.

### 4.3 Repetition fatigue

The hook fires on *every* UI-file save (ARCHITECTURE.md:283). Whatever the
limits section tells the agent to emit, the developer may see dozens of times
a session. guide's misframing table and proactive-phrasing list (guide.md:80–
102) are rich because they are read **once**. Advisor's equivalent must be
something the agent can surface **occasionally and briefly** without it
becoming wallpaper. The design implication: advisor's limits content is
mostly *agent-facing calibration* (shapes how the agent reasons about its
own findings) with only a *thin, rate-limited user-facing* element.

### What stays the same

Symmetry of *intent* is kept: advisor, like guide, should (1) name what it is
good at, (2) name what it structurally cannot see, (3) point at the next phase,
(4) avoid projecting false closure. Beacon's whole epistemic-honesty design
(ARCHITECTURE.md:319–321, 344) demands every skill carry its own boundary.
Advisor is currently the only one of the three with no self-boundary at all
(§2) — that gap, not the layout, is what must close.

### Evidence the terse shape is correct, not just convenient

External best-practice on real-time developer feedback converges on the same
answer. Linter/IDE guidance is consistent that inline, as-you-type feedback
must be "immediate and actionable" and "concise ... without overwhelming them
with verbose messages" — informativeness balanced against brevity, because the
developer's attention is on the code (dbvis SQL-linter guide; BrowserStack
"What Is a Linter"; webapp.io linting best-practices — see §7). A 6-section
meta-essay is exactly the verbosity that guidance warns against for the
real-time channel. So the terse shape is an evidence-backed design choice, not
a shortcut.

---

## 5. Proposed Section Shape

**One `##` section, three short `###` subsections.** Placed in `advisor.md`
immediately after `## Core Philosophy` (advisor.md:15–20) and before
`## Audience Mode` (advisor.md:21) — the same relative slot guide.md uses
(after Core Principles, before How to Use This Skill).

| Subsection | Job | Maps to guide.md? |
|---|---|---|
| `### What Real-Time Checks Catch — and Miss` | Names advisor's structural blind spot (static-pattern detection cannot see runtime/dynamic/judgement-quality). Agent-facing calibration. | Compresses guide's "Well-Suited For" + "Less Visibility" into one short two-list block |
| `### This Is Not the Audit` | One forward pointer: advisor ≠ inspect ≠ real-user testing. Positions advisor in the pipeline. | Compresses guide's 7-step "Recommended Workflow" + Tier table into 3 lines |
| `### Phrasing Boundaries in Hook Output` | Directive for the terse channel: when to add a boundary caveat to a hook finding, when to stay silent. The (b) job from §3. | **No guide equivalent** — this is the hook-specific addition |

Six subsections collapse to three; the third has no counterpart in guide
because guide has no hook channel. This is the "different because of hook
context" the ROADMAP question anticipated.

Total target length: **~35–40 lines**, roughly half of guide's ~80. It must
read as advisor-economical or it undercuts the skill it lives in.

---

## 6. Candidate Draft Section

The following is drop-in prose for `advisor.md`. Tone deliberately matches
advisor's existing terseness (cf. its Red Flags table, advisor.md:81–98) — not
guide's discursive register.

```markdown
## Limits of Real-Time Checks & Where Advisor Sits

Real-time checks are a fast first line, not a verdict. The hook sees the
diff in front of it — it cannot see the running page, and it cannot judge
whether your accessible-looking markup is actually meaningful. State that
boundary when it matters; do not imply a clean checklist means an
accessible result.

### What Real-Time Checks Catch — and Miss

Catches well (static, in-diff, high confidence):
- Known-bad patterns: `<div onclick>`, `outline:none` without
  `:focus-visible`, `minmax(Npx,…)` without `min()`, prescriptive
  "click here" copy, `tabindex > 0`.
- Missing structural attributes visible in the edited text: absent labels,
  alt, accessible names, skipped heading levels.

Cannot see (out of scope for a per-edit static check):
- Runtime behaviour — focus order, focus return after modal close, live-region
  announcements, keyboard traps in composed widgets.
- Cross-file and cross-component interaction — two individually-fine
  components conflicting once combined.
- Whether a label, alt text, or heading is *meaningful*. `alt="image"` passes
  every detector here and tells a screen-reader user nothing.
- Real contrast, real reflow, real assistive-tech behaviour on real devices.

When a finding touches these, say so in one clause rather than implying the
check was exhaustive: "static check is clean here; runtime focus behaviour
still needs a keyboard pass."

### This Is Not the Audit

Advisor is the *during-code* line of a three-phase pipeline. It does not
score, and a quiet hook is not a pass. Before shipping, run `/beacon:inspect`
for a scored WCAG 2.2 AA review — and note that even inspect reaches only the
machine-detectable subset (~30–40% of criteria). The rest needs a keyboard
walkthrough, a screen-reader pass, and, where it matters, disabled users
testing the real flow. Point the user one step forward; do not imply the
edit is done because the hook was silent.

### Phrasing Boundaries in Hook Output

Hook output is high-frequency and terse — keep the honesty terse too.

- For a concrete detected issue: state it plainly, no hedging. The detector
  is confident; the developer needs the fix, not a disclaimer.
- For a checklist reminder that depends on runtime (focus management,
  live-region announcement, dynamic state): frame it as "verify", not "pass"
  — e.g. "Focus returns to trigger on modal close? — verify by keyboard."
- Surface the "not the audit" boundary sparingly — once when a UI feature
  looks complete, not on every save. Repetition turns honesty into wallpaper.
- If the diff is clean and nothing runtime-dependent is in play, stay silent.
  Silence is a valid advisor output (the hook already follows this rule).
```

Notes on specific choices:

- **"a quiet hook is not a pass"** mirrors guide.md:77's "Useful as a
  baseline, not as a completion certificate" and inspect's epistemic-honesty
  posture (ARCHITECTURE.md:319–321), in advisor's compressed register.
- **`alt="image"` example** is lifted directly from guide.md:62
  ("presence ≠ clarity") — deliberate cross-skill consistency, the one piece
  worth keeping verbatim because it is the single sharpest illustration of
  "detectable ≠ meaningful".
- **"verify, not pass"** aligns with the user's own documented preference for
  `→ verify:` suffixes on multi-step guidance (MEMORY: `verify-suffix-in-plans`)
  and with external linter guidance that real-time feedback be "actionable"
  (§7). It also nudges the hook script's Layer-2 checklist wording, which
  ROADMAP line 60 separately flags for a tone pass — the two changes are
  compatible.
- **The `~30–40%` figure** is kept because it is what the rest of Beacon
  quotes (inspect.md:70, guide.md:77, ARCHITECTURE.md:344). It is defensible:
  by WCAG success criteria, ~30% are machine-testable; Deque's own study puts
  axe-core at 57% *by issue volume* (contrast alone is ~30% of all errors and
  is automatable), and ~80% only with guided semi-automated tests (§7). The
  criteria-based 30–40% is the honest figure for "what a static per-edit check
  can structurally reach." ROADMAP Open Question 1 owns refining this number;
  this draft should inherit whatever that question lands on rather than fork a
  second figure.

### A judgement call, flagged

Whether to place subsection 3 (`Phrasing Boundaries in Hook Output`) inside
`advisor.md` at all, versus only in the hook script's own comments, is a
genuine judgement call. Argument for keeping it in `advisor.md`: the agent
that composes hook-triggered guidance reads `advisor.md` as its reference
layer (advisor.md:2), so phrasing direction belongs where the agent will look
for it. Argument against: it is the one subsection about the *channel* rather
than about *accessibility*. On balance, keep it in `advisor.md` — but as the
clearly-labelled last subsection, so a future reader sees it is the
hook-specific outlier. If a reviewer disagrees, dropping subsection 3 still
leaves a coherent 2-subsection section that satisfies the symmetry-of-intent
goal.

---

## 7. Sources

External, web-retrieved 2026-05-21:

- Deque — "Automated Testing Study Identifies 57% of Digital Accessibility
  Issues": https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/
- Deque — "The Automated Accessibility Coverage Report" (guided tests extend
  coverage 57% → ~80%): https://www.deque.com/automated-accessibility-coverage-report/
- a11yproof — "What Automated Accessibility Testing Actually Catches (And
  Misses)": https://a11yproof.com/resources/guides/automated-accessibility-testing-accuracy
- TestParty — "Automated Accessibility Testing: What It Catches and What It
  Misses": https://testparty.ai/blog/automated-accessibility-testing-guide
- dbvis — "SQL Linter: How It Works and How to Choose the Best One":
  https://www.dbvis.com/thetable/sql-linter-how-it-works-and-how-to-choose-the-best-one/
- BrowserStack — "What Is a Linter? How it Works, Use Cases, and Tools":
  https://www.browserstack.com/guide/what-is-linter
- webapp.io — "Best practices for Linting":
  https://webapp.io/blog/linting-best-practices

Internal (Beacon repo, this checkout):

- `commands/guide.md:39–117` — exemplar 6-section limits block
- `commands/inspect.md:70, 76–94, 197–203, 346–348, 545` — distributed
  limits treatment (no contiguous section)
- `commands/advisor.md:2, 9–13, 15–20, 24–32, 81–98` — current advisor
  framing; grep confirms zero existing limits/boundary prose
- `scripts/a11y-advisor-hook.mjs:7, 139–193, 195–202` — hook output channel
- `ARCHITECTURE.md:30, 279–283, 293, 319–321, 336–344` — hook context,
  epistemic-honesty design intent
- `ROADMAP.md:41, 60, 80, 98–99` — the asymmetry statement and the open
  question this artefact answers

---

## 8. One-Paragraph Summary for the Maintainer

Yes, add a limits section to `advisor.md` — the asymmetry is real (advisor is
the only one of the three skills with no self-boundary prose; `inspect.md`'s
honesty is structural, not sectioned, so there is no rigid template to match).
But use **three compact subsections (~35–40 lines), not guide's six (~80)**:
the hook context is high-frequency and token-budgeted, so an 80-line meta-essay
would contradict the very skill it sits in. Keep symmetry of *intent* (name
strengths, name blind spots, point to the next phase, refuse false closure);
drop symmetry of *layout*. The one genuinely new subsection — "Phrasing
Boundaries in Hook Output" — has no `guide.md` counterpart because guide has no
hook channel; that is precisely the "different because of hook context" the
ROADMAP question anticipated. Draft section is in §6, drop-in ready.
