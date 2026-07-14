# Assets Status

Runtime assets are declared in durable source, copied into bundles, and
validated through manifests and inspection tools.

Authoring-time `tn audio generate-sfx` has mock integration evidence for
binary validation, atomic output, registration, optional cue binding,
rollback, and redaction. Its MP3 is an ordinary bundle-local asset. No live
provider smoke is currently claimed.

Current support:

- Optional, authoring-only Blender 4.5.11 lifecycle commands on the pinned host
  manifest: `tn tool status|install|remove blender`. Installation is explicit,
  hash checked, cache scoped, and never occurs during build or runtime.
- Bounded procedural model generation through `tn asset generate <id>
  --provider blender --recipe <path-or-json>`. Recipes support `cube`, `sphere`,
  `cylinder`, `cone`, and `torus`; PBR materials; flat/smooth shading;
  `array`/`bevel`/`boolean`/`mirror`/`solidify`; `join`/`parent`;
  position/rotation/scale tracks; and linear/step interpolation. Raw Python,
  remote recipe inputs, and unbounded operations are rejected.
- Snapshot-first Poly Haven model/texture/HDRI search and import with CC0
  provenance, plus explicit-network Sketchfab search/preview and OAuth-backed
  license/target-scale import. Live Sketchfab download evidence remains pending
  a user OAuth credential.
- Experimental Hyper3D status/generate/poll/import with explicit cost, terms,
  and input-rights acknowledgement, non-secret durable jobs, isolated mode-0600
  polling handles, bounded downloads, conservative rate guidance, scale
  normalization, and fail-closed Hunyuan status with a follow-up link.
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
- `tn model-test assets/hero.glb --verify --json` performs a self-hosted runtime
  capture and fails when the imported material observations do not agree with
  inspected names, base colors, PBR factors, or texture presence. Generated
  projects use version-derived package references and remain buildable after a
  move; imported source materials are owned by a generic model-asset contract,
  not a model-ID allowlist.
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
- `tn asset strategy --json`
- `tn asset provider search poly-haven --query crate --type models --live --json`
- `tn asset provider preview sketchfab <model-uid> --json`
- `tn asset generate robot.guardian --provider blender --recipe content/generators/robot.guardian.recipe.json --json`
- `tn environment add-scatter-layer --json`
- `tn world generate --json`
- `tn world proof --json`
- `tn model-test assets/hero.glb --screenshot --json`
- `tn model-test assets/hero.glb --angles 0,90,180,270 --json`
- `pnpm verify:model-test-material`
- `pnpm verify:release`
- `pnpm verify:blender-tool`
- `pnpm verify:blender-host` (downloads nothing implicitly; requires an already
  installed/acknowledged managed Blender and runs all three retained recipes)
- `pnpm verify:cookbook:blender` (same explicit installed-tool boundary, with
  record, two reruns, inspect, four-angle model-test, validate, and build)
- `pnpm verify:blender-package` (packs the CLI and rejects Blender archives,
  executables, and cache paths while requiring the owned runner)

Promotion boundary: Linux x64 has a real pinned-install and checked host smoke
for three bounded generated props, including exact mesh/material/triangle/bounds
baselines, actual owned-runner argv, output hashes, authoring/build success, and
cleanup. Humanoid animation and native visual work remains experimental rather
than part of this release gate. macOS x64/arm64 and Windows x64 remain
explicitly unproven rather than inferred from manifest URLs.

The fixed BlenderMCP outcome inventory retains 22 rows: 19 have full,
equivalent, or safe-replacement evidence; arbitrary `execute_blender_code`
remains a bounded recipe safe replacement; Hunyuan generate/poll/import remain
three visible deferred rows. The checked gate report is generated by
`pnpm verify:blender-tool`.

Evidence and owning gates:

- [retained lifecycle, coverage, and provider evidence](../../../tools/verify/evidence/blender-tool.json)
- [three checked recipe inputs](../../../tools/verify/evidence/blender-recipes)
- [promotion gate](../../../tools/verify/src/blenderToolGate.ts) and
  [real host collector](../../../tools/verify/src/blenderHostSmoke.ts)
- [package-content enforcement](../../../tools/verify/src/blenderPackageContents.ts)
- [portable model-test/material gate](../../../tools/verify/src/modelTestMaterialGate.ts),
  [expected/observed material report](../../../tools/verify/artifacts/model-test-material/material-report.json),
  and [four-angle contact sheet](../../../tools/verify/artifacts/model-test-material/contact-sheet.png)
- [phase evidence and pending boundaries](../../PRDs/other/optional-headless-blender-asset-generation.md#verification-evidence)

The commands write hash-bound reports under
`tools/verify/artifacts/blender-tool/`; scheduled CI retains each host report as
a matrix artifact.

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
