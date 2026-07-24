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

## Textured materials

Recipe materials may reference project-local PNG/JPEG textures instead of a
flat `baseColor`:

```json
{"id": "wall.concrete", "roughness": 0.9, "texture": "assets/imported/polyhaven/concrete_wall_008/diffuse-1k.jpg", "normalTexture": "assets/imported/polyhaven/concrete_wall_008/normal-1k.png", "textureScale": 3}
```

- `texture` feeds base color (it replaces `baseColor` on export), and
  `normalTexture` adds a tangent-space normal map; both must live below
  `assets/` and outside `assets/generated/`, and remote URLs are rejected.
- `textureScale` tiles the primitive's default UVs (e.g. `3` repeats the map
  three times per face span). Textures embed into the exported GLB, so size
  them against `maxOutputBytes` (1K JPEGs are usually enough for props).
- Source textures come from the curated CC0 catalog: search with
  `tn asset source search --query "concrete texture" --json` (Poly Haven and
  ambientCG texture-set records), open the record with
  `tn asset source get <id> --json`, download the chosen diffuse/normal maps at
  1K-2K into `assets/imported/<source>/<slug>/`, and record a `provenance.json`
  beside them with the record id, URL, and license (all Poly Haven/ambientCG
  sets are CC0).

## Existing GLB animation variant

To animate a model rather than generate primitives, first import it so the
source is self-contained and its node names are normalized, then inspect those
names:

```bash
tn asset import aircraft.glb --id aircraft.source --license user-provided --project . --json
tn asset inspect assets/imported/aircraft.source.glb --json
tn asset generate aircraft.animated --provider blender --recipe '{"schema":"threenative.blender-recipe","version":"0.1.0","id":"aircraft.animated","source":"assets/imported/aircraft.source.glb","animations":[{"id":"propeller.spin","duration":1,"loop":true,"tracks":[{"node":"Propeller","property":"rotation","keyframes":[{"time":0,"value":[0,0,0]},{"time":0.25,"value":[0,0,90]},{"time":0.5,"value":[0,0,180]},{"time":0.75,"value":[0,0,270]},{"time":1,"value":[0,0,360]}]}]}],"budgets":{"maxOutputBytes":50000000,"maxPolygons":200000}}' --overwrite-policy replace --project . --json
tn asset inspect assets/generated/aircraft.animated.glb --json
tn model-test assets/generated/aircraft.animated.glb --angles 0,90,180,270 --json
```

Source-backed tracks use exact unique node names. Position and rotation values
are local offsets from the imported pose; scale values multiply imported scale.
An optional `materials` array patches named imported materials without
replacing the material or its unpatched texture maps. Use it for bounded source corrections such as
`{"id":"Paint","metallic":0,"roughness":0.65}` when inspection shows that an
imported factor does not match the authored painted surface. Material names
must match the imported GLB exactly.
For detached surfaces whose imported origins do not sit on the hinge, a
rotation track may add `"pivot":[x,y,z]` in the source model's authored Y-up
coordinates. Blender creates an exported parent pivot while preserving the
surface's rest pose. Pivots are source-rotation-only and one node must use the
same pivot across clips. The provider rejects external GLB dependencies,
missing or duplicate targets, conflicting pivots, clip-name collisions, and
mixtures of `source` with generated parts.

When two real disconnected control surfaces are packed into one imported mesh,
the source recipe may separate them without creating replacement geometry:
`{"kind":"split-by-axis","node":"Ailerons","axis":"x","threshold":0,"negative":"aileron.left","positive":"aileron.right"}`.
The threshold uses authored Y-up coordinates and must not intersect a vertex or
face. Output ids must be unique, and animation tracks may target those outputs.
Source-backed recipes may also normalize one exact imported node and reduce
static mesh density before animation:

```json
{
  "operations": [
    {"kind":"transform","node":"AircraftRoot","rotation":[0,180,0]},
    {"kind":"decimate","ratio":0.6}
  ]
}
```

`transform` applies bounded authored-space position, rotation, or scale offsets.
`decimate` applies Blender's collapse modifier to every imported mesh with a
ratio in `(0, 1]`; the output polygon budget remains the final hard limit.

The retained Douglas SBD-3 example uses this contract for rigid wing-flap
deployment, paired elevator pitch, rudder yaw, and inverse roll ailerons, while
the propeller rotates on a measured shaft pivot. The ailerons are two existing
disconnected surfaces separated from one imported mesh by their x-axis sign.
Treat mesh nodes split only by material as one rigid assembly and target their
shared parent; do not infer independent mechanisms from overlapping bounds:

```bash
tn generator run aircraft.douglas-sbd3 --project . --json
tn asset inspect assets/generated/aircraft.douglas-sbd3.glb --json
tn model-test assets/generated/aircraft.douglas-sbd3.glb --angles 0,45,90,180,270 --json
```
