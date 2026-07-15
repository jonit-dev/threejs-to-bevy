---
id: procedural-geometry-v2
goal: Author deterministic static procedural props with expanded primitives, topology operations, compile-time CSG, and a derived collider.
category: authoring
scriptPath: src/game.ts
surfaces:
  - geometry
  - mesh
  - collider
  - visual
keywords:
  - MeshBuilder
  - procedural mesh
  - torus
  - plane
  - prism
  - rounded box
  - coherent noise
  - weld
  - subdivide
  - mirror
  - CSG
  - boolean
  - derived collider
  - LOD
---

## commands
```bash
tn authoring inspect --project . --json
```

## source-delta
```json
{"src/game.ts":"The SDK scene entry authors static generated meshes with deterministic MeshBuilder operations; captured output lowers to ordinary custom-mesh bundle assets."}
```

## script
```ts
import {
  Mesh,
  MeshBuilder,
  MeshStandardMaterial,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "scene.procedural" });

const archGeometry = MeshBuilder.create("prop.arch.weathered")
  .color("#b4a58e")
  .position([0, 1.05, 0])
  .box({ size: [2, 2.1, 0.7] })
  .subtract((operand) => {
    operand
      .position([0, 0.62, 0])
      .rotate([Math.PI / 2, 0, 0])
      .cylinder({ height: 1, radius: 0.68, segments: 24 });
  })
  .coherentNoise({ amplitude: 0.015, frequency: 3, octaves: 2, seed: 17 })
  .weld({ tolerance: 1e-5 })
  .build({ budget: "hero-prop", collider: "mesh", seed: 17, storage: "binary" });

scene.add(new Mesh({
  geometry: archGeometry,
  id: "prop.arch.weathered",
  material: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
}));

const catalogGeometry = MeshBuilder.create("prop.catalog-study")
  .position([-1.1, 0.25, 0])
  .torus({ majorRadius: 0.35, minorRadius: 0.08, radialSegments: 16, tubularSegments: 12 })
  .position([0, 0.5, 0])
  .prism({ sides: 6, radius: 0.3, height: 1 })
  .position([1.1, 0.3, 0])
  .roundedBox({ size: [0.65, 0.6, 0.65], cornerRadius: 0.08, cornerSegments: 2 })
  .subdivide({ iterations: 1 })
  .mirror({ axis: "x" })
  .build({ collider: "box", storage: "binary" });

scene.add(new Mesh({
  geometry: catalogGeometry,
  id: "prop.catalog-study",
  material: new MeshStandardMaterial({ color: "#6fa8dc", roughness: 0.7 }),
}));

const groundGeometry = MeshBuilder.create("surface.ground-grid")
  .plane({ size: [8, 8], widthSegments: 8, depthSegments: 8 })
  .build({ storage: "binary" });

scene.add(new Mesh({
  geometry: groundGeometry,
  id: "surface.ground-grid",
  material: new MeshStandardMaterial({ color: "#51634b", roughness: 1 }),
}));

export default scene;
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```

All operations above run during SDK capture and emit static custom-mesh data;
the runtimes do not execute CSG or coherent noise. Use a fixed seed whenever
noise participates in durable output. `weld()` removes coincident vertices,
`subdivide()` increases topology before a later deformation, and `mirror()`
reflects the accumulated result rather than creating a second copy.

`build({ collider: "box" | "mesh" })` records a derived collider hint. The
compiler uses it only when the captured mesh entity has no explicit authored
collider; an explicit collider always wins. Prefer `box` for a cheap bounds fit
and `mesh` only when the generated surface materially affects contact.

Generated-mesh LOD authoring is still deferred contract work. Do not pass an
invented `lodLevels` option or script runtime mesh swaps. The decimator alone
does not establish bundle ownership or adapter selection semantics; complete
the optional IR/compiler/runtime contract described in
[`procedural-generated-mesh-lod-contract-2026-07-14.md`](../PRDs/procedural-generated-mesh-lod-contract-2026-07-14.md)
before documenting generated LOD levels as portable.
