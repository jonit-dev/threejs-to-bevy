---
id: visual-reference-parity
goal: Measure repeatable visual similarity against a reference screenshot without a project-local wrapper.
category: proof
scriptPath: src/scripts/player.ts
surfaces:
  - visual
  - proof
keywords:
  - parity
  - screenshot
  - reference
  - similarity
  - compare
  - stale
---

## commands
```bash
# With `tn dev --target web` already running:
# tn parity visual --project . --url http://127.0.0.1:5173 --reference docs/reference/target.png --json
tn help screenshot --json
```

## source-delta
```json
{"artifacts/visual-parity/history.json":"The generic parity command appends timestamped similarity evidence and owns stale-preview checks; do not create a project-local wrapper."}
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
tn authoring validate --project . --json
tn build --project . --json
```
