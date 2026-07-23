# PRD: Advanced Physics for Major Games

Complexity: 13 -> HIGH mode

Score basis: +3 touches 10+ files, +2 introduces new physics systems, +2 has
complex fixed-step state and solver interaction, +2 spans SDK/IR/compiler/web/
Bevy/authoring/verification, +2 requires deterministic cross-runtime evidence,
+1 adds generated fracture assets, and +1 affects release gates.

Status: Complete. This PRD supersedes only Phase 2 (advanced physics) of
`proof-first-engine-loop-2026-07-05/PRD-016-advanced-animation-physics-depth.md`;
that document remains the owner of advanced animation planning.

## 1. Context

**Problem:** ThreeNative's portable physics contract supports core rigid-body
gameplay, but it cannot yet express or prove the wheel, drivetrain,
aerodynamic, compound-body, breakable-assembly, and high-load behavior needed
by racing, flight, vehicle-combat, demolition, and physics-sandbox games.

**Goal:** Let authors build those game classes through structured source and
portable TypeScript while preserving one versioned IR contract, actionable
unsupported diagnostics, comparable web/Bevy outcomes, and release-grade
performance evidence.

**Files analyzed:**

- `packages/sdk/src/physics.ts`
- `packages/ir/src/types.ts`
- `packages/ir/src/physicsValidation.ts`
- `packages/ir/src/scriptServices.ts`
- `packages/runtime-web-three/src/physics.ts`
- `runtime-bevy/crates/threenative_runtime/src/physics.rs`
- `packages/authoring/src/operations/`
- `tools/verify/src/physicsSelfVerification.ts`
- `docs/status/capabilities/physics.md`
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
- `docs/audits/PHYSICS_SYSTEM_AUDIT_2026-07-13.md`
- `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-016-advanced-animation-physics-depth.md`

No environment variables, external service, database, or network API are
required. Rapier is already the retained solver on web and the native solver in
Bevy; this PRD does not replace it.

**Current behavior:**

- Portable rigid bodies cover static, kinematic, and dynamic bodies with mass,
  velocity, damping, gravity scale, axis locks, sleep policy, solver iterations,
  CCD, filters, materials, and primitive/static-mesh colliders.
- Live Rapier supports hinge, slider, and suspension constraints in both
  adapters. Scripts can apply force, torque, impulses, and velocity changes in
  the current fixed tick.
- Contact phases, sensors, ray/shape/overlap queries, character push response,
  and focused web/native physics evidence exist.
- Compound colliders, wheel/tire models, drivetrains, force-at-point,
  aerodynamics, breakable constraints, destruction, ragdolls, and physics-state
  snapshots are not portable capabilities.
- Conservative query/proof geometry is duplicated outside retained Rapier,
  creating a known parity and maintenance risk.

## 2. Product Scope

### 2.1 Target game classes

The first release must make these loops viable without raw Rapier/Bevy access:

1. **Racing and vehicle combat:** four or more independently configured wheels,
   suspension, steering, braking, engine/gearing, tire slip, surface response,
   downforce, collision damage, and detachable parts.
2. **Flight and high-speed craft:** lift, drag, angle-of-attack response, stall,
   control surfaces, thrust, wind, air density, and force application at local
   points.
3. **Demolition and destructible environments:** authored fracture pieces,
   break thresholds, stress/impact damage, bounded debris activation, cleanup,
   and deterministic destruction events.
4. **Physics sandboxes and action games:** compound bodies, richer constraints,
   motors, breakable joints, projectile CCD, stable stacks, runtime queries,
   and inspectable solver state.

### 2.2 P0, P1, and explicit non-goals

**P0 release scope:** compound colliders; force/impulse at point; normalized live
queries; raycast wheels; tire/surface response; drivetrain and vehicle control;
aerodynamic bodies/surfaces/wind; fixed/ball/rope plus motorized and breakable
joints; build-time pre-fractured destruction; bounded debris lifecycle; physics
debugging, telemetry, deterministic event ordering, web/Bevy conformance, and
three playable forcing functions.

**P1 follow-up, not required for P0:** articulated ragdolls, buoyancy volumes,
tracked vehicles, hovercraft helpers, trailers, two-wheeled stabilization,
vehicle assists, replayable physics snapshots, and networking-friendly state
quantization. Each requires a separate promoted slice and proof case.

**Non-goals:** arbitrary runtime Boolean/Voronoi mesh cutting; soft bodies,
cloth, fluids, granular simulation, or deformable tires; CFD; professional
motorsport tire thermodynamics; bit-identical floating-point trajectories
between JavaScript/WASM and Rust; deterministic lockstep networking; raw solver
handles/callbacks; arbitrary solver plugins; or author-authored Rust/Bevy
physics. Unsupported declarations must fail during validation with a stable
code, source path, message, and portable alternative.

### 2.3 Success metrics

- A generated-project author can create a controllable four-wheel vehicle and
  an aerodynamic craft using documented SDK/structured-source APIs and no
  backend-specific code.
- A pre-fractured wall can break from a declared impact threshold, activate no
  more than its authored debris budget, and emit stable cause/piece events.
- Identical input recordings produce the same ordered semantic events and stay
  within per-observation web/Bevy tolerances for pose, velocity, wheel contact,
  vehicle state, aerodynamic force, and destruction state.
- The focused workload of 16 four-wheel vehicles, 128 active debris bodies,
  256 static compound shapes, and 64 projectile bodies holds p95 physics-step
  time at or below 12 ms on the documented web CI/reference profile and 8 ms on
  the documented desktop profile, with no step above 16.67 ms in the measured
  60-second steady-state window. Hardware and browser/runtime versions are
  recorded with evidence.
- Every promoted public field is consumed by both adapters or rejected before
  bundle emission. Registry/drift tests prevent an accepted field or service
  from becoming adapter-dead data.

## 3. Pre-Planning and Integration Points

**Durable owners:**

- The versioned IR component/service schemas and validation rules own portable
  meaning, units, limits, defaults, and unsupported boundaries.
- One physics capability descriptor registry owns component names, script
  services, authoring operations, adapter support, fixture enrollment, and
  release-gate requirements. SDK helpers, CLI/MCP/editor exposure, service
  allowlists, and coverage matrices must derive from it or have a drift test.
- Runtime adapters own only solver mapping and runtime-private handles.
- Generated fracture manifests own piece IDs, shapes, mass fractions, bonds,
  and activation budgets; emitted bundle JSON is never edited directly.

**How will this feature be reached?**

- [x] Entry point identified: SDK helpers, `content/**/*.json`, descriptor-backed
  `tn physics ... --json` mutations, portable `ctx.physics` services, `tn build`,
  `tn playtest`, and focused verification commands.
- [x] Caller files identified: compiler world extraction/validation, the fixed
  update system host, the web game loop, the native runtime loop, authoring
  operation dispatch, and verify command registration.
- [x] Registration/wiring needed: physics descriptor registry, IR/schema exports,
  SDK exports, compiler preservation, web/native mapper registration, script
  service matrix, CLI/MCP/editor derivation, fixture catalog, focused gate, docs,
  and generated-game proof enrollment.

**Is this user-facing?** Yes. The author-facing surface is structured source,
SDK helpers, conventional script APIs, bounded CLI/editor operations, debug
views, diagnostics, and playtest evidence. No separate settings page is needed;
the editor counterpart is descriptor-derived component forms and read-only live
telemetry for the same fields.

**Full user flow:**

1. The author adds a compound body, vehicle, aerodynamic surface, or destructible
   assembly through an SDK helper or `tn physics ... --json` operation.
2. `tn authoring validate --json` validates references, units, budgets, and
   portable bounds; `tn build` emits versioned IR and generated fracture data.
3. A fixed-update script reads declared input and calls conventional portable
   controls such as `ctx.physics.vehicle.setInputs(...)`, or fully declarative
   input bindings drive the controller.
4. The web or desktop adapter maps the same contract into retained Rapier,
   advances it once per fixed tick, and emits normalized observations/events.
5. `tn playtest` and debug capture show wheel contacts, forces, joints, breakage,
   timing, and objective-level results; unsupported behavior fails with a fix.

## 4. Solution

### 4.1 Architecture

```mermaid
flowchart LR
    A[SDK / structured source / tn physics] --> D[Physics capability descriptors]
    D --> V[IR schema + semantic validation]
    V --> C[Compiler + generated fracture manifest]
    C --> B[Versioned bundle]
    B --> W[Web retained Rapier adapter]
    B --> N[Bevy retained Rapier adapter]
    S[Portable fixed-update scripts] --> H[Descriptor-owned physics services]
    H --> W
    H --> N
    W --> O[Normalized observations + evidence]
    N --> O
    O --> G[Conformance / gameplay / performance gates]
```

### 4.2 Contract decisions

- Units are SI: meters, kilograms, seconds, Newtons, Newton-meters, radians,
  Pascals for optional pressure, and kilograms per cubic meter for density.
  Helpers may offer display-unit conversion, but IR stores SI values.
- Fixed update is the only mutation boundary. Inputs are sampled for the next
  fixed tick; commands queued in `fixedUpdate` affect that tick according to the
  existing scheduling contract. Render interpolation never feeds the solver.
- `CompoundCollider` is one component containing stable child IDs and local
  primitive or convex-hull shapes. Dynamic triangle meshes remain unsupported.
- `WheelAssembly` belongs to the chassis and contains stable wheel IDs, local
  attachment points, radius/width, suspension, steering/driven/braked flags,
  and a named `TireModel`. Wheels use solver ray/shape casts; visual wheel
  entities follow normalized wheel observations and are not extra rigid bodies.
- `VehicleController` owns engine torque curve, gearbox, differential, clutch,
  braking, steering response, assists, and input bindings. `TireModel` and
  `PhysicsSurface` own longitudinal/lateral grip curves and combine rules.
- `AerodynamicBody` provides reference area, drag coefficient, center of
  pressure, and density policy. Optional `AerodynamicSurface` entries provide
  local pose, area, lift/drag curves, stall angle, aspect ratio, control input,
  and deflection bounds. `WindVolume` supplies bounded uniform/gust fields.
- `PhysicsJoint` expands to `fixed`, `ball`, and `rope` and gains optional motor
  and break thresholds. A joint emits exactly one break event before removal.
- `Destructible` references a compiler-generated `FractureManifest`. The source
  asset or authored primitive recipe is fractured at build time using a stable
  seed; runtime only evaluates bonds and activates existing bounded pieces.
- Public observations are semantic and normalized, not raw solver objects:
  body state, contacts, wheel state, vehicle state, force contribution,
  joint load/break, and destructible state. Debug-only detail is artifact-backed
  and size-capped.
- Cross-runtime proof compares ordered events exactly and continuous values with
  field-owned absolute/relative tolerances. A tolerance registry is versioned,
  reviewed, and may not be widened merely to pass a gate.

### 4.3 Proposed portable data model

| Owner | Required fields | Important optional fields | Limits |
| --- | --- | --- | --- |
| `CompoundCollider` | `children[{id, shape, localPose}]` | child material/filter | 32 children; primitive/convex only |
| `WheelAssembly` | `wheels[{id, attachment, radius, width, suspension, tire}]` | steer/driven/braked, visual entity | 2-16 wheels |
| `TireModel` | longitudinal/lateral slip curves | load sensitivity, rolling resistance | bounded piecewise-linear curves, max 16 points |
| `PhysicsSurface` | friction/grip multipliers | rolling resistance, tags | named registry entry |
| `VehicleController` | engine curve, gears, final drive, input mapping | differential, clutch, ABS/TCS | 2-16 wheels, 1-12 forward gears |
| `AerodynamicBody` | reference area, drag coefficient | center of pressure, density | finite non-negative values |
| `AerodynamicSurface` | local pose, area, lift/drag curves | stall, aspect ratio, control binding | max 32 surfaces/body, curves max 16 points |
| `WindVolume` | shape, velocity | density, gust seed/frequency/amplitude | deterministic bounded gust function |
| `PhysicsJoint` | kind, target, anchors | limits, motor, break force/torque | finite graph; no self/cyclic gear drive |
| `Destructible` | fracture manifest, bond strength, activation budget | impact filter, cleanup policy, max depth | 256 pieces/assembly, 1024 active pieces/scene by default |

Exact JSON schema names and version migration are finalized in Phase 1 before
runtime implementation. Public helpers use familiar Unity/game-engine terms
where they do not conflict with the portable contract.

### 4.4 Sequence flow

```mermaid
sequenceDiagram
    participant U as Author/Input
    participant H as Fixed-update host
    participant P as Advanced physics runtime
    participant R as Retained Rapier
    participant O as Observation/event bridge
    participant G as Proof gate

    U->>H: throttle/steer/control + physics commands
    H->>P: validated commands for tick N
    P->>R: wheel casts, forces-at-point, joints, bodies
    R-->>P: contacts, poses, velocities, impulses
    P->>P: drivetrain/aero/bond state update
    P-->>O: normalized ordered observations/events
    O-->>H: script-readable tick N result
    O-->>G: compact trace and metrics
    alt unsupported or over budget
        P-->>O: stable diagnostic with source owner and fix
    end
```

### 4.5 Errors, budgets, and compatibility

- Validation rejects NaN/infinite/out-of-range values, missing entity/asset/
  surface references, duplicate child/wheel IDs, invalid curves, impossible
  gear graphs, unsupported dynamic triangle meshes, excessive fracture pieces,
  and raw backend fields.
- Runtime topology changes are bounded operations. Exceeding an authored active
  body/debris budget emits a deterministic event and applies the declared
  `reject-new`, `sleep-oldest`, or `despawn-oldest` policy; no silent dropping.
- New schema fields require an IR version bump or additive version policy,
  migration tests, and old-bundle fixtures. Unknown fields remain errors.
- Existing `RigidBody`, `Collider`, and joint declarations preserve behavior.
  There is no implicit conversion of the current `suspension` joint into a
  wheel; authors opt into `WheelAssembly`.
- Physics diagnostics include code, severity, source path, message, suggestion,
  and structured fix when a safe authoring mutation exists.

## 5. Execution Phases

Every phase is a user-testable vertical slice. Each checkpoint runs the
automated PRD work review required by the `prd-creator` protocol. Performance,
visual/debug, and playable-game phases also require manual artifact review.
The paths below are the five primary owner groups per phase; colocated tests and
generated schema snapshots remain part of their owner group. Files marked
`(new)` do not exist yet; each names the current durable owner it extends or is
extracted from, and implementation must move or derive that owner's behavior
rather than duplicating it in a second surface.

### Phase 1: Contract registry and live observation foundation

**Outcome:** An author can validate a compound collider and force-at-point call,
and both runtimes report the same normalized live body/query observation.

**Primary files (max 5):**

- `packages/ir/src/physicsCapabilities.ts` (new) - owning descriptors, units,
  limits, tolerance metadata, services, and adapter requirements; consolidates
  the physics knowledge currently spread across `physicsValidation.ts` and
  `scriptServices.ts` rather than adding a parallel list.
- `packages/ir/src/physicsValidation.ts` - semantic and negative validation.
- `packages/ir/src/types.ts` - versioned component/observation types.
- `packages/runtime-web-three/src/physics.ts` - retained Rapier compound mapping,
  force-at-point, and live query observations.
- `runtime-bevy/crates/threenative_runtime/src/physics.rs` - native equivalent.

**Implementation:**

- [x] Add descriptor registry and a drift assertion covering IR, script-service,
  web, native, authoring-operation, fixture, and gate ownership.
- [x] Add `CompoundCollider` with stable child IDs and local pose; support box,
  sphere, capsule, and compiler-produced bounded convex hull children.
- [x] Add `physics.addForceAtPoint` and `physics.applyImpulseAtPoint` with SI
  semantics and same-tick scheduling.
- [x] Replace conservative public query/proof claims with normalized retained
  Rapier raycast, shape-cast, overlap, and contact observations.
- [x] Preserve existing primitive contracts and reject raw handles/dynamic
  triangle children with actionable diagnostics.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should reject duplicate compound child ids and dynamic triangle children` | Stable code and exact source path for each invalid child. |
| `should rotate a body when force is applied off center` | Web/native angular and linear velocity are within owned tolerances. |
| `should report the live collider hit rather than conservative bounds` | Query identity, point, normal, and distance match the solver scene. |
| `should fail descriptor drift when an adapter consumer is absent` | Removing one consumer makes the registry test fail. |

**Verification plan:** focused IR/SDK/runtime tests; negative fixtures;
`pnpm verify:conformance`; old physics fixture regression.

**User verification:** Run the compound-body fixture and apply an off-center
impulse. The body spins, queries hit the correct child ID, and web/desktop
traces identify the same child and semantic event order.

**Checkpoint:** automated reviewer must report PASS before Phase 2.

### Phase 2: Wheel contact, suspension, tires, and surfaces

**Outcome:** An author can roll, steer, brake, and obtain suspension/tire state
for a chassis on surfaces with different grip.

**Primary files (max 5):**

- `packages/ir/src/physicsCapabilities.ts` - wheel/tire/surface descriptors.
- `packages/sdk/src/physics.ts` - `wheelAssembly`, `tireModel`, and surface helpers.
- `packages/compiler/src/emit/physics.ts` (new) - reference resolution and
  lossless emit, extracted from the current `emitPhysics` owner in
  `packages/compiler/src/emit/scene-to-world.ts` (tests already live in
  `emit/physics.test.ts`); `scene-to-world.ts` must delegate, not duplicate.
- `packages/runtime-web-three/src/physicsVehicle.ts` (new) - wheel cast and tire solver.
- `runtime-bevy/crates/threenative_runtime/src/physics_vehicle.rs` (new) - native solver.

**Implementation:**

- [x] Define stable wheel IDs, local attachments, suspension travel/spring/
  damper, radius/width, steering/driven/braked flags, and visual targets.
- [x] Define bounded longitudinal and lateral slip curves, load sensitivity,
  rolling resistance, and deterministic material/surface combine rules.
- [x] Use retained-world ray/shape casts, apply suspension and tire forces at
  contact points, and cap invalid/extreme forces through authored limits.
- [x] Publish contact, compression, normal load, slip ratio/angle, angular
  speed, surface, and grounded state in stable wheel order.
- [x] Keep wheel visuals presentation-only and interpolate from physics state.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should reject invalid wheel geometry and non-monotonic slip curves` | Validation points to the wheel/curve entry and suggests valid bounds. |
| `should compress suspension and settle chassis under static load` | Ride height and per-wheel load converge inside declared tolerance. |
| `should reduce acceleration when wheel moves from asphalt to ice` | Surface ID changes and longitudinal acceleration decreases measurably. |
| `should preserve stable wheel observation order` | Output order follows authored wheel IDs across runtimes. |

**Verification plan:** unit curve tests; static-load fixture; split-surface
fixture; paired traces; `pnpm verify:conformance`.

**User verification:** Drive the wheel fixture across asphalt and ice. Debug
rays, compression, contact patch, and slip change visibly and match telemetry.

**Checkpoint:** automated plus manual debug-overlay review.

### Phase 3: Drivetrain and production vehicle control

**Outcome:** An author can build a playable car with engine, gearing,
differential, steering, brakes, and bounded driving assists.

**Primary files (max 5):**

- `packages/ir/src/physicsCapabilities.ts` - controller/drivetrain contract.
- `packages/script-stdlib/src/physics.ts` (new) - typed conventional vehicle
  facade layered on the existing physics service surface in
  `packages/script-stdlib/src/script-context.ts`.
- `packages/runtime-web-three/src/physicsVehicle.ts` - drivetrain/control step.
- `runtime-bevy/crates/threenative_runtime/src/physics_vehicle.rs` - native step.
- `packages/authoring/src/operations/physics.ts` (new) - descriptor-backed
  mutation; the existing `RigidBody` component operation in
  `packages/authoring/src/operations/sceneComponents.ts` moves or is re-exported
  here so physics authoring has one owner.

**Implementation:**

- [x] Add bounded piecewise engine torque curve, idle/redline, forward/reverse
  ratios, final drive, clutch response, and open/locked/limited-slip differential.
- [x] Add throttle, brake, handbrake, steer, clutch, and gear inputs with
  declarative bindings plus `ctx.physics.vehicle.setInputs`.
- [x] Add speed-sensitive steering, brake bias, engine braking, auto/manual
  shift policy, optional ABS/TCS, and deterministic state transitions.
- [x] Publish speed, engine RPM, gear, torque path, and assist activations.
- [x] Add `tn physics vehicle add|inspect|validate --json` through the owning
  operation descriptor; derive MCP/editor metadata and generated API cards.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should reject disconnected driven wheels and invalid gear ratios` | Build fails with structured fixes. |
| `should shift through gears under a recorded throttle input` | Gear/RPM event sequence is stable and speed rises. |
| `should turn toward steering input without chassis teleportation` | Yaw and lateral path meet fixture bounds; transform has solver ownership. |
| `should expose identical CLI MCP and editor vehicle fields` | Descriptor drift test reports no missing fields. |

**Verification plan:** drivetrain unit tests; recorded-input lap segment;
authoring dry-run/apply round trip; web/desktop playtest.

**User verification:** Use the generated controls to launch, steer through a
slalom, brake, reverse, and retry. HUD/debug telemetry shows RPM, gear, speed,
wheel slip, and assists.

**Checkpoint:** automated plus manual playability/artifact review.

### Phase 4: Aerodynamics, thrust, control surfaces, and wind

**Outcome:** An author can create a craft that takes off, stalls, recovers, and
responds to wind using portable declarations and force-at-point physics.

**Primary files (max 5):**

- `packages/ir/src/physicsCapabilities.ts` - aero/wind/thrust descriptors.
- `packages/sdk/src/physics.ts` - aerodynamic helpers and bounded curves.
- `packages/runtime-web-three/src/physicsAerodynamics.ts` (new) - web force model.
- `runtime-bevy/crates/threenative_runtime/src/physics_aerodynamics.rs` (new) - native model.
- `packages/authoring/src/operations/physics.ts` - authoring operations/forms.

**Implementation:**

- [x] Add quadratic body drag and local aerodynamic surfaces with lift/drag
  curves, center of pressure, aspect-ratio correction, stall, and control input.
- [x] Add force/torque thrusters with throttle binding, response, and fuel hook
  metadata; fuel inventory itself remains a gameplay/resource concern.
- [x] Add box/sphere wind volumes with deterministic uniform and seeded gust
  velocity and optional air density override.
- [x] Publish relative air velocity, angle of attack, sideslip, lift, drag,
  force point, control deflection, and stall state.
- [x] Clamp only at declared physical/safety bounds and emit a diagnostic when
  input would create non-finite or over-budget force.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should produce zero aerodynamic force at zero relative airspeed` | All force contributions are zero and finite. |
| `should increase drag quadratically with airspeed` | Doubling speed yields four-times drag within numeric tolerance. |
| `should reverse control torque when elevator deflection reverses` | Pitch torque sign changes in both adapters. |
| `should enter and leave stall under a recorded maneuver` | Ordered stall events and recovery occur inside tick windows. |

**Verification plan:** analytic unit cases; wind-volume boundary fixture;
recorded takeoff/stall/recovery scenario; paired traces; visual force vectors.

**User verification:** Fly the forcing-function craft through a gust, induce a
stall, recover, and land. Telemetry and vectors explain the motion.

**Checkpoint:** automated plus manual flight-feel/artifact review.

### Phase 5: Rich, motorized, and breakable joints

**Outcome:** Authors can build doors, turrets, ropes, suspensions, detachable
vehicle parts, and machines with observable motors and break thresholds.

**Primary files (max 5):**

- `packages/ir/src/physicsValidation.ts` - joint graph validation.
- `packages/sdk/src/physics.ts` - fixed/ball/rope/motor/break helpers.
- `packages/runtime-web-three/src/physicsJoints.ts` (new) - web joint lifecycle,
  extracted from the joint handling in `packages/runtime-web-three/src/physics.ts`.
- `runtime-bevy/crates/threenative_runtime/src/physics_joints.rs` (new) - native
  lifecycle, extracted from `physics.rs`.
- `packages/ir/fixtures/conformance/advanced-physics-joints/` (new) - shared fixture.

**Implementation:**

- [x] Add fixed, ball, and rope joints while retaining hinge, slider, and
  suspension compatibility.
- [x] Add bounded position/velocity motors, maximum force/torque, damping, and
  limits where meaningful for each joint kind.
- [x] Add break force/torque, stable load observations, one-shot break events,
  and safe deferred solver removal.
- [x] Validate references, local frames, axes, motor/limit compatibility, and
  graph/budget limits before runtime.
- [x] Ensure runtime spawn/despawn and component patches reconcile joint state
  without rebuilding unrelated bodies.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should reject motor fields unsupported by the joint kind` | Diagnostic names field, kind, and supported alternative. |
| `should hold a fixed joint within tolerance under load` | Relative pose stays bounded across both adapters. |
| `should break once when accumulated load crosses threshold` | One event occurs and the joint is absent before remaining fixed-tick substeps. |
| `should preserve unrelated body handles when a joint changes` | Rebuild/lifecycle counter remains bounded. |

**Verification plan:** per-kind fixtures; load ramp; patch/reconciliation
tests; paired normalized joint trace; `pnpm verify:conformance`.

**User verification:** Apply load to a motorized turret and detachable panel;
the motor respects limits and the panel breaks at the declared threshold.

**Checkpoint:** automated reviewer must report PASS.

### Phase 6: Build-time fracture and bounded destruction runtime

**Outcome:** An authored wall or vehicle part breaks into physical pieces from
impact or script damage without runtime mesh cutting or unbounded debris.

**Primary files (max 5):**

- `packages/compiler/src/bake/fracture.ts` (new) - deterministic fracture/bond bake.
- `packages/ir/src/fractureManifest.ts` (new) - structured manifest schema and validation.
- `packages/runtime-web-three/src/physicsDestruction.ts` (new) - web damage/bond activation.
- `runtime-bevy/crates/threenative_runtime/src/physics_destruction.rs` (new) - native equivalent.
- `packages/cli/src/commands/physicsFracture.ts` (new) - inspect/generate/validate
  command, registered through `packages/cli/src/commands/registry.ts`.

**Implementation:**

- [x] Support imported pre-fractured GLB pieces and bounded seeded primitive/
  convex build-time fracture recipes; preserve stable piece and bond IDs.
- [x] Compute/validate piece colliders, mass fractions, adjacency bonds, health,
  impulse/energy thresholds, material response, and hierarchical activation.
- [x] Convert normalized contact impulse or explicit portable damage into bond
  damage once per tick, activate pieces in stable order, and conserve authored
  assembly mass within tolerance.
- [x] Enforce per-assembly and scene active-piece budgets with declared policy,
  sleep/despawn cleanup, pooling, and proof-visible overflow events.
- [x] Emit `damaged`, `bondBroken`, `pieceActivated`, `assemblyBroken`, and
  `budgetExceeded` events with cause entity/contact/script and stable ordering.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should bake byte-stable fracture manifests from the same source and seed` | Repeated output hashes match. |
| `should reject disconnected pieces invalid mass fractions and excessive budgets` | Each error has source path and fix. |
| `should break the same bonds for a recorded impact` | Ordered semantic events/piece IDs match web/native. |
| `should enforce debris policy without silently losing events` | Active count stays bounded and overflow event identifies policy. |

**Verification plan:** bake determinism; imported-piece fixture; impact replay;
mass/momentum bounds; budget stress; `tn asset inspect`/`tn model-test`; paired
playtests.

**User verification:** Fire projectiles at the wall at sub-threshold and
over-threshold speeds. The first impact dents/damages only; the second activates
the expected region, with bounded cleanup and readable evidence.

**Checkpoint:** automated plus manual destruction/contact-sheet review.

### Phase 7: Public authoring, debugging, and actionable diagnostics

**Outcome:** An author can discover, create, inspect, tune, and debug every P0
physics feature without hand-editing emitted artifacts.

**Primary files (max 5):**

- `packages/authoring/src/operations/physics.ts` - owning structured mutations.
- `packages/cli/src/commands/registry.ts` - derived `tn physics` command family.
- `packages/editor/src/` - descriptor-derived forms and live inspector panels.
- `packages/runtime-web-three/src/physicsDebug.ts` (new) - normalized debug primitives.
- `runtime-bevy/crates/threenative_runtime/src/physics_debug.rs` (new) - native debug output.

**Implementation:**

- [x] Provide bounded add/set/remove/inspect/validate operations for compound,
  wheel, vehicle, aero, joint, and destructible declarations, with dry-run and
  atomic batch support.
- [x] Derive CLI help, JSON payloads, MCP/editor operation metadata, generated
  types, API cards, and cookbook references from descriptors.
- [x] Add toggleable collider, center-of-mass, contact, wheel, suspension,
  slip, force, aero, joint-load, bond, sleep, and budget views.
- [x] Add compact per-tick/per-system timing, active/sleeping body counts,
  contacts, queries, solver iterations, rebuilds, and allocated pieces to
  artifact-backed telemetry; keep stdout summaries bounded.
- [x] Add diagnostic fixtures for every unsupported/non-finite/reference/budget
  boundary and verify structured fixes round-trip through authoring operations.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should round trip every advanced physics operation through dry run and apply` | Structured source is valid and stable after re-read. |
| `should keep CLI MCP editor and API card fields in descriptor parity` | No hand-maintained surface drifts. |
| `should draw normalized debug primitives from the same observation` | Web/native debug reports have matching IDs/types. |
| `should cap terminal output and persist deep telemetry as artifacts` | Size budget passes and artifact contains full details. |

**Verification plan:** operation/registry tests; generated-project smoke;
`pnpm verify:cookbook`; editor test; web/desktop debug captures.

**User verification:** Starting from a generated project, build and tune one
vehicle and one destructible prop using CLI/editor operations, then identify a
bad wheel contact and over-stressed joint from the debug evidence.

**Checkpoint:** automated plus manual editor/debug usability review.

### Phase 8: Major-game forcing functions, performance, and release ratchet

**Outcome:** Racing, flight, and destruction examples pass objective-level web
and desktop scenarios, conformance, and measured performance budgets.

**Primary files (max 5):**

- `examples/advanced-vehicle-course/` (new) - lap, surfaces, jump, damage, retry.
- `examples/aerodynamics-flight-course/` (new) - takeoff, gust, stall, recovery, land.
- `examples/destruction-range/` (new) - threshold, regional break, debris, cleanup.
- `tools/verify/src/advancedPhysicsGate.ts` (new) - registry-derived parity/perf gate.
- `docs/status/capabilities/physics.md` - evidence-backed capability truth.

**Implementation:**

- [x] Create production plans before source mutation and use catalog/authored
  assets for hero vehicles, craft, destructibles, and dominant environment.
- [x] Add recorded-input scenarios with objective, progression, fail/retry,
  feedback, collision/damage, and stable semantic assertions; primitives alone
  cannot qualify the visual forcing functions as finished.
- [x] Add exact event/state comparisons, field-owned numeric tolerances,
  negative controls, stale-evidence hashes, and web/desktop artifact pairing.
- [x] Add the specified dense workload and 60-second steady-state benchmark,
  recording p50/p95/max step, allocations, active/sleeping bodies, contacts,
  queries, piece count, hardware, browser, runtime, and build profile.
- [x] Enroll the descriptor-derived gate in focused/release verification only
  after all P0 cases pass; update `docs/STATUS.md`, Bevy parity evidence, cookbook,
  and code-quality risk notes in the same phase.

**Tests required:**

| Test | Assertion |
| --- | --- |
| `should complete a lap segment across mixed surfaces and collision damage` | Checkpoints, speed/slip bounds, damage, fail/retry, and finish event pass. |
| `should take off stall recover and land from recorded controls` | Objective states and aero observations occur in bounded tick windows. |
| `should keep destruction regional bounded and causally linked` | Expected bonds/pieces activate; unrelated region and budget remain stable. |
| `should reject stale missing weakened or single-adapter evidence` | Gate fails with exact missing/drift path. |
| `should stay within advanced physics performance budgets` | p95/max and count budgets meet Section 2.3. |

**Verification plan:** `pnpm verify:conformance`; focused advanced physics gate;
`pnpm test:gameplay`; `pnpm verify:gameplay-parity`; `pnpm verify:cookbook`;
desktop reruns for all three scenarios; full relevant release gate.

**User verification:** Play all three examples on web and desktop, review debug
and performance artifacts, and confirm each objective/fail/retry loop without
backend-specific source.

**Checkpoint:** automated reviewer PASS plus manual playability, visual,
performance, and artifact review before any status promotion.

## 6. Verification and Evidence Protocol

### 6.1 Comparison policy

- Exact across adapters: entity/piece/wheel/joint IDs, event types and order,
  input record, surface selection, gear transition order, grounded/stall/broken
  booleans, budget policy, diagnostic codes/paths, and fixture hashes.
- Numeric tolerance: positions, rotations, velocities, impulses, loads, slip,
  RPM, force contributions, and timing windows. Each field has an explicit
  absolute and/or relative tolerance in the owning registry.
- Outcome bounds: lap checkpoints, takeoff/landing corridor, stall/recovery
  window, impacted destruction region, active debris count, and settling time.
- Visual evidence supports, but never substitutes for, semantic and solver
  observations. Headless traces support, but never substitute for, playable
  input/objective proof.

### 6.2 Negative controls

Every promoted slice must prove at least one causal negative control: remove a
driven-wheel flag, invert a control surface, lower a joint threshold, swap the
surface, corrupt a fracture hash, exceed a budget, or remove one adapter's
consumer. The relevant gate must fail for the intended reason.

### 6.3 Evidence layout

- Shared fixture truth: `packages/ir/fixtures/conformance/advanced-physics-*`.
- Example runtime evidence: `examples/<forcing-function>/artifacts/<gate>/`.
- Aggregate report: `tools/verify/artifacts/advanced-physics/`.
- Bevy-only lower-level evidence: `runtime-bevy/artifacts/advanced-physics/`.
- Every report includes schema version, source/bundle hash, runtime adapter,
  runtime/dependency versions, platform, scenario, fixed delta, seed, tolerance
  registry version, command, timestamps, and artifact hashes.

### 6.4 Checkpoint protocol

After each phase, invoke the available PRD work reviewer with the PRD path,
phase number, implementation summary, and verification commands. Proceed only
on PASS. If that specialized reviewer is unavailable, record that fact and use
an independent review agent with the same checklist; do not silently skip the
checkpoint. Manual checkpoints are additional for Phases 2, 3, 4, 6, 7, and 8.

## 7. Risks and Mitigations

| Risk | Mitigation / owner |
| --- | --- |
| Rapier JS/Rust numerical divergence | Compare semantics exactly and values with reviewed field tolerances plus outcome bounds; never promise bit identity. Owner: IR tolerance registry. |
| Vehicle/aero helpers become an opaque second solver | Helpers calculate bounded forces/state only; retained Rapier owns integration, contacts, constraints, and body poses. Owner: runtime physics coordinator. |
| Descriptor and adapter drift | One registry plus missing-consumer tests; no second hand-maintained support list. Owner: IR physics capabilities. |
| Runtime topology churn/rebuild cost | Incremental handles and deferred safe mutation; lifecycle counters and stress tests. Owner: each adapter. |
| Unbounded debris/body growth | Authored budgets, deterministic policy, pooling/cleanup, and observable overflow. Owner: destruction runtime and target profile. |
| Destruction asset nondeterminism | Build-time seeded bake, canonical serialization, stable IDs, source hash, and repeat-build hash test. Owner: compiler fracture bake. |
| Tuning complexity harms author velocity | Conventional presets, bounded CLI operations, live debug telemetry, cookbook patterns, and source-preserving customization. Owner: authoring descriptor. |
| Advanced physics bloats all games | Tree-shakable web modules and feature-gated native systems/assets; bundle-size/startup metrics in the gate. Owner: compiler/adapter registration. |
| Scope expands into full simulation middleware | P0/P1/non-goal boundary and forcing-function admission rule; new breadth needs its own game case and evidence budget. Owner: this PRD/status docs. |

## 8. Acceptance Criteria

- [x] All eight phases are complete and every checkpoint review reports PASS.
- [x] Compound colliders and force/impulse-at-point work through portable source,
  scripts, retained Rapier, live queries, and paired evidence.
- [x] Wheel, tire, surface, suspension, drivetrain, steering, braking, and assist
  behavior completes the vehicle forcing function on web and desktop.
- [x] Lift, drag, stall, control surfaces, thrust, wind, and force telemetry
  complete the flight forcing function on web and desktop.
- [x] Fixed/ball/rope and motorized/breakable joints pass lifecycle, load, patch,
  and cross-runtime evidence.
- [x] Build-time pre-fracture, bonds, impact/script damage, deterministic piece
  activation, debris budgets, cleanup, and events complete the destruction
  forcing function on web and desktop.
- [x] CLI, MCP, editor, SDK, generated API card, cookbook, compiler, services,
  adapters, fixtures, and gates derive from the owner or pass explicit drift
  tests.
- [x] Unsupported soft-body/fluid/runtime-cutting/backend-specific behavior
  fails with stable actionable diagnostics and no silent fallback.
- [x] Existing physics fixtures and generated games do not regress.
- [x] `pnpm verify:conformance`, the focused advanced physics gate,
  `pnpm test:gameplay`, `pnpm verify:gameplay-parity`, `pnpm verify:cookbook`,
  and all three desktop scenarios pass with current-run evidence.
- [x] The dense workload meets the web and desktop budgets in Section 2.3 and
  records reproducible environment metadata.
- [x] Capability, `docs/STATUS.md`, Bevy parity, cookbook, and systems quality
  docs are updated only after their corresponding evidence exists.
- [x] No raw physics backend handle, generated artifact edit, weakened tolerance,
  broad cast, silent fallback, disabled test, or untracked compatibility shim is
  used to claim completion.

## 9. Verification Evidence

Each phase appends commands, pass/fail results, artifact paths, hashes, review
verdict, and manual sign-off here. The PRD moves to `docs/PRDs/done` only after every
acceptance criterion is checked and current status/capability indexes point to
the final evidence.

### Phase 1 evidence (checkpoint PASS)

- Focused paired evidence: `node tools/verify/dist/physicsSelfVerification.js
  --phase-1-only` writes the example report at
  `examples/advanced-physics-foundation/artifacts/physics-self-verification/scene-report.json`
  and the non-destructive Phase 1 aggregate at
  `tools/verify/artifacts/advanced-physics/phase-1-foundation/verification-report.json`.
- Current focused result: evidence assertions pass for exact compound-child
  query identity, fixed-tick force/impulse-at-point motion, ordered script-host
  services, the no-command causal control, registry-owned numeric tolerances,
  and stale source/bundle controls. The checked source hash is
  `sha256-bee6f33cf2040a9b69f2e27802dd6f095beadb9136aff065c9ed0e9576d81744`;
  the checked bundle hash is
  `sha256-8901390d93c9e180d848c11e41c00745982609df0e7a136f4de94b8a8294711b`.
- Focused contract verification: the selected IR physics and descriptor tests,
  verify-tools build, native trace binary check, and Rust formatting check pass.
- Full `pnpm verify:physics-self-verification` passes after the V7 query trace
  runner was moved to the retained native game-loop host. Its nested
  `pnpm verify:conformance` run also passes, including the live V7 physics query
  trace and the browser rendering fixture.
- Checkpoint review verdict: **PASS** on 2026-07-22 after independent read-only
  re-audit. The final review found no remaining Phase 1 functional, registry,
  schema-compatibility, runtime, evidence, or documentation blocker.
  Capability/status entries are limited to Phase 1 behavior; later-phase
  claims remain residual.

### Phase 2 evidence (checkpoint PASS)

- Focused paired evidence: `pnpm verify:focused
  verify:advanced-physics-wheels` writes the current report and paired web/native
  traces under `tools/verify/artifacts/advanced-physics/phase-2-wheels/`.
  The gate passes with zero diagnostics and both automated and manual
  checkpoints passing against tolerance registry `0.3.0`.
- The checked source hash is
  `sha256-a0f5481e804d7434a93d6e2e4e87de5bae2e8c749f0bb825706f7ae151e1f3a2`;
  the checked bundle hash is
  `sha256-51af5ef89df27348bbf1a35f6379594d94ba684324bc2fc359433ce11b297942`;
  and the manual screenshot hash is
  `sha256-1025fa0e2fa89060e4e710d35317862a4e495f993e2a14877690020a3115ea9e`.
- Paired scenarios prove static suspension load, asphalt-to-ice response,
  steering, braking, stable authored wheel/contact/visual order, causal flag
  negatives, full chassis and wheel telemetry, and presentation-only visual
  interpolation with bounded spin and wrap-safe shortest-path interpolation.
- Focused verification passes: 54 verify-tools tests, four IR descriptor/drift
  tests, the 498-test web runtime suite, five native vehicle tests, two native
  visual-consumption tests, docs consistency, and `git diff --check`.
- `pnpm verify:conformance` passes on an unchanged warm rerun. The preceding
  attempt recorded only a fixed 120-second cold Bevy compile timeout (`124`),
  not a test or parity diagnostic.
- Manual browser evidence records one solver-owned asphalt-to-ice crossing with
  keyboard steering/braking and replay, changing contact/surface telemetry,
  debug rays/normals, and all four authored visual targets with zero console
  errors.
- Checkpoint review verdict: **PASS** on 2026-07-22 after independent read-only
  final audit. The reviewer found no remaining Phase 2 contract, validation,
  compiler, solver, visual-consumption, evidence, manual-debug, or documentation
  blocker. Production drivetrain/controller behavior remains a Phase 3 boundary.

### Phase 3 evidence (checkpoint PASS)

- `pnpm verify:focused verify:advanced-physics-drivetrain` passes with zero
  diagnostics and both automated and manual checkpoints passing against
  tolerance registry `0.4.0`. The aggregate and paired traces are under
  `tools/verify/artifacts/advanced-physics/phase-3-drivetrain/`.
- The checked source hash is
  `sha256-d8efda8148bbb07e591a9f5a5c10dbcf25321715965a9c4323abc12f538c2367`;
  the checked bundle hash is
  `sha256-4fc3114d1d9eb5d77705af6fa01d9fd118f8b68cff9a9f7e5730ce421612b8bc`;
  and the manual browser screenshot hash is
  `sha256-7e0464a1b6057e59f2be68f6bc59290e49b3c87b080dab0568f2a2064a0d2768`.
- Paired traces prove automatic and manual shifting, steering, service braking,
  reverse, ABS/TCS transitions, deterministic fresh retry, and open, locked,
  and limited-slip differential torque paths. Numeric comparisons use stable
  checkpoints and manifest-owned local travel/stability bounds.
- Real `tn playtest` runs pass on web and graphical desktop with zero runtime
  diagnostics. Their target-specific summaries are under
  `examples/advanced-physics-drivetrain/artifacts/playtest/advanced-physics-drivetrain-automatic-launch/web/`
  and `desktop/`; the desktop evidence is produced by the real Bevy runtime.
- Manual browser review exercised launch, left/right slalom, braking, reverse,
  release, page reload, and a fresh retry launch. The retry reset the chassis
  to its authored start and moved it again under exact fixed-tick stepping.
  The HUD showed gear/RPM/clutch and authored-order
  torque telemetry, TCS and ABS each activated, all four wheels remained
  visible, and runtime diagnostics reported zero errors.
- Course-correction exit verification passes: the complete native Rust suite,
  conformance, cookbook, typecheck, docs consistency, focused drivetrain gate,
  and the full JavaScript workspace suite with bounded test-runner concurrency.

### Phase 4 evidence (checkpoint PASS)

- `pnpm verify:focused verify:advanced-physics-aerodynamics` passes with zero
  diagnostics and automated/manual evidence under
  `tools/verify/artifacts/advanced-physics/phase-4-aerodynamics/`.
- The checked source hash is
  `sha256-5fcc096e140dd2ad9c2b55f8d40767138b74a9b588f2c6a7b6be57d25eb9ae55`;
  the checked bundle hash is
  `sha256-5ed9385922833047402bed2fb5fae03760d2a9f43e38d861dd4f839083f6e9f9`;
  and the manual browser screenshot hash is
  `sha256-60260457bbd346b689e05fd97b67c44c5a5e2efdbd28ede2efc49e6bfd001b62`.
- Paired analytic traces prove zero-air behavior, quadratic drag, control-torque
  reversal, ordered stall/recovery, wind-volume boundaries and density,
  deterministic gusts, bounded thrust, fuel-hook metadata, and numeric parity.
  A retained 270-tick Rapier maneuver additionally records web/native ground
  contact, takeoff, stall at tick 138, recovery at tick 160, gust entry/exit,
  and settled landing, with final positions 0.40 m apart.
- Real web and graphical-desktop `tn playtest` runs pass with zero diagnostics.
  They use the same source/bundle hashes, finish 65.03 m and 64.84 m from the
  authored start, and settle on the runway at altitudes -0.50 m and -0.70 m.
- Manual browser review used the real HUD input path with exact fixed ticks to
  launch, enter and recover from a stall, cross gust telemetry, land over the
  runway, and retry. The hash-bound HUD screenshot shows lift, drag, thrust,
  and wind vectors with zero runtime errors.
- Descriptor-owned `physics aerodynamics` and `physics wind` add, inspect, and
  validate operations now serve CLI/editor authoring and reject invalid source
  through the shared IR validators. `docs/cookbook/advanced-physics-aerodynamics.md`
  documents the reusable authoring and two-target proof workflow, and
  `pnpm verify:cookbook` passes.
- Verification found and fixed two native-boundary defects: aerodynamic force
  is now integrated as a fixed-tick impulse like web, and successful graphical
  proof exits no longer tear down through the crashing overlay path.
- Independent checkpoint review reports PASS after confirming authoring
  ownership, executable cookbook coverage, retained integrated maneuver proof,
  target-specific playtests, and manifest-derived evidence bounds.

### Phase 5 evidence (checkpoint PASS)

- `pnpm verify:focused verify:advanced-physics-joints` passes with zero
  diagnostics and paired runtime traces under
  `tools/verify/artifacts/advanced-physics/phase-5-joints/`.
- The checked source hash is
  `sha256-c8805323a3bfb0e31a8db951ba4489b393e1a9a6be5de8b5f94d0b568d7a69fe`;
  the checked bundle hash is
  `sha256-9964502803b8194cd28b5ada5c447a19cc6b3cce53f19420fde84d7df3c15787`.
- Both retained Rapier adapters create ball, fixed, hinge, rope, slider, and
  suspension joints. The canonical load ramp records 0, 200, 400, and 650 N,
  emits one fixed-joint break at tick 4, and removes it before the tick's
  remaining solver substeps.
- Patch, despawn, and spawn evidence records zero body rebuilds, two joint-only
  rebuilds, monotonic lifecycle observations, and preserved unrelated handles.
  Bounded motor effort, fixed-joint load holding, actionable invalid-motor
  diagnostics, graph budgets, exact break identity/order, and tolerance-bounded
  normalized break loads have focused positive and negative coverage.
- Web runtime tests pass 526/526. Native runtime library tests pass 83/83 and
  physics integration tests pass 23/23. The focused verifier comparator passes
  7/7 and the fixture validates with zero IR diagnostics. The report records
  adapter and dependency versions, platform, seed, timestamps, and hashes for
  both retained trace artifacts.
- Independent checkpoint review reports PASS after confirming manifest-owned
  fixed-pose bounds, capped suspension motors, honest load-parity scope,
  one-shot deferred breaking, joint-only reconciliation, descriptor ownership,
  complete evidence metadata, and matching retained artifact hashes.

### Phase 6 evidence (checkpoint PASS)

- Seeded primitive and imported/convex fracture inputs now bake byte-stable
  manifests with stable piece/bond IDs. The compiler validates and copies every
  referenced durable `content/fractures/*.json` manifest into its bundle path.
- IR validation rejects disconnected graphs, invalid collider/pose/threshold
  values, non-unit mass fractions, unsafe references, excessive hierarchy, and
  piece/activation/pool budgets with actionable paths and suggestions.
- `tn physics fracture generate|inspect|validate` owns the reusable CLI path;
  the focused cookbook entry generates, attaches, validates, and builds a
  destructible wall successfully.
- Both adapters now map stable fracture pieces into their existing retained
  Rapier world, retire intact collision, preserve unrelated regional pieces,
  conserve authored assembly mass and inherited momentum, retain stable body
  handles, and translate solver contact impulses into same-tick bond damage
  with stable contact IDs and nearest-region bond selection.
  The production web host loads fracture manifests through its existing bundle
  reader and automatically registers/reconciles authored Destructible entities.
- `pnpm verify:focused verify:advanced-physics-destruction` passes with zero
  diagnostics. Its catalog-owned fixture compares exact impact event order,
  bond/piece IDs, regional isolation, physical lifecycle, manifest-owned mass
  and momentum tolerances, overflow policy/events, paired provenance, and stale
  or weakened evidence controls. The report and normalized traces are under
  `tools/verify/artifacts/advanced-physics/phase-6-destruction/`.
- The implementation-review remediation in
  `docs/audits/advanced-physics-prd-implementation-review-2026-07-22.md`
  closes every reported destruction, contract, and debug-semantic finding.
  Adapter traces now load and hash their own fixture bytes, referenced
  manifests and canonical source hashes fail closed, and descriptor-owned
  field consumers guard both adapters.
- Web runtime tests pass 543/543. Native destruction integration tests pass
  13/13 and native debug integration tests pass 5/5. The IR suite passes
  416/416, authoring passes 142/142, and compiler passes 293/293.
- The retained `examples/destruction-range` projectile scenario passes on web
  and graphical desktop. It captures labeled damage-only, east-region-active,
  and bounded-cleanup frames on each target plus a combined contact sheet at
  `examples/destruction-range/artifacts/playtest/destruction-range-projectile-threshold/contact-sheet.png`.
- The hash-bound checkpoint report beside that contact sheet records web
  telemetry ticks 26/42/122 and desktop ticks 17/33/113. On both targets the
  first checkpoint reduces only `bond.north` with zero allocated pieces; the
  second breaks `bond.east` and activates only northeast/southeast; the final
  checkpoint records those two pieces sleeping under the 2/4 allocation bound.
- Verification fixed three native proof-boundary defects exposed by the
  graphical run: physics-only bundles now install the fixed loop, sleeping
  joint-connected debris no longer violates Rapier island invariants, and the
  proof harness exits through `AppExit::Success`. Native proof readiness now
  samples normalized physics debug on the scripted runtime's main thread.
- Independent remediation review reports **PASS** after checking all six
  checkpoint images, every report hash, the raw web/native debug series, both
  `TN_PLAYTEST_OK` summaries, the native sampling owner, and 51 focused
  CLI playtest/artifact/schema tests.

### Phase 7 evidence (checkpoint PASS)

- The retained authoring/debug review at
  `docs/audits/advanced-physics-phase-7-authoring-review-2026-07-22.md`
  records the initial independent rejection, bounded remediation, and final
  PASS. The retained report is
  `tools/verify/artifacts/advanced-physics/phase-7-authoring-debug/verification-report.json`
  with SHA-256
  `b9ecd70f49b5a56d5bed6831174351040ebca750abe48fb0d20bed773904987a`.
- `packages/authoring/src/advancedPhysicsOperations.test.ts` passes all seven
  current tests for dry-run/atomic apply, descriptor-derived CLI/editor/API
  metadata, actionable rejection/fix round trips, scoped validation, generated
  transform ownership, and compact prefab references.
- The current editor panel tests pass both registry-category and deterministic
  toggle/filter cases; the current web debug suite passes four bounded summary,
  destruction-piece, center-of-mass, and normalized primitive cases; and the
  paired debug evidence suite passes all four ownership, identity, missing-
  category, and mismatch controls.
- The retained manual editor frame has SHA-256
  `cfa1dd457c0f84965470471503707e3812342156261704b270f6ce890b3595ee`.
  Its paired web/desktop observations retain identical bad front-left
  suspension and over-stressed joint-load identities, every descriptor-owned
  category, and bounded deep telemetry.
- `pnpm verify:cookbook` passes with zero diagnostics, including executable
  advanced-aerodynamics and destruction authoring entries derived from the
  public operation descriptors.

### Phase 8 evidence (automated, manual, and independent checkpoints PASS)

- The initial prototypes predated valid production plans and are retained
  honestly at checkpoint `3ae94543`. Commit `67ec38c8` then establishes three
  fresh machine plans before any further implementation mutation, with
  plan-artifact SHA-256 values
  `48c6970fb06c0ac948b45d6ed8b34a645ca8322a10038aa255d6a9ede6908825`
  (vehicle),
  `87f2221c7cbb0fae4aae897d1e9eb076c49f31d22b954f3ed4dd7bad3e8053a1`
  (flight), and
  `8de4b4b6c0b0fdebc109c0cd5814d8ec7f692e91961c5772bc1a7342df15ffbd`
  (destruction). `tn authoring inspect` resolved the actual durable owners;
  mismatched starter recipes were not applied. Commits `cfc72c51`,
  `c8f8f7a5`, and `8f92d433` then reimplement the objective owners and causal
  controls after that chronological boundary.

- `pnpm verify:focused verify:advanced-physics-major-games` passes its
  release-enrolled descriptor with zero diagnostics. The aggregate report at
  `tools/verify/artifacts/advanced-physics/phase-8-major-games/verification-report.json`
  has SHA-256
  `6b4d7fc4d4d419f7810acd179ed24e50e77fa86188be6ecfd4bddef7b0099a82`,
  schema `0.1.0`, tolerance registry `0.4.0`, and both automated and manual
  checkpoint status `PASS`.
- Five current proof pairs pass from exact matching source/bundle hashes:
  vehicle objective and no-throttle causal control, flight objective, and
  destruction threshold plus retry. The report hash-binds all ten summaries.
  Current source hashes are
  `ad824c59c8ecde9bd337083e5eef3fa4b16bceeb3071cef45ff3f904d4b4b585`
  for vehicle,
  `08ffb5fab9eca6862def6dcc82528d4da92ace069ffc2eb30ab885a9ab73a733`
  for flight, and
  `a24475ea08ef8160e2e35e7a3eae7874e4c8feebaeb02c6faf6e6b4a2dbf9ba2`
  for destruction.
- The exact workload runs 3,600 fixed samples over 60 seconds with 16
  four-wheel vehicles, 128 debris bodies, 256 compound children, and 64
  projectiles. Web records p50/p95/max
  `8.685/9.887/14.299 ms`; desktop records
  `0.541/0.703/1.112 ms`. Both remain within the Section 2.3 budgets and
  record body, contact, query, allocation, system, hardware, browser,
  dependency, platform, and release-profile metadata.
- Manual review is bound to the current finish, landed, and settled screenshots
  plus a current contact sheet. Current graphical desktop summaries prove each
  objective/retry loop with exact semantic-state agreement; desktop screenshots
  remain an explicit proof-harness limitation and are not mislabeled as web
  captures.
- Final verification passes: `pnpm verify:conformance`;
  `pnpm test:gameplay` under Xvfb with the feature-matched release binary;
  `pnpm verify:gameplay-parity` full profile; `pnpm verify:cookbook`; and
  `pnpm check:docs`. Full gameplay parity reports PASS; its three diagnostics
  are warnings from the explicitly quarantined/calibrating humanoid ramp and
  stair cases, while every enforced case passes.
- The registered gate rejects stale, missing, weakened, or single-adapter
  evidence; validates exact workload and telemetry counts; recursively
  discovers scenario summaries below descriptive artifact folders; and records
  complete Section 6.3 aggregate metadata and artifact hashes.
- Final independent closure review reports **PASS** after auditing the full
  prototype -> plan -> reimplementation history, all current proof hashes, the
  release-enrolled example registry, the feature-matched CEF gameplay result
  (15/15 assertions, zero diagnostics, 46.974 seconds), status truth, and every
  explicit unsupported boundary.
