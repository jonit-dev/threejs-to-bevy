# V6-03 Physics Colliders and Collision Events

Complexity: 8 -> HIGH mode

## Context

**Problem:** V3 walkability and V4 raycast services are not a general collision
system. Small 3D games need primitive colliders, triggers, contacts, and
collision events.

## Integration Points

- Entry point: SDK collider declarations attached to entities.
- Caller files: IR validator, web physics/collision service, Bevy runtime
  mapping, gameplay event queue.
- User-facing: systems receive collision/trigger events through declared event
  permissions.

## Solution

Add a narrow backend-neutral physics contract for primitive colliders, trigger
events, contact events, and simple layer/mask filtering where needed. Defer full
rigid-body solver parity to V7.

## Execution Phases

#### Phase 1: Collider Contract - Bundles validate collider definitions.

**Files (max 5):**

- `packages/sdk/src/physics/*` - collider helpers.
- `packages/ir/src/physics*` - schemas and validation.
- `packages/compiler/src/*` - collider capture/emit.
- `packages/ir/fixtures/conformance/*` - physics fixtures.
- `docs/ecs.md` - collider/event docs.

**Implementation:**

- [ ] Support box, sphere, capsule, and mesh-reference rejection/downgrade
  rules as explicitly documented.
- [ ] Validate dimensions, entity refs, trigger/contact flags, and layer masks.
- [ ] Emit stable `TN_IR_*` or `TN_PHYSICS_*` diagnostics.

#### Phase 2: Collision Events - Runtime contact traces reach gameplay systems.

**Files (max 5):**

- `packages/runtime-web-three/src/physics/*` - collision event source.
- `runtime-bevy/crates/threenative_runtime/src/physics*` - Bevy mapping.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native contact tests.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `packages/ir/fixtures/conformance/*` - observation expectations.

**Implementation:**

- [ ] Produce deterministic trigger/contact enter/exit/stay events for fixed
  traces.
- [ ] Expose collision observations in conformance reports.
- [ ] Fail closed for unsupported solver features.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] Primitive colliders validate and map to web/native evidence.
- [ ] Collision events are delivered through the V6 gameplay event path.
- [ ] Full rigid-body parity is explicitly deferred to V7.
