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
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}

export function triggerZoneWin(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
