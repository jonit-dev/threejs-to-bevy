---
id: top-down-collector-recipe
goal: Start a collectible game from the maintained top-down collector recipe.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - collectible
  - recipe
---

## commands
```bash
tn game plan --goal "small arena collectible game" --project . --apply --json
tn recipe top-down-collector --scene arena --player player --camera camera.main --dry-run --project . --json
```

## source-delta
```json
{"recipe":"Use game plan --apply for the scaffold-first baseline; dry-run the recipe when inspecting generated ids, source owners, and proof commands before a manual apply."}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["Transform"] },
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
  },
);

export const topDownCollectorSystem = defineBehavior(
  { id: "top-down-collector", schedule: "fixedUpdate" },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    const pickup = context.entity("coin.01");
    if (player === undefined || pickup === undefined) return;
    const playerPosition = player.transform().position;
    const pickupPosition = pickup.transform().position;
    const dx = playerPosition[0] - pickupPosition[0];
    const dz = playerPosition[2] - pickupPosition[2];
    if (pickupPosition[1] >= -10 && dx * dx + dz * dz < 0.36) {
      pickup.transform().setPosition([pickupPosition[0], -20, pickupPosition[2]]);
      const state = context.resources.get("GameState", { score: 0 });
      context.resources.patch("GameState", { score: state.score + 1, scoreText: `Score ${state.score + 1}` });
    }
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn iterate --project . --scenario playtests/top-down-collector.playtest.json --json
```
