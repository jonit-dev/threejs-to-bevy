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

- [ ] Distinguish real instanced groups from placeholders in reports.
- [ ] Report source asset count, instance count, group count, draw estimate,
  triangle estimate, texture estimate, and bundle size where available.
- [ ] Add Bevy observed environment summaries for repeated assets.

#### Phase 2: LOD Metadata and Budget Diagnostics

**Files:**

- `packages/ir/src/types.ts`
- `packages/ir/src/validate.ts`
- `packages/compiler/src/emit/bundle.ts`
- `packages/runtime-web-three/src/environment.ts`
- `runtime-bevy/crates/threenative_runtime/src/environment.rs`

**Implementation:**

- [ ] Add bounded LOD metadata with distance thresholds and asset refs.
- [ ] Reject missing levels, unsorted thresholds, unsupported formats, cycles,
  and target budget violations.
- [ ] Let web choose deterministic LODs for fixed camera/bookmark tests.
- [ ] Let Bevy observe the same metadata, with conservative fallback rendering
  allowed only when diagnosed.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test -p threenative_runtime --test v3_environment`

## Acceptance Criteria

- [ ] Dense content reports identify real versus placeholder evidence.
- [ ] Budget diagnostics include code, path, value, limit, and suggested fix
  where supported.
- [ ] LOD metadata is portable, validated, and target-gated.
- [ ] The V5 scene emits a budget report using environment assets.

