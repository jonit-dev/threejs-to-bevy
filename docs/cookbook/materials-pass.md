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
tn material create mat.shader.cookbook --project . --json
tn material set mat.shader.cookbook --shader-json '{"inputs":["uv0"],"outputs":["baseColor"],"uniforms":[{"name":"tint","type":"color","default":"#2f80ed"}],"program":{"language":"threenative-shader-v1","fragment":{"outputs":{"baseColor":{"kind":"uniform","uniform":"tint"}}}}}' --project . --json
```

## source-delta
```json
{"content/materials/*.json":"mat.cookbook declares base color and roughness in durable material source; mat.shader.cookbook declares a portable shader material through shader JSON."}
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
tn authoring validate --project . --json
tn build --project . --json
```
