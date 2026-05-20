<!--
DRAFT / RESEARCH ARTEFACT — ROADMAP Open Question 8
Status: proposal only. Does NOT create the skill, does NOT modify product code.
Author: Beacon deep-research agent
Date: 2026-05-21
Scope: answers "Should there be a /beacon:teach skill that is purely educational
       rather than action-oriented?"
-->

# Q8 — Should Beacon have a `/beacon:teach` skill?

## Question (verbatim from ROADMAP.md:86)

> Should there be a `/beacon:teach` skill that's purely educational rather than action-oriented? When a user asks "what is WCAG 1.4.3 about" they don't necessarily want a finding or a guide — they want explanation. Currently this falls between the three skills.

## Verdict

**Maybe — leaning NO as a fourth skill, YES as an explicit "explain" mode inside `/beacon:guide`.**

The educational gap the question describes is real, but a fourth top-level skill is the
wrong instrument to close it. The routing-ambiguity cost of a 4th description-triggered
skill is concrete and high; the benefit (a dedicated explanatory surface) can be obtained
almost entirely by adding an explicit **Mode 4: Concept Explanation** to `guide.md` plus a
small triggering-phrase addition. That captures the value without splitting the trigger
namespace four ways.

The rest of this document (a) establishes that the gap is real, (b) shows why a 4th skill
is disproportionately risky, (c) gives the recommended in-`guide.md` design, and (d) — for
completeness — drafts what a standalone `/beacon:teach` *would* look like if the maintainer
overrides this recommendation, with a description engineered to minimise cannibalisation.

---

## 1. Is the gap real? — Yes, partially

### 1.1 What the three skills currently do with "what is WCAG 1.4.3 about?"

| Skill | Trigger surface (from `description`) | What it would do with a pure "explain X" question |
|-------|--------------------------------------|---------------------------------------------------|
| `/beacon:guide` | Design-phase verbs: "how should I design", "accessible component", "design accessible", colour/typography/layout (`commands/guide.md:2-13`) | Closest fit. Has a "Pattern Library" mode and a "Who Benefits" block that *is* explanatory. But its whole framing is "I'm about to build X — how should I design it?" (`guide.md:30`). A bare definitional question carries no build intent, so description routing is a weak match. |
| `/beacon:advisor` | "auto-loaded by the PostToolUse hook... You can also invoke it manually for deeper guidance on... WCAG criteria" (`commands/advisor.md:2`) | The description *does* say "deeper guidance on... WCAG criteria", and the skill body calls itself "an educator who explains who is affected and why" (`advisor.md:8`). This is the second-closest fit — but the skill is overwhelmingly framed around *code edits*: "real-time, contextual guidance during development", "Red Flags", before/after snippets. A user not editing code is unlikely to be routed here, and the hook context dominates the skill's identity. |
| `/beacon:inspect` | "check accessibility", "WCAG compliance", "how accessible is this" (`commands/inspect.md:13-14`) | Wrong fit. Triggers on *assessment* intent. "What is 1.4.3" is not a request to score anything; routing here would produce a heavyweight audit process the user never asked for. |

So the question's premise holds: **a purely definitional WCAG question routes ambiguously.**
It is most likely to land in `guide` (correct-ish, but framed for builders) or `advisor`
(plausible via the "WCAG criteria" phrase, but framed for code edits). Neither is wrong
enough to break, but neither is *designed* for the explain-only case.

### 1.2 But the gap is narrower than "no educational content exists"

Beacon already carries substantial explanatory material — it is just not surfaced as a
user-facing skill:

- `references/wcag-quick.md` — WCAG 2.2 criteria grouped by scenario, with level and a
  one-line rule each. This is *exactly* the raw material a "what is 1.4.3" answer needs
  (see `wcag-quick.md:34` — "1.4.3 Contrast (Minimum) | AA | Text: >=4.5:1...").
- `references/disabilities.md` — disability categories, who-is-affected framing, global stats.
- `references/legal-brief.md`, `references/cases.md` — jurisdiction context and litigation history.
- `guide.md`'s "Who Benefits" block and "Common Misframings to Gently Counter" table
  (`guide.md:91-102`) are already explanatory, not action-oriented.

The gap is therefore **not "Beacon cannot explain WCAG"** — it demonstrably can. The gap is
**"Beacon has no routing path that says: the user wants explanation and nothing else."**
That is a routing/surfacing problem, not a content problem. This distinction is what drives
the verdict: routing problems are cheaper to fix by adjusting an existing skill's trigger
surface than by minting a new skill.

### 1.3 Judgement call — how often does this case actually occur?

Labelled as a judgement call (no telemetry in-repo to confirm). Beacon's positioning is a
*developer tool inside Claude Code* (`README.md:1`, ARCHITECTURE pipeline design->code->ship).
A developer in a coding session who types "what is WCAG 1.4.3 about" is, the overwhelming
majority of the time, about to *act* on that knowledge — they hit a contrast finding, or
they are choosing a colour. The pure "I am studying WCAG with no build in flight" case
exists but is the minority for this audience. This matters: it argues against spending a
whole skill slot on it, and for folding it into the design skill the user is most likely
already adjacent to.

---

## 2. Why a 4th skill is disproportionately risky

### 2.1 Claude Code skill routing is description-similarity matching

Claude Code routes to a skill by semantic match between the user's prompt and the skill's
`description` frontmatter (the mechanism is visible in every Beacon skill: the descriptions
are stuffed with explicit trigger phrases — `guide.md:2-13`, `inspect.md:11-15`,
`advisor.md:2`). There is no priority field, no disambiguation arbiter. When two
descriptions both plausibly match a prompt, the outcome is non-deterministic from the
maintainer's point of view.

Beacon already manages this tension carefully. Note the **explicit cross-references inside
the descriptions** designed to keep the three skills from poaching each other:

> "This is the 'before you code' skill; a11y-advisor is the 'while you code' skill;
> a11y-audit is the 'after you code' skill." — `guide.md:12-13`

That sentence exists *because* description routing is ambiguity-prone and the maintainer had
to hand-tune the boundaries. The three-skill set is already at the edge of what
phrase-based routing disambiguates cleanly.

### 2.2 A `teach` skill collides on the highest-traffic shared phrase: "WCAG"

"WCAG" is the single most load-bearing trigger token across the existing skills:

- `guide.md:8` triggers on `"accessible pattern"`, and `guide.md` description ends with the WCAG-laden design vocabulary.
- `inspect.md:13` triggers explicitly on `"WCAG compliance"`.
- `advisor.md:2` triggers on `"WCAG criteria"`.
- `beacon-governance.md:13` lists `WCAG` as a global trigger phrase.
- `beacon-prompt-gate.mjs:27` has `wcag` in its keyword regex.

A `/beacon:teach` whose whole reason to exist is "explain WCAG criterion X" **must** trigger
on "WCAG", "WCAG 1.4.3", "what is WCAG". But "WCAG compliance" (inspect) and "WCAG criteria"
(advisor) are near-neighbours in embedding space to "what is WCAG 1.4.3". Adding a 4th skill
keyed on the same token does not *add* a clean lane — it puts a 4th car in an intersection
that already needs hand-tuned right-of-way rules. Expected failure modes:

- User wants an audit ("check WCAG compliance of this page") -> routes to `teach`, gets a lecture.
- User wants an explanation ("what does 1.4.3 require") -> routes to `inspect`, gets a scoping interview ("Scope? Target level? Jurisdictions?" — `inspect.md:46-53`).
- User mid-code-edit asks "why does 1.4.3 matter here" -> the *advisor hook* already fired; now `teach` competes with the hook's own skill load.

ROADMAP itself flags the existing under-managed seam: *"No reference between skills... A
user reading `/beacon:guide` doesn't see that `/beacon:advisor` says similar things"*
(`ROADMAP.md:43`). Adding a 4th skill widens this un-cross-referenced surface by 33% before
the existing seam is closed.

### 2.3 The four-skill mental model breaks the pipeline metaphor

ARCHITECTURE's central organising idea is a **three-phase pipeline** — design -> code ->
ship -> guide / advisor / inspect (`ARCHITECTURE.md:7-33`). It is repeated in README,
governance, and every skill's prose. It is a *strong* mental model precisely because it is
small and each skill maps to a phase a developer recognises.

`teach` does not belong to a phase. It is orthogonal — you might want explanation *during
any phase*. Bolting an off-axis 4th skill onto a clean 3-phase model dilutes the model's
explanatory power. Every doc that currently says "three skills, three phases" would need a
caveat. That is a real documentation and conceptual tax for a minority use case.

### 2.4 Cost/benefit summary

| | 4th standalone skill | Explain-mode in `guide.md` |
|---|---|---|
| Closes the routing gap | Yes | Yes (via one added trigger cluster) |
| New routing-ambiguity surface | High — collides on "WCAG" with 2 skills + hook | Low — `guide` is already the closest match; sharpening it adds no new competitor |
| Breaks 3-phase pipeline model | Yes | No |
| New doc/version/cross-ref burden | plugin.json skills list, README table, ARCHITECTURE pipeline diagram, 3 cross-ref sentences rewritten | One mode added to an existing skill |
| Reversibility if it underperforms | Low — removing a shipped skill is a breaking change | High — a mode is internal prose |

The asymmetry is decisive. A mode addition is a *reversible, low-blast-radius* experiment;
a 4th skill is a near-irreversible structural commitment for a use case whose frequency is
unverified (section 1.3).

---

## 3. External grounding — how dev tools separate "explain" from "act"

Judgement calls flagged inline. Sources are public, general-knowledge dev-tool design;
treat the *pattern* as the evidence, not any single vendor claim.

- **MDN vs. linters.** The web platform's own division of labour: MDN Web Docs is the
  *explanatory* surface ("what is `aria-label`, who needs it, examples"); ESLint
  `jsx-a11y` / axe-core are the *action* surfaces (find-and-fix). They are deliberately
  *separate products*, not modes of one tool — but note: they are separate because they
  have separate *audiences and distribution channels* (a website vs. an npm package).
  Within a *single* tool, the pattern inverts (next bullet).

- **Within a single tool, "explain" is a sub-mode, not a sibling command.** Rust's
  `cargo` surfaces this cleanly: errors are actionable, and `rustc --explain E0382`
  is an explain *mode* of the same toolchain, not a separate binary. TypeScript does the
  same — diagnostics are actionable; the explanation lives behind the same `tsc` surface
  and the docs. The general pattern: when the explanatory content and the actionable
  content share an audience and an invocation context, tools expose explanation as a
  *flag/mode of the existing command*, not as a new top-level command. This is direct
  support for "explain-mode inside `guide.md`" over "`/beacon:teach`".

- **Lighthouse** (Beacon's stated comparator — `README.md:5`) ships every audit finding
  with an inline "Learn more" link to a docs page. The explanation is *attached to the
  action surface*, reachable from it, not a separate Lighthouse mode the user invokes
  cold. Analogue for Beacon: an `inspect` finding could carry a pointer like "for the
  concept behind this, ask `/beacon:guide` to explain WCAG 1.4.3" — explanation hangs off
  the action surface rather than competing with it for the initial route.

- **Documentation-tool design consensus (Diataxis framework, widely adopted in dev-docs).**
  Diataxis separates *explanation* (understanding-oriented) from *how-to guides*
  (task-oriented) and *reference* (information-oriented). Relevant nuance: Diataxis
  separates these as **document types within one corpus**, explicitly *not* as separate
  products. `references/wcag-quick.md` is already Beacon's *reference* quadrant;
  `guide.md`'s pattern catalog is its *how-to* quadrant. The missing quadrant is
  *explanation*. Diataxis's own guidance is that the four types coexist in one body of
  docs with clear internal signposting — i.e. add the explanation quadrant *to the
  existing skill set*, signposted, rather than spinning up a parallel product.

**Net external read:** every cross-checked pattern points the same way. Separate *products*
for separate audiences; separate *modes* for one audience in one context. Beacon's
explain-case is one audience (developers in a Claude Code session) in one context. That is
a mode, not a product.

---

## 4. Recommended design — "Mode 4: Concept Explanation" in `guide.md`

This is the recommended implementation. It is a proposal for a future prose change to
`commands/guide.md`; it is **not** applied here.

### 4.1 Why `guide.md` is the right host

- It is already the closest description match for definitional questions (section 1.1).
- It is already partly explanatory (`guide.md` "Who Benefits", "Common Misframings").
- It is the *pre-code* skill — the phase where "what does this criterion mean" is most
  often asked before a build decision. Hosting explain-mode here keeps the pipeline model
  intact: `guide` becomes "design guidance *and the concepts behind it*", which is a
  natural widening, not an off-axis bolt-on.

### 4.2 Trigger-surface change (minimal, additive)

Add to `guide.md`'s `description` frontmatter a small definitional-question cluster — worded
so it captures "explain" intent without poaching `inspect`'s assessment intent:

> Also use when the user asks a **definitional or conceptual** accessibility question with
> no build or audit in progress — "what is WCAG 1.4.3", "what does contrast minimum mean",
> "explain focus visible", "who does this criterion help", "why does this rule exist". Give
> the explanation directly; do not start a design consultation or an audit unless the user
> then asks to build or assess something.

Key wording choices and why:
- "with no build or audit in progress" — explicitly cedes the *assessment* lane to `inspect`.
- "explain", "what does X mean", "why does this rule exist" — verbs of *understanding*, not
  of *building* (guide's existing verbs) or *scoring* (inspect's verbs). This is the lane
  that is currently unowned.
- "Give the explanation directly; do not start a design consultation" — instructs the skill
  body to *not* fall through into Mode 1's 5-part build template when intent is explain-only.

### 4.3 The mode body (draft prose for `guide.md`, after "Mode 3")

```markdown
### Mode 4: Concept Explanation

When the user asks what a WCAG criterion, an accessibility concept, or a disability
category *means* — with no build or audit in flight — answer the question directly.
Do not route into Mode 1 (design consultation) or suggest /beacon:inspect unless the
user then signals they want to build or assess something.

Answer shape (keep it tight — explanation, not a lecture):

1. **Plain-language definition** — one or two sentences. What the criterion/concept
   requires, in human terms. Pull the rule from `references/wcag-quick.md`.
2. **Who it is for** — name the disability categories affected and one situational
   benefit. Pull from `references/disabilities.md`. This is Beacon's signature framing:
   a criterion is never just a rule, it is a group of people.
3. **What meeting it looks like** — one concrete pass example. One concrete fail
   example. Code only if it clarifies; this is not a fix request.
4. **The number behind it** — level (A/AA/AAA), and the threshold if it has one
   (e.g. 1.4.3 -> 4.5:1 body / 3:1 large text).
5. **Honest boundary** — where the criterion's machine-checkable part ends and human
   judgement begins (e.g. "alt text *presence* is checkable; whether it is *meaningful*
   is not"). This keeps Mode 4 consistent with Beacon's epistemic-honesty stance.
6. **One-line bridge to action, only if relevant** — "If you are about to build
   something that touches this, say so and I will switch to design guidance; if you
   want to check an existing page against it, /beacon:inspect scores it." Offer the
   bridge; do not force the user down it.

Do NOT, in Mode 4: produce a scaffold, start the Scope/Target-level interview, emit a
0-100 score, or generate `audit-results.json`. Those belong to Modes 1-3 and to
/beacon:inspect. Mode 4's deliverable is understanding.
```

### 4.4 Worked example — "what is WCAG 1.4.3 about?"

Mode 4 output, using only material already in the repo:

> **1.4.3 Contrast (Minimum)** is a WCAG 2.2 **Level AA** rule. It requires text to stand
> out enough from its background to be readable: a contrast ratio of at least **4.5:1**
> for normal text, **3:1** for large text (>=18pt, or >=14pt bold).
>
> **Who it is for:** low-vision users and elderly users, whose contrast sensitivity
> declines — grey-on-grey text that a younger designer reads fine can be invisible to
> them. It also helps everyone *situationally*: a phone in direct sunlight, a dimmed
> laptop on battery.
>
> **Pass:** `#595959` text on `#ffffff` = 7.0:1 — comfortably above the floor.
> **Fail:** `#999999` on `#ffffff` = 2.8:1 — below the 4.5:1 minimum; thin grey body text.
>
> **Boundary:** the *ratio* is machine-checkable when colours are plain hex. It becomes
> unverifiable over images, gradients, or `oklch` alpha backgrounds — there a human has to
> look. And 4.5:1 is a *floor*: it does not guarantee comfort, only a baseline.
>
> If you are about to choose colours for something, say so and I will switch to palette
> guidance. To check an existing page's contrast, `/beacon:inspect` scores it.

Note this answer is *assembled entirely from existing repo content* (`wcag-quick.md:34`,
`disabilities.md` low-vision/age entries, `inspect.md` severity-matrix reasoning that 1.4.3
is always a warning, the `unverifiable` concept from ARCHITECTURE). No new knowledge base is
needed — confirming section 1.2's claim that this is a surfacing problem, not a content gap.

### 4.5 Routing-ambiguity assessment for the recommended design

Adding Mode 4 to `guide.md` introduces **near-zero new ambiguity**, because:

- It does not create a new competing skill — `guide` is *already* the skill a definitional
  question is most likely to reach. Mode 4 just makes `guide` *handle that arrival well*
  instead of misfiring into a build consultation.
- The added trigger phrases are *understanding*-verbs that none of the other two skills
  claim. `inspect` owns "check/score/audit"; `advisor` owns the hook + "while editing".
  "Explain / what does X mean / why does this rule exist" is genuinely unclaimed lexical
  territory — occupying it *reduces* net ambiguity (today those phrases route by luck).
- The one residual overlap — a code-editing user asking "why does 1.4.3 matter here" —
  already resolves correctly: the `advisor` PostToolUse hook has *already fired* on the
  edit, so `advisor` is in context. Mode 4 in `guide` is for the *no-edit* case. The
  "with no build or audit in progress" clause in the description (4.2) makes this explicit.

---

## 5. Fallback — if the maintainer insists on a standalone `/beacon:teach`

This section is provided for completeness so the maintainer has a concrete spec if they
override the section-2 recommendation. **The deep-research verdict remains that section 4 is
the better path.** If a standalone skill is chosen anyway, build it like this to minimise
the cannibalisation that section 2.2 warns about.

### 5.1 Purpose

A read-only, explanation-only skill: it answers "what / who / why" about accessibility
concepts and never produces a scaffold, a score, or a file. Its deliverable is
understanding. It is the *explanation* quadrant of Diataxis (section 3).

### 5.2 Activation `description` frontmatter (engineered against cannibalisation)

```yaml
---
description: >-
  Plain-language EXPLANATION of accessibility concepts — definitions, not actions.
  Use ONLY when the user wants to understand what something means and is NOT asking to
  build, fix, score, or audit anything. Triggers on "what is WCAG", "what does [criterion]
  mean", "explain [WCAG criterion / a11y concept]", "why does this rule exist", "who does
  [criterion] help", "what's the difference between Level A and AA", "what is a screen
  reader", "what is ARIA", "what counts as large text". Answers definitional and
  conceptual questions about WCAG criteria, disability categories, and accessibility
  terminology.
  Do NOT use this skill if the user wants to build UI (use beacon:guide), is editing UI
  code (beacon:advisor handles that), or wants to assess/score/audit a page
  (use beacon:inspect). This skill never writes code, never produces a score, never
  creates a file. If the user shifts from "what is X" to "help me build/fix/check X",
  hand off to the appropriate skill.
---
```

Anti-cannibalisation devices in this description, and the rationale for each:

| Device | Why |
|--------|-----|
| Leads with "EXPLANATION ... definitions, not actions" | Front-loads the discriminating concept so the matcher weights it heavily. |
| Explicit "Use ONLY when ... NOT asking to build, fix, score, or audit" | Negative scoping — tells the router the exclusion set, the one lever available against phrase collision. |
| Trigger phrases are all *understanding*-verbs ("what is", "explain", "why", "who does X help", "what's the difference") | Avoids `guide`'s build-verbs and `inspect`'s assess-verbs. Picks lexically distinct territory. |
| Avoids the bare token "WCAG compliance" and "check accessibility" | Those are `inspect`'s exact phrases (`inspect.md:13`). Using "what is WCAG" / "explain WCAG criterion" instead keeps distance. |
| Explicit "Do NOT use ... use beacon:guide / beacon:advisor / beacon:inspect" with named handoffs | Mirrors the existing cross-reference pattern (`guide.md:12-13`) — the only tool Beacon already uses to keep skills from poaching. |
| "never writes code, never produces a score, never creates a file" | Hard scope fence; also tells the router this is not where build/audit intent should land. |

### 5.3 Scope boundaries (hard)

`/beacon:teach` MUST NOT:
- Produce a code scaffold or before/after fix (that is `guide` / `advisor`).
- Run any tier of audit, emit a 0-100 score, or write `audit-results.json` (that is `inspect`).
- Start the Scope/Target-level/Jurisdiction interview (`inspect.md:46-53`).
- Trigger from, or be loaded by, the PostToolUse hook — it is explicitly *not* a code-context skill.

`/beacon:teach` MAY:
- Quote `references/wcag-quick.md`, `disabilities.md`, `legal-brief.md`, `cases.md`.
- Show a tiny illustrative snippet *if it clarifies a concept* — clearly framed as an
  example, never as a fix to apply.
- End with a one-line, optional handoff to whichever action skill fits, if the user
  signals they now want to act.

### 5.4 Content shape (outline)

```
# Accessibility Concept Explainer (/beacon:teach)

## When This Skill Activates
  - explanation-only; explicit table vs guide/advisor/inspect (reuse guide.md:24-31 style)

## How to Answer  (the 6-part answer shape from section 4.3, verbatim)
  1. Plain-language definition
  2. Who it is for (disability categories + situational)
  3. Pass example / fail example
  4. The number behind it (level + threshold)
  5. Honest boundary (machine-checkable vs human-judgement)
  6. Optional one-line bridge to an action skill

## Concept Index  (lookup table, not new knowledge — pointers into references/)
  - WCAG criteria        -> references/wcag-quick.md
  - Disability categories-> references/disabilities.md
  - Legal terms          -> references/legal-brief.md, cases.md
  - ARIA / semantics terminology -> references/patterns.md
  - "Level A vs AA vs AAA", "what is a screen reader", "what is the a11y tree" — short
    inline glossary entries for the handful of meta-questions not covered by a criterion row

## What This Skill Will Not Do
  - explicit restatement of section 5.3 hard boundaries, so the model in-session does not
    drift into building or auditing

## References  (same shared reference set as the other three skills)
```

Note even the fallback skill is **a re-surfacing of existing references**, not a new corpus.
That is itself an argument that it does not need to be a skill — a skill that only
re-points at reference files is doing the job a mode could do.

### 5.5 Residual risk even with the engineered description

Be honest about the limit: description engineering *reduces* but cannot *eliminate*
collision. "What is WCAG 1.4.3" and "is my page WCAG 1.4.3 compliant" are close in
embedding space; some fraction of assess-intent prompts will still land on `teach` and some
explain-intent prompts on `inspect`. The 6-part answer shape's step 6 (bridge to action)
and `inspect`'s Step 1 scoping interview act as *recovery* paths, but a misroute still costs
the user a turn. This residual cost is exactly why section 4 (mode, not skill) is the
recommended answer: a mode inside `guide` has no sibling to collide with.

---

## 6. Recommendation summary

1. **Do not ship a 4th `/beacon:teach` skill.** The routing-ambiguity cost (collision on
   the high-traffic "WCAG" token with `inspect` and `advisor`, plus the hook) and the
   conceptual cost (breaking the 3-phase pipeline model that README/ARCHITECTURE/governance
   all depend on) outweigh the benefit for a use case whose frequency is unverified and
   probably minority for Beacon's developer audience.

2. **Do close the real gap.** Add **Mode 4: Concept Explanation** to `commands/guide.md`
   (draft prose in section 4.3) and a small definitional-question trigger cluster to its
   `description` (section 4.2). This captures essentially all the value: a clean route for
   "what is WCAG 1.4.3" that answers directly instead of misfiring into a build
   consultation or an audit interview.

3. **The gap is a surfacing problem, not a content problem.** `references/wcag-quick.md`
   and `disabilities.md` already contain everything a good explanatory answer needs
   (section 4.4 worked example proves this). No new knowledge base is required either way.

4. **If overridden**, build the standalone skill per section 5 — explanation-only, hard
   scope fences, an anti-cannibalisation `description`, hook-excluded — and accept the
   residual misroute cost section 5.5 documents.

5. **Adjacent ROADMAP item:** whichever path is taken, it intersects `ROADMAP.md:43` ("No
   reference between skills"). Mode 4 / `teach` should cross-link to `guide`, `advisor`,
   `inspect` the way the existing descriptions cross-link to each other (`guide.md:12-13`).
   Closing the cross-reference seam should happen *before or with* this change, not after.

---

## Appendix — evidence index

| Claim | Source |
|-------|--------|
| Question wording | `ROADMAP.md:86` |
| 3-skill pipeline = design/code/ship | `ARCHITECTURE.md:7-33`, `README.md:9-13` |
| `guide` triggers on design-phase verbs; cross-refs the other two | `commands/guide.md:2-13` |
| `guide` is "before you code", framed for builders | `commands/guide.md:30` |
| `advisor` description mentions "deeper guidance on WCAG criteria" | `commands/advisor.md:2` |
| `advisor` self-describes as "an educator" | `commands/advisor.md:8` |
| `advisor` is hook-driven, code-context | `commands/advisor.md:10-13`, `hooks/hooks.json:25-35` |
| `inspect` triggers on assess/score/"WCAG compliance" | `commands/inspect.md:11-15` |
| `inspect` opens with a Scope/Target/Jurisdiction interview | `commands/inspect.md:46-53` |
| WCAG explanatory content already exists as a reference | `references/wcag-quick.md` (e.g. line 34, 1.4.3) |
| Who-is-affected content already exists | `references/disabilities.md` |
| "WCAG" is a shared trigger token across skills + governance + gate | `guide`/`inspect`/`advisor` descriptions, `beacon-governance.md:13`, `scripts/beacon-prompt-gate.mjs:27` |
| Existing un-cross-referenced seam between skills | `ROADMAP.md:43` |
| Routing is description-similarity (no priority field) | inferred from all `commands/*.md` frontmatter shape; supported by hand-tuned cross-ref sentence `guide.md:12-13` |
| `rustc --explain`, MDN-vs-linter, Lighthouse "Learn more", Diataxis | external, general dev-tooling knowledge; cited as patterns, section 3 |
