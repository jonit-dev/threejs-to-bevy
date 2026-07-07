---
id: follow-camera
goal: Make the camera follow the player through authored camera metadata.
category: camera
scriptPath: src/scripts/player.ts
surfaces:
  - camera
  - player
---

## commands
```bash
tn scene set-camera arena camera.main --mode third-person-follow --target player --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"camera.main uses third-person-follow and targets player."}
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
```

## proof
```bash
tn playtest --project . --scenario playtests/camera-follow.playtest.json --stable-artifacts --json
```
