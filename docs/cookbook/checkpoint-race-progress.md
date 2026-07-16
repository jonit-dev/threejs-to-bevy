---
id: checkpoint-race-progress
goal: Plan checkpoint race progress with the maintained vehicle recipe metadata.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - checkpoint
  - vehicle
  - recipe
keywords:
  - race
  - checkpoint
  - lap
  - vehicle
  - kart
  - car
  - boat
blocks:
  - objective.checkpoint-lap
---

## commands
```bash
tn recipe apply vehicle-checkpoint --scene arena --vehicle player --camera camera.main --project . --json
```

## source-delta
```json
{"recipe":"Apply is transactional, adopts existing vehicle/camera entities without replacing their authored pose, creates five ordered checkpoint gates, owns RaceState timer/progress/finish/retry fields, binds the retained HUD, emits completion and retry scenarios, scaffolds the required script export, and is a no-op when retried unchanged."}
```

## script
```ts
import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";

export const vehicleCheckpointSystem = defineBehavior(
  { schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const vehicle = context.entity("player");
    if (vehicle === undefined) return;
    const initial = { nextCheckpoint: 0, progressText: "Checkpoint 0 / 5", time: 0 };
    const race = context.resources.get("RaceState", initial);
    if (context.input.pressed("retry")) {
      vehicle.transform().setPosition([0, 0.35, 2]);
      context.resources.patch("RaceState", initial);
      return;
    }
    const position = vehicle.transform().position;
    vehicle.transform().setPosition([
      position[0] + context.input.axis("Steer") * 0.06,
      position[1],
      position[2] - context.input.axis("Throttle") * 0.1,
    ]);
    race.time += context.time.fixedDelta;
    context.resources.patch("RaceState", race);
  },
);
```

## proof
```bash
tn iterate --project . --json
```

Use the compact game-plan match as the front door: run `tn game plan`, show
this cookbook entry from its emitted `cookbookId`, apply the bounded recipe,
then run `tn iterate` once against the recipe-emitted completion and retry
scenarios. Do not open the planning worksheet, sibling agent skills, generated
source, or deep artifacts unless the plan/iterate diagnostic says a required
field or repair path is missing.
