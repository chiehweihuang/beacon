# Audit evidence

## Purpose
描述已核對的靜態評分與證據隔離契約。基準為主線 `5fd4ac0`，不是所有檢測器的完整正確性保證。
來源：`core/scripts/static-audit.mjs` 的 scoreCategory 與 audit 組裝、`test/static-audit-scoring.test.mjs`、`test/scoring-properties.test.mjs`。
執行證據及限制見 `../../changes/automated-improvement-pipeline/verification.md`。

## Requirements

### Requirement: Unmeasured categories are not scores
The static scanner SHALL distinguish measured categories from review-only and inapplicable categories.

#### Scenario: No pass or fail evidence
- **WHEN** a category has no pass or fail evidence
- **THEN** its score is null
- **AND** review-only evidence is marked not-machine-checkable, while no evidence is marked not-applicable

#### Scenario: Thin measured evidence
- **WHEN** a category has one or two pass/fail items
- **THEN** it remains scored with thin set to true and participates in the weighted overall

### Requirement: Coverage remains separate from score
The scanner SHALL compute the overall from scored category weights and report measured-weight coverage separately.

#### Scenario: An unmeasured category
- **WHEN** a category is not scored
- **THEN** it is excluded from the overall weighted denominator rather than assigned zero
- **AND** the output exposes coverage_percent and category states

#### Scenario: Static confidence
- **WHEN** only static audit evidence is available
- **THEN** confidence is low or medium, never high

### Requirement: Judgment cannot silently change measured scores
The scanner SHALL preserve supplementary LLM judgment and reader-task evidence outside machine scoring.

#### Scenario: Supplementary judgment is supplied
- **WHEN** the scanner receives LLM judgment or reader evidence
- **THEN** these attachments do not change machine findings or overall score

### Requirement: Reproducible report identity
The scanner SHALL emit metadata.date and engine_fingerprint and support an explicitly fixed audit date.

#### Scenario: Same source and fixed date
- **WHEN** the same inputs are scanned twice using the same engine, paths and explicit date
- **THEN** the output is byte-identical

#### Scenario: Report date is selected
- **WHEN** --date is supplied
- **THEN** it takes precedence over the reproducible-build date environment setting
