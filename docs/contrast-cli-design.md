# Design: `beacon-contrast` — dual-standard contrast CLI (WCAG 2.2 + APCA)

Status: design proposal, not implemented. Author: pipeline-driven (improve loop, 2026-05-31).
Companion research notes (cited sources): vault `_yorozuya/research/2026-05-31-contrast-wcag2-apca-research.md`.

## Why

The improve pipeline's first real-site survey (50 sites, 2026-05-31) found `color-contrast`
the #1 cross-site detection gap (18/50). Beacon's Tier 1 static scanner structurally cannot
compute contrast; Tier 2 (axe-core via Playwright) can, and is already default-on. Yet the
seed case (tokyotaiwanradar) showed even an agent with Tier 2 available missed contrast. The
gap is therefore not "no mechanism" but "no deterministic, scriptable contrast oracle that the
agent or pipeline can invoke without relying on the LLM to remember to run axe and read its
contrast results." This design adds that, and folds in APCA (WCAG 3 direction) as informational
data alongside the authoritative WCAG 2.2 verdict.

## Research findings that shape the design

1. WCAG 2.x contrast is a settled standard (relative luminance + `(L1+0.05)/(L2+0.05)`;
   AA 4.5:1 / 3:1 large, large = >=24px or >=18.7px bold). axe-core already implements it
   well in a real browser: it resolves the effective background by walking the visual stack
   (`elementsFromPoint`) and alpha-compositing, and returns one of 14 `incomplete` states
   (bgImage, bgGradient, pseudoContent, complexTextShadows, fgAlpha, ...) when it cannot
   confirm. Accurate contrast REQUIRES a rendering engine; static CSS parsing cannot resolve
   cascade, opacity propagation, stacking, gradients, or CSS variables.
2. WCAG 3.0 is a Working Draft with no finalized contrast algorithm ("yet to be determined");
   no Recommendation expected before ~2028. APCA was removed from the WCAG 3 draft in 2023 and
   has never been normative. WCAG 2.2 remains the operative/legal standard.
3. APCA (Lc, directional, font-size/weight aware) is perceptually better for dark mode, thin
   fonts, and saturated-on-dark, but is informational only.
4. Licensing: `apca-w3` (the reference impl) carries a restrictive non-OSS license (no
   modification, audit-rights clause, commercial use needs a signed agreement, no OSS carve-out).
   `colorjs.io` (MIT, maintained by the CSS Color 4 editors) computes BOTH WCAG 2.1 ratio and
   APCA in one library. Using colorjs.io sidesteps the apca-w3 license for an open-source tool.
5. No existing tool combines live Playwright sampling + dual WCAG2/APCA output in a CLI.
   `@axe-core/cli` and Lighthouse do WCAG2 only; `a11y-color-contrast` does both for static
   color pairs but has no sampling layer or CLI.

## Design

`beacon-contrast` is a Tier-2 CLI. It does NOT reimplement contrast math and does NOT replace
Beacon's existing axe Tier 2; it orchestrates battle-tested pieces and adds the deterministic
CLI surface + APCA.

### Recommended architecture: axe-augmented (Option 1)

```
URL or file
  -> Playwright (chromium) render, hydrate
  -> inject + run axe-core color-contrast rule
       (axe resolves fg/bg, font size/weight, and emits pass / fail / incomplete per node)
  -> for each result node, enrich with APCA Lc computed from axe's resolved fg/bg
       (colorjs.io, MIT)
  -> emit dual-standard JSON report
```

Why axe-augmented over a custom TreeWalker sampler: axe's effective-background resolution
(visual-stack walk + multi-layer alpha compositing) and its 14 `incomplete` conditions are the
hard, error-prone part of contrast. Reusing them is cheaper and more correct than re-deriving
background colors ourselves. We only add what axe lacks: APCA and a deterministic raw-number CLI.

(A custom-sampling Option 2 exists — `page.evaluate` + `TreeWalker` + colorjs.io for both
standards — but it re-implements background resolution and would drift from axe's behavior.
Keep it as a fallback only if an axe dependency is unacceptable.)

### Output shape (per text node)

```json
{
  "text": "first 80 chars",
  "selector": "main > p:nth-child(2)",
  "fg": "#777777", "bg": "#ffffff",
  "fontSizePx": 16, "fontWeight": 400, "largeText": false,
  "wcag2": { "ratio": 4.48, "threshold": 4.5, "level": "AA", "pass": false },
  "apca": { "Lc": 61.2, "thresholdLc": 75, "pass": false, "note": "informational" },
  "status": "fail"            // pass | fail | review
}
```

Plus a summary: counts of pass / fail / review, and the worst offenders.

### Framing (non-negotiable)

- WCAG 2.2 ratio is the AUTHORITATIVE compliance verdict (drives `status`).
- APCA Lc is INFORMATIONAL / forward-looking only. Labelled as such. It never sets compliance
  pass/fail and never overrides WCAG 2.2. This matches APCA's non-normative status and avoids
  legal-risk misframing.

### Scope and limits (v1)

- In scope: text contrast (SC 1.4.3 AA, optional 1.4.6 AAA), per visible text node.
- Out of scope v1: SC 1.4.11 non-text/UI contrast (axe's color-contrast rule does not cover it).
- `review` (not pass/fail) is inherited from axe's `incomplete` set: gradients, background
  images, pseudo-element backgrounds, complex text-shadow, unresolved fg alpha, overlap. These
  are surfaced as a human-review queue, never silently passed.
- Large-text classification uses computed `font-size` (px) and `font-weight` from the browser,
  not authored CSS.

## Build vs adopt

Build a thin orchestration; adopt the math. Minimal dependency set:

| Layer | Package | License | Role |
|---|---|---|---|
| Render + run | `playwright` | Apache-2.0 | already a Beacon Tier-2 dep |
| WCAG2 verdict + fg/bg/size resolution | `axe-core` | MPL-2.0 | reuse its color-contrast rule |
| APCA Lc | `colorjs.io` | MIT | `color.contrast(other, "APCA")` |

Do NOT use `apca-w3` (restrictive license). Do NOT reimplement APCA from scratch (subtle
gamma/polarity conventions). Do NOT use `wcag-contrast` (abandoned) — axe already gives the ratio.

## How it fits Beacon

- A deterministic Tier-2 CLI the agent and the improve pipeline can invoke directly, instead of
  depending on the LLM to run axe and surface contrast. Closes the "agent had Tier 2 but missed
  contrast" failure mode from the seed case.
- For the improve pipeline: a deterministic contrast oracle. The pipeline can run it on real
  sites and feed results into tool-diff without an agent in the loop.
- Complements, does not replace, the inspect skill's existing Tier-2 axe guidance.

## Open risks / decisions for the maintainer

1. colorjs.io's APCA may lag the frozen reference (0.0.98G-4g). Acceptable because APCA is
   informational. Pin the colorjs.io version and note the APCA revision in output.
2. APCA-the-algorithm has IP claims from Myndex independent of code license. Using an
   independent MIT implementation (colorjs.io) is the common pragmatic path for OSS; if Beacon
   is ever distributed commercially, get legal sign-off on APCA usage.
3. Performance: per-node APCA is cheap; the cost is the axe run + render. Same budget as the
   existing Tier-2 path.
4. Decision needed: build v1 now (axe-augmented, text-only, APCA informational)? Or defer and
   only land the inspect.md evidence (already in PR #9)?

## Relationship to PR #9

PR #9 already upgraded the inspect.md "Why default-on" evidence to the 18/50 survey. This CLI is
the next, larger step: a concrete deterministic dual-standard contrast tool. It is a separate
change and should be its own PR if built.
