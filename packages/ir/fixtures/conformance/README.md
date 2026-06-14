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
| `v6-resources-events` | `ecs:event-schemas`, `ecs:events`, `ecs:resource-schemas`, `ecs:resources`, `scripting:event-reads`, `scripting:event-writes`, `scripting:resource-reads`, `scripting:resource-writes`, `scripting:systems` | V6 resource/event conformance fixture for serialized resource values, queued event values, and system access declarations. |
| `v5-drift-surface` | `asset:model.gltf`, `asset:texture.png`, `environment:atmosphere`, `environment:camera-bookmarks`, `environment:instances`, `environment:path`, `environment:scene`, `environment:source-assets`, `environment:terrain`, `rendering:camera.active`, `rendering:camera.orthographic`, `rendering:fog.exponential`, `rendering:light.ambient`, `rendering:light.angle`, `rendering:light.point`, `rendering:light.range`, `rendering:light.spot`, `rendering:material.texture.base-color`, `rendering:material.texture.emissive`, `rendering:material.texture.metallic-roughness`, `rendering:material.texture.normal`, `rendering:material.texture.occlusion`, `rendering:shadows`, `rendering:visibility`, `scripting:script-bundle`, `transform:hierarchy` | V5 drift catalog fixture for visibility, active orthographic camera, point/spot lights, texture slots, atmosphere metadata, source environment assets, and compact V4 scripting metadata. |
