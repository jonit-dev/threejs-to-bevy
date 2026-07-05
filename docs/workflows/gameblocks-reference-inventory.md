# GameBlocks Reference Inventory

ThreeNative reviewed `xt4d/GameBlocks` at commit
`ba678d6b82890d151cc839c090fda8ef883c0184` as portable gameplay-design
source material. GameBlocks is MIT licensed; ThreeNative does not vendor it as
a runtime dependency and does not copy its Three.js, Rapier, DOM, localStorage,
timer, filesystem, or renderer-object modules into generated game source.

## Promoted Semantics

| GameBlocks area | ThreeNative-owned contract |
| --- | --- |
| `math/WorldBasis.js` | `BasisEx` plain-data axis descriptors, planar conversion, yaw helpers, and handedness validation. |
| World-cardinal character motion | `ControllerEx.worldCardinalCharacter` pure reducer over input axes, `dt`, pose, velocity, speed, turn rate, gravity, and jump intent. |
| Position-follow camera rigs | `camera.position-follow` gameplay block metadata over existing `CameraMath` source-owned poses. |
| Checkpoint/lap gameplay | `CheckpointRaceEx` plain reducer with deterministic checkpoint, lap, finish, reset, and event ordering. |
| Spawn-area sampling | `SpawnEx` rect, circle, polygon, and segment-corridor regions with blocked-region rejection and deterministic seeded sampling. |

## Rejected Or Deferred Areas

| GameBlocks area | Decision |
| --- | --- |
| Three.js meshes, materials, lights, and render factories | Rejected. ThreeNative source documents own scene, material, lighting, and asset data. |
| Rapier kinematic/dynamic collision solvers and vehicle wheel physics | Deferred to physics PRDs; no backend solver semantics are promoted here. |
| DOM HUDs and localStorage settings | Rejected. Retained UI and explicit persistence contracts own these surfaces. |
| Runtime camera, renderer, filesystem, worker, timer, and platform handles | Rejected at scripting/compiler boundaries. |
| Arbitrary terrain mesh collision and dynamic vehicle drivetrain behavior | Non-goal for this PRD. |

## Planning Blocks

`tn game plan --json` emits ThreeNative-owned `gameplayBlocks` descriptors such
as `basis.y-up-z-forward`, `controller.world-cardinal-character`,
`camera.position-follow`, `objective.checkpoint-lap`, and
`spawn.region-sampler`. These rows are planning guidance and proof metadata;
durable behavior still lives in `src/scripts/**/*.ts`, with structured source
documents referencing the script module/export.

## License Handling

The implementation is behavioral reimplementation over plain tuples and JSON
objects. If a future change copies non-trivial GameBlocks source text, preserve
the MIT license notice in the copied/adapted file or an adjacent attribution
note.
