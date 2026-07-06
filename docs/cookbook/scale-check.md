---
id: scale-check
goal: Inspect relative scale before changing object sizes for readability.
category: proof
scriptPath: src/scripts/player.ts
surfaces:
  - scale
  - proof
---

## commands
```bash
tn scene inspect arena --project . --json
```

## source-delta
```json
{"scale-policy":"Use scene/game scale evidence before inflating a hero, vehicle, obstacle, or reward."}
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
```

## proof
```bash
tn game scale --project . --json
```
