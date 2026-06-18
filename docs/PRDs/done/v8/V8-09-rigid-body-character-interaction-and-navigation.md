# V8-09 Rigid Body, Character Interaction, and Navigation

Complexity: 11 -> HIGH mode

## Context

**Problem:** Physics and character movement currently prove primitive collider
metadata, fixed traces, narrow character movement, slope/step behavior, and
service observations, but not common rigid-body solver behavior, object pushing,
richer sensors, interaction volumes, or navigation/pathfinding.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v6/V6-03-physics-colliders-and-collision-events.md`,
`docs/PRDs/v6/V6-04-character-interaction-slice.md`, and
`docs/PRDs/v7/V7-02-advanced-physics-and-character-runtime-parity.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: SDK collider/rigid-body/character declarations,
  script services, fixed-step runtime, conformance traces, and functional scene
  verification.
- [x] Caller file identified: SDK physics APIs, compiler emit, IR validation,
  web physics runner, Bevy runtime physics mapping, and native tests.
- [x] Registration/wiring needed: capability tags, service permissions,
  deterministic observations, diagnostics, fixtures, docs, and gates.

**Is this user-facing?** Yes. Authors need crates-style game physics behavior
without binding directly to Bevy physics plugins or web-only engines.

## Solution

**Approach:**

- Promote a narrow primitive rigid-body solver contract before arbitrary mesh
  colliders or external backend handles.
- Make character-object pushing and interaction volumes explicit fixed-step
  behavior with deterministic observations.
- Add a small navigation/path query surface only if it can be represented as
  portable traces; diagnose full navmesh and backend-specific handles.

**Data Changes:** Extend physics IR with promoted body factors, interaction
volume metadata, push policy, sensor phases, optional path query traces, and
unsupported diagnostics for mesh colliders/navmesh/backend handles.

## Execution Phases

#### Phase 1: Rigid-Body Solver Contract - Primitive bodies have portable factors

**Implementation:**

- [ ] Promote dynamic/kinematic/static primitive bodies with mass, velocity,
  gravity scale, damping, restitution, and friction.
- [ ] Explicitly defer constraints, joints, soft bodies, and arbitrary mesh
  dynamics.
- [ ] Derive manifest capabilities and validation diagnostics.

**Verification Plan:** SDK/IR/compiler tests for accepted/rejected bodies and
capability tags.

#### Phase 2: Runtime Solver Parity - Common fixed-step cases match

**Implementation:**

- [ ] Compare gravity, collision response, resting contact, and bounce/friction
  observations.
- [ ] Keep deterministic ordering for simultaneous contacts.
- [ ] Expose web/native conformance traces for primitive cases.

**Verification Plan:** Web physics tests, Bevy runtime tests, and shared
conformance traces.

#### Phase 3: Interaction Volumes and Object Pushing - Characters can push and trigger

**Implementation:**

- [ ] Add pushable-object policy to character movement.
- [ ] Add enter/stay/exit sensor phases beyond current trigger scope.
- [ ] Prove block, push, sensor, and event ordering in one fixture.

**Verification Plan:** Functional fixture plus web/native trace comparison.

#### Phase 4: Navigation and Backend Diagnostics - Path behavior is narrow and explicit

**Implementation:**

- [ ] Add a bounded path query trace if portable enough for web and Bevy.
- [ ] Reject unsupported navmesh, dynamic mesh collider, and external physics
  backend handles with stable diagnostics.
- [ ] Document external backend integration strategy.

**Verification Plan:** Rejected fixtures, diagnostic assertions, docs guard.

## Acceptance Criteria

- [ ] Rigid-body primitives, pushing, sensors, and any promoted path trace have
  cross-runtime evidence.
- [ ] Mesh colliders, full navmesh, and external backend escape hatches fail
  loudly until a later PRD promotes them.
