---
id: mobile-hud-fit
goal: Constrain HUD layout so it remains readable on mobile screenshots.
category: ui
scriptPath: src/scripts/player.ts
surfaces:
  - hud
  - mobile
---

## commands
```bash
tn ui set-layout hud countdown --top 32 --width 390 --project . --json
```

## source-delta
```json
{"content/ui/hud.ui.json":"countdown is constrained to a mobile-width layout budget."}
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
tn screenshot --project . --url <preview-url> --out artifacts/game-production/mobile-viewport.png --viewport mobile --wait-ready --json
```
