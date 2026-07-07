---
id: typed-spec-input-ids
goal: Keep input axis declarations and character controller references type-adjacent.
category: typed-spec
authoring: typed-spec
scriptPath: src/game.spec.ts
surfaces:
  - typed-spec
  - input
  - controller
---

## commands
```bash
# spec is written from the script block before typed-spec compilation
```

## source-delta
```json
{"src/game.spec.ts":"move-x and move-z axes are declared before the player controller references them."}
```

## script
```ts
import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec({
  input: {
    axes: [
      { id: "move-x", negative: ["keyboard.KeyA", "keyboard.ArrowLeft"], positive: ["keyboard.KeyD", "keyboard.ArrowRight"] },
      { id: "move-z", negative: ["keyboard.KeyS", "keyboard.ArrowDown"], positive: ["keyboard.KeyW", "keyboard.ArrowUp"] },
    ],
    id: "arena",
  },
  scenes: [{
    entities: [{
      components: {
        CharacterController: { blocking: false, grounding: "none", moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
        Collider: { height: 1, kind: "capsule", radius: 0.25 },
        RigidBody: { kind: "kinematic" },
      },
      id: "player",
      transform: { position: [0, 0.5, 0] },
    }],
    id: "arena",
  }],
});
```

## proof
```bash
tn authoring compile-typed-spec --project . --json
```
