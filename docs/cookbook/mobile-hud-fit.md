---
id: mobile-hud-fit
goal: Constrain HUD layout so it remains readable on mobile screenshots.
category: ui
scriptPath: src/scripts/player.ts
surfaces:
  - hud
  - mobile
keywords:
  - mobile
  - responsive
  - hud
  - layout
  - screenshot
  - safe area
---

## commands
```bash
tn ui set-layout hud countdown --top 32 --width 390 --project . --json
```

## source-delta
```json
{"content/ui/hud.ui.json":"countdown uses target-specific layout and visual style overrides for a mobile-width layout budget."}
```

```json
{
  "id": "countdown",
  "type": "text",
  "text": "Ready",
  "responsive": [
    {
      "target": "mobile",
      "layout": { "left": 12, "top": 16, "width": 280 },
      "style": { "fontSize": 18, "opacity": 0.9 }
    }
  ]
}
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
tn screenshot --project . --url <preview-url> --out artifacts/game-production/mobile-viewport.png --viewport mobile --wait-ready --json
```
