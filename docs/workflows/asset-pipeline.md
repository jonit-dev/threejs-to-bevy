# V3 Asset Pipeline

V3 is asset-heavy. The asset pipeline must keep bundle output deterministic,
bundle-local, and inspectable.

## Supported Inputs

- glTF
- GLB
- `.bin` dependencies
- PNG textures
- JPEG textures
- WebP textures when supported by the target runtime/profile

## Inspecting Model Scale and Dependencies

Use the CLI inspection workflow before placing a new model into gameplay space:

```bash
tn asset inspect assets/model.glb
tn asset inspect assets/model.gltf --json
```

`tn asset inspect` reads `.glb` JSON chunks and `.gltf` files directly. It does
not launch a browser. The report includes:

- file type and byte size
- scene/node/mesh/material/image counts
- mesh bounds from `POSITION` accessor `min`/`max` values, including node
  translation/rotation/scale transforms
- external image and buffer dependencies plus missing-file diagnostics
- embedded image/buffer dependency classification for GLB/data URI assets
- scale calibration hints: model dimensions, camera distance, target-height /
  target-length scales, collider dimensions, lane-width ratio, and a gameplay
  verdict for likely too-small or too-large assets

Bounds are reported only when the glTF accessors contain `min` and `max` values;
otherwise the command emits `TN_ASSET_BOUNDS_MISSING` or
`TN_ASSET_BOUNDS_UNAVAILABLE` instead of pretending to decode geometry.

Use `tn model-test` when inspection succeeds but the model still needs isolated
render proof:

```bash
tn model-test assets/model.glb --out artifacts/model-test --verify --json
tn model-test assets/model.glb --out artifacts/model-test --screenshot --url http://127.0.0.1:5173 --json
```

The generated project copies the model and external dependencies, adds a 1m
ruler/floor, translucent bounds marker, and camera/light defaults from the
inspection calibration. The JSON report includes camera frustum metadata, `1x`,
`fit-target`, and `gameplay-recommended` scale presets, projected screen
occupancy, a scale verdict (`too-small`, `ok`, `too-large`, `clipped`, or
`unknown`), and an explicit caveat that isolated proof separates loader/asset
issues from full-scene composition issues. `--screenshot` captures a PNG from
the supplied preview URL; without `--url`, the report returns a stable
unavailable state and next command instead of failing silently.

## Bundle Behavior

- Copy referenced model files into the emitted bundle.
- Copy glTF `.bin` dependencies.
- Copy referenced texture dependencies.
- Preserve logical asset IDs.
- Preserve source scale unless an import profile explicitly overrides it.
- Rewrite or resolve paths so runtime adapters load bundle-local files.
- Validate bundle-relative file existence.
- Keep emitted metadata structured and JSON-first.

## Texture Policy

- Base color and emissive textures are sRGB.
- Normal, metallic-roughness, occlusion, and data textures are linear.
- Missing textures should fail validation when referenced by required V3
  assets.
- Unsupported texture formats should fail before runtime when the target profile
  does not allow them.
- Texture size and memory budgets belong to the target profile and V3
  performance report.

## Budget Policy

Track at least:

- model count
- instance count
- triangle estimate
- draw-call estimate
- texture memory estimate
- bundle size
- load time
- frame timing

Use:

```bash
pnpm verify:v3
```

Relevant report:

- `tools/verify/artifacts/milestones/v3/v3-environment-report.json`
