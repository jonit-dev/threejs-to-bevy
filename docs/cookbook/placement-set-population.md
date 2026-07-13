---
id: placement-set-population
goal: Author and inspect a deterministic prefab population without duplicating expanded entities.
category: authoring
scriptPath: src/scripts/player.ts
surfaces:
  - scene
  - prefab
  - placement
keywords:
  - placement
  - prefab
  - population
  - spawn
  - line
  - grid
  - inspect
---

## commands
```bash
tn scene placement add arena goal-row --placement '{"prefab":"prefab.goal","idFormat":"goal.row.{column}","pattern":{"kind":"line","origin":[-1,0.3,-1],"step":[1,0,0],"count":2},"defaults":{"transform":{"scale":[0.45,0.45,0.45]}}}' --project . --json
tn scene placement inspect arena goal-row --expand --project . --json
```

`scene placement migrate` is always a dry run. It reports `exactMatch`,
`matchedIds`, and every generated ID without writing source. Use the same
reviewed `--placement` payload with `scene placement apply` only after the dry
run reports an exact semantic match. Apply refuses partial matches, removes
only exactly equivalent explicit entities, and then writes the placement set.

```bash
tn scene placement migrate arena goal-row --placement '<reviewed-json>' --project . --json
tn scene placement apply arena goal-row --placement '<same-reviewed-json>' --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":{"placementSets":[{"id":"goal-row","kind":"placement-set","prefab":"prefab.goal","idFormat":"goal.row.{column}","pattern":{"kind":"line","origin":[-1,0.3,-1],"step":[1,0,0],"count":2},"defaults":{"transform":{"scale":[0.45,0.45,0.45]}}}]}}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", reads: ["Transform"] },
  (context: ScriptContext): void => {
    context.entity("goal.row.0")?.transform().position;
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
