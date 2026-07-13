---
id: baked-gi-probes
goal: Bake deterministic off-screen indirect lighting into portable SH2 probes.
category: lighting
scriptPath: src/scripts/main.ts
surfaces:
  - environment
  - lighting
  - compiler
keywords:
  - bake
  - global illumination
  - indirect lighting
  - light probe
  - sh2
  - gi
---

## commands
```bash
tn environment set-path world --path '{"id":"path.world","points":[[0,0,0],[1,0,0]],"width":1}' --project . --json
tn environment set-light-probe world probe.center --probe '{"bounds":{"min":[-3,0,-3],"max":[3,4,3]},"influenceRadius":5,"intent":"irradiance","source":{"format":"sh2","coefficients":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"bakeVersion":1,"sceneContentHash":"sha256:0000000000000000000000000000000000000000000000000000000000000000"}}' --project . --json
tn bake gi --project . --ray-count 96 --seed 7 --max-distance 24 --json
```

## source-delta
```json
{"content/lighting/world.probes.json":"Deterministic SH2 coefficients and the canonical scene-content hash used to detect stale lighting."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function update(_context: ScriptContext): void {
  const elapsed = _context.time.elapsed;
  void elapsed;
}
```

## proof
```bash
tn build --project . --json
```

The bake command traces static shadow-casting geometry, writes durable content,
and rebuilds so the emitted bundle contains the payload. Commit
`content/lighting/<scene>.probes.json`. Higher ray counts reduce noise but take
longer; `--max-distance` bounds which geometry can contribute.

After relevant geometry, materials, lighting, or probe placement changes, a
build emits `TN_IR_LIGHT_PROBE_BAKE_STALE`. Re-run the bake rather than editing
the 27 coefficients by hand. Treat non-empty `unsupportedMeshIds` JSON output
as incomplete coverage for important surfaces.
