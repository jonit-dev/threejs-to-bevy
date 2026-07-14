# Physics System and Script API Audit

Date: 2026-07-13

## Executive Summary

Overall physics quality score: **5.0 / 10**

ThreeNative has a real Rapier solver in both runtime adapters, a useful portable
physics contract, character movement, sensors, queries, and a substantial test
suite. The audited implementation is nevertheless not safe to describe as full
physics parity. Several fields accepted by the SDK and IR never reach runtime,
native script writes can erase authored physics metadata, some valid colliders
never enter the solver, native live collision events are not connected to the
game loop, and script queries/sensors use separate AABB implementations that
disagree with the solver.

The highest-risk pattern is **contract acceptance without behavioral
consumption**. A bundle can validate, advertise a physics capability, and pass
the current focused gates while the authored behavior is dropped, ignored, or
evaluated by a different collision model.

Recommended release posture: treat the current implementation as a bounded
primitive/character physics slice, not general Bevy/Rapier parity, until the P0
and P1 findings below are fixed and covered by live web/desktop scenarios.

## Scorecard

| Area | Score | Rationale |
| --- | ---: | --- |
| SDK/compiler/IR contract integrity | 4.0 | Some SDK collider fields are dropped during scene emission; unknown physics fields and missing transforms are not consistently rejected. |
| Live rigid-body solver | 5.5 | Both adapters use Rapier, but collider-only bodies, exact mass, capsule dimensions, sleep, CCD details, joints, and wake-up behavior are incorrect or incomplete. |
| Script physics API | 4.0 | Queries, sensors, and character movement exist; force/impulse/torque and body-state operations do not, and fixed-update mutations miss the current solver step. |
| Web/native parity | 4.0 | Live collision events, sensors, queries, and character blocking diverge; several collision algorithms are independently duplicated. |
| Verification | 7.0 | There is broad focused coverage, but it proves curated traces and metadata more often than live solver behavior. |
| Maintainability/architecture | 5.0 | Physics truth is split across Rapier, primitive proof solvers, sensor AABBs, query AABBs, character solvers, and a hand-maintained QuickJS bridge. |

## Scope Inspected

- Public physics declarations in `packages/sdk/src/physics.ts`.
- SDK scene-to-world emission and compiler capability enrollment.
- IR physics validation and native loader DTOs.
- Web Rapier integration, primitive proof solver, sensors, game loop, character
  movement, and script physics services.
- Native Rapier integration, sensors, character solver, game loop, QuickJS host
  bridge, service snapshots, and conformance traces.
- Physics capability/status claims and focused tests.

This was a source and test audit. It did not profile large physics scenes or run
a GPU/windowed desktop playtest.

## Findings, Descending Priority

### P0. SDK-authored collider contact, material, and sensor fields are silently dropped

**Evidence**

- The SDK exposes `contact`, `material`, and `sensor` on collider declarations:
  `packages/sdk/src/physics.ts:8-13`, `packages/sdk/src/physics.ts:79-95`.
- `emitPhysics` copies center, dimensions, filters, mesh, material coefficients,
  slope, and trigger, but omits those three fields:
  `packages/compiler/src/emit/scene-to-world.ts:329-365`.
- Capability collection only enrolls sensors if the emitted world still has
  `Collider.sensor`: `packages/compiler/src/emit/capabilities.ts:308-325`.

**Impact**

TypeScript authors can use a valid public SDK helper and receive a valid bundle
that no longer contains the requested sensor/contact behavior. This is data
loss at the compiler boundary and can make interaction volumes disappear
without a diagnostic.

**Specific fix**

1. Add `contact`, `material`, and `sensor` to the `Collider` object emitted by
   `emitPhysics`.
2. Replace the hand-copied field list with a typed serializer or a compile-time
   exhaustive mapper over `IColliderDeclaration` so new fields cannot disappear
   silently.
3. Add an emission test that authors all collider fields through SDK helpers and
   deep-compares the full emitted component.
4. Add a capability test proving an SDK-authored sensor enrolls `sensors` and
   `interaction-volumes`.

**Verification needed**

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/ir test`
- `pnpm verify:conformance`

### P0. Native script component writes can erase authored physics metadata

**Evidence**

- Native script snapshots manually rebuild `Collider`, but omit `contact`,
  `friction`, `material`, `mesh`, `restitution`, and `slope`:
  `runtime-bevy/crates/threenative_runtime/src/systems_context.rs:933-945`.
- The same snapshot path rebuilds `RigidBody` without `angularVelocity`, `ccd`,
  axis constraints, `inverseMass`, `sleepThreshold`, or `solverIterations`:
  `runtime-bevy/crates/threenative_runtime/src/systems_context.rs:986-994`.
- QuickJS `entity.patch` merges against that incomplete snapshot, while both
  `patch` and `set` are emitted through the same patches collection:
  `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:1026-1032`.
- Rust then merges every typed-component effect back into the current snapshot
  and deserializes the full component:
  `runtime-bevy/crates/threenative_runtime/src/systems_effects.rs:1343-1351`.
- Web `entity.set` replaces the component instead of merging it:
  `packages/runtime-web-three/src/systems/context.ts:1563-1569`.

**Impact**

A script that only patches `RigidBody.velocity` can reset authored CCD, locks,
inverse mass, sleep, angular velocity, or solver-iteration settings. Patching a
collider can similarly erase its material, mesh, slope, contact, and coefficient
metadata. Native `set` also cannot intentionally clear omitted fields and has
different semantics from web. This is silent state corruption on a normal
script-authoring path.

**Specific fix**

1. Replace handwritten typed-component snapshots with lossless serialization,
   preferably `serde_json::to_value(component)` behind one component descriptor.
2. Preserve the operation in the native effect contract: `patch` must merge and
   `set` must replace. Do not route both through an undifferentiated `patches`
   array.
3. Apply a patch against the lossless current typed value exactly once on the
   Rust side; do not pre-merge in QuickJS and merge again in Rust.
4. Add a descriptor/drift test so adding a field to a physics DTO requires its
   script snapshot and mutation codec to handle that field.

**Verification needed**

- Populate every `RigidBody` and `Collider` field, patch one field, and assert
  every other field is byte-for-byte preserved after native effect application.
- Set a minimal replacement and assert omitted fields are cleared in both web
  and native.
- Run the same bundled script in both adapters and deep-diff final components.

### P0. Collider-only entities validate but are ghosts in both live Rapier worlds

**Evidence**

- IR validation requires a collider when a rigid body exists, but does not
  require the reverse: `packages/ir/src/physicsValidation.ts:195-201`.
- Native `simulated_entity` accepts the collider and leaves `body_kind` absent:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:924-965`.
- Native Rapier world creation then skips the entity:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:633-636`.
- Web Rapier creation also requires both `RigidBody` and `Collider`:
  `packages/runtime-web-three/src/physics.ts:242-248`.
- Script queries and broad event traces still see collider-only entities, so the
  same object is queryable but non-solid.

**Impact**

A valid collider-only floor or wall can appear in raycasts and overlap traces
while dynamic bodies fall through it. This is especially surprising under the
Unity-like convention that a collider without a rigid body is static.

**Specific fix**

Normalize a collider without `RigidBody` to an adapter-private fixed body in
both Rapier builders. Include the effective static kind in topology signatures,
but do not synthesize or write a public `RigidBody` component back to the
bundle. If implicit static colliders are not intended, make IR validation reject
them instead; do not preserve the current mixed behavior.

**Verification needed**

- A dynamic box lands on a `Collider + Transform` floor without `RigidBody` in
  web and native live steps.
- Collider-only triggers remain nonblocking and emit the expected events.
- Queries, sensors, and solver contact all agree on the entity.

### P0. Native live physics never emits collision enter/stay/exit events

**Evidence**

- Web `stepPhysics` computes pair deltas and writes `CollisionEvent` and
  `TriggerEvent` queues every fixed step:
  `packages/runtime-web-three/src/physics.ts:78-99`.
- Native `step_bundle_physics_with_script_poses` only copies transforms and
  velocities: `runtime-bevy/crates/threenative_runtime/src/physics.rs:174-207`.
- `detect_physics_events` and its phase-delta implementation are separate AABB
  trace helpers used by tests/conformance:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:61-100`,
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:209-237`.
- The production loop passes only the physics step function:
  `runtime-bevy/crates/threenative_runtime/src/lib.rs:736-741`; it advances
  sensor state but never collision-pair state:
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:552-600`.

**Impact**

Scripts and gameplay systems that read live collision events work on web but do
not receive equivalent native events. Current conformance can still pass
because it invokes the disconnected trace helper directly.

**Specific fix**

1. Enable Rapier collision events on relevant colliders and drain them after
   every native fixed step.
2. Store active pair state in the per-runtime game-loop state and derive stable
   enter/stay/exit phases.
3. Write the normalized events into `bundle.world.events` before state machines,
   interactions, and `fixedUpdate` systems run.
4. Use Rapier narrow-phase/contact data as the source; retire the AABB pair
   detector from live claims.
5. Reset pair state on scene/bundle lifecycle changes.

**Verification needed**

- A native game-loop test, not a direct trace test, for enter, stay, and exit.
- Web/native script fixture that consumes the event and mutates a resource.
- Cases for filters, sensor-vs-solid classification, CCD, and stable ordering.

### P0. Authored mass is added to shape mass, while inverseMass is ignored

**Evidence**

- Native uses `additional_mass(mass)`:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:673-676`.
- Web uses `setAdditionalMass(body.mass)`:
  `packages/runtime-web-three/src/physics.ts:258-260`.
- Rapier treats this as mass in addition to attached-collider mass, not the
  body's final mass.
- `inverseMass` is public and validated (`packages/sdk/src/physics.ts:48-62`,
  `packages/ir/src/physicsValidation.ts:183-185`) but has no consumption in
  either live solver.

**Impact**

An authored `mass: 1` body does not have a total mass of 1 kg. Collision
response, stacking, momentum transfer, and any future impulse API therefore use
the wrong inertia. A bundle that authors only `inverseMass` receives default
Rapier mass instead of the declared value.

**Specific fix**

For the current one-collider-per-body contract, set the collider's exact mass
with Rapier's collider mass API and remove body additional mass. If only
`inverseMass` is authored, derive `mass = 1 / inverseMass`; retain the existing
consistency diagnostic when both are present. Clarify how inertia is derived
for each shape and whether a later compound-collider contract changes this.

**Verification needed**

- Assert the built Rapier body's total mass for 1 kg and 10 kg declarations.
- Compare two-body collision response and stacked-body behavior across adapters.
- Add an inverseMass-only case to conformance.

### P0. Character collision treats sensors as solids and ignores layer/mask rejection

**Evidence**

- Native character solids exclude only `trigger == true`, not colliders with
  `sensor` metadata: `runtime-bevy/crates/threenative_runtime/src/character.rs:163-174`.
- The native QuickJS bridge repeats the same rule:
  `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:78-82`.
- Live Rapier correctly classifies either trigger or sensor metadata as
  nonblocking: `runtime-bevy/crates/threenative_runtime/src/physics.rs:963`.
- Character resolution iterates blockers before applying symmetric
  layer/mask filtering: `runtime-bevy/crates/threenative_runtime/src/character.rs:325-401`;
  the bridge duplicates this behavior around
  `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:433-509`.

**Impact**

A pickup/hazard/zone sensor can physically block a player even though rigid
bodies pass through it. A collider excluded by either side's mask can also block
character movement while contact reporting says it was filtered.

**Specific fix**

Create one canonical predicate for `is_sensor = trigger || sensor != null` and
one symmetric portable contact-filter predicate. Apply both before character
ground, step, side-block, and push resolution in web, native Rust, and the
QuickJS bridge. Prefer generating or fixture-driving the bridge logic instead
of maintaining another copy.

**Verification needed**

- Character crosses a sensor volume and still receives its sensor event.
- Character crosses a solid rejected by either side's mask.
- Character is blocked when both filters allow contact.
- Run the same fixtures through direct web, direct native, and native script host.

### P1. Accepted physics objects are not closed, and Transform requirements drift

**Evidence**

- Physics validation checks known fields individually but does not apply a
  general field allowlist to `RigidBody` or `Collider`:
  `packages/ir/src/physicsValidation.ts:28-205`.
- Native serde DTOs contain only known fields, so accepted typos are discarded:
  `runtime-bevy/crates/threenative_loader/src/types.rs:788-830`.
- No physics validation rule requires a `Transform`.
- Web Rapier skips bodies without `Transform.position`:
  `packages/runtime-web-three/src/physics.ts:242-248`.
- Native defaults a missing transform to the origin:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:934-961`.

**Impact**

Typos can pass validation and disappear at runtime. Transform-less physics is
accepted but either skipped on web or simulated invisibly at native origin.

**Specific fix**

Add explicit allowed-field sets for all promoted physics objects and stable
`TN_IR_PHYSICS_*_FIELD_UNSUPPORTED` diagnostics. Require a finite Transform
pose for a live body/collider, or define and implement one shared identity-pose
default. Add contract-drift tests from IR fields to TypeScript and Rust
consumers; schema shape alone is insufficient because runtime consumption is
the missing link.

**Verification needed**

- Misspelled `gravityscale`, `sensr`, and `maxSubstep` fail validation.
- Transform-less physics produces the same diagnostic on both targets.
- Every accepted field has a named behavior test or an explicit metadata-only
  classification.

### P1. Capsule height is interpreted inconsistently by Rapier and the rest of the engine

**Evidence**

- Character authoring treats `height` as total capsule height; feet-origin
  guidance sets the center to `height / 2`:
  `packages/ir/src/physicsValidation.ts:207-228`.
- Broad bounds also use `height / 2` as the vertical half extent:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:1074-1077` and
  `packages/runtime-web-three/src/physics.ts:622-625`.
- Rapier's capsule constructor takes the half-height of the inner segment, but
  both adapters pass `height / 2` directly:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:907-911` and
  `packages/runtime-web-three/src/physics.ts:355-357`.

**Impact**

The live solver capsule is taller than the authored total height by two radii.
Character bounds, queries/events, and rigid-body contacts can therefore disagree
about when a capsule touches a floor or ceiling.

**Specific fix**

Define total capsule height explicitly in the contract and pass
`max(0, height / 2 - radius)` as Rapier's segment half-height. Add SDK/IR
validation that total height is at least `2 * radius`, or document and implement
a different unambiguous definition everywhere.

**Verification needed**

- Assert the solver AABB for a radius 0.25, height 1.8 capsule is exactly 1.8 m.
- Compare floor/ceiling contact time across Rapier, character, sensor, and query
  paths.

### P1. Sensors invent native occupants, ignore local centers, and cache stale first-tick state

**Evidence**

- Native sensor advance maps every world entity, not only colliders:
  `runtime-bevy/crates/threenative_runtime/src/physics_sensors.rs:28-33`.
- Missing colliders receive default 1 m bounds:
  `runtime-bevy/crates/threenative_runtime/src/physics_sensors.rs:220-241`.
- Native sensor centers use only Transform position and ignore
  `Collider.center`/mesh bounds center: the same lines plus overlap at
  `runtime-bevy/crates/threenative_runtime/src/physics_sensors.rs:261-265`.
- Web excludes collider-less candidates but also ignores collider centers:
  `packages/runtime-web-three/src/sensors.ts:112-130`,
  `packages/runtime-web-three/src/sensors.ts:178-190`.
- Startup and the first fixed step call `advance` with the same tick, while the
  sensor state returns cached events for duplicate ticks:
  `packages/runtime-web-three/src/gameLoop.ts:92-105`,
  `packages/runtime-web-three/src/sensors.ts:62-99`, and native equivalents at
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:496-570` and
  `runtime-bevy/crates/threenative_runtime/src/physics_sensors.rs:23-27`.

**Impact**

Native sensors can report cameras or other Transform-only entities as
occupants. Offset character capsules can enter/exit at the wrong time on both
targets, and movement during the first fixed tick can reuse startup occupancy.

**Specific fix**

Make native `sim_entity` return `Option` and include only real colliders. Use a
shared collider-pose helper that applies local center (including mesh bounds
center and body rotation). Separate startup sampling from fixed-tick advancement
with a phase-aware cache key, or do not consume fixed tick 0 during startup.

**Verification needed**

- Transform-only entity inside a sensor produces no event.
- Feet-origin offset capsule produces matching web/native phases.
- An entity that enters during fixed tick 0 produces an enter event that tick.
- Rotation of an offset sensor produces correct world-space bounds.

### P1. Script raycast/overlap/shapeCast do not query the live physics world

**Evidence**

- Script queries independently intersect axis-aligned boxes:
  `packages/runtime-web-three/src/systems/services/physics.ts:50-125` and
  `runtime-bevy/crates/threenative_runtime/src/systems_services.rs:115-267`.
- They ignore `Collider.center`, entity rotation, and actual sphere/capsule
  geometry; mesh bounds fall back to a 1 m cube because `readColliderSize` does
  not read `Collider.mesh.bounds`:
  `packages/runtime-web-three/src/systems/services/physics.ts:181-195` and
  `runtime-bevy/crates/threenative_runtime/src/systems_services.rs:515-535`.
- The native QuickJS bridge contains another copy with the same omissions:
  `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:230-355`.
- Query directions are neither normalized nor rejected. A direct audit probe
  against a wall at x=10 with `direction:[2,0,0]` and `maxDistance:6` returned a
  false hit at `distance:4.5`, point x=9; the wall is actually 9 world units
  away.
- Web rejects a zero-distance ray hit while the native copies accept it, creating
  another edge-case parity difference:
  `packages/runtime-web-three/src/systems/services/physics.ts:67-69`.

**Impact**

Camera collision, aiming, ground tests, and gameplay queries can return false
hits/misses or incorrect distances. A query can disagree with the live Rapier
shape occupying the same entity.

**Specific fix**

Route script services through a query pipeline built from the authoritative
live physics world. If synchronous QuickJS calls require snapshots, snapshot
full canonical shape/pose data and use one shared semantic implementation with
cross-language fixtures. Normalize nonzero directions at the API boundary (so
distance is in world units), reject zero vectors, honor mesh bounds/centers and
rotations, and define whether rays starting inside a collider return distance
zero.

**Verification needed**

- Non-unit and zero direction tests.
- Offset and rotated box tests.
- Sphere/capsule tangency tests.
- Mesh bounds larger than 1 m.
- Ray-origin-inside behavior.
- Exact web/native result diff for hit, entity, point, normal, and distance.

### P1. Compiler diagnostics do not detect undeclared `physics.sensor` use

**Evidence**

- The script diagnostic scanner recognizes `physics.overlap`, `raycast`, and
  `shapeCast`, but not `physics.sensor`:
  `packages/compiler/src/scripts/diagnostics.ts:250-261`.
- The runtime service exists and records `physics.sensor` calls:
  `packages/runtime-web-three/src/systems/context.ts:889-897`.

**Impact**

An undeclared sensor service can pass the compiler's static script check and
fail later at runtime. Authors lose the intended early, actionable diagnostic,
and this service has weaker contract enforcement than its sibling physics APIs.

**Specific fix**

Add `physics.sensor` to the scanner immediately, then derive all service-call
diagnostics from the owning service registry/descriptor so adding a service
cannot require another handwritten regex list. Add one positive declared case
and one `TN_SCRIPT_SERVICE_UNDECLARED` negative case.

### P1. Public SDK script physics types lag the implemented service contract

**Evidence**

- SDK `physics.overlap` omits implemented `ignore` and `layers`; `shapeCast`
  omits implemented `layers`: `packages/sdk/src/ecs/system.ts:254-287` versus
  `packages/runtime-web-three/src/systems/services/physics.ts:5-35`.
- SDK sensor events omit `filteredOut`, `interactionKind`, and `step`:
  `packages/sdk/src/ecs/system.ts:296-305` versus
  `packages/runtime-web-three/src/sensors.ts:9-16`.
- SDK `raycast` advertises a `material` result that the primitive query result
  does not populate: `packages/sdk/src/ecs/system.ts:261-278` and
  `packages/runtime-web-three/src/systems/services/physics.ts:50-73`.
- SDK character movement omits implemented `direction` and `speed` inputs and
  contact, slope, and push observations:
  `packages/sdk/src/ecs/system.ts:187-203` versus
  `packages/runtime-web-three/src/character.ts:3-28`.

**Impact**

Valid runtime functionality is inaccessible or incorrectly described to
TypeScript authors, while advertised result fields may never appear. Authors
either use casts/`any` or write logic against a contract the adapters do not
actually satisfy.

**Specific fix**

Make one exported script-service contract the source for SDK declarations,
runtime context types, service descriptors, and QuickJS bindings. As an
incremental repair, align the SDK inputs/results above, remove `material` until
both adapters return it (or implement it), and add `tsd`/compile fixtures plus
web/native serialized-result fixtures for every physics method.

### P1. Character mesh colliders become 1 m cubes in native character paths

**Evidence**

- Native character half extents do not handle mesh bounds and fall back to
  `[0.5, 0.5, 0.5]`:
  `runtime-bevy/crates/threenative_runtime/src/character.rs:570-585`.
- The native script bridge size helper also ignores mesh metadata:
  `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:230-242`.
- The core Rapier path does use mesh bounds as a cuboid proxy, so character and
  rigid-body behavior disagree.

**Impact**

Large track, wall, or terrain proxy colliders can be grounded or blocked by
rigid bodies but mostly ignored by native character movement.

**Specific fix**

Use one canonical collider-bounds helper for box, sphere, capsule, and bounded
mesh shapes, including local center. Consume it from native character Rust and
the QuickJS host, then add a drift test so the generated/embedded bridge cannot
omit new shape fields.

**Verification needed**

- A 10 m mesh floor grounds a character at both edges.
- A large mesh wall blocks at its authored boundary.
- Direct native and native script-host observations match web.

### P1. PhysicsJoint is accepted and capability-enrolled but never enters Rapier

**Evidence**

- The SDK exposes hinge, slider, and suspension with anchors, axes, limits,
  stiffness, damping, and travel: `packages/sdk/src/physics.ts:97-109`.
- Compiler capability collection enrolls `joint.<kind>`:
  `packages/compiler/src/emit/capabilities.ts:327-329`.
- Native runtime only serializes joint observations:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:151-168`.
- Rapier world construction inserts bodies and colliders only:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:627-698`.
- Web `tracePhysicsJoints` is likewise metadata observation only:
  `packages/runtime-web-three/src/physics.ts:434-450`.

**Impact**

Authored doors, sliders, wheel suspension, or connected bodies are completely
unconstrained even though the contract validates and advertises joint support.

**Specific fix**

After all body handles exist, resolve `connectedEntity` and construct Rapier
revolute/prismatic joints. Define a portable suspension mapping using a
motorized/spring prismatic joint, map limits/anchors/axes, include every joint
field and target in topology signatures, and produce a stable runtime diagnostic
for unresolved/non-body targets. Until this ships, classify joint support as
metadata-only in capability output rather than runtime support.

**Verification needed**

- Hinge holds anchors and rotates on one axis.
- Slider obeys min/max travel.
- Suspension responds to stiffness/damping and respects travel.
- Equivalent web/native live traces and desktop playtest evidence.

### P1. sleepThreshold and CCD details are accepted but silently ignored

**Evidence**

- Loader DTOs retain `sleep_threshold`, `ccd.max_substeps`, and `ccd.mode`:
  `runtime-bevy/crates/threenative_loader/src/types.rs:788-811`.
- Native `SimulatedEntity` carries only CCD enabled and no sleep threshold:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:430-456`,
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:924-965`.
- Native world creation only toggles CCD enabled:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:657-659`.
- Web maps `sleepThreshold` only to a can-sleep boolean and also ignores CCD
  mode/substep detail: `packages/runtime-web-three/src/physics.ts:251-263`.

**Impact**

Accepted precision/stability controls do not have their authored meaning.
High-speed collision behavior and sleep/wake behavior can differ from author
expectations and between adapters.

**Specific fix**

Carry the fields into runtime topology. Define exact portable semantics:
`sleepThreshold:0` disables sleep; positive values map to a documented Rapier
activation threshold. Map `linear` to Rapier CCD and either implement
`swept-aabb` as the promised bounded mode or reject it. Define whether
`maxSubsteps` is world-wide (for example, maximum authored value) or remove the
per-body field; do not accept a granularity Rapier cannot honor.

**Verification needed**

- Zero-threshold body stays awake.
- Script write wakes a sleeping body.
- Fast thin-wall scenario changes predictably with CCD enabled/substeps.
- Capability tags match the behavior actually selected.

### P1. Script physics mutations occur after the solver and there is no force/impulse API

**Evidence**

- Both loops step physics before running `fixedUpdate` scripts:
  `packages/runtime-web-three/src/gameLoop.ts:97-110` and
  `runtime-bevy/crates/threenative_runtime/src/systems_host.rs:530-615`.
- The public script physics facade exposes only overlap, raycast, sensor, and
  shape cast: `packages/runtime-web-three/src/systems/contextTypes.ts:188-193`.
- Scripts can patch `RigidBody.velocity` indirectly through generic component
  writes, but that patch is not consumed until the next fixed tick.

**Impact**

Input-driven velocity changes have a one-tick delay, and ordinary physics
gameplay (jump impulses, explosions, recoil, torque, force-based movement) lacks
a first-class portable operation. Generic patches also have unclear wake-up and
ordering semantics.

**Specific fix**

Add a staged physics command buffer with portable operations such as
`setLinearVelocity`, `setAngularVelocity`, `addForce`, `addTorque`,
`applyImpulse`, `applyAngularImpulse`, `wake`, and `sleep`. Execute pre-physics
commands before the solver, then expose contact/sensor results to a distinct
post-physics stage. If schedule expansion is deferred, at minimum reorder and
document `fixedUpdate` so body mutations affect the current step consistently.

**Verification needed**

- A fixed-update impulse changes position in the same tick.
- Force integration, wake-up, and torque match web/native within tolerances.
- Ordering tests cover multiple systems writing the same body.
- Unsupported body kinds return stable diagnostics.

### P1. Native cached Rapier state can ignore writes and leak across scene instances

**Evidence**

- Native stores one thread-local cache:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:11-13`.
- It is keyed by a topology signature, not runtime/bundle identity, and has no
  explicit disposal: `runtime-bevy/crates/threenative_runtime/src/physics.rs:598-617`.
- Every tick writes pose and velocity with `wake_up=false`:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:731-752`.
- Web correctly keeps Rapier state per `IWorldIr` and exposes disposal:
  `packages/runtime-web-three/src/physics.ts:61-64`,
  `packages/runtime-web-three/src/physics.ts:164-170`.

**Impact**

A script velocity/teleport applied to a sleeping body may not wake the island.
A newly loaded bundle with identical IDs/shapes can inherit sleep, warm-start,
or contact state from the prior scene on the same thread.

**Specific fix**

Own the Rapier world in the native runtime/game-loop instance, dispose/reset it
on bundle lifecycle changes, and remove the singleton. Track the last adapter
write; wake a body when authored pose or velocity changes, while preserving
sleep for unchanged copyback.

**Verification needed**

- Let a body sleep, patch velocity, and prove movement on the next intended step.
- Reload identical topology at new poses and prove pristine state.
- Run two independent runtime instances on one thread without cross-talk.

### P2. Collision layers silently fail after 16 unique names

**Evidence**

- Both adapters assign bits only to the first 16 layers:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:841-855` and
  `packages/runtime-web-three/src/physics.ts:315-327`.
- Native missing membership falls back to all groups, while missing mask bits
  fold to zero: `runtime-bevy/crates/threenative_runtime/src/physics.rs:858-880`.
- IR limits entries per mask but does not enforce a world-wide unique-layer
  budget: `packages/ir/src/physicsValidation.ts:22` and filter validation in the
  same file.

**Impact**

The 17th named layer can collide with everything or nothing depending on which
side owns the mask. The failure is order-dependent and silent.

**Specific fix**

Make the portable layer budget explicit and validate it at bundle scope. If web
packing requires 16, reject more than 16 unique physics layers with a stable
diagnostic and derive bit assignment from a deterministic sorted registry. Do
not default an unassigned named layer to `ALL`.

**Verification needed**

- Seventeen-layer negative fixture with exact diagnostic.
- Deterministic bit assignment independent of entity order.
- Matching one-way and symmetric mask cases across adapters.

### P2. Proof solvers can certify behavior different from live Rapier

**Evidence**

- Native primitive proof resolution includes static/kinematic trigger blockers,
  does not apply masks, and resolves an offset collider without subtracting its
  local center: `runtime-bevy/crates/threenative_runtime/src/physics.rs:255-313`,
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:343-390`.
- Web has a parallel primitive implementation:
  `packages/runtime-web-three/src/physics.ts:491-580`.
- Release/status evidence uses these traces alongside live-runtime claims.

**Impact**

A focused gate can pass for a trigger floor, filtered floor, or offset body even
when live Rapier behaves differently. More tests of the approximation do not
prove the production solver.

**Specific fix**

Drive solver verification through the live Rapier step and normalize its
observations. If the primitive solver remains as a fallback, give it a separate
capability/status classification and differential-test it against Rapier for
every promoted case. Fix filters, sensor exclusion, and center correction in
the meantime.

**Verification needed**

- Differential cases for offset collider, trigger floor, filtered floor,
  restitution, rotation, stacking, and CCD.
- Gates fail whenever proof and live observations diverge.

### P2. Script-posed kinematics lose surface velocity and momentum transfer

**Evidence**

- A script-posed kinematic is written into Rapier with zero linear velocity:
  `runtime-bevy/crates/threenative_runtime/src/physics.rs:723-743`.
- Its simulated pose is then discarded and the authored source velocity is
  restored: `runtime-bevy/crates/threenative_runtime/src/physics.rs:769-778`.

**Impact**

This prevents double integration, but moving platforms have no correct
kinematic surface velocity. Dynamic bodies cannot inherit expected contact
momentum or be pushed consistently.

**Specific fix**

Use position-based kinematics with a next pose, or compute kinematic velocity
from authored pose delta divided by fixed delta. Keep author-facing velocity
separate from adapter-derived contact velocity if both are required.

**Verification needed**

- Script-driven platform carries a dynamic box.
- Platform pushes a dynamic body with expected contact velocity.
- No double integration when the script also authors velocity.

### P2. SDK validation and IR physics contracts can disagree

**Evidence**

- SDK normalization accepts empty contact and sensor phase arrays because it
  rejects only invalid members: `packages/sdk/src/physics.ts:310-315` and
  `packages/sdk/src/physics.ts:355-370`.
- IR validation requires each supplied phase array to be non-empty:
  `packages/ir/src/physicsValidation.ts:359-365` and
  `packages/ir/src/physicsValidation.ts:497-505`.
- SDK mask validation checks names but not the IR maximum of 32 entries:
  `packages/sdk/src/physics.ts:292-306` versus
  `packages/ir/src/physicsValidation.ts:459-466`.
- The public IR TypeScript type still lists `cylinder`, but IR validation
  rejects it: `packages/ir/src/types.ts:488-499` and
  `packages/ir/src/physicsValidation.ts:62-69`.

**Impact**

SDK helpers and TypeScript types can construct values that fail only at the
later IR boundary. This weakens the SDK's promise of early validation and makes
the actual portable collider vocabulary ambiguous.

**Specific fix**

Derive SDK limits/enums from the IR contract or cover them with a bidirectional
contract-drift fixture. Reject empty phase arrays and masks above 32 in the SDK.
Remove `cylinder` from `IColliderComponent.kind` unless it is intentionally
promoted through validator, compiler, both runtimes, and conformance together.

## Functionality Gaps Relative to Bevy/Rapier

These are gaps rather than necessarily regressions. They should remain explicit
product boundaries until implemented.

| Priority | Gap | Current behavior | Concrete promotion path |
| --- | --- | --- | --- |
| P1 | Runtime forces, impulses, and torque | No first-class script operations; generic velocity/component patches only. | Add staged portable body commands, wake semantics, declared system services, host effects, and paired live tests. |
| P1 | Constraint solving | Hinge/slider/suspension are metadata observations only. | Map to Rapier impulse joints and prove anchors, axes, limits, motors/springs, lifecycle, and invalid targets. |
| P1 | Configurable world gravity | Live gravity is hardcoded to `[0,-9.81,0]` in web and native. | Add a versioned `PhysicsSettings` IR/resource with gravity and solver policy; include it in topology/config signatures. |
| P2 | Accurate live scene queries | Script queries use AABB snapshots rather than Rapier query pipelines. | Expose adapter-private query pipelines behind the existing portable result types. |
| P2 | True mesh narrow phase | Bounded mesh colliders are cuboid proxies. | Add an explicit static trimesh/convex policy, asset-derived cooked data, budgets, and fallback diagnostics; do not relabel AABB proxies as arbitrary mesh collision. |
| P2 | Multiple/compound colliders | One collider component is attached per entity/body. | Add versioned child/compound collider IR, mass-property rules, filtering, and deterministic IDs. |
| P2 | Material combine rules/contact forces | Only friction/restitution values are mapped; no combine rule or force threshold/callback contract. | Define portable combine enums and bounded contact observations before exposing backend details. |
| P3 | Vehicles, ragdolls, soft bodies | Explicitly deferred. | Promote only with genre fixtures, runtime APIs, stability/performance budgets, and desktop proof. |

## Systemic Architecture Risk

Physics collision semantics currently exist in at least these independent paths:

1. Web live Rapier.
2. Native live Rapier.
3. Web primitive proof solver and event AABBs.
4. Native primitive proof solver and event AABBs.
5. Web sensor AABBs.
6. Native sensor AABBs.
7. Web character collision.
8. Native character collision.
9. Native QuickJS bridge character/query collision.

This is the main reason fixes regress elsewhere. The preferred direction is not
one cross-language implementation, but one **canonical contract and fixture
set**, shared collider-pose/filter rules, generated host descriptors where
possible, and live Rapier-backed observations for solver/query claims.

## Recommended Remediation Order

1. Fix SDK collider emission and native lossless `set`/`patch` semantics; add
   exhaustive mapper and cross-adapter component-state tests.
2. Make collider-only static behavior and Transform requirements unambiguous.
3. Connect native live collision events to the fixed game loop.
4. Fix exact mass/inverseMass and capsule geometry.
5. Repair character sensor/filter behavior and native mesh bounds.
6. Replace or reconcile sensor/query AABBs with authoritative shape/pose data.
7. Align public service types and diagnostic enrollment, then add pre-/post-
   physics staging and body mutation commands.
8. Implement joints, sleep/CCD details, and per-runtime native Rapier ownership.
9. Add world layer-budget diagnostics, SDK/IR drift tests, and live-vs-proof
   differential gates.
10. Only then broaden claims toward richer Bevy/Rapier parity.

## Verification Run During Audit

All commands passed:

```text
pnpm --filter @threenative/runtime-web-three test
  416 passed

pnpm --filter @threenative/ir test
  360 passed

cargo test -p threenative_runtime --test physics --test systems_services --test systems_host
  62 passed
```

A read-only runtime probe also demonstrated the non-normalized ray direction
bug described above.

These passing results are positive baseline evidence, not evidence that the
findings are false. The identified edge cases are largely absent from the
current tests.

## Audit Boundary

No runtime, compiler, SDK, or IR behavior was changed by this audit. The only
intended repository changes are this report and the required brief systems
code-quality status link.

## Remediation Execution Addendum

Executed: 2026-07-13

The audit boundary above describes the original read-only pass. A subsequent
implementation pass repaired every P0 finding and most P1/P2 findings. The
remaining release boundaries are accurate live scene queries and replacing the
primitive proof solver with live Rapier observations. The revised bounded-slice
quality score is **8.7 / 10**; this is not a claim of general Bevy/Rapier
feature parity.

| Finding | Result | Executed repair and proof |
| --- | --- | --- |
| Collider fields lost by compiler | Closed | Exhaustive collider/body/joint emission preserves all accepted fields; compiler deep-equality and capability tests cover the full declaration. |
| Native script writes erase metadata | Closed | Native snapshots use lossless serde values and retain `set` versus `patch`; full-field preservation and minimal replacement tests cover both operations. |
| Collider-only solver ghosts | Closed | Both adapters synthesize adapter-private fixed bodies without mutating public IR; live landing tests cover collider-only floors. |
| Native live collision events absent | Closed | Native Rapier contact/intersection pairs now publish stable enter/stay/exit event queues from per-runtime pair state. |
| Incorrect mass/inverse mass | Closed | Collider mass is set to the authored final mass, including inverse-mass derivation; live Rapier mass inspection tests cover both forms. |
| Character sensors and filters block incorrectly | Closed | Sensor classification and symmetric layer/mask filtering now run before blocking, grounding, and pushing in web, native, and QuickJS paths. |
| Open physics objects and missing Transform drift | Closed | Collider/RigidBody fields are closed and physics entities require a Transform with stable IR diagnostics. |
| Capsule height mismatch | Closed | Total height is validated as at least two radii and converted to Rapier segment half-height consistently. |
| Sensor occupants/pose/cache drift | Closed | Sensors only consider colliders, include local and mesh centers plus rotation, and use phase-aware startup/fixed cache keys. |
| Script queries use divergent AABBs | Partial | Directions are normalized and zero vectors rejected; local centers, mesh bounds, rotations, filters, and conservative rotated bounds now match across the three service paths. Queries still use bounded snapshot geometry instead of the retained Rapier query pipeline. |
| `physics.sensor` diagnostic gap | Closed | Compiler service detection derives from the scripting-host service matrix. |
| Public SDK physics service type drift | Closed | SDK, IR, web, and native service/result types now agree, with matrix drift coverage. |
| Native character mesh bounds collapse | Closed | Character paths consume authored mesh bounds and center consistently. |
| PhysicsJoint metadata only | Closed for promoted kinds | Web and native build live Rapier hinge, slider, and suspension joints with anchors, axes, limits, travel, stiffness, and damping; IR rejects missing/non-body targets. |
| Sleep/CCD fields ignored | Closed for the portable policy | Zero sleep threshold disables sleep, authored changes wake bodies, and the maximum authored CCD substep count configures the world. Positive threshold mapping remains limited by the web Rapier API. |
| No same-tick body commands | Closed | Fixed scripts run before the solver and declared `addForce`, `addTorque`, `applyImpulse`, `applyAngularImpulse`, and velocity-set services execute in the current fixed tick. |
| Native Rapier cache cross-talk/wake risk | Closed in runtime ownership | Cache state is keyed per native loop, disposed with loop state, includes full topology, and wakes on authored pose/velocity changes. |
| Silent 17th collision layer | Closed | IR enforces a world-wide 16-name budget; both adapters derive sorted deterministic bit registries and fail closed for unknown names. |
| Proof solver can disagree with Rapier | Partial | Trigger exclusion, filters, collider-only statics, and local-center resolution were repaired. Proof gates still need to move entirely to normalized live Rapier observations or gain a comprehensive differential matrix. |
| Script-posed kinematics lose momentum | Closed | Solver velocity is derived from authored pose delta without double integration; web/native moving-platform momentum tests cover the handoff. |
| SDK and IR validation disagree | Closed | Capsule, phase-array, mask-budget, and collider-kind rules now agree at the SDK and IR boundaries. |

Additional promoted behavior completed during remediation:

- Runtime configuration accepts a finite portable gravity vector and both live
  adapters consume it.
- Physics system service truth is registry-backed across SDK, IR, web, native,
  compiler diagnostics, and the scripting-host matrix.
- Native joint targets must resolve to another entity with a RigidBody before
  runtime construction.

The functionality-gap table above is superseded for body commands, promoted
hinge/slider/suspension constraints, and configurable gravity. True mesh narrow
phase, compound colliders, material combine/contact-force callbacks, vehicles,
ragdolls, and soft bodies remain explicit product boundaries.

### Remediation Verification

The implementation pass was self-verified after the final fixed-phase and
sensor-classification repairs:

```text
pnpm verify:physics-self-verification
  PASS: seven physics scenes, negative fixtures, V8/V9/V10 physics gates,
  animation/physics residuals, and conformance

cargo test -p threenative_runtime \
  --test physics --test physics_sensors --test character \
  --test systems_services --test systems_effects --test systems_host
  104 passed

pnpm --filter @threenative/runtime-web-three test
  433 passed

pnpm --filter @threenative/compiler test
  267 passed

pnpm check:docs
  PASS

tn parity playtest --project examples/humanoid-physics-course \
  --scenario playtests/humanoid-course-forward-movement.playtest.json \
  --targets web,desktop --stable-artifacts --json
  TN_PARITY_PLAYTEST_OK: web PASS, desktop PASS, no diagnostics
```

The aggregate report is
`tools/verify/artifacts/physics-self-verification/verification-report.json`.
The paired gameplay report is
`examples/humanoid-physics-course/artifacts/gameplay-parity/playtests/humanoid-course-forward-movement.playtest.parity.json`.
