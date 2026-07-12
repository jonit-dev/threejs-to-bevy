# Assets Status

Runtime assets are declared in durable source, copied into bundles, and
validated through manifests and inspection tools.

Authoring-time `tn audio generate-sfx` has mock integration evidence for
binary validation, atomic output, registration, optional cue binding,
rollback, and redaction. Its MP3 is an ordinary bundle-local asset. No live
provider smoke is currently claimed.

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

GLB/glTF visual inspection is available through the web preview workflow:

- `tn model-test assets/hero.glb --view` generates, builds, and serves an
  interactive one-model preview until interrupted. Add `--angle 45` to author
  a deterministic model yaw.
- `tn model-test assets/hero.glb --screenshot --json` self-hosts the generated
  project, captures one PNG, and reports canvas, nonblank, runtime, and resource
  checks. `--url <preview-url>` remains available for an externally managed
  single-frame preview.
- `tn model-test assets/hero.glb --angles 0,90,180,270 --json` normalizes and
  deduplicates bounded angles (one to 36 captures), writes individual PNGs
  under `artifacts/turntable/`, and emits a structured `manifest.json`. A
  failed capture preserves completed records and restores the generated source
  and verified bundle to zero yaw.

These are web-only inspection artifacts. They separate asset loading, bounds,
scale, and framing issues from full-scene composition, but they are not Bevy
visual-parity evidence.

Verification:

- `tn asset source search --json`
- `tn asset inspect --json`
- `tn environment add-scatter-layer --json`
- `tn world generate --json`
- `tn world proof --json`
- `tn model-test assets/hero.glb --screenshot --json`
- `tn model-test assets/hero.glb --angles 0,90,180,270 --json`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
