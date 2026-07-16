---
id: spatial-grid-objective-recipe
goal: Apply the complete discrete grid, push, occupancy objective, win, and retry composition when semantic coverage is exact.
category: gameplay
scriptPath: src/scripts/spatialRecipeNote.ts
surfaces:
  - input
  - transform
  - objective
  - ui
  - retry
keywords:
  - spatial grid objective
  - push crates onto goals
  - semantic recipe
---

## commands
```bash
tn game plan --goal "grid puzzle where a player pushes crates onto goals" --project . --json
tn recipe apply spatial-grid-objective --project . --json
```

The recipe is admitted only when the plan covers discrete grid movement,
blocked cells, push interaction, occupancy progress and win, plus retry. A grid
or pressure-plate game without pushing should compose `grid-step` and
`occupancy-objective` directly. Physics knockdown stays on its physics-target
path.

## source-delta
```json
{"content/mechanics/grid-step.mechanic.json":"The recipe composes descriptor-owned grid-step, push-interaction, and occupancy-objective blocks in one publication."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function spatialRecipeNote(context: ScriptContext): void {
  if (context.input.pressed("retry")) {
    context.resources.patch("SpatialObjective", { progress: 0, won: false });
  }
}
```

Customize bounds, blocked cells, counts, prefixes, and subject tags through the
individual block commands. Behavior remains owned by `src/scripts/spatial.ts`;
systems and UI remain sibling documents. Remove the entire generated
composition with `tn recipe remove spatial-grid-objective --project . --json`.

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn iterate --project . --json
```

Run the three emitted block playtests and repeat the release scenario with
`--target desktop` before making a cross-runtime claim.
