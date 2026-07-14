---
id: blender-generated-prop
goal: Create, regenerate, inspect, and visually prove one bounded custom Blender prop.
category: assets
scriptPath: src/scripts/generatedProp.ts
providerBoundary: installed-tool-opt-in
surfaces:
  - asset
  - generator
  - model-test
keywords:
  - blender
  - procedural prop
  - crate
  - recipe
  - turntable
---

## commands
```bash
tn asset strategy --json
tn tool status blender --json
tn generator record-blender prop.crate --recipe '{"schema":"threenative.blender-recipe","version":"0.1.0","id":"prop.crate","budgets":{"maxOutputBytes":4194304,"maxPolygons":30000},"materials":[{"id":"wood.blue","baseColor":[0.035,0.18,0.48,1],"metallic":0.08,"roughness":0.48},{"id":"frame.dark","baseColor":[0.025,0.035,0.06,1],"metallic":0.82,"roughness":0.22},{"id":"mark.cyan","baseColor":[0.01,0.65,0.95,1],"emissive":[0,0.55,1],"metallic":0.15,"roughness":0.2}],"parts":[{"id":"body","primitive":"cube","material":"wood.blue","position":[0,0.65,0],"scale":[1.45,1.2,1.25],"modifiers":[{"kind":"bevel","width":0.09,"segments":3}]},{"id":"rail.top","primitive":"cube","material":"frame.dark","position":[0,1.19,-0.66],"scale":[1.62,0.13,0.12]},{"id":"rail.bottom","primitive":"cube","material":"frame.dark","position":[0,0.11,-0.66],"scale":[1.62,0.13,0.12]},{"id":"rail.left","primitive":"cube","material":"frame.dark","position":[-0.74,0.65,-0.66],"scale":[0.13,1.2,0.12]},{"id":"rail.right","primitive":"cube","material":"frame.dark","position":[0.74,0.65,-0.66],"scale":[0.13,1.2,0.12]},{"id":"brace.a","primitive":"cube","material":"frame.dark","position":[0,0.65,-0.69],"rotation":[0,0,38],"scale":[0.12,1.55,0.09]},{"id":"brace.b","primitive":"cube","material":"frame.dark","position":[0,0.65,-0.7],"rotation":[0,0,-38],"scale":[0.12,1.55,0.09]},{"id":"back.top","primitive":"cube","material":"frame.dark","position":[0,1.19,0.66],"scale":[1.62,0.13,0.12]},{"id":"back.bottom","primitive":"cube","material":"frame.dark","position":[0,0.11,0.66],"scale":[1.62,0.13,0.12]},{"id":"mark","primitive":"cube","material":"mark.cyan","position":[0,0.67,-0.735],"rotation":[0,0,45],"scale":[0.28,0.28,0.04],"modifiers":[{"kind":"bevel","width":0.04,"segments":2}]}]}' --project . --json
```

## source-delta
```json
{"content/generators/prop.crate.recipe.json":"Created by the executable generator record-blender command above; it contains ten bounded parts, three PBR materials, bevel modifiers, and explicit polygon/output budgets."}
```

## script
```ts
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function rotateGeneratedProp(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.rotation = Vector3.add(transform.rotation, [0, context.time.fixedDelta * 0.5, 0]);
  }
}
```

## proof
```bash
tn tool install blender --accept-download --json
tn generator run prop.crate --project . --json
tn generator run prop.crate --project . --json
tn asset inspect assets/generated/prop.crate.glb --json
tn model-test assets/generated/prop.crate.glb --verify --json
tn model-test assets/generated/prop.crate.glb --angles 0,45,90,180 --json
tn authoring validate --project . --json
tn build --project . --json
```

The two `generator run` calls prove the owned rerun path. Repository maintainers
can exercise this installed-tool proof with `pnpm verify:cookbook:blender` and
the cross-host recipe set with `pnpm verify:blender-host`. The runtime-aware
`--verify` step compares inspected material intent with observed loaded glTF
materials and rejects fallback-only white evidence; the turntable remains an
isolated asset proof rather than a final-scene composition claim.
