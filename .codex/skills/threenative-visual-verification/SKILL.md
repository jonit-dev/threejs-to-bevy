---
name: threenative-visual-verification
description: Use this skill in the threejs-to-benvy repo when verifying V1 web rendering, comparing screenshots, inspecting visual artifacts, or iterating on blank canvas, framing, lighting, color, or frame-change issues.
---

# ThreeNative Visual Verification

Use the repo CLI as the source of truth. Do not replace it with ad hoc browser checks unless the CLI is broken and you are debugging the CLI itself.

## V1 Web Fast Loop

1. Build once when source changed:
   ```bash
   pnpm tn -- build --project examples/v1-canonical
   ```
2. Start or reuse a web preview when repeatedly iterating:
   ```bash
   pnpm tn -- dev --target web --project examples/v1-canonical --json
   ```
3. Reuse that URL for quick verification:
   ```bash
   pnpm tn -- verify --project examples/v1-canonical --url <preview-url> --frames 2 --json
   ```

   After `pnpm --filter @threenative/cli build`, the fastest inner loop is:
   ```bash
   node packages/cli/dist/index.js verify --project examples/v1-canonical --url <preview-url> --frames 2 --json
   ```

When no preview is running, use the full command:

```bash
pnpm tn -- verify --project examples/v1-canonical --frames 2 --json
```

## Artifacts To Inspect

The verifier writes:

- `examples/v1-canonical/artifacts/verify/frame-01.png`
- `examples/v1-canonical/artifacts/verify/frame-02.png`
- `examples/v1-canonical/artifacts/verify/verification-report.json`

Always inspect the JSON report before deciding the scene is visually correct. It includes:

- `status`
- `diagnostics`
- `previewUrl`
- screenshot paths
- canvas size
- nonblank ratio
- frame diff ratio
- average brightness delta
- average RGB deltas
- browser console logs, page errors, request failures, and runtime readiness data

## Screenshot Comparison

Use this when comparing two saved PNGs, including subtle lighting/color changes:

```bash
pnpm tn -- compare-images <first.png> <second.png> --json
```

Look at:

- `changedPixelRatio` for structural/image changes
- `averageBrightnessDelta` for lightening/darkening
- `averageColorDelta.red|green|blue` for color shifts

This is the current objective image-diff primitive. It is generic: it does not
know whether a delta came from lighting, camera, material, geometry, fog,
shadow, or asset placement. Use it as supporting evidence, not as a complete
runtime parity gate.

## V3 Release Gate

Use this for the current V3 environment proof:

```bash
pnpm verify:v3
pnpm verify:v3 -- --json
```

`verify:v3` builds the CLI, builds and validates `examples/v3-environment`,
checks the V3 template, and then runs these verifier modules from
`packages/cli/src/verify`:

- `v3Environment.ts`: web runtime performance and instancing summary.
- `v3Scene.ts`: environment scene authoring checks, bookmark screenshots, Bevy
  capture smoke, and the Three.js/Bevy side-by-side contact sheet.
- `v3Atmosphere.ts`: declared atmosphere profile, fog/haze, shadow, sky, and
  lighting metadata checks.
- `v3FirstPerson.ts`: first-person camera/control contract checks.
- `v3Walkability.ts`: walkability bounds and deterministic movement checks.

The aggregate report is written to:

- `artifacts/v3/verification-report.json`

Important linked reports and artifacts:

- `artifacts/v3/v3-environment-report.json`
- `artifacts/v3/v3-scene-report.json`
- `artifacts/v3/v3-atmosphere-report.json`
- `artifacts/v3/v3-first-person-report.json`
- `artifacts/v3/v3-walkability-report.json`
- `artifacts/v3/screenshots/*.threejs.png`
- `artifacts/v3/screenshots/*.bevy-gltf.png`
- `artifacts/v3/screenshots/threejs-bevy-side-by-side.png`

## Three.js vs Bevy Visual Parity

Current state: V3 scene verification captures both Three.js and Bevy images and
checks that neither side is blank, but it does not assert visual parity. The
`v3-scene-report.json` field is currently:

```json
{ "nativeSmoke": { "visualParity": "not-asserted" } }
```

For manual or exploratory comparison, run `pnpm verify:v3`, then compare a
matching bookmark pair:

```bash
pnpm tn -- compare-images \
  artifacts/v3/screenshots/<bookmark>.threejs.png \
  artifacts/v3/screenshots/<bookmark>.bevy-gltf.png \
  --json
```

Use the side-by-side contact sheet for human inspection and the JSON comparison
for objective deltas. Do not claim runtime parity just because both screenshots
are nonblank.

## Lighting And Atmosphere Checks

There is no dedicated objective lighting parity script yet. The current split is:

- `v3Atmosphere.ts` verifies that the bundle declares atmosphere/lighting
  features such as an active atmosphere profile, fog or haze, and shadow policy.
- `compare-images` can quantify brightness and RGB deltas between two PNGs.
- `v3Scene.ts` can produce Three.js and Bevy screenshot pairs for the same
  bookmark, but marks visual parity as not asserted.

To investigate lighting differences today:

1. Run `pnpm verify:v3`.
2. Inspect `artifacts/v3/v3-atmosphere-report.json`.
3. Inspect `artifacts/v3/screenshots/threejs-bevy-side-by-side.png`.
4. Run `pnpm tn -- compare-images` on matching bookmark PNGs.
5. Use `averageBrightnessDelta` and `averageColorDelta` to describe the
   difference objectively.

A future lighting parity gate should compare matching Three.js and Bevy
bookmark screenshots with explicit thresholds for brightness delta, RGB channel
delta, and changed-pixel ratio, then write a dedicated pass/fail report.

## Rendering Parity Validation Playbook

Use layered validation. Screenshot diffs alone are too late and too noisy; they
should confirm lower-level contracts rather than replace them.

### 1. Contract And Schema Validation

Goal: prove both runtimes receive the same portable data.

Use:

```bash
pnpm tn -- build --project <project> --json
pnpm tn -- validate --project <project> --json
pnpm verify:conformance
```

Check:

- `manifest.json` points at the expected IR files.
- `world.ir.json`, `materials.ir.json`, `assets.manifest.json`,
  `environment.scene.json`, and `target.profile.json` validate.
- Unsupported render features fail before runtime.
- IDs for cameras, lights, materials, meshes, textures, and environment
  instances are stable.

### 2. Runtime Mapping Conformance

Goal: prove each adapter maps the same IR fields to equivalent runtime concepts.

Use focused TypeScript and Rust tests before image tests:

- SDK/compiler tests for emitted bundle shape.
- `packages/runtime-web-three` tests for Three.js mapping.
- `runtime-bevy` tests for Bevy component/material/light/camera mapping.
- `pnpm verify:conformance` for shared fixture contracts.

Check at least:

- transform position, rotation, scale, and hierarchy
- perspective and orthographic camera projection fields
- active camera selection
- ambient, directional, point, and spot light fields
- material base color, roughness, metalness, alpha, and texture slots
- visibility flags and render layers
- primitive geometry dimensions and imported asset transforms
- coordinate, unit, handedness, rotation, and color-space conventions

### 3. Deterministic Fixture Scenes

Goal: isolate render differences by feature.

Prefer small fixtures over debugging the full forest scene first:

- unlit color cards
- PBR material grid
- one primitive under ambient light only
- one primitive under directional light only
- point/spot light falloff scene
- shadow receiver/caster scene
- fog/haze depth ramp
- texture slot swatches
- glTF transform and scale fixture
- camera FOV/framing grid
- visibility and layer fixture

Each fixture should render from named bookmarks so Three.js and Bevy captures
use the same camera intent.

### 4. Image Capture Parity

Goal: compare equivalent screenshots, not arbitrary camera views.

Use V3 scene verification for current bookmark captures:

```bash
pnpm verify:v3
```

Inspect:

- `artifacts/v3/v3-scene-report.json`
- `artifacts/v3/screenshots/*.threejs.png`
- `artifacts/v3/screenshots/*.bevy-gltf.png`
- `artifacts/v3/screenshots/threejs-bevy-side-by-side.png`

Requirements for a useful capture:

- same bundle
- same bookmark ID
- same viewport size
- same camera projection
- same loaded asset set
- same animation/time state, or a static frame
- deterministic background/clear color
- no debug overlays unless both sides show the same overlay

### 5. Objective Image Metrics

Current available metric command:

```bash
pnpm tn -- compare-images <threejs.png> <bevy.png> --json
```

Current metrics:

- `changedPixelRatio`
- `averageBrightnessDelta`
- `averageColorDelta.red`
- `averageColorDelta.green`
- `averageColorDelta.blue`

Future parity metrics worth adding:

- max channel delta
- median and 95th percentile channel delta
- luma delta histogram
- per-channel histogram distance
- perceptual color delta such as Delta E
- SSIM or MS-SSIM for structural similarity
- edge/silhouette diff for geometry and camera framing
- masked region diffs for sky, terrain, hero object, foreground, and UI
- alpha coverage diff
- shadow-region brightness diff
- fog/depth ramp profile diff
- over/under-exposure pixel counts

Use thresholds per fixture class. A shadow/fog scene needs different tolerances
than a flat color card.

### 6. Lighting-Specific Validation

Goal: separate lighting bugs from geometry, camera, and asset bugs.

Validate in this order:

1. Declared atmosphere data:
   `artifacts/v3/v3-atmosphere-report.json`
2. Light entity/component mapping in web and Bevy tests.
3. Controlled lighting fixtures with simple geometry.
4. Screenshot metrics on matching bookmark pairs.
5. Full V3 scene contact sheet.

Lighting checks should cover:

- ambient intensity and color
- directional light direction, color, and intensity
- point light range/falloff
- spot light angle/range/falloff
- shadow enablement and map size
- tone mapping and exposure
- color-space conversion
- fog/haze color, near/far, and density
- sky/background color
- material response under known light values

Do not debug forest-scene lighting parity until the simple ambient,
directional, shadow, and fog fixtures are close.

### 7. Geometry And Camera Validation

Goal: avoid blaming lighting when the image differs because objects are in the
wrong place.

Check:

- camera position, rotation, FOV, near/far, and aspect
- imported glTF scale and root transform
- primitive geometry dimensions
- hierarchy inheritance
- object visibility
- clipping or culling differences
- instance counts and transforms
- winding, normals, and tangent generation

Useful image metrics:

- edge/silhouette diff
- bounding-box/object-mask diff
- screenshot overlay/contact sheet inspection

### 8. Material And Texture Validation

Goal: prove both runtimes interpret the same material inputs.

Check:

- base color and alpha
- linear vs sRGB texture interpretation
- roughness and metalness
- normal map conventions, when supported
- texture UV transform, when supported
- missing texture fallback color
- transparency sorting and alpha mode, when supported

Use material grid fixtures and compare the same swatch positions rather than
only comparing whole-scene averages.

### 9. Performance And Budget Validation

Rendering parity also includes staying inside the intended runtime budget.

Use:

```bash
pnpm verify:v3
```

Inspect:

- `artifacts/v3/v3-environment-report.json`
- draw calls
- instance counts
- triangle estimates
- bundle and asset sizes
- load/frame timing samples

Do not accept a visually close result that regresses the web performance budget
or relies on runtime-specific rendering shortcuts.

### 10. Reporting Standard

When reporting rendering parity work, include:

- exact command run
- bundle path and hash if available
- report paths
- screenshot paths
- contact sheet path
- metric JSON from `compare-images`
- whether parity was asserted or only manually inspected
- known non-parity areas, such as placeholder assets or missing texture support

If a gate is not implemented, say so explicitly. For example:

```txt
Three.js and Bevy screenshots were captured and compared manually.
Objective image parity is not currently asserted by verify:v3.
```

## Iteration Rules

- If the canvas is missing or zero-sized, inspect runtime-web and browser errors first.
- If the screenshot is blank, inspect camera/framing, transforms, lights, material colors, and runtime diagnostics.
- If the frame diff is zero but motion was expected, rerun with `--expect-motion` and inspect animation/runtime code.
- If Three.js and Bevy differ visually, first check whether the report says
  `visualParity: "not-asserted"` before treating the difference as a failed
  gate.
- For lighting or color changes, prefer `compare-images --json` plus the
  atmosphere report over subjective screenshot descriptions alone.
- Keep generated screenshots and reports only when they are deliberate evidence for a PRD or debugging handoff.
