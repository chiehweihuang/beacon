# Research daily cycle

## Purpose
描述 repo 外營運腳本已核對的行為。來源為獨立研究 workspace 的 daily-plan.mjs、daily-survey.mjs、schedule-plan.mjs；實際檔案 hash 存私人驗收紀錄。
這些腳本目前不由本 repo build 配送；本規格不能被誤讀為安裝 plugin 就有排程。

## Requirements

### Requirement: Three rotating lanes
The daily planner SHALL request 200 revisit, 50 retry and 50 fresh entries by default without resetting the legacy queue.

#### Scenario: Enough eligible targets
- **WHEN** each lane has sufficient candidates
- **THEN** the selected counts are 200, 50 and 50
- **AND** existing targets rotate by oldest daily_attempt, with id breaking ties

#### Scenario: Retry selection
- **WHEN** an eligible survey target is dead, walled, has a positive capture streak, an audit error or a later interrupted attempt than its last success
- **THEN** it is eligible for the retry lane rather than the normal revisit lane
- **AND** retired targets are excluded

#### Scenario: New-target supply
- **WHEN** fresh targets are selected
- **THEN** unconsumed legacy candidates precede the local domain list
- **AND** known normalized sites and consumed legacy candidates are excluded without mutating queue progress
- **AND** insufficient candidates are reported as a shortfall, not silently moved between quotas

### Requirement: Historical inputs survive a revisit
The daily runner SHALL preserve existing snapshot and report inputs before capture and distinguish website comparison from engine comparison.

#### Scenario: Both old inputs exist
- **WHEN** the new capture and both audits succeed under the same current engine
- **THEN** website comparison uses old versus new snapshots under that engine
- **AND** rules comparison uses the old stored report versus a current-engine audit of the old snapshot

#### Scenario: Fresh audit timeout
- **WHEN** the fresh audit times out
- **THEN** the latest stored snapshot and report remain unchanged and the target enters retry rotation

#### Scenario: Baseline-only timeout
- **WHEN** the fresh audit succeeds but the old-snapshot audit times out
- **THEN** the fresh report is retained and comparison is null with baselineFailed true

### Requirement: Persisted daily work is resumable
The runner SHALL resume its oldest incomplete persisted batch before creating another and reuse saved capture results.

#### Scenario: Registry commit or synchronization interruption
- **WHEN** execution stops after registry materialization or database synchronization fails
- **THEN** replay does not recapture completed entries or inflate the failure streak
- **AND** synchronization must succeed before the batch becomes complete

#### Scenario: Capture started but result is absent
- **WHEN** a capture-started marker exists without capture.json
- **THEN** that attempt is recorded as interrupted without another request in the same batch
- **AND** the interruption does not increment the capture failure streak or change status

### Requirement: Scheduled jobs serialize
Generated Linux timer units SHALL use persistent triggering and a shared blocking flock for intake, drift and digest.

#### Scenario: Simultaneous invocations
- **WHEN** three test jobs contend for the shared lock
- **THEN** each executes once without overlap instead of failing immediately on lock contention

#### Scenario: Restart after downtime
- **WHEN** a missed timer is activated after downtime
- **THEN** the configured job can run its catch-up activation
- **AND** this does not imply replaying one batch for every missed calendar day

## Known limits
The lock test is a local process test, not a live reboot test. Daily execution processes one batch per invocation.
The runner's multiple files are individually atomic, not a single cross-file transaction; do not infer universal crash safety from the tested interruption points.
