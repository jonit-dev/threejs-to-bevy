---
id: materials-pass
goal: Add an authored material pass instead of relying on flat default colors.
category: visuals
scriptPath: src/scripts/player.ts
surfaces:
  - material
  - visual
---

## commands
```bash
tn material create mat.cookbook --project . --json
tn material set mat.cookbook --color blue --roughness 0.65 --metalness 0 --project . --json
```

## source-delta
```json
{"content/materials/*.json":"mat.cookbook declares base color and roughness in durable material source."}
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
