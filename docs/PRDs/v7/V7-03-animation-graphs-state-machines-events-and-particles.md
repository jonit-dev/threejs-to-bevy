# V7-03 Animation Graphs State Machines Events and Particles

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 named clip playback is not enough for richer games that need
transitions, blends, animation events, and bounded particles.

## Integration Points

- Entry point: SDK animation graph/state-machine declarations and particle
  emitters.
- Caller files: asset validation, runtime animation adapters, event queue,
  conformance reports.
- User-facing: authors can define a constrained portable animation controller.

## Solution

Define a constrained animation graph/state-machine IR with transitions, blend
metadata, events, and a bounded particle contract. Reject engine-specific
controllers.

## Execution Phases

#### Phase 1: Graph Contract - Animation controllers serialize deterministically.

**Files (max 5):**

- `packages/sdk/src/animation/*` - graph/state helpers.
- `packages/ir/src/animation*` - schemas and validation.
- `packages/compiler/src/*` - capture/emit.
- `packages/ir/fixtures/conformance/*` - fixtures.
- `docs/scripting-api.md` - graph/event docs.

**Implementation:**

- [x] Support states, transitions, simple blend durations, parameters, clip refs,
  and animation event markers.
- [x] Add bounded particle emitter declarations if they can be observed in both
  runtimes.
- [x] Reject IK, retargeting, arbitrary engine controllers, and unbounded
  particle behavior.

#### Phase 2: Runtime Observations - Graph state and events match fixed traces.

**Files (max 5):**

- `packages/runtime-web-three/src/animation/*` - graph runner.
- `runtime-bevy/crates/threenative_runtime/src/animation*` - native mapping.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native evidence.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `examples/v7-functional/*` - scene proof.

**Implementation:**

- [x] Run graph transitions from scripted parameter changes.
- [x] Emit animation events into the portable event queue.
- [x] Report graph state, clip, transition, and particle observations.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] Animation graph behavior is constrained, observable, and portable.
- [x] Unsupported animation systems fail with stable diagnostics.
