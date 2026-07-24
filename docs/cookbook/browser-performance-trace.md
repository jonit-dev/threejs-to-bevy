---
id: browser-performance-trace
goal: Capture a web or native Chrome/Perfetto trace before changing rendering quality to chase low FPS.
category: proof
scriptPath: src/scripts/player.ts
surfaces:
  - performance
  - proof
keywords:
  - browser
  - native
  - cpu
  - gpu
  - performance
  - playwright
  - trace
---

## commands
```bash
# With `tn dev --target web` already running:
# tn performance trace --project . --url http://127.0.0.1:5173 --seconds 5 --out artifacts/performance-trace.json.gz --json
# From a graphical desktop session:
# tn performance trace --project . --target desktop --seconds 5 --out artifacts/native-performance-trace.json.gz --json
tn help visual-qa --json
```

## source-delta
```json
{"artifacts/performance-trace.json.gz":"The generic trace command captures a gzip-compressed Chrome/Perfetto trace: browser DevTools events for web, or Bevy tracing spans for desktop."}
```

## script
```ts
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```
