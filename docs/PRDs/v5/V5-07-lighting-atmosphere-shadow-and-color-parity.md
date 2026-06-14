# V5-07 Lighting Atmosphere Shadow and Color Parity

Complexity: 8 -> HIGH mode

## Context

**Problem:** Point/spot lights, visibility, atmosphere, fog, sky, shadows, and
color management have partial contracts. V5 should tighten the existing surface,
not introduce a broad render graph or custom shader system.

## Solution

Add fixture-backed parity evidence and stable diagnostics for promoted lighting
and atmosphere fields.

## Execution Phases

#### Phase 1: Visibility and Light Fixtures

**Files:**

- `packages/ir/fixtures/conformance/*`
- `packages/runtime-web-three/src/mapWorld.test.ts`
- `runtime-bevy/crates/threenative_runtime/tests/*`
- `docs/bevy-feature-parity.md`

**Implementation:**

- [x] Add a shared fixture with visible and hidden meshes.
- [x] Cover ambient, directional, point, and spot lights.
- [x] Expose light kind, color, intensity, range, angle, transform, and
  supported downgrade diagnostics in runtime observations.

#### Phase 2: Atmosphere, Shadows, and Color

**Files:**

- `packages/ir/src/rendering.ts`
- `packages/runtime-web-three/src/rendering.ts`
- `runtime-bevy/crates/threenative_runtime/src/rendering.rs`
- `runtime-bevy/crates/threenative_runtime/tests/rendering_atmosphere.rs`

**Implementation:**

- [x] Cover linear/exponential fog, sky color, tone mapping, exposure, color
  space, shadow map size, bias, normal bias, and cascade distance where already
  represented or explicitly promoted.
- [x] Reject over-budget or unsupported settings with stable diagnostics.
- [x] Document intentional drift instead of silently claiming parity.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test -p threenative_runtime --test rendering_atmosphere`

## Acceptance Criteria

- [x] Visibility and point/spot light behavior is fixture-backed.
- [x] Promoted atmosphere, shadow, sky, and color fields are observable in web
  and Bevy or explicitly diagnosed as target drift.
- [x] The V5 scene demonstrates promoted lighting and atmosphere fields.

## Implementation Evidence

- `v5-drift-surface` now includes visible and hidden meshes plus point/spot
  lights with promoted range and angle fields.
- SDK/compiler output preserves point-light range and spot-light range/angle,
  and derived manifests add `rendering:light.range` and
  `rendering:light.angle` when those fields are present.
- Web and Bevy runtimes map point/spot range and spot angle, and conformance
  reports expose runtime-normalized light observations beside authored light
  fields and transforms.
- Atmosphere observations now include fog color/density/distances, sky/horizon
  color, tone mapping, exposure, color spaces, shadow map size, bias, normal
  bias, cascade count, and max distance.
- Over-budget shadow maps and malformed fog profiles continue to fail IR
  validation with stable `TN_IR_ATMOSPHERE_*` diagnostics.
- Native fog/sky/color rendering remains documented as target drift; V5-07
  promotes observable contracts and focused tests, not a custom renderer or
  pixel-perfect Bevy/Three.js visual match.
