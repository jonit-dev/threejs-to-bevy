# Physics Status

Physics is authored through portable source components and runtime services, not
runtime-specific gameplay source.

Current support:

- RigidBody, Collider, physics materials, character controller, primitive body,
  trigger/sensor, kinematic mover, and bounded native proof paths.
- Compiler-emitted heightfield collider descriptors exist for structured JSON
  terrain heightmaps, and the web runtime feeds those descriptors into its
  static terrain collision path; Bevy runtime heightfield collision remains a
  PRD-006 follow-up before promotion.
- Gameplay with physical contact must author physics metadata up front and then
  prove movement/contact behavior with playtests.
- Humanoid course web and desktop playtests are the current high-signal
  character/control proof.

Verification:

- `pnpm verify:conformance`
- `pnpm verify:physics-self-verification`
- `tn playtest --target desktop ...`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
