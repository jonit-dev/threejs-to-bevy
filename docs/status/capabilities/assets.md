# Assets Status

Runtime assets are declared in durable source, copied into bundles, and
validated through manifests and inspection tools.

Current support:

- Asset, material, mesh, audio, animation, GLB/glTF, texture, heightmap,
  environment, and generated mesh source documents.
- Heightmap assets are contract-level structured JSON terrain inputs with
  dimension, encoding, height-range, splat-layer, target cell-budget
  validation, compiler-emitted generated terrain chunk mesh descriptors, and
  web and Bevy runtime rendering from hydrated generated mesh payloads.
- Environment scatter layers can be authored through structured source/CLI and
  lower deterministically against generated terrain samples with height, slope,
  path, and exclusion-zone filters.
- `tn world generate --biome <name>` writes deterministic structured heightmap
  source, terrain/scatter environment source, and catalog provenance for
  meadow, forest, desert, canyon, and arctic starts.
- SQLite-backed asset-source catalog for generated games, with provenance and
  license metadata expected beside committed assets.
- Asset inspection, model tests, bundle-local path validation, and production
  evidence gates.

Verification:

- `tn asset source search --json`
- `tn asset inspect --json`
- `tn environment add-scatter-layer --json`
- `tn world generate --json`
- `tn world proof --json`
- `tn model-test --json`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
