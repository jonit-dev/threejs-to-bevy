---
id: player-move-wasd
goal: Add source-authored WASD and arrow-key horizontal movement to the player.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - input
  - script
keywords:
  - move
  - movement
  - wasd
  - keyboard
  - walk
  - run
  - input
blocks:
  - controller.*
---

## commands
```bash
tn input add-axis arena MoveX --negative-keys KeyA,ArrowLeft --positive-keys KeyD,ArrowRight --project . --json
tn input add-axis arena MoveZ --negative-keys KeyS,ArrowDown --positive-keys KeyW,ArrowUp --project . --json
```

## source-delta
```json
{"content/input/arena.input.json":"MoveX maps keyboard controls; script reads context.input.getAxis(\"MoveX\")."}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
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
```

## proof
```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
```
