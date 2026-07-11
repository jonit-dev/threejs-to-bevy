---
id: lane-runner-spawn
goal: Use the maintained lane-runner recipe as the starting point for lane spawning.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - lanes
  - spawn
  - recipe
---

## commands
```bash
tn game plan --goal "lane runner with coins" --project . --apply --json
tn recipe lane-runner --scene arena --player player --camera camera.main --dry-run --project . --json
```

## source-delta
```json
{"recipe":"Use game plan --apply for the scaffold-first baseline; dry-run the recipe when inspecting generated ids/proof commands before a manual apply."}
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

export function laneRunnerSystem(context: ScriptContext): void {
  const state = context.state("lane-runner", { lane: 1, speed: 4 });
  state.lane = Math.max(0, Math.min(2, state.lane));
  state.speed = Math.max(0, state.speed + context.time.fixedDelta * 0.1);
}
```

## proof
```bash
tn iterate --project . --scenario playtests/lane-runner.playtest.json --json
```
