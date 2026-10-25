## ADDED Requirements

### Requirement: Traceable improvement candidates
The pipeline SHALL identify each candidate by its source evidence and revision, preserving observations separately from interpretations.

#### Scenario: Evidence replay
- **WHEN** identical source evidence is processed again
- **THEN** the existing candidate is reused without duplicating work

#### Scenario: Evidence changes
- **WHEN** the source revision changes
- **THEN** the changed evidence is linked without erasing earlier conclusions

### Requirement: Isolated and verified fixes
The pipeline SHALL evaluate fixes in isolation and distinguish a reproduced failure, a passing regression check and measured accuracy.

#### Scenario: Regression fix
- **WHEN** a candidate claims to fix a reproducible defect
- **THEN** the same regression test fails for the expected reason before the fix and passes after it
- **AND** versions, commands and results remain traceable

#### Scenario: No accuracy evidence
- **WHEN** outputs match a historical corpus but no independent labels exist
- **THEN** the result is reported as compatibility evidence, not improved accuracy

### Requirement: Historical comparisons and integration
The pipeline SHALL preserve earlier snapshots and reports and make applicable new results discoverable through the existing registry, digest and database workflow.

#### Scenario: Website and engine changes
- **WHEN** both a page and the engine have changed
- **THEN** comparison uses the same engine across snapshots and the same snapshot across engines
- **AND** unavailable comparisons are explicitly marked unverified

### Requirement: Recoverable execution
The pipeline SHALL preserve pending work across interruption and prevent concurrent ownership of the same operation.

#### Scenario: Lock contention or interruption
- **WHEN** a run cannot acquire its lock or stops before completion
- **THEN** unfinished work remains recoverable without duplicate publication or false completion

### Requirement: Private experience integration
The pipeline SHALL keep private experience data outside Git repositories and record actual decisions separately from agent assessments.

#### Scenario: No owner decision
- **WHEN** an agent proposes a lesson without an explicit owner acceptance
- **THEN** the proposal remains unaccepted

#### Scenario: Experience service unavailable
- **WHEN** an experience operation fails
- **THEN** the failure is recorded for retry without inventing a successful result

### Requirement: Bounded publication
The pipeline SHALL publish only authorized, explicitly selected sanitized artifacts to an approved destination.

#### Scenario: Private or unapproved artifact
- **WHEN** a publication candidate includes raw research data, credentials or unapproved output
- **THEN** publication is blocked and the reason remains visible

#### Scenario: Publication is not deployment
- **WHEN** an authorized change is published for review
- **THEN** it does not enable a schedule, merge a branch or deploy without the applicable authorization
