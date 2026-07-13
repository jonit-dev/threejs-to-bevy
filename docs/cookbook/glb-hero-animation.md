---
id: glb-hero-animation
goal: Inspect catalog-backed hero model choices and declare intended animation clips.
category: assets
scriptPath: src/scripts/player.ts
surfaces:
  - hero
  - animation
  - asset
keywords:
  - glb
  - hero
  - character
  - animation
  - clip
  - model
  - catalog
---

## commands
```bash
tn asset source search --game-category humanoid --format glb --direct-only --json
```

## source-delta
```json
{"asset-selection":"After choosing a catalog GLB, add it with tn asset add and declare clips with tn animation add-clip."}
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
tn asset inspect assets --recursive --json
tn model-test assets/hero.glb --out artifacts/model-test --verify --json
```
