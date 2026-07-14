---
id: distribution-release-plan
goal: Inspect the complete cross-platform release matrix before packaging a game.
category: tooling
scriptPath: src/scripts/main.ts
surfaces:
  - distribution
  - package
  - release
keywords:
  - package plan
  - web zip
  - pwa
  - android
  - ios
  - desktop installer
---

## commands
```bash
tn package plan --project . --matrix release --json
```

## source-delta
```json
{"content/distribution.json":"The read-only plan reports missing metadata until distribution app and target operations create this durable descriptor."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function update(context: ScriptContext): void {
  void context.time.elapsed;
}
```

## proof
```bash
tn build --project . --json
```
