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
- Phase 3 implements the bounded vehicle-controller contract on both adapters: engine and
  gearbox curves, clutch and automatic/manual shifting, open/locked/limited-slip
  differential torque paths, steering, service/hand brakes, engine braking,
  ABS/TCS, declarative bindings, and `physics.vehicle.setInputs`. Normalized
  observations publish speed, RPM, gear, clutch/shift state, authored-order
  wheel torque, and assist state. Speed and speed-sensitive steering use Y-up
  ground-plane chassis velocity, excluding vertical suspension and landing
  velocity. Paired traces, browser review, and real web/graphical-desktop
  playtests pass. The Phase 8 vehicle forcing function adds mixed surfaces,
  ordered checkpoints, collision damage, finish, and fresh retry; its
  plan-first reimplementation has matching current web/desktop objective and
  no-throttle causal proof.
- Phase 4 implements bounded aerodynamics on both adapters:
  quadratic body drag, lift/drag curves, control surfaces and stall, force and
  torque thrusters with fuel hooks, deterministic box/sphere wind volumes,
  density overrides, and `physics.aerodynamics.setInputs`. Paired traces prove
  analytic behavior and numeric parity; real web/graphical-desktop flights and
  a hash-bound browser review prove takeoff, gust response, stall/recovery,
  landing, force telemetry, and fresh retry. The Phase 8 flight forcing
  function repeats that objective loop with a sourced aircraft on web and
  desktop.
- 2026-07-23: the surface angle-of-attack sign was corrected on both adapters
  (positive when the relative wind comes from below, i.e. while sinking). The
  previous sign inverted the lift feedback loop, so any sink reduced lift and
  every aerodynamic body was dynamically unstable regardless of tuning. Both
  runtimes carry a sinking-reads-positive-AoA regression test and the paired
  aerodynamics parity gate passes with the corrected convention.
- Aerodynamic authoring validation now performs a conservative spawn-state
  viability analysis before build: lift versus weight, thrust versus cruise
  drag, combined damping, and stowed-control trim moments report measured,
  actionable diagnostics or an explicit not-applicable reason. This is an
  adapter-independent source check, not a replacement for flight playtests.
- Phase 5 implements the bounded rich-joint contract on both
  adapters: ball, fixed, hinge, rope, slider, and suspension constraints;
  force/torque-capped motors; stable load observations; one-shot breaks with
  same-tick pre-substep solver removal; and joint-only patch/despawn/spawn reconciliation.
  Paired retained-Rapier traces prove the declared load threshold, exact break
  identity/order, lifecycle bounds, zero body rebuilds, and preserved unrelated
  handles.
- Phase 6 has a promoted bounded destruction contract and paired physical slice:
  compiler/CLI-owned seeded fracture baking emits byte-stable connected piece
  and bond manifests; IR validation enforces collider, mass, hierarchy, and
  activation budgets; and both adapters implement stable once-per-tick damage,
  ordered bond/piece events, overflow policies, cleanup, and pooling. Both
  retained Rapier adapters materialize stable physical pieces, preserve bound
  regions, retire intact collision, inherit motion, and prove mass/momentum,
  same-tick contact routing with stable contact/bond identity, and paired
  event/budget/debug parity from independently loaded fixture bytes. The
  retained web/desktop projectile playtests and reviewed contact sheet prove
  damage-only, regional activation, settling, bounded allocation, and retry.
- Phase 7 exposes descriptor-backed add/set/remove/inspect/validate operations
  for compound colliders, wheel assemblies, vehicle controllers, aerodynamic
  bodies, physics joints, and destructibles. The same operation cards derive
  CLI, editor/API, MCP, and generated-client surfaces, while staged batch plans
  provide byte-preserving dry runs and atomic apply.
- Web and native runtime observations emit the same normalized, stable-ID
  collider, center-of-mass, contact, wheel, suspension, slip, force, aero,
  joint-load, bond, piece, sleep, and budget primitives. Bounded summaries keep
  terminal output compact while deeper artifacts retain timing and body,
  contact, query, solver, rebuild, and allocated-piece telemetry. The reviewed
  authoring/debug workflow uses the same hash-matched web/desktop observations
  to identify a bad wheel attachment and an over-stressed joint; the editor
  exposes category toggles that filter the production snapshot.
- Descriptor-owned field consumers now guard every public top-level advanced-
  physics field in both adapters. Native controller bindings consume the same
  action/axis vocabulary as web, including bounded single-edge manual shifts.
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
- Phase 8 owns the descriptor-derived
  `verify:advanced-physics-major-games` gate and three structured-source
  vehicle, flight, and destruction examples. Their plan-first reimplementations
  have five current matching web/desktop proof pairs, a hash-bound manual
  playability and visual review, and the exact 60-second dense workload on both
  adapters. The release-enrolled gate passes automated and manual checkpoints;
  the retained report records complete source, bundle, adapter, environment,
  timing, and artifact hashes.
- Soft bodies, fluids, runtime mesh cutting, ragdolls, dynamic triangle
  compound children, arbitrary triangle narrow phase, and public backend
  handles remain explicit unsupported boundaries.

Verification:

- `pnpm verify:conformance`
- `pnpm verify:physics-self-verification`
- `pnpm verify:focused verify:advanced-physics-wheels`
- `pnpm verify:focused verify:advanced-physics-drivetrain`
- `pnpm verify:focused verify:advanced-physics-aerodynamics`
- `pnpm verify:focused verify:advanced-physics-joints`
- `pnpm verify:focused verify:advanced-physics-destruction`
- `pnpm verify:focused verify:advanced-physics-major-games`
- `pnpm verify:focused verify:feature-parity-physics-native`
- `packages/ir/fixtures/conformance/advanced-physics-foundation/`
- `packages/ir/fixtures/conformance/advanced-physics-wheels/`
- `packages/ir/fixtures/conformance/advanced-physics-drivetrain/`
- `packages/ir/fixtures/conformance/advanced-physics-aerodynamics/`
- `packages/ir/fixtures/conformance/advanced-physics-joints/`
- `packages/ir/fixtures/conformance/advanced-physics-destruction/`
- `tn playtest --target desktop ...`
- `tools/verify/artifacts/advanced-physics/phase-8-major-games/verification-report.json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
