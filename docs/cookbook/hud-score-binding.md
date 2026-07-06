---
id: hud-score-binding
goal: Bind a retained HUD text node to a source-owned score resource.
category: ui
scriptPath: src/scripts/player.ts
surfaces:
  - hud
  - resource
---

## commands
```bash
tn ui add-text hud score --text Score --project . --json
tn ui bind hud score --resource GameState.score --project . --json
```

## source-delta
```json
{"content/ui/hud.ui.json":"score text node binds to GameState.score."}
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
  context.resources.set?.("GameState", { countdown: "Score", score: 0 });
}
```

## proof
```bash
tn playtest --project . --scenario playtests/hud-resource.playtest.json --stable-artifacts --json
```
