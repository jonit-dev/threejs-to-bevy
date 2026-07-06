---
id: lane-runner-spawn
goal: Use the maintained lane-runner recipe as the starting point for lane spawning.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - lanes
  - spawn
  - recipe
---

## commands
```bash
tn recipe lane-runner --scene arena --player player --camera camera.main --dry-run --project . --json
```

## source-delta
```json
{"recipe":"Dry-run first, inspect generated ids/proof commands, then apply with the same arguments."}
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

export function laneRunnerSystem(): void {}
```

## proof
```bash
tn playtest --project . --suggest-scenario smoke-movement --json
```
