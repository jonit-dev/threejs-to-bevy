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

## V5 Native Test And Visual-Quality Focus

V5 should move unresolved Bevy drift into explicit Rust tests and shared
conformance fixtures instead of relying on broad release-gate smoke checks.
When a V5 feature claims native support, it needs native-side evidence in
`runtime-bevy`, usually through focused `cargo test` coverage plus any relevant
shared fixture or artifact comparison.

Every V5 feature that affects visible output, interaction, or runtime state
should also appear in the V5 functional 3D scene where practical. That scene
should use `assets-source/environment` assets when they can show the feature,
and Bevy evidence should connect back to the same scene through native tests,
observed scene summaries, screenshots, effect logs, or diagnostics.

Priority V5 native coverage:

1. Loader and fixture reuse for shared IR bundles used by both web and Bevy
   tests.
2. Renderer mapping tests for material texture slots, visibility, lights,
   shadows, atmosphere, fog, skybox, and color-space behavior promoted by V5.
3. Environment-scene tests for dense 3D content quality: instancing/batching,
   LOD, mesh/texture optimization metadata, asset budgets, and imported
   transform conventions.
4. Scripting-host tests for V4 behavior preserved through V5 refactors:
   service facades, effect logs, diagnostics, and native patch application.
5. Native artifact checks where practical: observed scene summaries, canonical
   effect logs, screenshots, and stable failure messages that can be compared
   against web runtime output.

V5 is not the scene-editor, online, networking, plugin, or custom renderer
milestone. Those remain V6 or later unless a V5 PRD scopes the work as internal
cleanup or test-harness preparation.

## V4 Scripting Parity

| Area | Status | What's drifting or missing |
| --- | --- | --- |
| V4 PRD scope and docs gate | ✅ | `docs/PRDs/v4` defines the QuickJS scripting proof and `check:docs:v4` rejects obvious scope drift. |
| `systems.ir.json` scripting contract | ✅ | V4 system declarations include reads/writes, queries, events, commands, services, stage, and script export metadata for the primitive scripting proof. Broader dynamic world reconciliation is V5+ scope. |
| `scripts.bundle.js` compiler output | ✅ | The compiler emits deterministic portable script bundles only when systems exist, includes stable system ID metadata, passes an ESM loadability probe, and is loaded by the Bevy QuickJS host in focused tests. |
| Web portable system runner | ✅ | Web executes the V4 primitive example through cloned portable query snapshots, validates effects before mutation, and emits canonical web patch/event/command/service logs for rotation, movement, spawn/despawn, event handoff, `physics.raycast`, and `animation.play`. |
| Bevy QuickJS host | ✅ | The native adapter embeds `quickjs-rusty`/QuickJS-ng, loads `scripts.bundle.js`, calls declared exports, snapshots portable ECS data, validates effects, applies declared patches, syncs scripted transform updates into the live Bevy preview, captures a V4 Bevy frame artifact, and keeps an unsupported-host diagnostic helper for unavailable builds. Full dynamic native spawn/despawn reconciliation is V5+ scope. |
| Host service facades | ✅ | Web and native expose deterministic time/input/events/commands plus primitive `physics.raycast` and `animation.play` service facades with declared-service validation. Full physics and animation playback remain V5+ scope. |
| Patch/event/command/service-call log parity | ✅ | `pnpm verify:v4` builds the primitive demo, runs web and native QuickJS over the same fixed trace, and compares canonical patch/event/command/service logs into `artifacts/v4/effects-diff.json`. |
| V4 primitive scripting template | ✅ | `examples/v4-scripting` and `templates/v4-scripting` provide a self-contained primitive-only demo and `tn create --template v4-scripting` path for the current MVP API surface. |
| Unsupported portable-script diagnostics | ✅ | DOM, Node/runtime imports, timer and worker APIs, arbitrary npm imports, undeclared writes, commands, events, and services fail before runtime for current bundled systems. Deeper AST coverage is V5+ hardening scope. |

## Sources

- Bevy feature overview: https://bevy.org/
- Bevy 0.18 release notes: https://bevy.org/news/bevy-0-18/
- Bevy examples catalog: https://bevy.org/examples/
- Bevy crate documentation: https://docs.rs/bevy
