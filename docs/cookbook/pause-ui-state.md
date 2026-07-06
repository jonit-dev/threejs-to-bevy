---
id: pause-ui-state
goal: Add a retained pause menu state with ordinary editable UI nodes.
category: ui
scriptPath: src/scripts/player.ts
surfaces:
  - pause
  - ui
---

## commands
```bash
tn ui recipe hud pause-menu --id pause --project . --json
```

## source-delta
```json
{"content/ui/hud.ui.json":"pause-menu recipe expands into retained UI nodes and provenance."}
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
tn authoring validate --project . --json
tn build --project . --json
```
