---
id: kinematic-hazard
goal: Add a moving hazard body with visible authored geometry and collider metadata.
category: physics
scriptPath: src/scripts/player.ts
surfaces:
  - hazard
  - physics
keywords:
  - hazard
  - obstacle
  - dodge
  - avoid
  - moving
  - patrol
blocks:
  - objective.obstacle-avoid
---

## commands
```bash
tn scene add-prefab arena prefab.hazard --primitive box --color "#ff3355" --project . --json
tn scene add-entity arena hazard.01 --prefab prefab.hazard --project . --json
tn scene set-transform arena hazard.01 --position 0,0.35,-1.2 --project . --json
tn physics add-rigid-body arena hazard.01 --kind kinematic --project . --json
tn physics add-collider arena hazard.01 --kind box --size 0.8,0.4,0.4 --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"hazard.01 is visible, kinematic, and collidable."}
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

export const kinematicHazard = defineBehavior(
  { id: "kinematic-hazard", schedule: "fixedUpdate", resourceReads: ["GameState"], resourceWrites: ["GameState", "hazard-cooldown"], writes: ["Transform"] },
  (context: ScriptContext): void => {
    const hazard = context.entity("hazard.01");
    const player = context.entity("player");
    if (hazard === undefined || player === undefined) return;
    const hazardPosition = hazard.transform().position;
    const phase = context.time.elapsed * 0.8;
    hazard.transform().setPosition([Math.sin(phase) * 1.2, hazardPosition[1], hazardPosition[2]]);
    const state = context.state("hazard-cooldown", { nextHit: 0 });
    const playerPosition = player.transform().position;
    const dx = playerPosition[0] - hazard.transform().position[0];
    const dz = playerPosition[2] - hazard.transform().position[2];
    if (context.time.elapsed >= state.nextHit && dx * dx + dz * dz < 0.49) {
      state.nextHit = context.time.elapsed + 1;
      const gameState = context.resources.get("GameState", { lives: 3 });
      context.resources.patch("GameState", { lives: Math.max(0, gameState.lives - 1), status: "Hazard hit" });
    }
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
