# Bevy Feature Parity Drift

Purpose: keep V3 honest. This is not a Bevy API coverage matrix. It only tracks
the product-contract drift that matters for the current V3 forest scene and the
active V4 native scripting proof:

```txt
TypeScript authoring -> validated IR bundle -> web-three + native Bevy behavior
```

Baseline: the repo pins Bevy and `bevy_ecs` to `=0.14.2`.

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
| glTF/GLB asset bundling | ✅ | Compiler copies selected glTF/GLB, `.bin`, and texture dependencies; web-three and Bevy now resolve V3 environment instances to real bundle-local glTF scenes instead of placeholder model primitives. |
| Asset manifest validation | ⚠️ | Bundle-relative existence, formats, and references are validated; diagnostics are still partly generic compiler errors instead of stable domain diagnostics everywhere. |
| V3 environment scene IR | ✅ | `environment.scene.json` supports source assets, instances, scatter, terrain/path, hero placements, camera bookmarks, atmosphere, first-person config, and walkability metadata for the V3 proof scene. |
| Instancing/batching | ⚠️ | Web builds an instancing plan and the async glTF loading path can emit real geometry/material `InstancedMesh` groups for repeated compatible assets; synchronous verification still uses placeholder geometry and synthetic renderer estimates, and Bevy equivalent budget evidence remains missing. |
| V3 performance budgets | ✅ | Target profile, performance metrics, and `verify:v3` budget checks are wired for the V3 web proof. |
| `verify:v3` release gate | ✅ | Script builds and validates the example, scaffolds and builds the V3 template, saves web performance reports, captures bookmarked Three.js/Bevy side-by-side visual artifacts from real model-loading paths, and runs V3 scene/atmosphere/first-person/walkability gates. |
| Bevy V3 environment loading | ⚠️ | Native runtime maps `environment.scene.json` into terrain/path placeholders plus real glTF scene instances and can capture bookmarked Bevy screenshots; atmosphere/lighting parity and broader native interaction remain limited. |
| Forest atmosphere | ⚠️ | Portable atmosphere data is emitted and observed for web/Bevy; native rendering parity for fog/sky/color management remains limited. |
| First-person controls | ⚠️ | Portable first-person config, pointer-lock expectations, movement update, and walkthrough verification exist; native input capture is still smoke-level. |
| Walkability and scene collision | ⚠️ | V3 walkable regions and blocking probes exist in IR, web resolver, Bevy helper, and release gate; this is not a general physics collision system. |
| Coordinate/color-space conventions | ⚠️ | `docs/conventions.md` now defines axes, units, handedness, rotations, color space, and imported asset scale; runtime capture/parity work must keep proving adapters follow it. |
| UI | ❌ | UI IR types exist, but retained UI rendering and input/focus parity are not implemented. Not V3-critical unless verification overlays need it. |
| Audio | ⚠️ | Audio IR and asset validation exist; runtime playback is not implemented. Not V3-critical unless ambience enters scope. |
| Gameplay ECS/systems | ❌ | Components/resources/events/system schemas are not a working gameplay host. Keep out of V3 unless a ticket explicitly narrows the slice. |
| Mobile packaging | ❌ | Out of current V3 scope. Do not let old roadmap language imply this is part of V3. |
| Custom shaders/render graph/Solari/networking/editor | ❌ | Out of V3 scope and should stay adapter-internal or post-V3. |

## What Is Drifting

- The V3 bundle contract now drives real model loading in both visual paths, but
  Bevy still has drift in native atmosphere, lighting, instancing, and first-
  person interaction depth.
- Validation is ahead of user-facing diagnostics in places: missing files and
  unsupported assets are caught, but not every failure has stable V3 diagnostic
  codes and suggested fixes.
- IR types are ahead of parity: texture slots, UI, audio, collider shapes, point
  lights, spot lights, and orthographic cameras exist in schema form without
  equal SDK/compiler/web/Bevy proof.
- `verify:v3` is now the V3 release gate, but its visual comparison remains a
  practical side-by-side artifact and nonblank/composition proof rather than
  pixel-perfect renderer equivalence.
- Old roadmap language still risks implying V3 is a broad production platform.
  Current V3 is only the first-person forest scene proof.

## What Is Left For V3

1. Tighten Bevy vs Three.js visual parity for lighting, atmosphere, camera
   framing, and imported asset scale/rotation using the real side-by-side
   screenshots.
2. Tie real web glTF instancing and the Bevy equivalent to captured
   draw/instance/triangle budget evidence instead of synthetic verifier
   estimates.
3. Strengthen native first-person input capture beyond smoke-level reporting.
4. Prove runtime adherence to the documented coordinate, unit, handedness,
   rotation, imported scale, and color conventions.
5. Keep post-V3 features out of the V3 gate unless a PRD explicitly pulls in a
    narrow slice.

## V4 Scripting Parity

| Area | Status | What's drifting or missing |
| --- | --- | --- |
| V4 PRD scope and docs gate | ✅ | `docs/PRDs/v4` defines the QuickJS scripting proof and `check:docs:v4` rejects obvious scope drift. |
| `systems.ir.json` scripting contract | ⚠️ | V4 system declarations now include reads/writes, queries, events, commands, services, stage, and script export metadata; Bevy consumes the primitive host subset, while broader runtime scheduling is still pending. |
| `scripts.bundle.js` compiler output | ⚠️ | The compiler emits deterministic portable script bundles only when systems exist, includes stable system ID metadata, passes an ESM loadability probe, and is loaded by the Bevy QuickJS host in focused tests. |
| Web portable system runner | ⚠️ | Web executes the V4 primitive example through cloned portable query snapshots, validates effects before mutation, and emits canonical web patch/event/command/service logs; fixed-trace native comparison is still pending. |
| Bevy QuickJS host | ⚠️ | The native adapter embeds `quickjs-rusty`/QuickJS-ng, loads `scripts.bundle.js`, calls declared exports, snapshots portable ECS data, validates effects, applies declared patches, captures a V4 Bevy frame artifact, and keeps an unsupported-host diagnostic helper for unavailable builds; broader runtime schedule integration is still pending. |
| Host service facades | ⚠️ | Web and native expose deterministic time/input/events/commands plus primitive `physics.raycast` and `animation.play` service facades with declared-service validation; full physics and animation playback remain post-V4. |
| Patch/event/command/service-call log parity | ⚠️ | Web and native now emit the same canonical effect-log shape, including service calls, but the fixed input trace comparator is not wired into a V4 release gate yet. |
| Unsupported portable-script diagnostics | ⚠️ | DOM, Node/runtime imports, timer and worker APIs, arbitrary npm imports, undeclared writes, commands, events, and services fail before runtime for current bundled systems; deeper AST coverage is still pending. |

## Sources

- Bevy feature overview: https://bevy.org/
- Bevy 0.18 release notes: https://bevy.org/news/bevy-0-18/
- Bevy examples catalog: https://bevy.org/examples/
- Bevy crate documentation: https://docs.rs/bevy
