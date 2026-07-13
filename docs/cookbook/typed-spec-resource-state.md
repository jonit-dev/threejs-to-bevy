---
id: typed-spec-resource-state
goal: Declare gameplay resource state and system access from typed source.
category: typed-spec
authoring: typed-spec
scriptPath: src/game.spec.ts
surfaces:
  - typed-spec
  - resource
  - system
keywords:
  - typed spec
  - resource
  - state
  - system
  - access
---

## commands
```bash
# spec is written from the script block before typed-spec compilation
```

## source-delta
```json
{"src/game.spec.ts":"score resource is declared beside the system reads/writes that own gameplay state."}
```

## script
```ts
import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec({
  scenes: [{
    entities: [{ id: "player", transform: { position: [0, 0.5, 0] } }],
    id: "arena",
    resources: [{ id: "score", value: 0 }],
    systems: [{ id: "score-system", resourceReads: ["score"], writes: ["Transform"] }],
  }],
});
```

## proof
```bash
tn authoring compile-typed-spec --project . --json
```
