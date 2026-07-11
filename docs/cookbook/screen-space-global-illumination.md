---
id: screen-space-global-illumination
goal: Add portable dynamic indirect diffuse lighting with an honestly reported native approximation.
category: lighting
scriptPath: src/scripts/main.ts
surfaces:
  - runtime
  - rendering
---

## commands
```bash
tn runtime set-rendering desktop --screen-space-global-illumination true --screen-space-global-illumination-quality medium --screen-space-global-illumination-intensity 1 --screen-space-global-illumination-radius 12 --project . --json
```

## source-delta
```json
{"content/runtime/desktop.runtime.json":"renderer.screenSpaceGlobalIllumination enables bounded indirect diffuse response; web applies temporal screen-space color bleed and Bevy reports an ambient/SSAO approximation."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function update(_context: ScriptContext): void {}
```

## proof
```bash
pnpm verify:focused verify:ssgi
```
