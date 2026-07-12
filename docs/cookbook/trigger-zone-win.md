---
id: trigger-zone-win
goal: Turn an objective entity into a trigger zone for win detection.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - trigger
  - objective
  - physics
---

## commands
```bash
tn physics add-collider arena goal --kind box --size 0.8,0.8,0.8 --trigger true --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"goal receives a trigger collider for script-visible overlap checks."}
```

## script
```ts
import { TriggerEx, defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    if (player === undefined) return;
    const position = player.transform().position;
    const delta = context.time.fixedDelta * 2.4;
    player.transform().setPosition([
      position[0] + context.input.getAxis("MoveX") * delta,
      position[1],
      position[2] + context.input.getAxis("MoveZ") * delta,
    ]);
  },
);

export const triggerZoneWin = defineBehavior(
  { id: "trigger-zone-win", schedule: "fixedUpdate", resourceWrites: ["GameState"], services: ["physics.sensor"] },
  (context: ScriptContext): void => {
    if (TriggerEx.entered(context, "goal", { component: "Transform" }).length === 0) return;
    context.resources.patch("GameState", { status: "Win", won: true });
  },
);
```

`TriggerEx.entered` is a compatibility wrapper and is deprecated for one
release cycle. New scripts should read the runtime-owned phases directly with
`context.physics.sensor({ sensor: "goal", phases: ["enter"] })` so the same
enter/stay/exit state is shared by every reader in a fixed tick.

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
