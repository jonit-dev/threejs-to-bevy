---
id: typed-spec-entity-transform
goal: Author entity position, rotation, and scale in typed source.
category: typed-spec
authoring: typed-spec
scriptPath: src/game.spec.ts
surfaces:
  - typed-spec
  - entity
  - transform
keywords:
  - typed spec
  - entity
  - transform
  - position
  - rotation
  - scale
---

## commands
```bash
# spec is written from the script block before typed-spec compilation
```

## source-delta
```json
{"src/game.spec.ts":"player transform keeps position, rotation, and scale together with the entity id."}
```

## script
```ts
import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec({
  scenes: [{
    entities: [{
      id: "player",
      transform: {
        position: [1, 0.5, -2],
        rotation: [0, 0.6, 0],
        scale: [1.2, 1.2, 1.2],
      },
    }],
    id: "arena",
  }],
});
```

## proof
```bash
tn authoring compile-typed-spec --project . --json
```
