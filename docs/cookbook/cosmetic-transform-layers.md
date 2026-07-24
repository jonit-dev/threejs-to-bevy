---
id: cosmetic-transform-layers
goal: Add a visual bank or bob without replacing an entity's authored or simulated pose.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - transform
keywords:
  - cosmetic offset
  - local transform
  - visual bank
  - authored rotation
---

## commands
```bash
tn scene set-transform arena player --position 0,0.5,0 --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"The durable Transform remains the authored/simulated pose; CosmeticTransform is a separately declared runtime write."}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["CosmeticTransform"] },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    if (player === undefined) return;
    const bank = context.input.getAxis("MoveX") * 0.12;
    player.transform().setLocalOffset({
      rotation: [0, 0, Math.sin(bank / 2), Math.cos(bank / 2)],
    });
  },
);
```

## proof
```bash
tn authoring validate --project . --json
```
