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

- [ ] Derive capabilities from world, material, asset, systems, UI, input,
  audio, physics, and environment IR.
- [ ] Cover primitive meshes, texture slots, point/spot lights, orthographic
  cameras, visibility, scripts, UI, audio, and physics when present.
- [ ] Keep output deterministic.

#### Phase 2: Shared Drift Fixtures

**Files:**

- `packages/ir/fixtures/conformance/*`
- `packages/ir/fixtures/conformance/README.md`
- `packages/ir/src/conformance.test.ts`

**Implementation:**

- [ ] Add fixtures for visibility, active camera, point/spot lights,
  orthographic camera, material texture slots, atmosphere, and compact V4
  scripting metadata.
- [ ] Include accepted and rejected cases where the fixture exercises
  validation behavior.
- [ ] Ensure every fixture has accurate capability tags.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/ir test`
- `pnpm verify:conformance`

## Acceptance Criteria

- [ ] Manifest capabilities are derived from actual emitted IR.
- [ ] Shared fixtures cover the known drift areas listed in the V5 roadmap and
  parity tracker.
- [ ] Fixture validation failures identify the fixture and bundle path.
- [ ] No runtime support is claimed only because a schema field exists.

