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

- `artifacts/v3/v3-environment-report.json`
