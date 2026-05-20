# Q6 — Should `inspect.md` and `advisor.md` skill prose be tone-passed to match the report?

Research artefact for ROADMAP Open Question 6 (verbatim, ROADMAP.md:84):
> "Should `inspect.md` and `advisor.md` skill prose be tone-passed to match the report?"

Status: proposal only. No product files edited (IRON RULES). This document quotes
the current text with `file:line`, names the clash, and proposes a concrete
replacement for each item.

---

## 1. The Tone Standard (grounded in `guide.md` and the report)

The desired tone is not "be soft". It is a specific, documented calibration. Four
anchor passages define it:

**Anchor A — suggestion-toned verdicts (the v2.0.7 tone pass).**
`scripts/generate-report.mjs:176-178` and `:200-202`:
```
verdict_pass:        'Meets baseline'
verdict_needs_work:  'Consider improving'
verdict_fail:        'Priority review recommended'
rem_p0: 'P0 — Recommended priority (Level A)'
```
ARCHITECTURE.md:307-309 states the rationale: "`PASS / FAIL` -> `Meets baseline /
Priority review recommended`. The intent is to avoid shame-avoidance: developers
who feel judged by a tool tend to skip it. Suggestion-toned vocabulary keeps the
substance ... but reframes the relationship from examiner-to-examinee to
advisor-to-advisee."

**Anchor B — epistemic humility about what tooling can know.**
Report banner, `generate-report.mjs:358` and `:366`: "This is an **automated
baseline audit** ... automated tools cover roughly 30-40% of WCAG criteria ... A
high score, on its own, does not yet fully demonstrate accessibility."
guide.md:89: "Avoid framing guidance as 'the accessible answer' when it is more
accurately 'the conventional accessible default'. ... the former projects false
closure; the latter invites verification."

**Anchor C — neutral, non-alarmist heading vocabulary.**
`generate-report.mjs:161-163` deliberately renames the section headings away from
severity-shaming language: `h2_critical: 'Priority Items'`, `h2_warnings: 'Items
to Note'`, `h2_tips: 'Suggestions & Best Practices'`. Finding-level labels follow
suit: `finding_fix: 'Suggested adjustment'`, `th_fail: 'Adjust'`,
`finding_empty: 'No observations in this category at the moment.'`

**Anchor D — invitational, reframe-don't-scold register.**
guide.md:91-102, the "Common Misframings to Gently Counter" table — note the verb
"Gently". The exemplar register: "Here is the conventional accessible pattern;
here is what's worth verifying with real users before locking it in." The report's
own version, `generate-report.mjs:569`, even renames the column from anything
accusatory to "Common assumption... / Worth keeping in mind...".

Synthesising A-D, the standard has four testable properties. A phrase clashes if
it violates any:

1. **Suggestion over verdict** — frames findings as advice to consider, not a
   grade handed down. (clash type: *judgemental*)
2. **Epistemic humility** — states what the tool cannot see; avoids "the answer",
   "complete", "handled", absolute coverage claims. (clash type: *over-certain*)
3. **Non-alarmist** — no shock vocabulary (banned, immediately, hostile, lawsuit
   countdown) used to coerce. Substance is kept; the threat framing is dropped.
   (clash type: *alarmist*)
4. **Human, not clinical** — names who is affected in plain language; avoids
   examiner register (scan, classify, verdict-as-noun) where advisor register
   fits. (clash type: *clinical*)

Note an important boundary: `inspect.md` is partly a **machine-procedure spec**
(scoring formulae, the SEVERITY MATRIX, JSON schema). That register is correct as
clinical — a severity matrix *should* say "critical" tersely. The tone pass
targets **reader-facing prose and section headings**, not the internal
classification vocabulary the JSON schema depends on. The IRON RULE protecting the
`audit-results.json` schema reinforces this: `severity: critical | warning | tip`
is a schema enum and must not move.

---

## 2. `commands/inspect.md` — clashing phrases

### 2.1 The skill title and one-liner — `inspect.md:17-19`

Current:
```
17  # Accessibility Audit v2.1
19  Conduct a structured accessibility audit that produces **quantitative scores**
    and an **interactive HTML report** — not just a checklist. Think Lighthouse for
    accessibility, but with legal risk assessment and human-centered explanations.
```
Clash: minor, *over-certain*. "Think Lighthouse for accessibility" invites the
exact misframing the report banner spends a whole paragraph countering — that the
score is the deliverable. The report calls itself an "automated **baseline**
audit" (`:358`); the skill that generates it should self-describe with the same
humility, not borrow Lighthouse's authority.

Proposed:
```
Conduct a structured accessibility audit that produces **quantitative scores** and
an **interactive HTML report**. The score is a machine-detectable baseline — a
useful starting point, not a completion certificate. Pairs Lighthouse-style
scoring with legal-risk context and human-centered explanations.
```

### 2.2 "What This Version Adds" framing — `inspect.md:21`

Current heading: `## What This Version Adds`. Clash: negligible, but "v2.1" in the
title (`:17`) plus this heading reads like changelog bleed into user-facing prose.
Low priority. Optional rename to `## What This Skill Produces`. Flagged for
completeness; not counted as a tone clash in the verdict tally.

### 2.3 Automated-coverage claim is blunter than the report — `inspect.md:71`

Current:
```
71  Automated tools catch ~30-40% of issues. The remaining 60-70% requires manual review.
```
Clash: *over-certain* / under-humble. The report banner (`generate-report.mjs:360-363`)
makes the identical claim but (a) attributes it ("including statements from the
axe-core team itself"), (b) enumerates *what* the 60-70% is (cognitive load, real
screen-reader task completion, dynamic interaction quality), and (c) frames the
remainder as "better confirmed through testing alongside disabled users" rather
than the cold "requires manual review". The skill prose is the thinner, more
clinical version of a passage the report already does well.

Proposed:
```
Automated tools cover roughly 30-40% of WCAG criteria — a figure the axe-core team
states themselves. The remaining 60-70% (cognitive load, real screen-reader task
completion, dynamic interaction quality, whether labels are genuinely
understandable) is better confirmed through testing alongside disabled users than
through any scan. Treat the automated pass as a baseline, not a verdict.
```

### 2.4 LOW-confidence disclaimer wording — `inspect.md:201`

Current:
```
201  | **LOW** | < 40% visible; CSR shell | Score static HTML only. Append disclaimer:
     "This score reflects static HTML analysis only. A live browser audit is required
     for a meaningful assessment." ...
```
Clash: *over-certain* in a self-contradicting way. The phrase "is **required** for
a meaningful assessment" is more absolute than the report's calibrated banner,
which says a high score "does not yet **fully** demonstrate accessibility" (note
"yet", note "fully" — hedged). Telling the user the current assessment is *not
meaningful* also undercuts the three-state-verdict design whose entire point
(ARCHITECTURE.md:178-181, 304-305) is that an honest "unknown" *is* meaningful
output. The disclaimer should recommend the live audit, not declare the present
one void.

Proposed disclaimer text:
```
"This score reflects static HTML analysis only. A live browser audit (Tier 2)
would give a fuller picture; until then, treat this as a partial baseline."
```

### 2.5 Severity-classification prose — `inspect.md:361-366`, the SEVERITY MATRIX
table, and `:394-398`

Current (sample, `:361-364`):
```
361  Severity classification rules:
362  - **Critical** = WCAG Level A violation, confirmed from evidence
363  - **Warning** = WCAG Level AA violation, or Level A violation that is likely
     but not 100% confirmed
364  - **Tip** = Best practice ...
```
Clash: **none — leave as-is.** This is the machine-classification spec that feeds
`severity: critical | warning | tip` in the JSON schema (ARCHITECTURE.md:229,
:148). "Critical/Warning/Tip" here are enum values, not reader-facing verdicts.
The report already translates them at render time — `h2_critical` becomes
"Priority Items", `severity: critical` cards are styled but the *heading* the user
reads is calibrated. Re-toning the matrix would either desync it from the schema
(violates IRON RULE) or force a parallel rename through `generate-report.mjs`
(out of scope). Explicitly **excluded** from the tone pass.

### 2.6 Legal risk-level labels — `inspect.md:427-431`

Current:
```
427  Cap at 10. Map to risk levels:
428  - 8-10: CRITICAL
429  - 5-7: HIGH
430  - 3-4: MEDIUM
431  - 1-2: LOW
```
Clash: *alarmist* + inconsistent with the rest of the pipeline. ROADMAP.md:48 and
:100 already flag the report's uppercase legal badges ("HIGH", "MEDIUM") as a
known tone debt and propose a "Higher exposure / Notable exposure / Moderate
exposure / Lower exposure" mapping. The same uppercase shouting lives here in the
source skill. **However** — these strings are also schema values:
`legal_risk.overall_level: "critical" | "high" | "medium" | "low"` (ARCHITECTURE.md:246,
:252). Recommendation: keep the *enum* lowercase values for the JSON, but the
**prose** here should describe them as exposure bands, not yell them. This is the
one inspect.md item that should be coordinated with the separate ROADMAP item on
report legal badges, not fixed in isolation.

Proposed:
```
Cap at 10. Map to exposure bands (these become the `risk_level` JSON values
critical / high / medium / low; the report renders them as reader-facing labels):
- 8-10: highest exposure
- 5-7:  higher exposure
- 3-4:  moderate exposure
- 1-2:  lower exposure
```

### 2.7 Step 8 — "static badges" aside — `inspect.md:531`

Current:
```
531  Offer to generate an accessibility statement (the international standard
     replacement for static badges).
```
Clash: minor *over-certain*. "the international standard replacement" overstates;
an accessibility statement is *recommended practice* (the report says exactly
this — `generate-report.mjs:563`: "Required in EU under EAA, recommended
elsewhere"). Align the certainty level.

Proposed:
```
Offer to generate an accessibility statement (required in the EU under the EAA,
recommended elsewhere — and a more honest signal than a static compliance badge).
```

### 2.8 "Scoring Interpretation" band labels — `inspect.md:650-655`

Current:
```
650  | Score | Meaning |
652  | 90-100 | Excellent — minor improvements only |
653  | 70-89  | Good — some issues need attention |
654  | 50-69  | Needs work — significant barriers exist |
655  | 0-49   | Poor — critical barriers blocking users |
```
Clash: **the single biggest clash in the file** — *judgemental*. This table is the
pre-tone-pass vocabulary the v2.0.7 pass explicitly retired. ROADMAP.md:30 records
v2.0.7 as "`通過/PASS -> 達到基準/Meets baseline`, `需改進/NEEDS WORK -> 建議考慮改進/
Consider improving`". The report no longer says "Needs work" or "Poor" anywhere —
its verdict copy is "Meets baseline / Consider improving / Priority review
recommended" (`generate-report.mjs:176-178`). Yet `inspect.md` still instructs the
auditing agent in the retired "Excellent / Good / Needs work / Poor" terms. The
skill is teaching the agent the vocabulary the product deliberately abandoned.
"Poor" and "Needs work" are exactly the examiner-to-examinee register
ARCHITECTURE.md:309 warns drives developers away.

Proposed:
```
| Score  | Reading |
| 90-100 | Meets baseline comfortably — refinements only |
| 70-89  | Meets baseline — some items worth attention |
| 50-69  | Below baseline — notable barriers worth prioritising |
| 0-49   | Well below baseline — priority barriers likely blocking users |
```
(Keeps the substance — a 0-49 site genuinely has blocking barriers — but drops the
verdict-noun "Poor". Mirrors the report's "Meets baseline" anchor verbatim.)

### 2.9 "Common Pitfalls" heading and column — `inspect.md:632-646`

Current heading `## Common Pitfalls`, column header `| Pitfall | Correct Approach |`.
Clash: mild *clinical/judgemental*. The report covers the same ground under the
calibrated heading "Context That's Easy to Overlook" with columns "Common
assumption... / Worth keeping in mind..." (`generate-report.mjs:566-569`).
"Pitfall / Correct Approach" is the harsher examiner phrasing. Low-to-medium
priority — this is an internal agent-facing reference table, not user-rendered, so
the clash is real but the blast radius is small.

Proposed: rename heading to `## Common Misframings` (echoes guide.md:91) or
`## Easy Things to Get Wrong`; column header to `| Common approach | More reliable
approach |`. Content rows unchanged.

### 2.10 Items in `inspect.md` that are FINE — do not touch

For calibration, these were checked and judged already on-tone or correctly
clinical:
- The three-state verdict table `:340-348` — uses "pass/fail/unverifiable" as
  schema enums; the surrounding prose ("prevents penalizing CSR/SPA sites",
  "honest about what static analysis cannot see") is already epistemically humble.
- Step 1-3 procedure prose — neutral instruction register, appropriate.
- "Framework-Specific Fix Patterns" `:593-605` — neutral.
- The 44-site benchmark bands `:33-41` — descriptive, not judgemental ("SPA shells",
  "neglected sites" is borderline but factual and not reader-facing).

---

## 3. `commands/advisor.md` — clashing phrases

Context: `advisor.md` is the most-seen Beacon surface (ARCHITECTURE.md:281, the
PostToolUse hook drives it). ROADMAP.md:41 already singles it out: "The Advisor
still frames its checklist as authoritative review items rather than as
conventional defaults + boundary acknowledgement." So a tone clash here is
expected, and confirmed.

### 3.1 "Red Flags — Immediate Strong Warning" heading — `advisor.md:81`

Current:
```
81  ## Red Flags — Immediate Strong Warning
82  These patterns trigger 🔴 CRITICAL regardless of context:
```
Clash: *alarmist*. "Immediate Strong Warning", "regardless of context" is the
coercive register. Compare the report's equivalent — it lists hard problems too,
but under "Context That's Easy to Overlook" / "Priority Items"
(`generate-report.mjs:161`, :566). The substance (these are genuinely high-priority
patterns) is correct; the *shouting* is what clashes. Note also: `advisor.md`
itself, two sections up, states the Core Philosophy "as an educator who explains
**who** is affected and **why**" (`:8`) — the Red Flags heading contradicts the
skill's own stated register.

Proposed:
```
## High-Priority Patterns
These patterns are reliably worth flagging as 🔴 CRITICAL — they block users in
ways that are well-established, so context rarely changes the recommendation:
```

### 3.2 Red-flags table cells — `advisor.md:84-98`

Several cells use coercive or absolute vocabulary in the "Reason" column. Each is a
*alarmist* / *judgemental* clash. The report and guide make the same points
without the threat framing.

| Line | Current text | Clash | Proposed |
|---|---|---|---|
| `:88` | "Accessibility overlay widget ... **FTC fined $1M. Does not fix issues. Increases legal risk.**" | alarmist (staccato threat) | "Accessibility overlays have a poor track record with real assistive-tech users; the FTC has fined an overlay vendor, and overlays are themselves a common trigger for ADA suits. Native semantic implementation is more reliable." (mirrors guide.md:101 almost verbatim — guide.md already solved this) |
| `:89` | "CAPTCHA ... **#1 barrier for a decade. Blocks blind, cognitive, motor users.**" | alarmist | "Image/puzzle CAPTCHA is one of the longest-standing barriers for blind, cognitive, and motor-impaired users. Prefer non-interactive or honeypot alternatives." |
| `:90` | "`<select>` / dropdown menu — **Hostile to** elderly, low vision, motor impaired." | judgemental ("Hostile") | "`<select>` / dropdown menu — difficult for many elderly, low-vision, and motor-impaired users. A radio group, segmented control, or toggles are usually easier." (the word "hostile" appears in guide.md:230 too — see 3.6 below) |
| `:93` | "Taiwan `:::` navigation markers ... **Remove immediately.**" | alarmist (imperative) | "Taiwan `:::` navigation markers — never aligned with WCAG 2.0+/ISO 40500, and dropped from Taiwan's own 2017 standard revision. They add reading-comprehension load for cognitive/learning-disability users; worth removing." |

Note on the column header itself, `:84` `| Pattern | Reason |` — fine, keep.

### 3.3 "Decision Framework" / overall instruction tone — `advisor.md:70-78`

Current `:72`: "Before writing any UI element, consider:" followed by five
questions. Clash: **none** — this is a genuinely well-toned section, questions not
commands. Cited here as the positive in-file exemplar: the rest of `advisor.md`
should match *this* paragraph's register, not the Red Flags register.

### 3.4 Missing the limits-and-workflow section — structural, not phrase-level

ROADMAP.md:41 and :80 (Open Question 2) note `advisor.md` never received the
limits-and-workflow treatment `guide.md` (2.0.8) and `inspect.md` got. This is a
*tone-adjacent* gap: `advisor.md` has no epistemic-humility section at all. It
currently jumps from "Core Philosophy" straight to operational checklists with no
"here is what real-time code checks cannot see" boundary statement. A reader of
`guide.md` meets "Limits of This Guide" at line 39; a reader of `advisor.md` meets
no equivalent.

This question (Q6) is scoped to *phrase-level tone*, and adding a whole section is
Open Question 2's job, not Q6's. But the two are entangled: you cannot fully
"tone-match advisor.md to the report" without giving it the humility section,
because the report's tone *is* substantially its limits framing. **Recommendation:
flag the dependency.** A pure phrase-level pass on `advisor.md` (sections 3.1-3.2)
is worthwhile on its own and should ship; the limits section is a larger follow-up
tracked under Open Question 2.

### 3.5 "Prevention over remediation" — `advisor.md:19`

Current:
```
19  3. **Prevention over remediation** — Catch issues during development, not in a
    lawsuit 6 years later.
```
Clash: mild *alarmist*. "in a lawsuit 6 years later" is a scare clause. The point
(fixing early is cheaper) is sound and worth keeping — guide.md:99 makes the same
point as "roughly 10x cheaper to revise". Reframe from threat to economics.

Proposed:
```
3. **Prevention over remediation** — addressing accessibility during development
   is far cheaper and less disruptive than retrofitting it after ship.
```

### 3.6 Cross-file note: the word "hostile"

`advisor.md:90` and `guide.md:230` both call `<select>` "hostile to" certain
users. If `advisor.md:90` is softened (3.2 above), `guide.md:230` should be
softened in the same pass for consistency, even though `guide.md` is otherwise the
exemplar. Flagged so the two do not drift apart. Not counted in the advisor tally
(it is a guide.md line) but recorded as a consistency action.

### 3.7 Items in `advisor.md` that are FINE — do not touch

- Core Philosophy `:16-19` (except 3.5) — "People, not rules" is already the
  target register.
- Audience Mode / Output Format / Mode-Specific Content `:21-68` — neutral spec.
- "When to Read References", "Platform-Specific Notes", "WCAG 3.0 Directional
  Notes" `:100-146` — neutral, correctly informational.

---

## 4. Tally

| File | Tone clashes found | Of which high-priority |
|---|---|---|
| `inspect.md` | 7 (2.1, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9) | 1 (2.8 — the retired "Poor/Needs work" band labels) |
| `advisor.md` | 4 (3.1, 3.2 [4 cells], 3.5; 3.4 is structural) | 2 (3.1 heading, 3.2 cells — most-seen surface) |

Excluded by design (not clashes): `inspect.md` SEVERITY MATRIX and severity-rule
prose (2.5) — schema-bound classification vocabulary. The legal-band item (2.6) is
a clash but must be coordinated with the separate ROADMAP report-badge item, not
fixed standalone.

Cross-file consistency action: `guide.md:230` "hostile" (3.6).
Larger follow-up, separate question: `advisor.md` limits section (3.4 / Open
Question 2).

---

## 5. Verdict

**A tone pass is warranted.** The evidence is concrete, not aesthetic: `inspect.md`
still hard-codes the exact "Excellent / Good / Needs work / Poor" vocabulary that
the v2.0.7 tone pass (ROADMAP.md:30) deliberately retired from the report. The
skill that *generates* the report is, verifiably, teaching the auditing agent the
vocabulary the rendered product abandoned — ROADMAP.md:42 states this asymmetry
plainly. `advisor.md`, the most-seen surface (ARCHITECTURE.md:281), opens its
hardest section with "Immediate Strong Warning" / "Remove immediately" coercion
that contradicts its own stated philosophy of being "an educator who explains who
and why" (`advisor.md:8`).

**Scope: small surgical set of edits, not a rewrite.** Eleven phrase-level changes
total (7 in `inspect.md`, 4 in `advisor.md`), each a localised heading or sentence
swap with the replacement text already drafted above. No structural reorganisation,
no schema change, no `generate-report.mjs` change. The bulk of both files (scoring
formulae, procedure steps, pattern catalogs, platform notes) is already correctly
toned or correctly clinical and must be left alone. The one genuinely larger piece
— giving `advisor.md` a limits-and-workflow section — is explicitly *out of Q6
scope* and belongs to Open Question 2; Q6's phrase-level pass should ship
independently of it.

Recommended sequencing:
1. Ship the 11 surgical edits (this document, sections 2 and 3) as one
   `refactor: tone pass` commit, mirroring the v2.0.7 / v2.0.8 pattern.
2. Apply the `guide.md:230` "hostile" consistency fix in the same commit.
3. Defer the legal-band rename (2.6) to bundle with the ROADMAP report-badge item.
4. Track the `advisor.md` limits section separately under Open Question 2.
