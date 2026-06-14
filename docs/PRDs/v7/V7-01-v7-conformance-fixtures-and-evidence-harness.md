# V7-01 V7 Conformance Fixtures and Evidence Harness

Complexity: 8 -> HIGH mode

## Context

**Problem:** V7 feature work is deeper and riskier than V6, so shared fixtures
and reports need to exist before claims are promoted.

## Integration Points

- Entry point: `pnpm verify:conformance` and future `pnpm verify:v7`.
- Caller files: shared fixture catalog, web/Bevy report generators, docs gate.
- User-facing: release reports identify drift by fixture, runtime, path, and
  artifact.

## Solution

Add V7 fixture categories and report fields for advanced physics, animation,
UI/audio, renderer/content, scripting lifecycle, packaging, and performance.

## Execution Phases

#### Phase 1: Fixture Categories - V7 claims have shared data.

**Files (max 5):**

- `packages/ir/fixtures/conformance/*` - V7 fixture catalog.
- `packages/ir/src/fixtures*` - fixture loading helpers if needed.
- `packages/ir/src/*.test.ts` - fixture validation tests.
- `docs/bevy-feature-parity.md` - evidence expectations.
- `docs/PRDs/v7/README.md` - fixture dependency note.

**Implementation:**

- [x] Add accepted and rejected V7 fixture categories before runtime claims.
- [x] Include bundle paths and target capability expectations.
- [x] Keep fixture content deterministic and minimal.

#### Phase 2: Report Evidence - Drift localizes to concrete artifacts.

**Files (max 5):**

- `packages/runtime-web-three/src/conformance*` - web observations.
- `runtime-bevy/crates/threenative_runtime/src/*conformance*` - native
  observations.
- `runtime-bevy/crates/threenative_runtime/tests/*` - report tests.
- `scripts/verify-v7*.mjs` - report aggregation.
- `docs/verify-v7.md` - artifact contract.

**Implementation:**

- [x] Report fixture ID, runtime, bundle path, expected value, actual value,
  diagnostic code, and artifact path.
- [x] Preserve V5/V6 report compatibility where possible.
- [x] Fail conformance on unsupported silent drops.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] Every V7 feature ticket can point at a shared fixture or report path.
- [x] Report mismatches identify actionable paths and artifacts.
