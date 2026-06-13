# V3 Environment Example

This example is the V3 sandboxed game folder. It reads the canonical source pack
from `assets-source/environment/glTF` and emits a self-contained bundle at
`dist/forest.bundle`.

The emitted bundle contains deterministic IR files, selected glTF models,
required `.bin` sidecars, referenced textures, and the `Preview_2.jpg` reference
image under bundle-local `assets/environment` paths.

The scene source defines the forest terrain bounds, central walkable path,
exclusion zones, deterministic scatter specs, authored hero placements, and
camera bookmarks in `src/game.ts`.

Build and validate:

```bash
pnpm tn -- build --project examples/v3-environment
```

V3 performance verification writes metrics and raw frame samples under
`artifacts/v3`, including `v3-performance-summary.json` and
`v3-performance-samples.json`. Scene authoring verification also writes
`v3-scene-report.json` with the bundle hash, environment IR path, hero/scatter
counts, path point count, and bookmark count. Atmosphere verification writes
`v3-atmosphere-report.json` with the active lighting, fog, sky, shadow, and
color-management observation.
