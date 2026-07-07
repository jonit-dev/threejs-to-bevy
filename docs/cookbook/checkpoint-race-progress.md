---
id: checkpoint-race-progress
goal: Plan checkpoint race progress with the maintained vehicle recipe metadata.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - checkpoint
  - vehicle
  - recipe
---

## commands
```bash
tn recipe vehicle-checkpoint --scene arena --vehicle player --camera camera.main --dry-run --project . --json
```

## source-delta
```json
{"recipe":"Use dry-run proofCommands and generatedIds before applying vehicle-checkpoint source changes."}
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

export function vehicleCheckpointSystem(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
