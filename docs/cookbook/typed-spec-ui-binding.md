---
id: typed-spec-ui-binding
goal: Bind UI text to a typed resource declaration from one source file.
category: typed-spec
authoring: typed-spec
scriptPath: src/game.spec.ts
surfaces:
  - typed-spec
  - ui
  - resource
keywords:
  - typed spec
  - ui
  - text
  - binding
  - resource
---

## commands
```bash
# spec is written from the script block before typed-spec compilation
```

## source-delta
```json
{"src/game.spec.ts":"score-label is declared and bound to the score resource in the same typed spec."}
```

## script
```ts
import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec({
  scenes: [{
    entities: [{ id: "player", transform: { position: [0, 0.5, 0] } }],
    id: "arena",
    resources: [{ id: "score", value: 0 }],
    ui: {
      bindings: [{ node: "score-label", resource: "score" }],
      nodes: [{ id: "score-label", text: "Score", type: "text" }],
    },
  }],
});
```

## proof
```bash
tn authoring compile-typed-spec --project . --json
```
