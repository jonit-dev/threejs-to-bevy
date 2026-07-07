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
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}

export function topDownCollectorSystem(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn iterate --project . --scenario playtests/top-down-collector.playtest.json --json
```
