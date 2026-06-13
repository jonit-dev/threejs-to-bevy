# Bevy Feature Parity Drift

Purpose: keep V3 honest. This is not a Bevy API coverage matrix. It only tracks
the product-contract drift that matters for the current V3 forest scene:

```txt
TypeScript authoring -> validated IR bundle -> web-three + native Bevy behavior
```

Baseline: Bevy 0.18, released January 13, 2026.

## Status

| Status | Meaning |
| --- | --- |
| ✅ | Implemented consistently enough across SDK/IR/compiler/runtime/tests for the current scope. |
| ⚠️ | Some pieces exist, but SDK, IR, validation, web, Bevy, or verification disagree. |
| ❌ | Not implemented in the repo yet. |

## V3 Parity

| Area | Status | What's drifting or missing |
| --- | --- | --- |
| Stable entities, transforms, hierarchy | ✅ | V1 contract is present across IR, web, and Bevy. Keep conformance green. |
| Primitive mesh rendering | ✅ | Box/sphere/plane are proven; capsule/cylinder appear in IR/Bevy but need matching SDK/web confidence before treating as broad parity. |
| Perspective camera | ✅ | Current cross-runtime path is usable. Orthographic exists in IR/Bevy but is not the V3 proof path. |
| Ambient/directional lights | ✅ | Current baseline works. |
| Point/spot lights | ⚠️ | SDK/compiler/Bevy paths exist, but verify web parity and add focused conformance before claiming done. |
| Visibility | ⚠️ | IR and Bevy map visibility; confirm web enforcement and tests for `MeshRenderer.visible`/`Visibility`. |
| Active camera/resource model | ⚠️ | `ActiveCamera` exists; general resources are still absent. |
| Standard material scalar fields | ✅ | Color, metalness, and roughness are implemented for the base render slice. |
| Material texture slots | ⚠️ | IR/compiler validation accepts texture slots; web/Bevy material loading does not yet apply real textures. |
| glTF/GLB asset bundling | ⚠️ | Compiler copies selected glTF/GLB, `.bin`, and texture dependencies; runtime still renders placeholder environment meshes instead of loaded models. |
| Asset manifest validation | ⚠️ | Bundle-relative existence, formats, and references are validated; diagnostics are still partly generic compiler errors instead of stable domain diagnostics everywhere. |
| V3 environment scene IR | ⚠️ | `environment.scene.json` supports source assets, instances, path, and reference image; missing scatter zones, hero placement semantics, camera bookmarks, and walkability metadata. |
| Instancing/batching | ⚠️ | Web builds an instancing plan and placeholder `InstancedMesh` groups; missing real geometry/material instancing, Bevy equivalent, and budget evidence tied to real assets. |
| V3 performance budgets | ⚠️ | Target profile and performance metrics exist; `verify:v3` must prove failures on real over-budget scene output, not just fixture paths. |
| `verify:v3` release gate | ⚠️ | Script builds, validates, and runs web performance verification; missing Bevy native load smoke, bookmarked visual checks, and manual visual review record. |
| Bevy V3 environment loading | ❌ | Native runtime maps `world.ir.json`; it does not load or render `environment.scene.json` model instances yet. |
| Forest atmosphere | ❌ | No portable fog/haze, sky color, shadow, color-management, or sun/ambient scene profile for V3. |
| First-person controls | ❌ | No portable pointer-lock, mouse-look, movement resolver, native mouse capture, or walkthrough probe. |
| Walkability and scene collision | ❌ | Collider components exist in IR shape, but V3 path bounds/blockers/camera collision are not implemented. |
| Coordinate/color-space conventions | ❌ | Still needs an explicit doc/contract for axes, units, handedness, rotations, color space, and imported asset scale. |
| UI | ❌ | UI IR types exist, but retained UI rendering and input/focus parity are not implemented. Not V3-critical unless verification overlays need it. |
| Audio | ⚠️ | Audio IR and asset validation exist; runtime playback is not implemented. Not V3-critical unless ambience enters scope. |
| Gameplay ECS/systems | ❌ | Components/resources/events/system schemas are not a working gameplay host. Keep out of V3 unless a ticket explicitly narrows the slice. |
| Mobile packaging | ❌ | Out of current V3 scope. Do not let old roadmap language imply this is part of V3. |
| Custom shaders/render graph/Solari/networking/editor | ❌ | Out of V3 scope and should stay adapter-internal or post-V3. |

## What Is Drifting

- The V3 bundle contract is ahead of runtime behavior: environment assets and
  scene metadata can be emitted, but web uses placeholders and Bevy ignores the
  V3 environment scene.
- Validation is ahead of user-facing diagnostics in places: missing files and
  unsupported assets are caught, but not every failure has stable V3 diagnostic
  codes and suggested fixes.
- IR types are ahead of parity: texture slots, UI, audio, collider shapes, point
  lights, spot lights, and orthographic cameras exist in schema form without
  equal SDK/compiler/web/Bevy proof.
- `verify:v3` is partially wired but not yet the release gate described by the
  PRDs: it lacks native environment smoke, bookmarked visual evidence, and
  close-practical comparison to `Preview_2.jpg`.
- Old roadmap language still risks implying V3 is a broad production platform.
  Current V3 is only the first-person forest scene proof.

## What Is Left For V3

1. Load real V3 glTF models and textures in web-three instead of placeholder
   boxes.
2. Map `environment.scene.json` into Bevy enough for a native load/render smoke.
3. Add environment scene fields for scatter zones, hero placements, camera
   bookmarks, walkability bounds, and blocking props.
4. Implement real instancing/batching for repeated forest props and connect it
   to draw/instance/triangle budgets.
5. Add forest atmosphere: directional sun, ambient fill, fog or haze, sky color,
   shadows, and color-management assumptions.
6. Add first-person camera movement, pointer lock on web, native mouse capture,
   and deterministic walkthrough probes.
7. Add path/blocker collision so the camera stays inside authored walkable
   bounds.
8. Make `verify:v3` save performance metrics, bookmarked screenshots, native
   smoke results, and manual-review evidence.
9. Document coordinate, unit, handedness, rotation, imported scale, and color
   conventions.
10. Keep post-V3 features out of the V3 gate unless a PRD explicitly pulls in a
    narrow slice.

## Sources

- Bevy feature overview: https://bevy.org/
- Bevy 0.18 release notes: https://bevy.org/news/bevy-0-18/
- Bevy examples catalog: https://bevy.org/examples/
- Bevy crate documentation: https://docs.rs/bevy
