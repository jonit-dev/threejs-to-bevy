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
- `CharacterRig.update` can opt into transferring a permitted push trace to a
  dynamic body's velocity while retaining the deterministic pose handoff.
- `CharacterRig.update` supports an opt-in grounded kinematic jump with an
  action binding, authored takeoff speed, portable gravity, held-input
  debouncing, stdlib bundle-equivalence coverage, and desktop transform proof.
- Native Rapier now preserves authored quaternion/angular-velocity state,
  rotation-axis constraints, and sensor-only collider semantics. The web
  adapter retains its Rapier world across unchanged fixed steps and explicitly
  frees it with the runtime lifecycle; focused coverage guards topology reuse.
- `pnpm verify:focused verify:feature-parity-physics-native` aggregates the
  existing physics self-verification and animation/physics residual gates. It
  requires matching web/native material, stack, character-contact, query, and
  bounded mesh traces with compact stable-order sidecars, plus sloped grounding,
  bounded rebake, off-mesh-link, and small-crowd evidence. Full constraint
  solving, vehicles, tire/drivetrain models, soft bodies, ragdolls, arbitrary
  triangle narrow phase, and public backend handles remain explicit boundaries.

Verification:

- `pnpm verify:conformance`
- `pnpm verify:physics-self-verification`
- `pnpm verify:focused verify:feature-parity-physics-native`
- `tn playtest --target desktop ...`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
