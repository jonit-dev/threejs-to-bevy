---
name: threenative-runner-playtest
description: Verify the ThreeNative Crystal Runner example or similar primitive scripted runner gameplay across Three.js web and Bevy native runtimes. Use when asked to playtest runner motion, validate scripted Transform/resource effects, capture multiple web/Bevy screenshots, diagnose player-moving-but-obstacles-static bugs, or prove web/native runner behavior from artifacts.
---

# ThreeNative Runner Playtest

Use this skill in the `threejs-to-bevy` repo for primitive runner examples that
depend on scripted ECS systems moving render entities through `Transform`
patches.

## Build And Contract Checks

Start from the repo root:

```bash
node packages/cli/dist/index.js build --project examples/crystal-runner --json
node packages/cli/dist/index.js validate --project examples/crystal-runner --json
```

If package code changed, build the affected packages first:

```bash
pnpm --filter @threenative/ir build
pnpm --filter @threenative/runtime-web-three build
pnpm --filter @threenative/cli build
```

Inspect the emitted contract:

```bash
jq '{requiredCapabilities, entry, files}' examples/crystal-runner/dist/crystal-runner.bundle/manifest.json
jq '{systems:.systems, schema:.schema}' examples/crystal-runner/dist/crystal-runner.bundle/systems.ir.json
jq '{assets:[.assets[].primitive], assetCount:(.assets|length)}' examples/crystal-runner/dist/crystal-runner.bundle/assets.manifest.json
sed -n '1,220p' examples/crystal-runner/dist/crystal-runner.bundle/scripts.bundle.js
```

Confirm:

- assets are generated primitives only (`box`, `capsule`, etc.)
- manifest capabilities include scripting, input, camera, lights, UI, physics,
  generated primitive meshes, and runtime config
- systems declare `Transform` in `reads`/`writes` when scripts call
  `entity.get("Transform")` or `entity.patch("Transform", ...)`
- `scripts.bundle.js` includes the runner gameplay system and patches obstacle,
  pickup, player, and `RunnerState`

## Web Runtime Playtest

Run the automated verifier:

```bash
node packages/cli/dist/index.js verify --project examples/crystal-runner --frames 4 --expect-motion --json
```

Required evidence:

- status is `pass`
- `checks.nonblank.ok` is true
- `checks.frameDiff.ok` is true with `expectedMotion: true`
- no `pageErrors`
- screenshots exist under `examples/crystal-runner/artifacts/verify/`
- `web-effect-log.json` contains `patch` entries for `Transform` and
  `resource` entries for `RunnerState`

For manual input playtest, start a preview and drive it with Playwright. Save
artifacts under `examples/crystal-runner/artifacts/playtest/`, including:

- `web-00-ready.png`
- `web-01-left.png`
- `web-02-jump.png`
- `web-03-right-running.png`
- `web-04-late.png`
- `web-playtest-report.json`

Use key input (`ArrowLeft`, `Space`, `ArrowRight`) and summarize
`globalThis.__THREENATIVE_EFFECT_LOG__`.

## Bevy Runtime Playtest

Run the native regression that guards the player-moves-but-obstacles-static
class of bug:

```bash
cargo test -p threenative_runtime systems_context_should_include_union_of_declared_query_matches --quiet
```

Then capture multiple native frames:

```bash
for frame in 30 120 240; do
  cargo run --quiet -p threenative_runtime --bin threenative_capture -- \
    /home/joao/projects/threejs-to-bevy/examples/crystal-runner/dist/crystal-runner.bundle \
    camera.main \
    /home/joao/projects/threejs-to-bevy/examples/crystal-runner/artifacts/playtest/bevy-frame-${frame}.png \
    "$frame" || exit 1
done
```

Compare early vs late captures:

```bash
node packages/cli/dist/index.js compare-images \
  examples/crystal-runner/artifacts/playtest/bevy-frame-30.png \
  examples/crystal-runner/artifacts/playtest/bevy-frame-240.png \
  --json
```

Bevy motion is proven when the changed-pixel ratio is above the default
threshold and visual inspection shows cubes/pickups advancing or recycling.

## Common Failure

If the player moves but obstacles/pickups do not in Bevy, inspect:

- `runtime-bevy/crates/threenative_runtime/src/systems_context.rs`
- `runtime-bevy/crates/threenative_runtime/src/systems_host.rs`
- `runtime-bevy/crates/threenative_runtime/src/lib.rs`

The native system context must expose the union of all declared query matches,
not only the first query. Otherwise scripts using `ctx.query({ with:
["Obstacle"] })` see no obstacle entities even though the web runtime works.

## Reporting

Report commands and artifact paths. Include objective metrics:

- web verifier status and `frameDiff.changedPixelRatio`
- web playtest report path and latest transform positions
- Bevy screenshot paths for frames 30, 120, 240
- Bevy compare-images changed-pixel ratio
- native regression test result
