# Beacon Repeat Testing in Codex

Use this flow when iterating on UI repeatedly. The normal interface is a Codex goal or skill invocation; CLI commands are internal helpers Codex may run for repeatability.

## Goal-First Invocation

User-facing examples:

```text
Use beacon while editing this UI and keep checking after each UI change.
```

```text
Run a Beacon review on this component and tell me the remaining accessibility risks.
```

```text
用 beacon 反覆測這個頁面，直到沒有 blocking a11y issue。
```

## During Editing

Codex may run the advisor on changed UI files:

```bash
node ~/.codex/skills/beacon/scripts/advisor.mjs path/to/file.tsx
```

Exit code:

- `0`: no static advisor issue found.
- `2`: static issues found; fix before continuing unless explicitly not applicable.

## Static Baseline Audit

Codex may generate an audit JSON:

```bash
node ~/.codex/skills/beacon/scripts/static-audit.mjs \
  --scope "Project homepage" \
  --output reports/a11y/audit-results.json \
  src app public
```

Codex may generate the HTML report:

```bash
node ~/.codex/skills/beacon/scripts/generate-report.mjs \
  reports/a11y/audit-results.json \
  --output reports/a11y/a11y-report.html
```

Compare against a previous run:

```bash
node ~/.codex/skills/beacon/scripts/generate-report.mjs \
  reports/a11y/audit-results.json \
  --previous reports/a11y/previous-audit-results.json \
  --output reports/a11y/a11y-report.html
```

## What This Catches Well

- Missing HTML `lang` / title / viewport.
- Missing alt text.
- Missing labels on obvious inputs.
- Clickable non-button elements.
- `outline: none` without `:focus-visible`.
- Positive `tabindex`.
- Fixed-grid / fixed-width reflow risk.
- Motion without `prefers-reduced-motion`.
- Missing AEO structural basics such as meta description and JSON-LD review flags.

## What Still Needs Runtime Testing

- Real contrast after CSS variables and overlays resolve.
- Actual keyboard flow through modals, menus, and route changes.
- Screen reader reading order and announcement quality.
- Dynamic state changes.
- Mobile touch ergonomics.
- Whether labels and alt text are meaningful.
- Real disabled-user testing.

## Codex Usage Contract

For UI changes, Codex should:

1. Run `advisor.mjs` on touched UI files.
2. Run project tests / build as usual.
3. For substantial UI work, run `static-audit.mjs` and generate the HTML report.
4. Report what was checked and what remains unverifiable.
