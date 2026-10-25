# Research results and quality observation

## Purpose
記錄 triage、digest、SQLite 與回歸工具的現行邊界，不宣稱它們已構成自動改善管線。
來源：營運 workspace 的 triage-daily.mjs、survey-digest.mjs、db.mjs、scanner-regression.mjs。

## Requirements

### Requirement: Issue signatures preserve observed history
Triage SHALL group completed-day results by capture reason, protection, audit timeout, baseline timeout and finding-count changes from rules comparison.

#### Scenario: Resolved signature recurs
- **WHEN** a fixed, verified or closed issue appears on a later day
- **THEN** it reopens with a recorded event

#### Scenario: Incomplete or missing input
- **WHEN** a selected day is incomplete or a completed day lacks a required result file
- **THEN** triage fails visibly rather than recording an empty success

#### Scenario: Default day selection
- **WHEN** no date is supplied
- **THEN** current triage selects only the latest completed day
- **AND** this does not prove earlier untriaged days were processed

### Requirement: Latest and historical audits are queryable
Database synchronization SHALL derive target and audit rows from the registry and stored reports in a transaction.

#### Scenario: Completed daily capture
- **WHEN** an isolated daily run completes with database synchronization
- **THEN** its latest survey audit and historical after audit can both be queried
- **AND** repeated synchronization does not duplicate their logical rows

### Requirement: Digest preserves prior reports during engine refresh
Digest SHALL save the old report before replacing it with a successful re-audit of the stored snapshot.

#### Scenario: Different engine fingerprint
- **WHEN** the stored report uses a different engine and local re-audit succeeds
- **THEN** the original report remains in content-addressed report history
- **AND** suspect lists remain review candidates rather than confirmed false positives

### Requirement: Regression comparison does not imply accuracy
The scanner regression gate SHALL fail on output differences, execution errors or an empty comparison corpus.

#### Scenario: A differing report
- **WHEN** a re-scan differs in a compared report section
- **THEN** the gate exits nonzero and records the differing section

#### Scenario: All compared outputs match
- **WHEN** compared reports match under the gate's normalization
- **THEN** the result is compatibility evidence only, not independently measured precision or recall

## Known defects, not intended contracts
GAP-01: current SQLite ingest reads metadata.audit_date, while the scanner emits metadata.date, producing null dates.
GAP-02: malformed reports can advance the mtime marker before successful parsing; a repaired file retaining that mtime can remain stale in SQLite.
GAP-03: default triage processes only the latest complete day; it does not backfill a missed older day.
These are reproduced in synthetic probes and must not be accepted as desired improvement-pipeline behavior.
