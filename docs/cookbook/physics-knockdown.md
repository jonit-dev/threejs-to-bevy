---
id: physics-knockdown
goal: Add a dynamic target body for knockdown or push mechanics.
category: physics
scriptPath: src/scripts/player.ts
surfaces:
  - target
  - physics
---

## commands
```bash
tn scene add-prefab arena prefab.target --primitive box --color "#f97316" --project . --json
tn scene add-entity arena target.01 --prefab prefab.target --project . --json
tn scene set-transform arena target.01 --position -1,0.4,-1 --project . --json
tn physics add-rigid-body arena target.01 --kind dynamic --mass 1 --project . --json
tn physics add-collider arena target.01 --kind box --size 0.5,0.5,0.5 --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"target.01 is a dynamic rigid body with a box collider."}
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

export function physicsKnockdown(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
