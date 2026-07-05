# @threenative/script-stdlib

Portable helpers available to authored game scripts.

## Rigs

Use `CharacterRig.update(context, entity, options)` for common third-person
locomotion wiring. It reads input axes, stores smoothing state in
`context.state("tn.characterRig." + entityId, ...)`, calls
`context.character.move` with direct `direction` and `speed`, writes the entity
pose, and plays optional idle/walk/run clips.

Use `CameraRig.thirdPerson(context, options)` for a smoothed follow camera. It
stores follow/yaw state in `context.state("tn.cameraRig." + cameraId, ...)` and
sets the camera pose directly.

Use `TriggerEx.entered(context, sensor, options)` for persistent trigger
overlaps that should fire once per entrant. It consumes
`context.physics.sensor(...)`, stores the active occupant set in
`context.state(...)`, and can filter occupants by component or collider layer.
`TriggerEx.cooldown(context, key, seconds)` provides the matching state-backed
cooldown gate.

Use `KinematicMoverEx.sweep(context, entity, options)` for sine-wave platform or
hazard motion. It writes the entity pose and patches `RigidBody.velocity` with
the derivative velocity for runtime collision response.

Use `RespawnEx.reset(context, entity, options)` for checkpoint/fail-state reset
logic. It restores pose, patches requested components, and updates named
resources through `context.resources.set(...)`.

These helpers are mirrored in `SCRIPT_STDLIB_BUNDLE_SOURCE`; package tests
assert typed/bundled parity.
