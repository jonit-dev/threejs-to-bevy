---
id: hud-score-binding
goal: Bind a retained HUD text node to a source-owned score resource.
category: ui
scriptPath: src/scripts/player.ts
surfaces:
  - hud
  - resource
keywords:
  - score
  - hud
  - text
  - binding
  - resource
  - ui
  - effect
  - highlight
---

## commands
```bash
tn ui add-text hud score --text Score --project . --json
tn ui bind hud score --resource GameState.score --project . --json
```

## source-delta
```json
{"content/ui/hud.ui.json":"score text binds to GameState.score and uses a predicate-triggered glow with an explicit shadow fallback."}
```

When no bounded `tn ui` mutation covers an effect preset yet, add the preset
to the structured node and keep the fallback explicit:

```json
{
  "id": "score",
  "type": "text",
  "text": "Score 0",
  "effects": [
    {
      "id": "score.active",
      "kind": "glow",
      "trigger": "predicate",
      "predicate": { "resource": "GameState", "field": "scoreActive", "equals": true },
      "color": "#ffd166",
      "radius": 8,
      "intensity": 0.7,
      "fallback": "shadow"
    }
  ]
}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", resourceReads: ["GameState"], resourceWrites: ["GameState"], writes: ["Transform"] },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    if (player === undefined) return;
    const position = player.transform().position;
    const delta = context.time.fixedDelta * 2.4;
    player.transform().setPosition([
      position[0] + context.input.getAxis("MoveX") * delta,
      position[1],
      position[2] + context.input.getAxis("MoveZ") * delta,
    ]);
    const state = context.resources.get("GameState", { score: 0 });
    context.resources.patch("GameState", { score: state.score, scoreActive: state.score > 0, scoreText: `Score ${state.score}` });
  },
);
```

## proof
```bash
tn playtest --project . --scenario playtests/hud-resource.playtest.json --stable-artifacts --json
```
