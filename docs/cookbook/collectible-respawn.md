---
id: collectible-respawn
goal: Add a visible collectible prefab and instance that a script can respawn.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - collectible
  - prefab
  - script
---

## commands
```bash
tn scene add-prefab arena prefab.pickup --primitive sphere --color "#f2c94c" --project . --json
tn scene add-prefab-instance arena pickup.01 --prefab prefab.pickup --position 1,0.3,-1 --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"Adds prefab.pickup and pickup.01 at a readable world position."}
```

## script
```ts
import { Vec3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vec3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}

export function collectibleRespawn(): void {}
```

## proof
```bash
tn scene inspect arena --node pickup.01 --project . --json
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
```
