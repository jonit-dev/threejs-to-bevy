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
tn authoring inspect --project . --plan artifacts/game-production/plan.json --json
tn authoring prototype --from-plan artifacts/game-production/plan.json --project . --run-proof --json
```

Inspect `diagnostics`, `authoringMode`, mechanic responsibilities, and proof
before applying a proposal. Load only the generated `threenative-workflow`
skill at the start; load authoring or verification guidance only when the plan
or a diagnostic makes it relevant. When the plan reports
`TN_GAME_PLAN_OFF_RECIPE` or `authoringMode: "custom-on-starter"`, keep the
starter scene and follow the commands above in order: plan, inspect, then
author the requested loop through bounded structured-source operations plus
portable scripts. Do not substitute a keyword-adjacent recipe. The default
inspection briefing names the real document owners and IDs,
`src/scripts/**/*.ts` behavior owner, `pressed`/`released` edge APIs, declaration
rules, and missing acceptance IDs. If the project is too large for the 16 KiB
stdout budget, read the returned `detailsArtifactPath` rather than searching
engine source. When plan and inspect emit the exact `authoring prototype`
command, run it once: the intent contract selects a neutral interaction-loop
descriptor, atomically writes valid source owners and a self-contained portable
behavior, and enrolls one playtest for every required acceptance ID. The plan
remains `custom-on-starter`; the prototype is a bounded starting point, not a
prompt-named recipe or a release claim.

## source-delta
```json
{"artifacts/game-production/plan.json":{"authoringMode":"custom-on-starter","mutate":false}}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    if (context.input.pressed("retry")) {
      context.entity("player")?.transform().setPosition([0, 0, 0]);
    }
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn iterate --project . --json
```
