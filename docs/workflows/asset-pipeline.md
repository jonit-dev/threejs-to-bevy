# V3 Asset Pipeline

V3 is asset-heavy. The asset pipeline must keep bundle output deterministic,
bundle-local, and inspectable.

## Supported Inputs

- glTF
- GLB
- `.bin` dependencies
- PNG textures
- JPEG textures
- WebP textures when supported by the target runtime/profile

## Source Catalog To Inspect Loop

Before downloading or referencing a third-party model for generated games,
examples, starters, or visual fixtures, query the asset source catalog:

```bash
tn asset source search --game-category underwater --format glb --direct-only --json
tn asset source get babylon-grey-snapper-vert-color --json
tn asset strategy --json
```

Prefer direct records with `isDirectDownload: true`, a compatible
`licenseId`/`licensePosture`, and complete `origin`/`sourceMetadata`. If no
direct model fits, search typed fallback records, for example
`--file-role pack-page`, `--file-role material-index`, `--file-role
texture-index`, or `--file-role hdri-index`, then use
`docs/workflows/open-source-3d-asset-kits.md` for human review.

After selecting a model, preserve the catalog ID, direct URL, source URL,
provenance URL, origin name, origin URL, license evidence, review status,
downloaded date, and conversion notes next to the committed asset. Then inspect
the downloaded model before placing it in a scene:

```bash
tn asset inspect assets/model.glb --json
tn model-test assets/model.glb --out artifacts/model-test --verify --json
```

## Optional Providers And Bounded Blender Generation

Poly Haven is CC0-first and snapshot-first. Live search is explicit; imported
models, texture sets, and HDRIs are copied to bundle-local files with source,
author, license, selection, hash, and derivation provenance:

```bash
tn asset provider search poly-haven --query brick --type textures --live --json
tn asset provider import poly-haven brick_floor_001 --type textures --resolution 1k --format png --id material.brick --project . --json
```

Sketchfab search and previews are public, but download requires a personal
OAuth Bearer token in `THREENATIVE_SKETCHFAB_OAUTH_TOKEN`, an explicit canonical
license acknowledgement, and target meter size. Third-party applications need
their own Sketchfab OAuth integration and applicable agreement.

```bash
tn asset provider search sketchfab --query chair --json
tn asset provider preview sketchfab <model-uid> --json
tn asset provider import sketchfab <model-uid> --accept-license cc-by --target-size 1 --id chair --project . --json
```

Hyper3D Rodin is experimental and opt-in. Status is offline unless `--live` is
passed. Generation accepts exactly one prompt or project-local PNG/JPEG/WebP
and requires separate cost, provider-terms, and input-rights acknowledgements.
The documented Gen-2 base is 0.5 credit and requires a Business subscription;
review current pricing and terms before every paid submission. Polling is one
explicit request, never a daemon or recursive wait. Poll conservatively, honor
HTTP 429 `Retry-After`, and re-check the provider's current API rate limit
before scripting requests. Durable job records retain only non-secret hashes,
state, expiry, and provider task IDs. The polling handle is isolated in a
project-local mode-0600 `.secret.json` sidecar; stdout, source, bundles,
provenance, and evidence omit credentials, polling handles, and signed URLs.
Hunyuan status is visible and fail-closed; its job handlers are absent. The
official-source review is recorded in
[`docs/audits/hyper3d-provider-review-2026-07-14.md`](../audits/hyper3d-provider-review-2026-07-14.md).

```bash
tn asset model-provider status hyper3d --json
tn asset model-provider generate hyper3d --id crate-job --prompt "beveled sci-fi crate" --accept-cost --accept-provider-terms --confirm-input-rights --project . --json
tn asset model-provider poll hyper3d crate-job --project . --json
tn asset model-provider import hyper3d crate-job --id crate.generated --target-size 1.2 --project . --json
```

Blender is an optional authoring-only tool, never a runtime dependency. The
managed install is roughly 378-399 MB compressed depending on host and is only
downloaded after `--accept-download`; source URL, expected size, SHA-256, and
Blender 4.5.11 are pinned in the external-tool manifest. The cache defaults to
the platform user cache under `threenative/tools`; `THREENATIVE_TOOL_CACHE`
overrides it and `THREENATIVE_BLENDER_PATH` selects a reviewed existing binary.
Normal proxy environment variables are honored by the Node download. Offline
use works after installation; removal is explicit. Interrupted downloads,
hash mismatch, stale locks, timeouts, traversal, recipe budgets, and malformed
GLBs fail with stable `TN_*` diagnostics and cleanup staging/lock/process state.

```bash
tn tool status blender --json
tn tool install blender --accept-download --json
tn asset generate prop.crate --provider blender --recipe content/generators/prop.crate.recipe.json --project . --json
tn asset inspect assets/generated/prop.crate.glb --json
tn model-test assets/generated/prop.crate.glb --angles 0,45,90,180 --json
tn tool remove blender --json
```

Recipes use a closed vocabulary: `cube`, `sphere`, `cylinder`, `cone`, and
`torus` primitives; flat/smooth shading; `array`, `bevel`, `boolean`, `mirror`,
and `solidify` modifiers; `join` and `parent` hierarchy operations;
position/rotation/scale animation tracks; and linear/step interpolation. Raw
Python, arbitrary Blender code/add-ons/operators/drivers/modules, remote
recipes, GUI/Xvfb, `.blend` import, rigs, and unbounded providerless text-to-3D
are not supported.

A source-backed recipe may instead name one self-contained project-local GLB
below `assets/`. In that mode, generated parts remain forbidden. The bounded
`split-by-axis` operation may separate one imported mesh whose disconnected
surfaces already lie strictly on opposite sides of an authored-space
threshold; it emits two uniquely named nodes without adding polygons. Other
source operations remain forbidden. Animation tracks target exact unique
imported or split-output node names reported by `tn asset inspect`.
Optional material rows target exact imported material names and patch bounded
factors such as `metallic` or `roughness` while preserving unpatched source
texture maps.
Position and rotation values are local offsets from the imported pose, while
scale values multiply the imported scale. A source-backed rotation track may
also declare a `pivot` in the model's authored Y-up coordinates. The runner
creates a bounded parent pivot, preserves the target's rest pose, and exports
the rotation on that parent so detached control surfaces hinge around their
real edge rather than the model origin. Pivots are rejected on generated
recipes and non-rotation tracks. Source bytes are included in the generator
input hash. Missing or ambiguous targets or materials, conflicting pivots,
split thresholds that intersect a vertex or face, output collisions, external
dependencies, clip-name collisions, traversal/symlinks, missing emitted clips,
and source/output budget violations fail before promotion:

```json
{
  "schema": "threenative.blender-recipe",
  "version": "0.1.0",
  "id": "aircraft.animated",
  "source": "assets/imported/aircraft.source.glb",
  "animations": [{
    "id": "propeller.spin",
    "duration": 1,
    "loop": true,
    "tracks": [{
      "node": "Propeller",
      "property": "rotation",
      "pivot": [0, 0, 0.75],
      "keyframes": [
        { "time": 0, "value": [0, 0, 0] },
        { "time": 1, "value": [0, 0, 360] }
      ]
    }]
  }],
  "budgets": { "maxPolygons": 200000, "maxOutputBytes": 50000000 }
}
```

Linux x64 has retained real generation proof. macOS
x64/arm64 and Windows x64 remain rejected with
`TN_EXTERNAL_TOOL_HOST_UNPROVEN` until the opt-in matrix retains equivalent
install, cleanup, generation, and visual evidence.

### Reviewed img2threejs GLB Finalization

Use the internal img2threejs provider only when the user explicitly selects a
ThreeNative/GLB result after the skill's image assessment, sculpt-spec build
passes, and visual reviews are accepted. It is not a one-shot image-to-3D
command and does not replace that judgment. Prefer the catalog for an existing
asset and the bounded Blender provider for a simple structured primitive
recipe; choose img2threejs when a reviewed project-local Three.js factory is
the durable source that must be finalized as a normal GLB.

The reviewed workspace owns these inputs:

```text
content/references/<id>.png
content/generators/<id>.sculpt-spec.json
content/generators/<id>.validation.json
content/generators/<id>.img2threejs.json
src/generators/create<Model>.ts
```

The recipe is structured JSON and names the reviewed source image, validated
sculpt spec, local factory module/export, pinned upstream identity, output
options, and budgets. CLI and MCP accept a project-local recipe path; neither
surface accepts inline TypeScript, a remote factory URL, browser handles, or
an unreviewed upstream commit.

```bash
tn asset generate prop.radio --provider img2threejs --recipe content/generators/prop.radio.img2threejs.json --project . --json
tn generator run prop.radio --project . --json
tn asset inspect assets/generated/prop.radio.glb --json
tn model-test assets/generated/prop.radio.glb --angles 0,90,180,270 --out artifacts/model-test --json
tn authoring validate --project . --json
tn build --project . --json
```

Finalization executes the declared factory once in isolated, network-blocked
Chromium, embeds supported reviewed local/canvas textures, validates the GLB,
compares fixed source/reload renders, and atomically commits the GLB,
hash-bound generator provenance, and normal asset registration. After that,
the generated file follows the ordinary bundle-local GLB path in web and Bevy;
img2threejs, its Python scripts, review prompts, and authoring factory are not
runtime dependencies. `manual` and `skip` preserve changed/unowned output;
`replace` must be explicit.

Fix compatibility or parity failures in the sculpt spec, factory, or reviewed
local resource and repeat the skill review. Do not edit emitted GLB bytes or
weaken proof thresholds. V1 is limited to the documented object-focused
triangle geometry, Basic/Standard materials, six texture slots, and typed
socket/collider/destruction metadata. Physical/custom shaders, rigs, morphs,
animations, review lights/cameras/helpers, external resources, broader
upstream factories, and native pixel parity remain unsupported. Record source
rights separately from the MIT-licensed skill code. The executable clean-project
pattern is [img2threejs generated prop](../cookbook/img2threejs-generated-prop.md),
and the pinned fork/sync procedure is [the vendor record](../vendor/img2threejs.md).

## Inspecting Model Scale and Dependencies

Use the CLI inspection workflow before placing a new model into gameplay space:

```bash
tn asset inspect assets/model.glb
tn asset inspect assets/model.gltf --json
```

`tn asset inspect` reads `.glb` JSON chunks and `.gltf` files directly. It does
not launch a browser. The report includes:

- file type and byte size
- scene/node/mesh/material/image counts
- mesh bounds from `POSITION` accessor `min`/`max` values, including node
  translation/rotation/scale transforms
- external image and buffer dependencies plus missing-file diagnostics
- embedded image/buffer dependency classification for GLB/data URI assets
- scale calibration hints: model dimensions, camera distance, target-height /
  target-length scales, collider dimensions, lane-width ratio, and a gameplay
  verdict for likely too-small or too-large assets

Bounds are reported only when the glTF accessors contain `min` and `max` values;
otherwise the command emits `TN_ASSET_BOUNDS_MISSING` or
`TN_ASSET_BOUNDS_UNAVAILABLE` instead of pretending to decode geometry.

Use `tn model-test` when inspection succeeds but the model still needs isolated
render proof:

```bash
tn model-test assets/model.glb --out artifacts/model-test --verify --json
tn model-test assets/model.glb --out artifacts/model-test --view
tn model-test assets/model.glb --out artifacts/model-test --screenshot --json
tn model-test assets/model.glb --out artifacts/model-test --screenshot --angle 45 --json
tn model-test assets/model.glb --out artifacts/model-test --angles 0,90,180,270 --json
tn model-test assets/model.glb --out artifacts/model-test --screenshot --url http://127.0.0.1:5173 --json
```

The generated project copies the model and external dependencies, adds a 1m
ruler/floor, translucent bounds marker, and camera/light defaults from the
inspection calibration. Package dependencies are compatible published versions
derived from the running CLI package, so the project can be moved without
retaining a developer-checkout path. The model prefab is asset-only: imported
glTF materials own the loaded meshes, while a failed load remains an explicit
runtime diagnostic rather than a white primitive that can pass as the model.
The JSON report includes camera frustum metadata, `1x`,
`fit-target`, and `gameplay-recommended` scale presets, projected screen
occupancy, a scale verdict (`too-small`, `ok`, `too-large`, `clipped`, or
`unknown`), and an explicit caveat that isolated proof separates loader/asset
issues from full-scene composition issues. `--verify` now self-hosts a runtime
capture and compares plural inspection-time and runtime material observations:
name, base color, metallic, roughness, and base-color/metallic-roughness texture
presence. A colored or materialized asset that resolves only to the default
white material fails closed. `--screenshot` self-hosts the
generated bundle when `--url` is omitted and captures a PNG with
runtime/nonblank checks. `--angles` implies self-hosted turntable capture,
normalizes duplicate angles, limits runs to 36 distinct angles, and writes a
manifest under `artifacts/turntable/`. The generated source is restored to zero
yaw after every turntable run. Web captures are inspection evidence only and
do not claim Bevy parity.

Repository maintainers can rerun the retained positive, relocation, four-angle,
and white-fallback negative controls with `pnpm verify:model-test-material`.

## Bundle Behavior

- Copy referenced model files into the emitted bundle.
- Copy glTF `.bin` dependencies.
- Copy referenced texture dependencies.
- Preserve logical asset IDs.
- Preserve source scale unless an import profile explicitly overrides it.
- Rewrite or resolve paths so runtime adapters load bundle-local files.
- Validate bundle-relative file existence.
- Keep emitted metadata structured and JSON-first.

## Texture Policy

- Base color and emissive textures are sRGB.
- Normal, metallic-roughness, occlusion, and data textures are linear.
- Missing textures should fail validation when referenced by required V3
  assets.
- Unsupported texture formats should fail before runtime when the target profile
  does not allow them.
- Texture size and memory budgets belong to the target profile and V3
  performance report.

## Budget Policy

Track at least:

- model count
- instance count
- triangle estimate
- draw-call estimate
- texture memory estimate
- bundle size
- load time
- frame timing

Use:

```bash
pnpm verify:v3
```

Relevant report:

- `tools/verify/artifacts/milestones/v3/v3-environment-report.json`
