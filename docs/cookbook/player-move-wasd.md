---
id: player-move-wasd
goal: Add source-authored WASD and arrow-key horizontal movement to the player.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - input
  - script
---

## commands
```bash
tn input add-axis arena MoveX --negative-keys KeyA,ArrowLeft --positive-keys KeyD,ArrowRight --project . --json
```

## source-delta
```json
{"content/input/arena.input.json":"MoveX maps keyboard controls; script reads context.input.getAxis(\"MoveX\")."}
```

## script
```ts
import { Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    const moveX = context.input.getAxis("MoveX");
    transform.position = Vec3.add(transform.position, [moveX * context.time.fixedDelta * 2.4, 0, 0]);
  }
}
```

## proof
```bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
```
