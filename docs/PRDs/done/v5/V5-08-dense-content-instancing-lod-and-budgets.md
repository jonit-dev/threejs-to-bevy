# V5-08 Dense Content Instancing LOD and Budgets

Complexity: 9 -> HIGH mode

## Context

**Problem:** V3 proved a dense environment scene, but some budget evidence is
still synthetic or web-only, and there is no portable LOD metadata slice for V5
content quality.

## Solution

Unify instance/budget reporting across web and Bevy, improve texture/geometry
budget diagnostics, and add a narrow portable LOD metadata contract.

## Execution Phases

#### Phase 1: Real Instancing and Budget Evidence

**Files:**

- `packages/runtime-web-three/src/environment.ts`
- `packages/runtime-web-three/src/instancing.ts`
- `packages/runtime-web-three/src/performanceMetrics.ts`
- `runtime-bevy/crates/threenative_runtime/src/environment.rs`
- `runtime-bevy/crates/threenative_runtime/tests/v3_environment.rs`

**Implementation:**

- [x] Distinguish real instanced groups from placeholders in reports.
- [x] Report source asset count, instance count, group count, draw estimate,
  triangle estimate, texture estimate, and bundle size where available.
- [x] Add Bevy observed environment summaries for repeated assets.

#### Phase 2: LOD Metadata and Budget Diagnostics

**Files:**

- `packages/ir/src/types.ts`
- `packages/ir/src/validate.ts`
- `packages/compiler/src/emit/bundle.ts`
- `packages/runtime-web-three/src/environment.ts`
- `runtime-bevy/crates/threenative_runtime/src/environment.rs`

**Implementation:**

- [x] Add bounded LOD metadata with distance thresholds and asset refs.
- [x] Reject missing levels, unsorted thresholds, unsupported formats, cycles,
  and target budget violations.
- [x] Let web choose deterministic LODs for fixed camera/bookmark tests.
- [x] Let Bevy observe the same metadata, with conservative fallback rendering
  allowed only when diagnosed.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test -p threenative_runtime --test v3_environment`

## Acceptance Criteria

- [x] Dense content reports identify real versus placeholder evidence.
- [x] Budget diagnostics include code, path, value, limit, and suggested fix
  where supported.
- [x] LOD metadata is portable, validated, and target-gated.
- [x] The V5 scene emits a budget report using environment assets.

## Implementation Evidence

- IR source assets now accept validated `lod` levels with bounded distance
  ranges and model asset references.
- Compiler emission copies LOD target models into the bundle while keeping
  authored source assets distinct for dense-content reporting.
- Web verification reports source asset, instance, group, draw, triangle,
  texture, texture-byte, and bundle-byte estimates, plus deterministic LOD
  selections.
- Bevy environment observation reports repeated model-backed asset groups and
  the same LOD metadata selections used by fixed-distance checks.
- `examples/v5-functional` uses repeated grass scatter, source-asset LOD
  metadata, target budgets, and environment assets for the V5-08 scene proof.
