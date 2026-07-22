---
id: img2threejs-generated-prop
goal: Finalize a reviewed local img2threejs object factory into a portable GLB.
category: assets
providerBoundary: local-reviewed-source
fixtureManifest: tools/verify/evidence/img2threejs/deterministic-fixture.json
keywords:
  - ThreeNative image-to-GLB finalization
  - reviewed factory
  - generated prop
surfaces:
  - assets
  - generators
---

Use this recipe only when the user explicitly requests ThreeNative/GLB
finalization. It is not permission to convert an image merely because a broad
image-to-3D request or keyword is present. This pattern starts after the
internal img2threejs skill has produced and
reviewed local source; it does not invoke a remote image-to-3D service. Use
skill `1.2.0` against upstream commit
`e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b` and the reviewed internal fork
tree `3f410de76c9a7ae53875abe7b47f99edf3beb2a6`. Complete the locked blockout,
structural, material, and optimization reviews before finalization.

The checked [fixture manifest](../../tools/verify/evidence/img2threejs/deterministic-fixture.json)
materializes the exact clean-project inputs used by `pnpm verify:cookbook`:
the project-local PNG reference, accepted review images, sculpt spec, strict
validation report bound to the spec SHA-256, provider recipe, and factory. For
a real internal object, create the same paths through the reviewed skill and
replace the fixture content; do not copy generated GLBs or provenance as
source. The fixture and its independent concept reference are first-party
synthetic works released as CC0-1.0. Record equivalent creator, permission,
license, modifications, and input hashes for any replacement reference.

The supported initial matrix is a single named `THREE.Group` containing
triangle `BufferGeometry`, `MeshBasicMaterial` or `MeshStandardMaterial`, and
reviewed local/canvas textures in supported slots. Physical/custom shader
materials, animations, morph targets, lights, cameras, helpers, network
requests, and native handles are unsupported. A
`TN_IMG2THREEJS_FEATURE_UNSUPPORTED` or other provider diagnostic means repair
the reviewed factory/spec and repeat review; do not weaken the gate or edit the
GLB. `manual` ownership is the default: an unowned existing output fails with
`TN_GENERATOR_OUTPUT_CONFLICT`. After acceptance, rerun only with `tn generator
run prop.radio`; the recorded input/output hashes prove whether the same owner
and bytes are still current.

## commands
```bash
tn asset generate prop.radio --provider img2threejs --recipe content/generators/prop.radio.img2threejs.json --project . --json
```

## source-delta
```json
{
  "content/references/prop.radio.png": "Rights-cleared project-local source image.",
  "content/generators/prop.radio.sculpt-spec.json": "Completed locked-pass review record.",
  "content/generators/prop.radio.validation.json": "Pinned strict-validator result bound to the spec hash.",
  "content/generators/prop.radio.img2threejs.json": "Reviewed provider recipe and export budgets.",
  "src/generators/createPropRadioModel.ts": "Static local Three.js factory; no network or runtime handles."
}
```

## proof
```bash
tn generator run prop.radio --project . --json
tn asset inspect assets/generated/prop.radio.glb --json
tn model-test assets/generated/prop.radio.glb --angles 0,90,180,270 --out artifacts/model-test --json
```
