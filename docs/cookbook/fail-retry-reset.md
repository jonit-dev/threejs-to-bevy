---
id: fail-retry-reset
goal: Add durable game-state fields for fail and retry flow.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - state
  - retry
keywords:
  - fail
  - retry
  - reset
  - lose
  - restart
  - game-over
---

## commands
```bash
tn resources create game --project . --json
tn resources add game Flow.status --value 0 --project . --json
tn resources add game Flow.retries --value 0 --project . --json
```

## source-delta
```json
{"content/resources/game.resources.json":"Flow.status uses numeric state codes; Flow.retries tracks retry count."}
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

export function failRetryReset(context: ScriptContext): void {
  const state = context.resources.get("Flow", { status: 0, retries: 0 });
  context.resources.patch("Flow", { status: Math.max(0, state.status), retries: Math.max(0, state.retries) });
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
