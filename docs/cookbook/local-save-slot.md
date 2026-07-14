---
id: local-save-slot
goal: Persist declared resource and component state in a versioned local save slot.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - persistence
  - local-data
  - lifecycle
keywords:
  - persistence
  - save
  - load
  - local storage
  - resume
---

## commands
```bash
tn authoring validate --project . --json
```

## source-delta
```json
{
  "content/persistence/game.persistence.json": {
    "schema": "threenative.local-data",
    "version": "0.1.0",
    "components": [],
    "resources": [
      {
        "id": "GameState",
        "schema": { "fields": { "progress": { "kind": "integer" } } }
      }
    ],
    "saveSlots": [
      { "id": "slot.auto", "schemaVersion": 1, "appVersion": "1.0.0" }
    ],
    "settings": []
  }
}
```

## script
```ts
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

type PersistenceContext = ScriptContext & {
  persistence: {
    load(slot: string): { accepted: boolean };
    save(slot: string): { accepted: boolean };
  };
};

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [
      context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4,
      0,
      0,
    ]);
  }
}

export function restoreAndAutosave(rawContext: ScriptContext): void {
  const context = rawContext as PersistenceContext;
  const state = context.state("local-save", { loaded: false, savePending: false });
  if (!state.loaded) {
    context.persistence.load("slot.auto");
    state.loaded = true;
  }
  if (state.savePending) {
    context.persistence.save("slot.auto");
    state.savePending = false;
  }
}
```

Declare every durable resource/component in the persistence document. Call
`load` once before gameplay consumes the restored world, then call `save` only
after the owning resource or component mutation is visible to the runtime.

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn playtest --project . --scenario playtests/cold-relaunch.playtest.json --target web --json
```
