# Adapter build

## Purpose
描述 shared core 與 runtime adapter 的生成邊界。來源：ADAPTERS.md、build.mjs、tools/manifest.mjs、test/build-roundtrip.test.mjs。
主線基準 `5fd4ac0`；不包含獨立視口 feature branch 的未合併變更。

## Requirements

### Requirement: Shared sources generate runtime surfaces
The build SHALL generate declared shared outputs from core and retain adapter-specific files outside that manifest.

#### Scenario: Shared script change
- **WHEN** a shared script changes in core
- **THEN** parity checking compares each generated runtime copy against core, not just against the other copy

#### Scenario: Adapter-specific behavior
- **WHEN** a file is runtime-specific and outside the generated manifest
- **THEN** the shared build does not overwrite it

### Requirement: Check mode is non-deploying
Build check mode SHALL compare staged generated content with existing outputs and return nonzero on drift.

#### Scenario: Stale generated output
- **WHEN** --check detects an output differing from core regeneration
- **THEN** it reports the mismatch without refreshing installed plugins or enabling hooks

## Known limits
Build parity proves source consistency, not that a host actually invokes a hook.
Codex UI gate runtime verification remains a separate unfinished work item.
