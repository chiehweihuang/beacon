---
tags: [a11y, openspec, testing]
status: spec
source: agent
---

# Reference Loading Behavior

## Purpose

Verify that the advisor loads reference files only when needed, not preemptively, to conserve context window.

## Requirements

### Requirement: Selective Reference Loading

References MUST be loaded on-demand based on the scenario.

#### Scenario: Simple HTML issue
- **GIVEN** code contains `<div onclick="save()">`
- **WHEN** the advisor reviews this code
- **THEN** it does NOT load references/disabilities.md
- **AND** it does NOT load references/legal-brief.md
- **AND** it does NOT load references/cases.md
- **AND** it uses built-in knowledge from SKILL.md to provide the suggestion

#### Scenario: Need to explain disability category in detail
- **GIVEN** the user asks "why does this matter for cognitive disabilities?"
- **WHEN** the advisor responds
- **THEN** it reads references/disabilities.md for detailed cognitive disability information
- **AND** provides ICF-level detail if appropriate

#### Scenario: Lead mode legal question
- **GIVEN** `a11y-audience: lead` is set
- **AND** a significant violation is detected
- **WHEN** the advisor produces output
- **THEN** it reads references/legal-brief.md for jurisdiction-specific risk
- **AND** it reads references/cases.md for relevant case citations

#### Scenario: Component pattern needed
- **GIVEN** the user is building a tab interface
- **WHEN** the advisor reviews the implementation
- **THEN** it reads references/patterns.md for the correct tabs ARIA pattern
- **AND** does NOT load other reference files

---

### Requirement: No Full Preload

The advisor MUST NOT load all reference files at startup.

#### Scenario: Session start
- **GIVEN** a new session begins with UI code
- **WHEN** the a11y-advisor skill is triggered
- **THEN** only SKILL.md is loaded
- **AND** reference files are NOT loaded until specifically needed
- **AND** context window usage is minimized

---

### Requirement: Cross-Skill Reference Sharing

The audit skill MUST be able to access advisor's references.

#### Scenario: Audit reads advisor references
- **GIVEN** the a11y-audit skill is triggered
- **WHEN** it needs WCAG criterion details
- **THEN** it reads `../a11y-advisor/references/wcag-quick.md`
- **AND** the path resolves correctly
