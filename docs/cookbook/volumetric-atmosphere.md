---
id: volumetric-atmosphere
goal: Add portable height fog and directional-sun shafts to an environment.
category: lighting
scriptPath: src/scripts/main.ts
surfaces:
  - environment
  - lighting
---

## commands
```bash
tn environment set-path world --path '{"id":"path.world","points":[[0,0,0],[1,0,0]],"width":1}' --project . --json
tn environment set-volumetrics world --volumetrics '{"heightFog":{"enabled":true,"density":0.12,"falloffHeight":10,"baseHeight":0},"godRays":{"enabled":true,"intensity":1,"density":0.4,"maxDistance":80,"quality":"medium"}}' --project . --json
```

## source-delta
```json
{"content/environment/world.environment.json":"atmosphere.volumetrics enables height fog and directional-sun god rays."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function update(_context: ScriptContext): void {}
```

## proof
```bash
tn playtest --project . --scenario playtests/volumetrics.playtest.json --target desktop --stable-artifacts --json
```
