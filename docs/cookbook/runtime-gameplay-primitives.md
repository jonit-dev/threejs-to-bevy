---
id: runtime-gameplay-primitives
goal: Add a runtime-owned countdown while keeping HUD state in a portable resource.
category: gameplay
scriptPath: src/scripts/timer.ts
surfaces:
  - countdown
  - hud
  - fixed-tick
keywords:
  - countdown
  - timer
  - runtime
  - hud
  - resource
  - fixed tick
---

## commands
```bash
tn add timer --resource RoundTimer --direction down --limit 30 --project . --json
```

## source-delta
```json
{"content/systems/arena.systems.json":"RoundTimer is declared as a fixed-tick runtime countdown that emits RoundTimer.limit once per cycle."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function updateTimerHud(context: ScriptContext): void {
  const timer = context.resources.get<{ remaining: number }>("RoundTimer", { remaining: 30 });
  context.resources.patch("RoundTimer", { statusText: `Time ${Math.ceil(timer.remaining)}` });
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
pnpm verify:gameplay-primitives
```
