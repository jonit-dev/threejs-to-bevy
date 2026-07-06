---
id: kinematic-hazard
goal: Add a moving hazard body with visible authored geometry and collider metadata.
category: physics
scriptPath: src/scripts/player.ts
surfaces:
  - hazard
  - physics
---

## commands
```bash
tn scene add-prefab arena prefab.hazard --primitive box --color "#ff3355" --project . --json
tn scene add-entity arena hazard.01 --prefab prefab.hazard --project . --json
tn scene set-transform arena hazard.01 --position 0,0.35,-1.2 --project . --json
tn physics add-rigid-body arena hazard.01 --kind kinematic --project . --json
tn physics add-collider arena hazard.01 --kind box --size 0.8,0.4,0.4 --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"hazard.01 is visible, kinematic, and collidable."}
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

export function kinematicHazard(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
