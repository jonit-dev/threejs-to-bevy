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
  character/control proof.
- Native Rapier now preserves authored quaternion/angular-velocity state,
  rotation-axis constraints, and sensor-only collider semantics. The web
  adapter retains its Rapier world across unchanged fixed steps and explicitly
  frees it with the runtime lifecycle; focused coverage guards topology reuse.

Verification:

- `pnpm verify:conformance`
- `pnpm verify:physics-self-verification`
- `tn playtest --target desktop ...`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
