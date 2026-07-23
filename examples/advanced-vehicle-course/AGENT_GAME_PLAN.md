# Advanced Vehicle Course Production Plan

Status: implemented and proof-complete on 2026-07-23.

Timing note: the required machine-readable plan was mistakenly left as a blank
starter while the first implementation was authored. The current plan at
`artifacts/game-production/plan.json` was regenerated from the finished durable
source. It is retained as ownership and acceptance evidence, not represented as
proof that the planner command preceded the initial source mutation.

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
