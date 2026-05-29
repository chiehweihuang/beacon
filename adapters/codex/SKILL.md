---
name: beacon
description: "Use Beacon accessibility + AEO review in Codex. Trigger when the user asks for accessibility, a11y, WCAG, inclusive design, UI/UX audit, legal accessibility risk, AEO / answer-engine optimization, schema/meta/AI-crawlability, or when reviewing/building UI where accessibility matters. Ported from chiehweihuang/beacon for Codex; does not rely on Claude Code hooks."
---

# Beacon

Use this skill to add Beacon's accessibility + AEO lens to Codex UI work. Beacon is strongest after or during UI work; pair it with `bright-raven-uiux` for Bright Raven philosophy and `akegarasu-design` for high-fidelity Codex prototypes when that skill is installed. Do not invoke Claude-side legacy design plugins from Codex.

The user-facing interface is the skill / goal, not the command line. Bundled scripts are internal repeat-testing helpers Codex may run when useful.

## Modes

1. **Guide before code**：when designing layout, forms, navigation, modals, color, typography, motion, responsive behavior, or component patterns.
2. **Advisor during code**：when editing HTML, CSS, JSX, TSX, Vue, Svelte, SwiftUI, Android Compose, Flutter, React Native, or UI-like JS/TS.
3. **Inspect after code**：when reviewing a page, component, prototype, PR, or live URL for accessibility / AEO risk.

Codex does not run Beacon's Claude PostToolUse hook. Apply advisor mode manually when UI files are created or edited.

## Quick Workflow

1. Identify scope: page, component, entire project, live URL, or design mockup.
2. Default standard: WCAG 2.2 AA.
3. Default jurisdictions when relevant: US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, Australia DDA.
4. Run the strongest available checks:
   - Static review with file reads and `rg`.
   - Browser review with Playwright when a dev server / live page is available.
   - Keyboard path test for primary flow.
   - Screenshot checks at desktop and 320px mobile width.
5. Report findings as user-impact first, criterion second.

## Categories

- Contrast
- Keyboard
- Screen reader
- Forms
- Media
- Motion
- Touch target
- Cognitive load / dark patterns
- Responsive reflow
- Agent / AEO: schema, metadata, heading outline, AI-crawlability

## Reference Loading

Load only the reference needed:

- Full design guidance: `references/beacon-guide.md`
- During-code advisor rules: `references/beacon-advisor.md`
- Full audit process: `references/beacon-inspect.md`
- WCAG criteria: `references/wcag-quick.md`
- Component patterns: `references/patterns.md`
- Disability categories: `references/disabilities.md`
- Legal context: `references/legal-brief.md`
- Cases: `references/cases.md`
- Document accessibility: `references/documents.md`

## Goal / Skill Workflow

When the user says to run Beacon, repeat Beacon, use `/goal`, or keep testing accessibility during UI iteration:

1. Treat this skill as the operating contract.
2. Run advisor checks after touching UI files.
3. For substantial UI work, produce a repeatable audit artifact.
4. Use LLM review for judgment that scripts cannot verify.
5. Report only the findings and residual risk the user needs.

User-facing prompt examples:

```text
Use beacon on this UI change and keep iterating until no blocking accessibility issues remain.
```

```text
Run the Beacon goal on this page: design guidance, implementation review, static baseline, then tell me remaining risks.
```

```text
每次你改 UI，都用 beacon 做 advisor review；完成後產出 accessibility summary。
```

See `references/goal-workflows.md` for reusable goal patterns.

## Internal Repeat Testing Helpers

During UI iterations, Codex may run the advisor on touched files:

```bash
node ~/.codex/skills/beacon/scripts/advisor.mjs path/to/file.tsx
```

For a repeatable static baseline, Codex may run:

```bash
node ~/.codex/skills/beacon/scripts/static-audit.mjs \
  --scope "Project UI" \
  --output reports/a11y/audit-results.json \
  src app public
```

Then generate the HTML report:

```bash
node ~/.codex/skills/beacon/scripts/generate-report.mjs \
  reports/a11y/audit-results.json \
  --output reports/a11y/a11y-report.html
```

These commands are not the required user interface. They exist so a skill / goal can repeat the same checks consistently instead of relying only on free-form review.

See `references/repeat-testing.md` and `references/goal-workflows.md` for the longer contract.

## HTML Report

If an audit JSON exists, generate Beacon's interactive report:

```bash
node ~/.codex/skills/beacon/scripts/generate-report.mjs audit-results.json --output a11y-report.html
```

Do not invent a numeric score without an evidence-backed audit JSON. If you cannot verify runtime behavior, mark it unverifiable.

## Output Rules

- Findings first, ordered by severity.
- Name who is affected, not just which rule fails.
- Prefer native semantic HTML before ARIA.
- State what was checked and what could not be verified.
- For code work, make the smallest patch that fixes the issue.
- For design work, give the accessible pattern before decorative styling.
- For repeated testing, keep audit JSON and HTML report under a project-local `reports/a11y/` or equivalent ignored/generated folder unless the project already has a convention.
