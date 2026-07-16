---
id: spatial-grid-mechanics
goal: Compose discrete grid movement, push-only objects, occupancy progress, win, and retry from atomic mechanic blocks.
category: gameplay
scriptPath: src/scripts/spatialCookbookNote.ts
surfaces:
  - input
  - transform
  - objective
  - ui
  - retry
keywords:
  - grid step
  - push interaction
  - occupancy objective
  - pressure plate
---

## commands
```bash
tn add grid-step --actor player --step 1 --bounds "-2,2,-2,2" --project . --json
tn add push-interaction --crate-prefix crate --crate-count 2 --project . --json
tn add occupancy-objective --target-prefix target --target-count 2 --project . --json
```

`grid-step` owns edge-triggered movement, bounds, blocked cells, and retry.
`push-interaction` owns adjacency, push-only movement, and occupied destination
rejection. `occupancy-objective` owns target progress, win state, HUD binding,
and retry integration. For a no-push pressure plate composition, add only
`occupancy-objective` with `--subject-tag player`.

The default push composition places two independently reachable crates and two
matching goals on separate rows. It also authors a visible floor grid and
perimeter walls aligned with `SpatialGrid` bounds. Generated crates use
portable kinematic rigid bodies and box colliders; the floor, perimeter, and
blocked cells use portable static rigid bodies and box colliders. Scripted
grid rules remain the deterministic gameplay owner, while the physics metadata
keeps visible contact surfaces portable across web and desktop.

## source-delta
```json
{"content/scenes/arena.scene.json":"SpatialGrid and SpatialObjective retain configuration while systems and UI remain in sibling owner documents."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function spatialCookbookNote(context: ScriptContext): void {
  if (context.input.pressed("retry")) {
    context.resources.patch("SpatialObjective", { progress: 0, won: false });
  }
}
```

Durable configuration and entities remain in `content/scenes/*.scene.json`.
Input, system, and UI declarations remain in their sibling documents under
`content/input`, `content/systems`, and `content/ui`. Portable behavior is owned
by `src/scripts/spatial.ts`; generated output under `dist` is never edited.

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn playtest --project . --scenario playtests/block-grid-step.playtest.json --stable-artifacts --json
tn playtest --project . --scenario playtests/block-occupancy-objective.playtest.json --stable-artifacts --json
```

The committed grid-step scenario moves the player to the configured boundary,
attempts another step, and proves that the position does not change. The
occupancy scenario pushes both crates onto their goals and requires progress
`2 / 2`, visible board geometry, and both generated crate/goal tag counts.
These project-local scenarios are the durable proof owners. Repeat them with
`--target desktop` before a release claim.
