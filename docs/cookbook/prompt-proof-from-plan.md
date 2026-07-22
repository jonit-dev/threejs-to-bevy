---
id: prompt-proof-from-plan
goal: Generate one real-ID transition scenario for every required acceptance assertion in a game plan.
category: testing
scriptPath: src/scripts/promptProofNote.ts
surfaces:
  - playtest
  - plan
  - input
  - objective
keywords:
  - proof from plan
  - acceptance coverage
  - transition assertions
---

## commands
```bash
tn game plan --goal "grid puzzle where a player pushes crates onto goals" --project . --json
tn recipe apply spatial-grid-objective --project . --json
tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json
```

The scaffold reads stable acceptance IDs plus proof-template bindings from the
plan, then resolves the project’s actual actor, pushable, input, resource, HUD,
and grid-bound IDs. All required scenarios publish atomically. Unsupported
assertions emit `TN_PLAYTEST_PLAN_ASSERTION_UNSUPPORTED` and leave no partial
proof set.

## source-delta
```json
{"playtests/acceptance-grid-movement.playtest.json":"Uses the real actor and grid boundary with a maximum-distance blocked-step assertion."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function promptProofNote(context: ScriptContext): void {
  const objective = context.resources.get("SpatialObjective", { progress: 0 });
  if (objective.progress > 0) context.resources.patch("SpatialObjective", { progress: objective.progress });
}
```

Generated progress and HUD assertions require `changed: true`; retry also
observes entity movement back to its authored start. A final equals-only value
is not treated as proof that a transition occurred.

Use `holdTicks` and `waitTicks` when acceptance depends on an exact number of
fixed updates. Browser proof runs step those ticks while the normal render
lifecycle remains paused; frame-named fields retain compatibility behavior.

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```

Run `tn iterate --project . --json` after generation, inspect its current-run
acceptance coverage, and repeat the release scenario on desktop.
