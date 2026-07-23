# Asset Provenance

Reviewed: 2026-07-23.

The high-value target is a deterministic, project-local generated asset rather
than an external download:

- Recipe: `content/generators/destruction.target-block.recipe.json`
- Generator record: `content/generators/destruction.target-block.generator.json`
- Asset declaration:
  `content/assets/destruction.target-block.assets.json`
- Output: `assets/generated/destruction.target-block.glb`
- SHA-256:
  `fe04e6e8ae9a1addd6d9c5f5d37b56f79bc7305cea4a5148d2f4c828bb247af0`

`tn asset inspect` returned `TN_ASSET_INSPECT_OK`: four mesh nodes, 48
triangles, two authored materials, no missing dependencies, and a
2.345 x 1.846 x 0.775 bound. `tn model-test --verify` returned
`TN_MODEL_TEST_OK`, built the isolated bundle, rendered a nonblank 1280x720
image with seven visible meshes, and matched the concrete and warning
materials.
