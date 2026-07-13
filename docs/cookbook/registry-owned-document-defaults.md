---
id: registry-owned-document-defaults
goal: Reuse an exact maintained archetype, flow, or sequence default without copying its fields.
category: authoring
scriptPath: src/scripts/player.ts
surfaces:
  - archetype
  - flow
  - sequence
  - registry
keywords:
  - preset
  - defaults
  - duplicate
  - ownership
---

## commands
```bash
tn authoring inspect --project . --json
```

Use a compact `preset` reference only when the whole document is an exact
semantic match for a maintained default. Edit the structured document directly
because no bounded preset-selection command is promoted yet. The authoring
loader expands the reference before validation and compilation, so emitted IR
remains ordinary portable archetype, GameFlow, or Sequence data.

Current preset IDs are `game-archetype.top-down`,
`flow.ready-playing-win`, and `sequence.intro-camera`. Retained UI keeps its
bespoke nodes and shares the existing `recipes` plus `provenance` contract;
visual similarity alone is not a reason to replace local UI source.

## source-delta
```json
{"content/flow/match.flow.json":{"preset":"flow.ready-playing-win"}}
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
