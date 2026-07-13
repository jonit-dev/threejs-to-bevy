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
tn recipe vehicle-checkpoint --scene arena --vehicle player --camera camera.main --dry-run --project . --json
```

## source-delta
```json
{"recipe":"Use dry-run proofCommands and generatedIds before applying vehicle-checkpoint source changes. Apply is transactional, adopts existing vehicle/camera entities without replacing their authored pose, scaffolds the required script export, and is a no-op when retried unchanged. The Interaction contract may own a bounded cross-adapter checkpoint enter/effect pipeline; lap ordering and racing rules remain script-owned."}
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

export function vehicleCheckpointSystem(context: ScriptContext): void {
  const state = context.state("checkpoint-race", { index: 0, lap: 0 });
  state.index = Math.max(0, state.index);
  state.lap = Math.max(0, state.lap);
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
