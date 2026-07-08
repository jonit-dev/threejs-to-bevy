# Assets Status

Runtime assets are declared in durable source, copied into bundles, and
validated through manifests and inspection tools.

Current support:

- Asset, material, mesh, audio, animation, GLB/glTF, texture, heightmap,
  environment, and generated mesh source documents.
- Heightmap assets are contract-level structured JSON terrain inputs with
  dimension, encoding, height-range, splat-layer, and target cell-budget
  validation; runtime terrain chunking/collision remains PRD-006 follow-up.
- SQLite-backed asset-source catalog for generated games, with provenance and
  license metadata expected beside committed assets.
- Asset inspection, model tests, bundle-local path validation, and production
  evidence gates.

Verification:

- `tn asset source search --json`
- `tn asset inspect --json`
- `tn model-test --json`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
