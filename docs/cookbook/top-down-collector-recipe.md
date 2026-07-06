---
id: top-down-collector-recipe
goal: Start a collectible game from the maintained top-down collector recipe.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - collectible
  - recipe
---

## commands
```bash
tn recipe top-down-collector --scene arena --player player --camera camera.main --dry-run --project . --json
```

## source-delta
```json
{"recipe":"Dry-run gives the exact operation plan, source owners, generated ids, and proof commands."}
```

## script
```ts
import { Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vec3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}

export function topDownCollectorSystem(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
