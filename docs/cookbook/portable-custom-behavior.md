---
id: portable-custom-behavior
goal: Scaffold and preflight one self-contained portable behavior with discrete input, resource state, transform writes, HUD text, and retry.
category: authoring
scriptPath: src/scripts/portableCustom.ts
surfaces:
  - script
  - input
  - resource
  - transform
  - ui
  - retry
keywords:
  - portable behavior
  - script scaffold
  - script check
  - pressed input
---

## commands
```bash
tn authoring script scaffold --module src/scripts/scaffoldProbe.ts --export updateScaffoldProbe --entity player --resource GameState --input move-left --project . --json
tn authoring script check --module src/scripts/scaffoldProbe.ts --export updateScaffoldProbe --project . --json
```

The scaffold command selects only IDs already present in structured source. The
check command aggregates module state, closure, host API, and declaration
diagnostics before a full iterate. For a discrete action, use `pressed` or
`released`; held `getButton`/`action` input needs an intentional repeat policy.

## source-delta
```json
{"src/scripts/portableCustom.ts":"Self-contained fixed-update behavior uses existing player, GameState, and move-left IDs."}
```

## script
```ts
import { defineBehavior, type ScriptContext } from "@threenative/script-stdlib";

export const updatePortableCustom = defineBehavior(
  {
    id: "portable-custom",
    resourceReads: ["GameState"],
    resourceWrites: ["GameState"],
    schedule: "fixedUpdate",
    writes: ["Transform"],
  },
  (context: ScriptContext): void => {
    if (!context.input.pressed("move-left")) return;
    const player = context.entity("player");
    if (player === undefined) return;
    const state = context.resources.get("GameState", { retries: 0, statusText: "Ready" });
    player.transform().setPosition([0, 0.8, 0]);
    context.resources.patch("GameState", {
      retries: state.retries + 1,
      statusText: "Reset complete",
    });
  },
);
```

## proof
```bash
tn authoring script check --module src/scripts/portableCustom.ts --export updatePortableCustom --project . --json
tn authoring validate --project . --json
tn build --project . --json
```
