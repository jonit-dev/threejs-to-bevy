# Advanced Vehicle Course Production Plan

Status: reimplemented after the recorded plan boundary and proof-complete on
2026-07-23.

Historical timing note: the required machine-readable plan was mistakenly left
as a blank starter while the first implementation was authored. That prototype
is retained at checkpoint `3ae94543`; it is not represented as plan-first work.

Reimplementation boundary: on 2026-07-23, after checkpointing the inspected
prototype and before any further implementation mutation, `tn game plan` wrote
`artifacts/game-production/plan.json` with SHA-256
`48c6970fb06c0ac948b45d6ed8b34a645ca8322a10038aa255d6a9ede6908825`.
`tn authoring inspect --plan artifacts/game-production/plan.json` then resolved
the actual scene, system, script, and proof owners. The planner's generic
vehicle recipe was not applied because it would replace the inspected
four-wheel advanced-physics ownership with a starter. The final implementation
must instead re-author the durable owners named below and obtain fresh proof.

## Playable Loop

- Controls: `KeyW` throttle, `KeyS` brake, `KeyA`/`KeyD` steering, `KeyR`
  retry.
- Objective: cross the mixed-surface, jump, and damage checkpoints in order,
  then reach the finish.
- Progression: asphalt launch -> asphalt/ice split -> ramp jump -> barrier
  collision/damage -> finish.
- Fail/retry: retry restores the chassis pose, velocities, course state, and
  event history before a fresh launch.
- Feedback: retained HUD state, surface response, jump motion, collision
  damage, finish state, and `goal-ping.wav`.

The positive recorded scenario is
`playtests/vehicle-course.playtest.json`; the causal no-throttle control is
`playtests/no-throttle.playtest.json`. Both are required on web and desktop.

## Reimplementation Owners

- `src/scripts/course.ts`: express ordered mixed-surface, jump, damage,
  finish, and retry milestones as the plan-driven objective loop.
- `content/scenes/arena.scene.json` and
  `content/systems/arena.systems.json`: retain the catalog vehicle and portable
  four-wheel physics while making the objective ownership explicit.
- `playtests/vehicle-course.playtest.json` and
  `playtests/no-throttle.playtest.json`: enroll the positive loop and the
  no-throttle causal control against fresh source and bundle hashes.
- `content/assets/arena.assets.json`, `docs/asset-provenance.md`, and this
  plan: retain the catalog asset choice, no-clip rationale, and scale checks.

## High-value Surfaces

| Surface | Durable owner | Production treatment |
| --- | --- | --- |
| Hero vehicle | `content/assets/arena.assets.json`, `content/scenes/arena.scene.json` | Kenney Racing Kit CC0 race-car GLB with distinct body and four wheel meshes. |
| Obstacles/goal | Same scene and asset documents | Kenney barrier and checkered-finish GLBs; authored collision and checkpoint entities own behavior. |
| Environment | `content/scenes/arena.scene.json` | Authored asphalt, ice, ramp, barriers, lighting, and course landmarks; primitives are limited to intentional physics surfaces. |
| HUD/audio | `content/ui/hud.ui.json`, `content/assets/arena.assets.json` | Retained state feedback and local completion cue. |

Asset provenance, hashes, inspection, and model-test results are recorded in
`docs/asset-provenance.md`.

## Source Ownership

| Behavior | Structured-source owner | Script/export |
| --- | --- | --- |
| Vehicle input and physics | `content/input/arena.input.json`, `content/scenes/arena.scene.json` | Runtime `VehicleController` and `WheelAssembly` components |
| Objective, damage, and retry | `content/systems/arena.systems.json` | `src/scripts/course.ts#updateVehicleCourse` |
| HUD binding | `content/ui/hud.ui.json` | `CourseState` resource |
| Camera and framing | `content/scenes/arena.scene.json` | Portable follow-camera component |

The vehicle starts with the authored Y-up rotation `[0, 1, 0, 0]`, automatic
transmission, and solver-owned motion. Finished state parks the already
qualified vehicle at the finish; it cannot create the prerequisite checkpoint,
jump, or collision events.

## Animation, Scale, and Polish

- The source car has no animation clips; wheel position/steer/spin comes from
  the physics-owned visual targets rather than a canned clip.
- `tn asset inspect` reports a 0.729 x 0.397 x 1.346 source asset with six named
  nodes and 1,430 triangles. Scene scale and collider dimensions make it read
  as a compact race car beside the 3.5 m course width.
- Lighting, finish flag, barrier silhouettes, surface colors, ramp profile, and
  chase framing must remain readable at gameplay distance.
- The real 60-second dense benchmark owns the performance budget; this example
  must not substitute its headless browser cadence for that benchmark.

## Required Proof

```bash
tn authoring validate --project . --json
tn build --project . --json
tn playtest --project . --scenario playtests/vehicle-course.playtest.json --target web --json
tn playtest --project . --scenario playtests/vehicle-course.playtest.json --target desktop --json
tn playtest --project . --scenario playtests/no-throttle.playtest.json --target web --json
tn playtest --project . --scenario playtests/no-throttle.playtest.json --target desktop --json
```

Completion requires exact ordered events
`retry,mixed-surface,jump,collision-damage,finish`, checkpoint `3`, damage
`25`, a real finish state, matching adapter hashes, bounded movement parity,
and a no-throttle run that records no jump or damage.
