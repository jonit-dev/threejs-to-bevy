---
id: project-local-script-modules
goal: Share pure gameplay helpers between portable TypeScript systems.
category: scripting
scriptPath: src/scripts/player.ts
surfaces:
  - scripting
  - compiler
  - portability
keywords:
  - import
  - module
  - helper
  - shared code
  - script
  - compiler
---

# Project-local script modules

Use ordinary relative imports to share pure helpers between portable systems.
The compiler resolves these imports under `src/scripts`, scopes each module in
the generated runtime bundle, and records the graph in `scripts.manifest.json`.

```ts
// src/scripts/shared/score.ts
export const addScore = (base: number, bonus: number) => base + bonus;

// src/scripts/collect.ts
import { addScore } from "./shared/score";

export const collect = (context: ScriptContext) => {
  context.events.emit("Collected", { score: addScore(3, 2) });
};
```

Keep shared modules pure: do not use mutable top-level variables, side-effect
imports, dynamic imports, filesystem paths, or unapproved packages. Use
components/resources for state that persists between ticks. Extensionless
imports prefer `shared.ts` and then `shared/index.ts`; explicit `.ts` imports
are also supported.

## commands
```bash
tn authoring validate --project . --json
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    // In a multi-file project, import this pure helper from ./shared/score.
    const addScore = (base: number, bonus: number) => base + bonus;
    const player = context.entity("player");
    if (player === undefined) return;
    const position = player.transform().position;
    player.transform().setPosition([addScore(position[0], 1), position[1], position[2]]);
  },
);
```

## proof
```bash
pnpm verify:focused verify:script-local-modules
```
