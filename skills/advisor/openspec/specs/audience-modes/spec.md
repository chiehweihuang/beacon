---
tags: [a11y, openspec, testing]
status: spec
source: agent
---

# Audience Mode Output

## Purpose

Verify that the a11y-advisor produces appropriately different output for each audience mode, with the correct focus and token efficiency.

## Requirements

### Requirement: Expert Mode Output

Expert mode produces the most concise output possible.

#### Scenario: Missing label in expert mode
- **GIVEN** `a11y-audience: expert` is set
- **AND** code contains `<input type="email" placeholder="Email">`
- **WHEN** the advisor reviews this code
- **THEN** the output is ≤40 tokens
- **AND** contains the fix (add `<label>`)
- **AND** contains the WCAG reference (3.3.2)
- **AND** does NOT contain code examples
- **AND** does NOT contain legal risk information

---

### Requirement: Dev Mode Output

Dev mode includes before/after code snippets.

#### Scenario: Missing label in dev mode
- **GIVEN** `a11y-audience: dev` is set (or no setting, since dev is default)
- **AND** code contains `<input type="email" placeholder="Email">`
- **WHEN** the advisor reviews this code
- **THEN** the output includes a code snippet showing correct `<label>` usage
- **AND** includes WCAG reference with version and level
- **AND** mentions affected disability categories
- **AND** is ≤100 tokens

---

### Requirement: Designer Mode Output

Designer mode focuses on who is affected and experience impact, without code.

#### Scenario: Missing label in designer mode
- **GIVEN** `a11y-audience: designer` is set
- **AND** code contains `<input type="email" placeholder="Email">`
- **WHEN** the advisor reviews this code
- **THEN** the output describes which users are affected (visual — screen readers, cognitive — memory)
- **AND** explains the experience difference ("placeholder disappears on focus, user forgets what to enter")
- **AND** does NOT contain code examples
- **AND** MAY include global statistics (e.g., "1.3 billion people have some form of disability")
- **AND** tells the designer what to specify in the design ("mark as required labeled field")

---

### Requirement: Lead Mode Output

Lead mode focuses on legal risk and business impact.

#### Scenario: Missing label in lead mode
- **GIVEN** `a11y-audience: lead` is set
- **AND** code contains `<input type="email" placeholder="Email">`
- **WHEN** the advisor reviews this code
- **THEN** the output mentions legal exposure (ADA, EAA, applicable laws)
- **AND** includes lawsuit statistics or settlement amounts where relevant
- **AND** compares fix cost vs. litigation cost
- **AND** does NOT contain code examples
- **AND** ends with an actionable recommendation for a decision-maker

---

### Requirement: Team Mode Output

Team mode produces PR-review-ready checklists.

#### Scenario: Missing label in team mode
- **GIVEN** `a11y-audience: team` is set
- **AND** code contains `<input type="email" placeholder="Email">`
- **WHEN** the advisor reviews this code
- **THEN** the output contains `- [ ]` checkbox items
- **AND** each item is actionable and verifiable
- **AND** includes a WCAG reference at the bottom
- **AND** is suitable for pasting into a PR review comment

---

### Requirement: Mode Consistency

The same issue always triggers the same WCAG criterion regardless of mode.

#### Scenario: Same issue, different modes
- **GIVEN** code contains `<img src="photo.jpg">` (missing alt)
- **WHEN** the advisor reviews in `expert` mode
- **AND** the advisor reviews in `lead` mode
- **THEN** both cite WCAG 2.2: 1.1.1 Non-text Content (A)
- **AND** both classify as 🔴 CRITICAL
- **BUT** the content focus and length differ per mode
