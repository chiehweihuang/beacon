# Beacon Goal Workflows for Codex

These are user-facing goal patterns. The user should be able to ask for Beacon by goal; Codex decides whether to run bundled scripts, inspect files manually, use Playwright, or ask for a live URL.

## UI Iteration Goal

```text
Use beacon while editing this UI.

Loop:
1. Before changing UI structure, apply Beacon guide mode.
2. After each UI file change, apply Beacon advisor mode.
3. Fix blocking issues immediately.
4. At the end, run a static baseline audit if the change is more than a tiny copy/style edit.
5. Report what was checked, what improved, and what still needs live/browser/manual verification.
```

## Review Goal

```text
Review this page/component with beacon.

Output:
- Blocking accessibility issues first.
- AEO / agent-crawlability issues second.
- Legal-risk notes only where relevant.
- Suggested smallest patch.
- Residual risks that static review cannot verify.
```

## Pre-Code Design Goal

```text
Use Beacon guide mode before implementing this UI.

Give:
- Accessible pattern choice.
- Who benefits.
- Anti-patterns to avoid.
- Semantic structure.
- Verification checklist.
```

## Full Audit Goal

```text
Run a Beacon audit.

Use strongest available tier:
1. Static files if no browser is available.
2. Playwright / live browser if a dev server or URL is available.
3. Add keyboard walkthrough notes.
4. Generate or update a report artifact when useful.
```

## Principle

Do not force the user to remember CLI commands. The skill decides the workflow. Scripts are bundled tools for repeatability, not the product surface.
