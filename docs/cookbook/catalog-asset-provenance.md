---
id: catalog-asset-provenance
goal: Search the bundled asset catalog before using web search or primitives.
category: assets
scriptPath: src/scripts/player.ts
surfaces:
  - provenance
  - asset
---

## commands
```bash
tn asset source search --game-category racing --format glb --direct-only --json
```

## source-delta
```json
{"provenance":"Preserve catalog id, source URL, origin, license posture, and conversion notes next to committed assets."}
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
```

## proof
```bash
tn asset source get <asset-source-id> --json
tn asset inspect assets/<model>.glb --json
```
