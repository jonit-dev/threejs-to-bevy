# Conformance Fixtures

Conformance fixtures are shared IR bundles consumed by both the Three.js web
runtime and the Bevy native runtime. They are source fixtures, not generated
runtime artifacts.

Each fixture directory contains:

- `game.bundle/manifest.json`
- `game.bundle/world.ir.json`
- `game.bundle/materials.ir.json`
- `game.bundle/assets.manifest.json`
- `game.bundle/target.profile.json`

Expected runtime reports should be written outside this fixture tree. The
top-level gate writes:

```txt
artifacts/conformance/<fixture>/<runtime>.report.json
artifacts/conformance/<fixture>/comparison.report.json
```

Package-local tests may write equivalent temporary reports under their own
test artifact directories, but committed fixture source directories must contain
only authored IR inputs and catalog documentation.

## Catalog

| Fixture | Capability tags | Purpose |
| --- | --- | --- |
| `basic-scene` | `rendering:mesh.primitive.box`, `rendering:material.standard`, `rendering:light.directional`, `rendering:camera.perspective`, `transform:hierarchy` | Baseline scene for transform hierarchy, generated mesh, standard material, camera, and light mapping. |
