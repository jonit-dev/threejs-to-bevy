---
id: event-driven-flow
goal: Emit a typed gameplay event from a script and transition declarative flow state.
category: gameplay
scriptPath: src/scripts/event-flow.ts
surfaces:
  - events
  - flow
  - scripting
---

## commands
```bash
tn schema create gameplay-events --kind event --project . --json
tn schema set gameplay-events match.win --kind event --fields '{"collected":{"kind":"number"}}' --project . --json
tn system create match-events --schedule fixedUpdate --project . --json
tn system attach-script match-events --module src/scripts/event-flow.ts --export emitMatchWin --project . --json
```

## source-delta
```json
{"content/schemas/gameplay-events.schema.json":"The event payload is declared as an event schema; literal script payloads can also infer missing fields.","content/flow/match.flow.json":"Add an event trigger with kind event and event match.win for the transition that should react.","content/interactions/arena.interactions.json":"Bounded cross-adapter Interaction completion and emitEvent effects may emit the same declared event; GameFlow remains the owner of state transitions and copy."}
```

## script
```ts
import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const emitMatchWin = defineBehavior(
  { eventWrites: ["match.win"] },
  (context: ScriptContext): void => {
    context.events.emit("match.win", { collected: 8 });
  },
);
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
