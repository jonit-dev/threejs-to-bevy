# V7-09 Performance Budgets and Profiling Evidence

Complexity: 8 -> HIGH mode

## Context

**Problem:** V7-scale scenes need release-gated performance evidence across
rendering, scripting, UI, audio, assets, and packaged output.

## Integration Points

- Entry point: `pnpm verify:v7` performance steps and runtime reports.
- Caller files: web performance reporter, Bevy observation runner, package
  report collector, docs gate.
- User-facing: reports explain which budget failed and how to inspect it.

## Solution

Add target-profile-aware budgets and profiling evidence for V7 scenes: frame,
entity, draw/instance, asset-load, script, UI, audio, and package size.

## Execution Phases

#### Phase 1: Budget Contract - Profiles define measurable thresholds.

**Files (max 5):**

- `docs/verify-v7.md` - performance artifact docs.
- `scripts/verify-v7*.mjs` - budget config.
- `packages/runtime-web-three/src/performance*` - web metrics.
- `packages/ir/src/*` - target profile metadata if needed.
- `docs/developer-workflow.md` - profiling workflow.

**Implementation:**

- [x] Define V7 target profiles and budget fields.
- [x] Record metrics in machine-readable reports.
- [x] Separate warnings from release-blocking failures.

#### Phase 2: Cross-Runtime Evidence - Reports cover web and native targets.

**Files (max 5):**

- `runtime-bevy/crates/threenative_runtime/src/*` - native observations.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native report tests.
- `scripts/verify-v7*.mjs` - report aggregation.
- `examples/v7-functional/*` - profiled scene.
- `tools/verify/artifacts/milestones/v7/*` - generated outputs.

**Implementation:**

- [x] Collect web and Bevy performance/profiling observations where practical.
- [x] Link package-size and asset-load evidence.
- [x] Emit `TN_PERF_*` and `TN_VERIFY_V7_*` diagnostics with measured values.

## Verification Strategy

- `pnpm verify:v7`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] V7 performance budgets are target-profile aware and machine-readable.
- [x] Failed budgets identify metric, measured value, threshold, and artifact.
