---
id: interaction-objective
goal: Declare a deterministic pickup objective through the bounded Interaction contract.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - interaction
  - objective
  - physics
keywords:
  - pickup
  - collectible
  - interaction
  - objective
  - trigger
  - win condition
---

## commands
```bash
tn schema create objective-state --kind resource --project . --json
tn schema set objective-state Score --kind resource --fields '{"value":{"kind":"number","default":0}}' --project . --json
tn schema create objective-events --kind event --project . --json
tn schema set objective-events match.win --kind event --fields '{"collected":{"kind":"number"}}' --project . --json
```

Interaction is a durable document surface with matching bounded web and Bevy
fixed-tick execution. Author the document under
`content/interactions/*.interactions.json`; it is validated during build and
emitted as `interactions.ir.json`. Pickup, hazard, checkpoint, and projectile
trace/resource/entity-state pairs are enrolled in `pnpm verify:conformance`;
new vocabulary remains unpromoted until equivalent paired evidence lands.

## source-delta
```json
{"content/interactions/arena.interactions.json":{"schema":"threenative.interactions","version":"0.1.0","id":"arena-objectives","interactions":[{"id":"player-collects-pickup","detector":{"kind":"sensor-enter","source":{"entity":"player"},"target":{"withTag":"pickup"},"fallback":{"kind":"distance2d","radius":0.7,"source":{"entity":"player"},"target":{"withTag":"pickup"}}},"gate":{"kind":"once-per-target"},"effects":[{"kind":"addResource","resource":"Score","field":"value","value":1},{"kind":"despawn","target":"detected"}],"complete":{"when":{"resource":"Score","field":"value","gte":1},"event":"match.win"}}]}}
```

Detectors are normalized and sorted by interaction, source, and target ID.
Gates run before declaration-ordered effects; completion runs afterward and
fires once per lifecycle cycle. Sensor/distance fallback is explicit, and
unsupported selectors, effects, or conflicting exclusive writes fail bundle
validation. Default runtime output remains compact; normalized traces are a
bounded artifact/debug surface.

When terminal state must be committed with the completion event, declare
bounded `complete.effects` using the same closed effect vocabulary. This keeps
win-state resource/UI updates in the interaction lifecycle instead of adding a
second polling script.

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    if (player === undefined) return;
    const position = player.transform().position;
    player.transform().setPosition([
      position[0] + context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4,
      position[1],
      position[2],
    ]);
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
