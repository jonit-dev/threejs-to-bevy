---
id: collectible-respawn
goal: Add a visible collectible prefab and instance that a script can respawn.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - collectible
  - prefab
  - script
keywords:
  - collect
  - coin
  - pickup
  - gather
  - respawn
  - collectible
blocks:
  - objective.collectible
---

## commands
```bash
tn scene add-prefab arena prefab.pickup --primitive sphere --color "#f2c94c" --project . --json
tn scene add-prefab-instance arena pickup.01 --prefab prefab.pickup --position 1,0.3,-1 --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"Adds prefab.pickup and pickup.01 at a readable world position."}
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

export const collectibleRespawn = defineBehavior(
  {
    id: "collectible-respawn",
    schedule: "fixedUpdate",
    reads: ["Transform"],
    resourceReads: ["GameState"],
    resourceWrites: ["GameState", "collectible-respawn"],
    writes: ["Transform"],
  },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    const pickup = context.entity("pickup.01");
    if (player === undefined || pickup === undefined) return;
    const pickupPosition = pickup.transform().position;
    const state = context.state("collectible-respawn", { homeX: pickupPosition[0], homeY: pickupPosition[1], homeZ: pickupPosition[2], respawnAt: 0 });
    if (context.time.elapsed >= state.respawnAt && pickupPosition[1] < -10) {
      pickup.transform().setPosition([state.homeX, state.homeY, state.homeZ]);
      return;
    }
    const playerPosition = player.transform().position;
    const dx = playerPosition[0] - pickupPosition[0];
    const dz = playerPosition[2] - pickupPosition[2];
    if (pickupPosition[1] >= -10 && dx * dx + dz * dz < 0.36) {
      pickup.transform().setPosition([state.homeX, -20, state.homeZ]);
      state.respawnAt = context.time.elapsed + 2;
      const gameState = context.resources.get("GameState", { score: 0 });
      context.resources.patch("GameState", { score: gameState.score + 1 });
    }
  },
);
```

## proof
```bash
tn scene inspect arena --node pickup.01 --project . --json
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
```
