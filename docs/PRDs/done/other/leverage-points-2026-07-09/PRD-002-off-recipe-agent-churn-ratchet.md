# PRD-002: Off-Recipe Agent Churn Ratchet

## Status

Implemented

## Context

Scaffold-first evidence is now strong: current capability docs report collector
and lane-runner below the token target with low step counts and zero
failed-command median. Off-recipe evidence remains expensive: checkpoint-race
and physics-knockdown still exceed the authoring-cost gate with 47-53 median
ThreeNative tool steps. The known churn classes are engine-source searches,
standalone verifies, artifact forensics, missing `tn iterate`, missing
discovery, repeated diagnostics, and failed commands.

## Goal

Make off-recipe churn measurable, replayable, and gateable before running
another expensive live-agent benchmark matrix.

## Non-Goals

- Do not change the Round 5B decision thresholds.
- Do not use LLM runs in CI.
- Do not add cookbook/API-card content without transcript evidence.

## Requirements

1. Add churn classification to benchmark aggregate reports for off-recipe
   sessions.
2. Add deterministic replay fixtures for representative off-recipe workflows
   where possible.
3. Fail the preparation audit when churn budgets are not green.
4. Connect repeated churn classes to concrete repair work: command, API card,
   diagnostic, or scenario change.

## Execution Phases

### Phase 1: Churn Classifier

- [x] Extend benchmark event/session analysis with normalized churn counters:
      engine-source search, standalone verify, artifact forensics, missing
      iterate, missing discovery, repeated file read, failed command, repeated
      assertion, and repeated diagnostic.
- [x] Add fixtures from existing off-recipe artifacts.
- [x] Report churn by prompt and condition.

### Phase 2: Preparation Audit Gate

- [x] Add or extend `tn-agent-benchmark audit` so Round 5B preparation requires
      churn budgets to be green.
- [x] Keep deterministic `verify:session-cost` as a prerequisite, not a
      substitute for off-recipe confidence.
- [x] Emit exact next actions for each failing churn class.

### Phase 3: Repair Ratchet

- [x] For each top churn class, add the smallest product change: command,
      compact docs/API-card line, prescriptive diagnostic, or playtest summary.
- [x] Rerun only the audit after each repair.
- [x] Launch live Round 5B only after the audit passes.

## Files Likely Touched

- `tools/agent-benchmark/src/*`
- `tools/agent-benchmark/schemas/*.schema.json`
- `tools/agent-benchmark/ROUND-5B-PROTOCOL-2026-07-08.md`
- `tools/verify/src/sessionCostGate.ts`
- `tools/verify/src/sessionCostGate.test.ts`
- `docs/status/capabilities/tooling-proof.md`
- `docs/status/capabilities/game-production.md`

## Verification

- `pnpm --filter @threenative/agent-benchmark test`
- `pnpm verify:session-cost`
- `pnpm verify:agent-io`

## Acceptance Criteria

- [x] Benchmark reports include per-run and aggregate churn counters.
- [x] Round 5B preparation fails when churn budgets are not green.
- [x] Each failing churn class has a stable diagnostic and suggested repair
      surface.
- [x] Live-agent reruns are blocked until deterministic gates pass.

## Implementation Notes

- Agent benchmark artifacts and schemas now include per-run churn counters for
  engine-source searches, standalone verifies, artifact forensics, missing
  iterate/discovery, repeated reads, failed commands, repeated assertions, and
  repeated diagnostics.
- Round-5B preparation is gated by the next-steps audit and emits concrete
  repair diagnostics before live-agent reruns.
- Verification used `pnpm --filter @threenative/agent-benchmark test` and the
  focused verify-tools slices that cover session-cost and benchmark audit
  behavior.
