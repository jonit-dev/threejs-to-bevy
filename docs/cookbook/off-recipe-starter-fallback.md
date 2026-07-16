---
id: off-recipe-starter-fallback
goal: Continue from the structured-source starter when no promoted scaffold covers the requested game.
category: authoring
scriptPath: src/scripts/player.ts
surfaces:
  - plan
  - scene
  - script
  - proof
keywords:
  - off-recipe
  - unmatched
  - custom game
  - starter fallback
---

## commands
```bash
tn game plan --goal "turn-based spatial logic game" --project . --json
tn authoring inspect --project . --json
```

Inspect `diagnostics`, `authoringMode`, mechanic responsibilities, and proof
before applying a proposal. When the plan reports
`TN_GAME_PLAN_OFF_RECIPE` or `authoringMode: "custom-on-starter"`, keep the
starter scene and author the requested loop through bounded structured-source
operations plus portable scripts. Do not substitute a keyword-adjacent recipe.

## source-delta
```json
{"artifacts/game-production/plan.json":{"authoringMode":"custom-on-starter","mutate":false}}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", reads: ["Transform"] },
  (context: ScriptContext): void => {
    context.entity("player")?.transform().position;
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
