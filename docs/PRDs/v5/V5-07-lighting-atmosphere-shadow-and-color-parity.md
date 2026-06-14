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

- [ ] Add a shared fixture with visible and hidden meshes.
- [ ] Cover ambient, directional, point, and spot lights.
- [ ] Expose light kind, color, intensity, range, angle, transform, and
  supported downgrade diagnostics in runtime observations.

#### Phase 2: Atmosphere, Shadows, and Color

**Files:**

- `packages/ir/src/rendering.ts`
- `packages/runtime-web-three/src/rendering.ts`
- `runtime-bevy/crates/threenative_runtime/src/rendering.rs`
- `runtime-bevy/crates/threenative_runtime/tests/rendering_atmosphere.rs`

**Implementation:**

- [ ] Cover linear/exponential fog, sky color, tone mapping, exposure, color
  space, shadow map size, bias, normal bias, and cascade distance where already
  represented or explicitly promoted.
- [ ] Reject over-budget or unsupported settings with stable diagnostics.
- [ ] Document intentional drift instead of silently claiming parity.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test -p threenative_runtime --test rendering_atmosphere`

## Acceptance Criteria

- [ ] Visibility and point/spot light behavior is fixture-backed.
- [ ] Promoted atmosphere, shadow, sky, and color fields are observable in web
  and Bevy or explicitly diagnosed as target drift.
- [ ] The V5 scene demonstrates promoted lighting and atmosphere fields.

