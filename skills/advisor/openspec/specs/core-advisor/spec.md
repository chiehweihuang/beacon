---
tags: [a11y, openspec, testing]
status: spec
source: agent
---

# Core Advisor Behavior

## Purpose

Verify that the a11y-advisor skill correctly identifies accessibility issues, names affected disability categories, and provides actionable guidance.

## Requirements

### Requirement: Disability Category Identification

Every accessibility suggestion MUST name the specific disability category affected, not just cite the WCAG criterion.

#### Scenario: Missing alt text
- **GIVEN** code contains `<img src="chart.png">`
- **WHEN** the advisor reviews this code
- **THEN** the output mentions "visual" disability (blind users, screen reader users)
- **AND** cites WCAG 2.2: 1.1.1 Non-text Content (A)
- **AND** does NOT say just "fails WCAG 1.1.1" without mentioning who is affected

#### Scenario: Low contrast text
- **GIVEN** code defines text color #777 on background #fff (contrast ratio ~4.48:1 for body text)
- **WHEN** the advisor reviews this code
- **THEN** the output mentions "visual" (low vision) and "age-related" disability categories
- **AND** cites WCAG 2.2: 1.4.3 Contrast Minimum (AA)
- **AND** provides the calculated contrast ratio

#### Scenario: Missing keyboard handler
- **GIVEN** code contains `<div onclick="doSomething()">`
- **WHEN** the advisor reviews this code
- **THEN** the output mentions "visual" (screen reader) AND "motor" (keyboard users) disability categories
- **AND** cites WCAG 2.2: 4.1.2 (A) and 2.1.1 (A)

---

### Requirement: Native First Principle

The advisor MUST prefer native HTML elements over ARIA-enhanced div solutions.

#### Scenario: Custom dialog
- **GIVEN** code contains `<div role="dialog" aria-modal="true">`
- **WHEN** the advisor reviews this code
- **THEN** the output suggests using native `<dialog>` element with `showModal()`
- **AND** explains that native `<dialog>` provides focus trapping, Escape key, and backdrop for free

#### Scenario: Custom accordion
- **GIVEN** code contains a div-based accordion with `aria-expanded` and JavaScript toggle
- **WHEN** the advisor reviews this code
- **THEN** the output suggests using native `<details>` / `<summary>`
- **AND** notes that zero JavaScript is required for basic accordion behavior

#### Scenario: Custom button
- **GIVEN** code contains `<span role="button" tabindex="0" onclick="submit()">`
- **WHEN** the advisor reviews this code
- **THEN** the output suggests using `<button type="submit">`
- **AND** explains that native `<button>` gives focus, Enter/Space activation, and correct role for free

---

### Requirement: WCAG Version Identification

All WCAG references MUST include the version number (2.2) and level (A/AA/AAA).

#### Scenario: Standard criterion
- **GIVEN** any accessibility issue is detected
- **WHEN** the advisor produces output
- **THEN** the WCAG reference includes version: `WCAG 2.2:`
- **AND** includes the level in parentheses: `(A)`, `(AA)`, or `(AAA)`
- **AND** never outputs bare criterion numbers like "1.4.3" without version

#### Scenario: WCAG 2.2 new criteria
- **GIVEN** code has interactive targets of 20×20px
- **WHEN** the advisor reviews this code
- **THEN** cites `WCAG 2.2: 2.5.8 Target Size (Minimum) (AA) [NEW]`
- **AND** notes this is new in WCAG 2.2

---

### Requirement: WCAG 3.0 Direction

When WCAG 3.0 has a relevant directional change, the advisor SHOULD append it with `⟶` prefix.

#### Scenario: Contrast with APCA direction
- **GIVEN** a contrast issue is detected
- **WHEN** the advisor provides feedback
- **THEN** it MAY append `⟶ WCAG 3.0 方向：APCA LC ≥60 for body text`
- **AND** clarifies this is directional, not yet required

#### Scenario: Cognitive accessibility
- **GIVEN** a complex form with many steps and no undo
- **WHEN** the advisor reviews this
- **THEN** it MAY note `⟶ WCAG 3.0 大幅強化認知無障礙要求`

---

### Requirement: Severity Classification

Issues MUST be classified by severity based on WCAG level and impact.

#### Scenario: Level A violation
- **GIVEN** a Level A criterion is violated
- **WHEN** the advisor produces output
- **THEN** it is marked as 🔴 CRITICAL
- **AND** uses the `🔴 A11Y` header format

#### Scenario: Level AA violation
- **GIVEN** a Level AA criterion is violated
- **WHEN** the advisor produces output
- **THEN** it is marked as ⚠ WARNING
- **AND** uses the `⚠ A11Y` header format

#### Scenario: Best practice / AAA
- **GIVEN** a best practice or AAA improvement is possible
- **WHEN** the advisor produces output
- **THEN** it is marked as 💡 TIP
- **AND** uses the `💡 A11Y` header format

#### Scenario: Seizure risk (life-safety)
- **GIVEN** content flashes more than 3 times per second
- **WHEN** the advisor detects this
- **THEN** it is marked as 🔴 CRITICAL
- **AND** explicitly states "LIFE-SAFETY" in the output
- **AND** cites WCAG 2.2: 2.3.1 Three Flashes (A)
