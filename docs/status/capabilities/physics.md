# Physics Status

Physics is authored through portable source components and runtime services, not
runtime-specific gameplay source.

Current support:

- RigidBody, Collider, physics materials, character controller, primitive body,
  trigger/sensor, kinematic mover, portable contact layer/mask/material filters,
  contact phase metadata, and bounded native proof paths.
- Compiler-emitted heightfield collider descriptors exist for structured JSON
  terrain heightmaps, and the web runtime feeds those descriptors into its
  static terrain collision path while the Bevy runtime maps generated chunk
  meshes into synthetic Rapier heightfield colliders for native bundle physics.
- Gameplay with physical contact must author physics metadata up front and then
  prove movement/contact behavior with playtests.
- Humanoid course web and desktop playtests are the current high-signal
  character/control proof. The desktop stair scenario now rejects first-riser
  stalls through forward-distance and resolved vertical-displacement checks;
  Bevy's direct and script-host character solvers share leading-edge step
  semantics with web.
- `CharacterRig.update` reports permitted push traces without authoring the
  dynamic body; retained Rapier contact solving exclusively owns its transform
  and velocity, avoiding duplicate pose-and-velocity movement per fixed tick.
- `CharacterRig.update` supports an opt-in grounded kinematic jump with an
  action binding, authored takeoff speed, portable gravity, held-input
  debouncing, stdlib bundle-equivalence coverage, and desktop transform proof.
- Native Rapier now preserves authored quaternion/angular-velocity state,
  rotation-axis constraints, and sensor-only collider semantics. The web
  adapter retains its Rapier world across unchanged fixed steps and explicitly
  frees it with the runtime lifecycle; focused coverage guards topology reuse.
- Compiler emission and native script mutations preserve the complete accepted
  Collider, RigidBody, and PhysicsJoint contract. Collider-only entities become
  adapter-private fixed bodies, authored mass/inverse mass and capsule total
  height map consistently, and native live contacts publish enter/stay/exit.
- Portable runtime gravity and live hinge, slider, and suspension constraints
  are consumed by both Rapier adapters. Joint targets must resolve to another
  rigid-body entity before bundle acceptance.
- Fixed-update scripts execute before physics and may declare bounded dynamic
  body services for force, torque, linear/angular impulse, and linear/angular
  velocity. Authored mutations wake native sleeping bodies and affect the
  current solver tick.
- Phase 1 advanced-physics foundation is promoted on both adapters:
  `CompoundCollider` supports stable child IDs, local poses, child
  material/filter metadata, and bounded box, sphere, capsule, and convex-hull
  children; `physics.addForceAtPoint` and `physics.applyImpulseAtPoint` enter
  the retained solver in the declaring fixed tick; and normalized body/query
  traces identify the exact compound child hit. The paired fixture includes an
  omitted-command causal control plus checked source/bundle provenance.
- Phase 2 promotes bounded raycast-wheel assemblies, named tire curves, and
  deterministic physics surfaces on both adapters. The catalog-owned split
  asphalt/ice fixture proves exact authored wheel order, grounded and surface
  semantics, exact contact presence and IDs, and registry-toleranced full
  chassis pose/velocity plus wheel/contact observations. Paired outcomes prove
  lower ice acceleration, steering yaw/lateral path, and service-brake speed
  reduction with non-driven, non-steering, and non-braked causal controls. Its
  authored chassis-child wheel targets are consumed by both presentation
  adapters with paired suspension position, steering, bounded spin, and
  shortest-arc interpolation observations. Its aggregate report also
  hash-binds the paired traces, debug telemetry, and a reviewed continuous
  asphalt-to-ice browser crossing.
- Phase 3 implements the bounded pre-release vehicle-controller contract on both adapters: engine and
  gearbox curves, clutch and automatic/manual shifting, open/locked/limited-slip
  differential torque paths, steering, service/hand brakes, engine braking,
  ABS/TCS, declarative bindings, and `physics.vehicle.setInputs`. Normalized
  observations publish speed, RPM, gear, clutch/shift state, authored-order
  wheel torque, and assist state. Speed and speed-sensitive steering use Y-up
  ground-plane chassis velocity, excluding vertical suspension and landing
  velocity. Paired traces, browser review, and real web/graphical-desktop
  playtests pass; release enrollment remains deferred to the final PRD phase.
- Phase 4 implements bounded pre-release aerodynamics on both adapters:
  quadratic body drag, lift/drag curves, control surfaces and stall, force and
  torque thrusters with fuel hooks, deterministic box/sphere wind volumes,
  density overrides, and `physics.aerodynamics.setInputs`. Paired traces prove
  analytic behavior and numeric parity; real web/graphical-desktop flights and
  a hash-bound browser review prove takeoff, gust response, stall/recovery,
  landing, force telemetry, and fresh retry. Release enrollment remains
  deferred to the final PRD phase.
- Phase 5 implements the bounded pre-release rich-joint contract on both
  adapters: ball, fixed, hinge, rope, slider, and suspension constraints;
  force/torque-capped motors; stable load observations; one-shot breaks with
  next-tick solver removal; and joint-only patch/despawn/spawn reconciliation.
  Paired retained-Rapier traces prove the declared load threshold, exact break
  identity/order, lifecycle bounds, zero body rebuilds, and preserved unrelated
  handles. Release enrollment remains deferred to the final PRD phase.
- Phase 6 now has a pre-release destruction contract and paired physical slice:
  compiler/CLI-owned seeded fracture baking emits byte-stable connected piece
  and bond manifests; IR validation enforces collider, mass, hierarchy, and
  activation budgets; and both adapters implement stable once-per-tick damage,
  ordered bond/piece events, overflow policies, cleanup, and pooling. Both
  retained Rapier adapters materialize stable physical pieces, preserve bound
  regions, retire intact collision, inherit motion, and prove mass/momentum,
  contact routing, and paired event/budget parity. Web/desktop projectile
  playtests and manual contact-sheet review remain before the checkpoint passes.
- Phase 7 exposes descriptor-backed add/set/remove/inspect/validate operations
  for compound colliders, wheel assemblies, vehicle controllers, aerodynamic
  bodies, physics joints, and destructibles. The same operation cards derive
  CLI, editor/API, MCP, and generated-client surfaces, while staged batch plans
  provide byte-preserving dry runs and atomic apply.
- Web and native runtime observations now emit the same normalized, stable-ID
  collider, center-of-mass, contact, wheel, suspension, slip, force, aero,
  joint-load, bond, piece, sleep, and budget primitives. Bounded summaries keep
  terminal output compact while deeper artifacts retain timing and body,
  contact, query, solver, rebuild, and allocated-piece telemetry. Cross-adapter
  evidence and the manual editor/debug usability review remain pending.
- Sensor, character, and query snapshots share local/mesh center, rotation,
  symmetric filter, deterministic 16-layer, and normalized-direction rules.
  Phase 1 script raycast, shape-cast, and overlap observations now come from
  retained Rapier; broader rotated-shape coverage and contact-manifold detail
  remain hardening boundaries.
- `pnpm verify:focused verify:feature-parity-physics-native` aggregates the
  existing physics self-verification and animation/physics residual gates. It
  requires matching web/native material, stack, character-contact, query, and
  bounded mesh traces with compact stable-order sidecars, plus sloped grounding,
  bounded rebake, off-mesh-link, and small-crowd evidence. The Phase 1
  `advanced-physics-foundation` row additionally proves at-point causality,
  exact compound-child query identity, stable script-host order, and provenance.
  Release-enrolled drivetrain/controller, aerodynamics, and rich-joint support;
  destruction playability/release enrollment, soft bodies, ragdolls, dynamic triangle compound children,
  arbitrary triangle narrow phase, and public backend handles remain explicit
  boundaries.

Verification:

- `pnpm verify:conformance`
- `pnpm verify:physics-self-verification`
- `pnpm verify:focused verify:advanced-physics-wheels`
- `pnpm verify:focused verify:advanced-physics-drivetrain`
- `pnpm verify:focused verify:advanced-physics-aerodynamics`
- `pnpm verify:focused verify:advanced-physics-joints`
- `pnpm verify:focused verify:advanced-physics-destruction`
- `pnpm verify:focused verify:feature-parity-physics-native`
- `packages/ir/fixtures/conformance/advanced-physics-foundation/`
- `packages/ir/fixtures/conformance/advanced-physics-wheels/`
- `packages/ir/fixtures/conformance/advanced-physics-drivetrain/`
- `packages/ir/fixtures/conformance/advanced-physics-aerodynamics/`
- `packages/ir/fixtures/conformance/advanced-physics-joints/`
- `packages/ir/fixtures/conformance/advanced-physics-destruction/`
- `tn playtest --target desktop ...`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
