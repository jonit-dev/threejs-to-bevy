# V5-01 Capability-Derived Manifests and Shared Fixtures

Complexity: 7 -> HIGH mode

## Context

**Problem:** Bundle manifests can advertise broad or stale capabilities, and
shared conformance fixtures do not cover known V3/V4 drift areas. That makes
runtime support look stronger than the emitted IR proves.

## Solution

Derive `requiredCapabilities` from emitted bundle data and expand the shared
fixture catalog for current drift contracts.

## Execution Phases

#### Phase 1: Capability Derivation

**Files:**

- `packages/compiler/src/emit/bundle.ts`
- `packages/compiler/src/emit/scene-to-world.ts`
- `packages/compiler/src/emit/*.test.ts`
- `packages/ir/src/conformance.ts`

**Implementation:**

- [x] Derive capabilities from world, material, asset, systems, UI, input,
  audio, physics, and environment IR.
- [x] Cover primitive meshes, texture slots, point/spot lights, orthographic
  cameras, visibility, scripts, UI, audio, and physics when present.
- [x] Keep output deterministic.

#### Phase 2: Shared Drift Fixtures

**Files:**

- `packages/ir/fixtures/conformance/*`
- `packages/ir/fixtures/conformance/README.md`
- `packages/ir/src/conformance.test.ts`

**Implementation:**

- [x] Add fixtures for visibility, active camera, point/spot lights,
  orthographic camera, material texture slots, atmosphere, and compact V4
  scripting metadata.
- [x] Include accepted and rejected cases where the fixture exercises
  validation behavior.
- [x] Ensure every fixture has accurate capability tags.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/ir test`
- `pnpm verify:conformance`

## Acceptance Criteria

- [x] Manifest capabilities are derived from actual emitted IR.
- [x] Shared fixtures cover the known drift areas listed in the V5 roadmap and
  parity tracker.
- [x] Fixture validation failures identify the fixture and bundle path.
- [x] No runtime support is claimed only because a schema field exists.

## Implementation Evidence

- `packages/compiler/src/emit/bundle.ts` derives `requiredCapabilities` from
  emitted IR payloads instead of hardcoded baseline tags.
- `packages/ir/fixtures/conformance/v5-drift-surface` catalogs the V5 drift
  surfaces for visibility, active orthographic camera, point/spot lights,
  texture slots, atmosphere metadata, environment source assets, and compact V4
  scripting metadata.
- Rejected validation behavior remains covered by focused IR validator tests;
  the committed conformance fixture is an accepted source bundle shared by
  conformance gates.
