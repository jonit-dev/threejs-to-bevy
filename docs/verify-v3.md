# verify:v3

`verify:v3` is the authority for the V3 forest environment release gate.

## Command

```bash
pnpm verify:v3
pnpm verify:v3 -- --json
```

## What It Checks

- V3 documentation consistency.
- CLI build.
- `examples/v3-environment` build.
- V3 environment bundle validation.
- V3 environment template scaffold and build.
- Web runtime environment performance and instancing summary.
- Environment scene authoring checks.
- Bookmarked Three.js screenshots.
- Bookmarked Bevy screenshots.
- Three.js/Bevy side-by-side contact sheet generation.
- Preview_2 target reference capture and target-vs-output contact sheet
  generation when the bundle declares `environment.scene.json/referenceImage`.
- Atmosphere profile checks.
- First-person walkthrough checks.
- Walkability and blocking probe checks.

## Artifact Layout

Current artifacts are written under:

```txt
artifacts/v3/
  verification-report.json
  v3-environment-report.json
  v3-scene-report.json
  v3-atmosphere-report.json
  v3-first-person-report.json
  v3-walkability-report.json
  screenshots/
    Preview_2.jpg
    <bookmark>.threejs.png
    <bookmark>.bevy-gltf.png
    preview2-target-vs-output.png
    threejs-bevy-side-by-side.png
  template-smoke/
    v3-environment/
```

The built example bundle lives at:

```txt
examples/v3-environment/dist/forest.bundle/
```

## Pass/Fail Semantics

V3 blocks on:

- docs check failure
- CLI build failure
- V3 example build failure
- bundle validation failure
- template scaffold/build failure
- web performance verification failure
- missing or invalid environment scene metadata
- blank bookmarked Three.js screenshot
- blank bookmarked Bevy screenshot
- missing atmosphere profile, fog/haze, or shadow policy
- first-person verification failure
- walkability verification failure

V3 does not currently block on pixel-perfect Three.js/Bevy visual equivalence.
`v3-scene-report.json` marks native visual parity as `not-asserted`.

V3 scene verification records `visualReview` evidence separately from automated
pass/fail status. The report includes the copied Preview_2 reference artifact,
its bundle-relative source path and hash, the target-vs-output contact sheet
path, and `manualReview.status: "not-recorded"` until a human close-match review
is recorded outside the automated gate.

## Debugging Order

1. Open `artifacts/v3/verification-report.json`.
2. Find the first failed step.
3. Open that step's linked report.
4. If screenshots exist, inspect
   `artifacts/v3/screenshots/threejs-bevy-side-by-side.png`.
5. Inspect `artifacts/v3/screenshots/preview2-target-vs-output.png` to compare
   `Preview_2.jpg` against bookmarked Three.js and Bevy output.
6. Use `pnpm tn -- compare-images <threejs.png> <bevy.png> --json` for
   objective brightness/color/image deltas.
