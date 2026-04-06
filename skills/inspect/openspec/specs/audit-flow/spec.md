---
tags: [a11y, openspec, testing]
status: spec
source: agent
---

# Audit Flow

## Purpose

Verify that the a11y-audit skill follows a structured process and produces a complete, actionable report.

## Requirements

### Requirement: Scope Definition

The audit MUST establish scope before beginning review.

#### Scenario: No scope specified
- **GIVEN** the user says "do an accessibility audit"
- **WHEN** the audit skill is triggered
- **THEN** the skill asks for scope (entire project / page / component)
- **AND** asks for target level (default: WCAG 2.2 AA)
- **AND** asks for target jurisdictions
- **AND** does NOT begin the audit until scope is confirmed

#### Scenario: Scope specified
- **GIVEN** the user says "audit the login form for WCAG 2.2 AA, targeting US ADA and EU EAA"
- **WHEN** the audit skill is triggered
- **THEN** the skill proceeds directly to review without asking scope questions

---

### Requirement: Report Structure

The audit report MUST follow the defined template structure.

#### Scenario: Complete report
- **GIVEN** an audit has been completed
- **WHEN** the report is generated
- **THEN** it contains all required sections:
  - Header with date, scope, standard, jurisdictions
  - Summary table (categories × pass/fail/review)
  - Verdict (PASS / CONDITIONAL PASS / FAIL)
  - Critical findings (🔴) with WCAG reference + affected users + fix
  - Warnings (⚠)
  - Improvements (💡)
  - Remediation priority (P0 / P1 / P2)
  - Legal risk summary
  - WCAG 3.0 forward look
  - Testing recommendations

---

### Requirement: Category Coverage

The audit MUST check all defined categories.

#### Scenario: All categories checked
- **GIVEN** a full-scope audit is requested
- **WHEN** the audit is completed
- **THEN** the summary table includes ALL of:
  - Color & Contrast
  - Keyboard Navigation
  - Screen Reader
  - Forms
  - Media
  - Motion & Animation
  - Touch & Target Size
  - Cognitive
  - Agent Operability

---

### Requirement: Severity Assignment

Each finding MUST have a severity based on WCAG level.

#### Scenario: Level A violation in audit
- **GIVEN** the audit finds a Level A violation
- **WHEN** the finding is documented
- **THEN** it is classified as 🔴 CRITICAL
- **AND** placed in P0 remediation priority

#### Scenario: Level AA violation in audit
- **GIVEN** the audit finds a Level AA violation
- **WHEN** the finding is documented
- **THEN** it is classified as ⚠ WARNING
- **AND** placed in P1 remediation priority

#### Scenario: Best practice in audit
- **GIVEN** the audit identifies a best practice improvement
- **WHEN** the finding is documented
- **THEN** it is classified as 💡 IMPROVEMENT
- **AND** placed in P2 remediation priority

---

### Requirement: Legal Risk Mapping

The audit report MUST map findings to specific legal risks based on selected jurisdictions.

#### Scenario: US ADA jurisdiction
- **GIVEN** the audit targets US ADA
- **WHEN** Level A or AA violations are found
- **THEN** the legal risk section mentions ADA Title III litigation risk
- **AND** includes current lawsuit statistics (8,667 in 2025)

#### Scenario: EU EAA jurisdiction
- **GIVEN** the audit targets EU EAA
- **WHEN** violations are found
- **THEN** the legal risk section mentions EAA enforcement (in force since June 2025)
- **AND** includes penalty range (up to €1,000,000)

#### Scenario: Japan jurisdiction
- **GIVEN** the audit targets Japan
- **WHEN** violations are found
- **THEN** the legal risk section mentions 障害者差別解消法 (2024 amendment)
- **AND** notes private sector "reasonable accommodation" is now mandatory

---

### Requirement: Automated + Manual Balance

The audit MUST clearly distinguish automated findings from manual review items.

#### Scenario: Automated tool availability
- **GIVEN** the project has axe-core or Lighthouse available
- **WHEN** the audit begins
- **THEN** automated tools are run first
- **AND** results are documented
- **AND** the report explicitly states "automated tools catch ~30-40% of issues"
- **AND** manual review covers the remaining ~60-70%

#### Scenario: No automated tools
- **GIVEN** the project has no automated accessibility testing tools
- **WHEN** the audit begins
- **THEN** the audit proceeds with manual review only
- **AND** the testing recommendations section suggests installing axe-core

---

### Requirement: Follow-up Offers

After delivering the report, the audit SHOULD offer follow-up actions.

#### Scenario: Post-report options
- **GIVEN** the audit report has been delivered
- **WHEN** the user reads the report
- **THEN** the skill offers:
  - Create OpenSpec scenarios for critical findings
  - Create GitHub issues or todo items for each finding
  - Suggest re-audit timeline based on severity
  - Generate a remediation plan with estimated effort
