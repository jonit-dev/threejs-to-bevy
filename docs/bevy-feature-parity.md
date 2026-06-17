# Three.js Game Engine x Bevy Parity

| Scope | Value |
| --- | --- |
| Contract | Three.js-style TypeScript game engine -> validated IR bundle -> web Three.js + native Bevy |
| Native baseline | Bevy and `bevy_ecs` pinned to `=0.14.2` |
| Evidence anchors | native test, visual scene, game-authoring ergonomics, V6 PRDs, verify:v6, V7 PRDs, verify:v7, V8 PRDs, examples/v7-functional, artifacts/v7, GitHub open-game usage scan |

## Status

| Status | Meaning |
| --- | --- |
| ✅ | Works across the Three.js-style API, IR, web runtime, and Bevy where claimed. |
| ⚠️ | Partly works, but web and Bevy are not fully aligned yet. |
| ❌ | Not implemented in this repo. |
| ⏭️ | Intentionally deferred or never portable. |

## Bevy Feature Checklist

This checklist is a Bevy-derived backlog for the portable ThreeNative contract.
Checked items have an explicit ThreeNative row or promoted slice in the parity
table below. Unchecked items are reminders to either promote through SDK/IR,
validation, web, Bevy, conformance, and docs evidence, or explicitly defer with
diagnostics. The baseline remains Bevy `=0.14.2`, not latest Bevy.

Priority labels on unchecked items:

- `P0`: Blocks a functional simple game or makes promoted behavior misleading.
- `P1`: High-value small-game parity after the current promoted surface.
- `P2`: Production workflow, scale, or polish needed before a stable release.
- `P3`: Advanced engine parity, specialized workflows, or long-tail features.
- `D`: Deferred or intentionally non-portable.

### GitHub Open-Game Usage Scan

This backlog is also informed by a lightweight scan of open-source Bevy games
and game templates on GitHub, focused on `Cargo.toml` dependencies and source
usage rather than Bevy engine examples. Sampled repos include
`fishfolk/jumpy`, `Dreamtowards/Ethertum`, `RaminKav/LostInTime`,
`opstic/gdclone`, `ShenMian/sokoban-rs`, `wesfly/bevy_fs`,
`NiiightmareXD/golab`, `traffloat/traffloat`, `aratama/magiaforge`,
`PraxTube/tsumi`, `cleder/brkrs`, `chriamue/flyconomy`,
`nilaysavant/keep-it-rolling-game`, and `jmbhughes/rustytowers`.

Repeated patterns in those games:

- ECS resources/events/states, explicit schedules, commands, timers, and
  state-gated systems are the common gameplay backbone.
- Real games frequently reach for physics plugins (`bevy_rapier`, Avian),
  action-map input (`leafwing-input-manager`), asset loading/state machines,
  audio plugins, inspector/debug UI, egui-style panels, save/config crates, and
  dev-time asset watching.
- Many open Bevy games are 2D-first, but ThreeNative is currently scoped as a
  3D-only engine. Treat sprites, tilemaps, LDtk/Tiled, and 2D-specific
  collisions as out of active scope unless the product boundary changes.
- Some games use networking (`lightyear`, `bevy_renet`, websockets), but this
  remains outside the portable contract for now. The priority is stable
  unsupported-networking diagnostics, not runtime networking parity.

### 🧩 ECS, App, and Scheduling

- [x] Entities, stable IDs, components, and component schemas
- [x] Parent/child hierarchy and local/global transform propagation
- [x] Resources and typed game events
- [x] Startup, fixed update, update, and post-update schedules
- [x] Deterministic system ordering and command-buffer spawn/despawn
- [x] State metadata and constrained lifecycle traces
- [x] Bevy-style computed states and substates
- [x] Observer/event propagation model
- [x] Component hooks and lifecycle hooks
- [x] Scene serialization/deserialization as an authoring feature
- [x] Reflection/type registration surface for portable components
- [x] Async task/channel patterns
- [x] Plugin/plugin-group composition as a portable declaration

### 📐 Transforms, Math, and Geometry

- [x] Translation, rotation, scale, and nested transforms
- [x] Basic 3D mesh primitives: box, sphere, plane, capsule, cylinder
- [x] Bounding/raycast-style queries for promoted physics traces
- [x] Full Bevy primitive catalog and extrusions
- [x] Custom mesh generation and custom vertex attributes
- [x] `P1` Portable procedural mesh authoring
  - [x] MeshBuilder API for generated static meshes
  - [x] Primitive composition helpers for organic props
  - [x] Compiler-only Three.js BufferGeometry import/snapshot
- [x] Mesh bounds, AABB/sphere intersection utilities, and sampling
- [x] Curves, splines, easing functions, and path sampling
- [x] `P1` Transform interpolation/smoothing helpers
- [x] `P2` Gizmo geometry as debug/editor-only output

### 🎥 Cameras and Views

- [x] Perspective camera and active camera selection
- [x] Orthographic projection metadata and conformance observation
- [x] First-person camera/controller metadata
- [x] `P1` Multiple active cameras, camera ordering, and split-screen
- [x] `P1` Viewports, sub-views, and render layers
- [x] `P2` Render-to-texture and depth-only camera targets
- [x] `P3` Custom projections
- [x] `P1` Camera effects: screen shake, orbit, pan, zoom, and view models
- [x] `P2` Screenshot/export camera workflows
- [ ] `P2` Residual camera diagnostics and editor/debug tooling

### 💡 Lights, Shadows, and Global Illumination

- [x] Ambient light
- [x] Directional light
- [x] Point light with range
- [x] Spot light with range and angle
- [x] Shadow metadata and shadow conformance observations
- [x] `P2` Report-only V8-12 shadow-policy and shadow-sensitive web/native screenshot trace
- [x] `P2` Dynamic light limits and light culling budget observations
- [x] `P2` Point-light PCF/shadow-filtering metadata parity
- [x] `P1` Shadow bias controls
- [x] `P1` Per-mesh shadow caster/receiver controls
- [ ] `P3` Spherical/area-light behavior
- [ ] `P3` Lightmaps and mixed baked/dynamic lighting
- [x] `P2` Light probes and environment maps
  - [x] V9-04 SDK/IR/compiler/runtime conformance contract and evidence for
    bundle-local skybox, environment-map, and bounded light-probe declarations
- [x] `P2` Light/probe gizmo debug observations

### 🎨 Materials, Textures, and Shaders

- [x] Standard material base color, metalness, roughness
- [x] Texture references and web/native material slot observations
- [x] Visibility flags on mesh renderers
- [x] Native texture image loading through Bevy `AssetServer` for promoted material slots
- [x] `P1` Authored alpha modes, opacity, alpha cutoff, and web/native material observations
- [x] `P1` Transparency sorting metadata, portable blend modes, and depth policy with web/native observations
- [x] `P1` Authored emissive material color/intensity and web/native material observations
- [ ] `P1` HDR bloom contribution from emissive materials
- [x] `P1` Normal/occlusion texture refs plus authored specular, clearcoat, and transmission scalar factors
- [x] `P1` Clearcoat, clearcoat-roughness, and transmission texture maps
- [x] `P1` Specular texture maps
- [ ] `P3` Parallax mapping and depth maps
- [ ] `P3` Anisotropy, specular tint, and advanced PBR fields
- [x] `P1` Authored texture repeat/wrap/filter/UV transform controls in IR, web runtime mapping, native sampler/UV application, and conformance observations
- [x] `P2` Multiple generated-mesh UV channels
- [x] `P2` Generated-mesh vertex colors
- [x] `P2` Constrained extended material presets (`unlitMasked`, `foliage`)
- [ ] `P2` Explicit portable shader promotion criteria and unsupported-feature diagnostics
- [ ] `P3` Custom shaders, shader defs, storage buffers, and render phases
- [ ] `P3` Bindless materials/textures

### 🌌 3D Rendering, Atmosphere, and Post-Processing

- [x] Basic 3D scene rendering through web Three.js and native Bevy
- [x] Fog, sky/horizon color, tone mapping, exposure, and color-space metadata
- [x] Dense-content budget estimates and repeated-instance observations
- [x] Source asset LOD metadata and fixed LOD-selection traces
- [x] `P1` Focused visual fog/sky parity evidence in native output
- [x] `P1` Focused unlit color swatch and lit PBR sphere parity evidence
- [ ] `P3` Atmospheric scattering and atmospheric fog
- [ ] `P3` Volumetric fog and volumetric lighting
- [x] `P1` Skyboxes and cubemap/equirect texture handling
  - [x] V9-04 validates bundle-local cubemap/equirect texture refs, emits
    rendering capabilities, reports web/native skybox observations, and writes
    screenshot-level web/native/diff/contact-sheet evidence under
    `artifacts/v9/rendering-lights/skybox-environment/`; compressed texture
    formats remain deferred
- [x] `P1` Bloom through runtime config in web and native camera runtime
- [x] `P1` MSAA anti-aliasing modes through runtime config in web and native
- [ ] `P2` FXAA, TAA, and SMAA anti-aliasing modes
- [x] `P2` Color grading and filmic metadata observations
- [ ] `P3` Auto exposure
- [ ] `P2` Depth of field
- [ ] `P3` Motion blur and motion vectors
- [ ] `P3` Screen-space reflections and mirrors
- [ ] `P2` Decals
- [ ] `P3` Deferred rendering
- [x] `P2` Visibility ranges/HLOD fade observations
- [ ] `P1` Renderer-level native instancing and batching parity
- [ ] `P3` Virtual geometry/meshlet rendering
- [ ] `P3` Custom post-processing passes

### 📦 Assets, glTF, and Scenes

- [x] Bundle-local glTF/GLB assets
- [x] glTF `.bin` and texture dependency bundling
- [x] Model scene instances in web and Bevy
- [x] Material/texture/mesh asset diagnostics and conformance observations
- [x] Typed animation clip metadata from model assets
- [x] `P1` Declared embedded asset manifest entries with bounded payload validation
- [x] `P1` Declared HTTPS network asset manifest entries with target-profile validation
- [ ] `P3` Custom asset loaders and custom asset types
- [x] `P1` Deterministic multi-asset load synchronization trace
- [x] `P1` Declared asset groups and default `bundle.requiredAssets` manifest group
- [x] `P2` glTF extras and custom glTF vertex attributes
- [x] `P1` Query/update spawned glTF scene entities
- [x] `P1` Scene viewer/editor inspection workflow
- [x] `P1` Dev-time asset file watching and explicit reload diagnostics
- [x] `P2` Asset hot reload and state-preserving reload behavior

### 🎞️ Animation and Particles

- [x] Animation clip metadata and validated clip refs
- [x] `animation.play` service-call trace
- [x] Constrained animation graph metadata
- [x] Animation event-marker metadata and fixed event traces
- [x] Bounded particle-emitter metadata and deterministic spawn traces
- [x] Runtime animation playback binding and time advancement for model renderers in web and Bevy
- [x] `P0` Visual skeletal animation deformation from loaded glTF clips
- [x] `P1` Transform animation authored in code/IR
- [x] `P1` `animation.query` / `animation.stop` declared command-shape/service-payload parity
- [x] `P1` Animation blending beyond fixed graph traces
- [ ] `P2` Animation masks
- [x] `P1` Stateful animation stop/state query runtime semantics
- [ ] `P2` Morph-target animation
- [ ] `P3` Retargeting and inverse kinematics
- [ ] `P2` UI/property animation
- [x] `P1` Rendered particle systems

### 🧱 Physics, Collision, and Character Movement

- [x] Fixed-timestep movement contract
- [x] Box, sphere, and capsule colliders
- [x] Rigid-body metadata
- [x] Primitive solver v2 contract metadata for bounded primitive multi-body
  declarations, including mass, inverse mass, velocity, angular velocity,
  sleep threshold, and solver iteration policy
- [x] Primitive rigid-body solver trace for gravityScale, damping, restitution,
  friction, and a falling dynamic box against a static floor
- [x] Trigger/contact event phases for fixed traces
- [x] Collision layer/mask metadata
- [x] Raycast-style grounding trace
- [x] Overlap and shape-cast service traces
- [x] Narrow character controller movement and blocking trace
- [x] `P1` Full rigid-body solver parity beyond the current primitive
  falling-box trace
- [ ] `P2` Dynamic mesh colliders
- [x] `P1` Broad sensors beyond current trigger/overlap scope
- [x] Step offsets, ledge ungrounding, moving-platform carry, and richer ground contact trace
- [x] `P0` Slope limits and sloped-surface walkability for promoted ramp colliders
- [x] `P1` Character interaction volumes and object pushing
- [x] `P1` Navmesh/pathfinding behavior
- [x] `P1` External physics backend integration strategy

### 🎮 Input, Picking, and Controls

- [x] Keyboard/mouse-style input references for promoted systems
- [x] Pointer-lock expectation metadata
- [x] UI action queue metadata
- [x] Fixed first-person movement trace
- [x] Native keyboard, mouse-button, and pointer-axis input capture for Bevy preview/runtime systems
- [x] `P1` Optional gamepad button/axis state in web and Bevy runtime input snapshots
- [x] `P1` Touch control/axis state hooks in web and Bevy runtime input snapshots
- [x] `P1` Gamepad viewer-style diagnostics and device capability reporting
- [x] `P1` Basic touch gesture recognition for tap, swipe, and pinch
- [x] `P1` Mesh picking service for generated mesh renderer bounds in web and Bevy scripts
- [x] `P1` Mouse/screen pointer ray generation for picking workflows
- [x] `P1` Basic UI picking/action dispatch for web and Bevy buttons/touch controls
- [ ] `P2` Drag-and-drop picking events
- [ ] `P2` Picking debug overlay
- [x] `P1` Basic input rebinding helpers and device capability diagnostics
- [x] `P1` Controls settings rebind metadata and local input override persistence
- [ ] `P2` Richer device diagnostics overlays and repair hints

### 🧭 UI, Text, and Accessibility

- [x] Retained UI IR and validation
- [x] Web DOM overlay and Bevy UI entity spawning
- [x] Text, resource-bound bars, and focusable buttons
- [x] Focus order, navigation links, input action refs, and safe-area metadata
- [x] Fixed web/native focus and activation trace
- [x] `P0` Explicit flex layout metadata for direction, alignment, justification, gaps, padding, size, and grow
- [x] `P2` Basic CSS grid-style layout for repeat-count rows/columns and auto-flow
- [x] `P1` UI overflow clipping and z-index layering
- [x] `P1` UI absolute anchors and inset positioning
- [x] `P1` UI min/max size constraints
- [x] `P1` Basic vertical UI scrolling containers
- [x] `P1` UI background/text color, borders, rounded corners, and opacity
- [x] `P1` Portable UI shadow/linear-gradient metadata and web DOM rendering
- [ ] `P1` Native-rendered UI shadows and gradients
- [x] `P1` Basic UI text size, alignment, and wrapping
- [x] `P1` Portable UI text weight/decoration metadata and web DOM rendering
- [ ] `P1` Rich text styling: font assets, inline spans, and native-rendered weight/decoration
- [x] `P1` Basic UI image nodes
- [ ] `P1` UI texture atlases, 9-slice scaling, flipping, and tiling
- [ ] `P2` Standard widgets: sliders, scrollbars, virtual keyboard, context menus
- [x] `P1` Basic automatic tab/sequential directional navigation parity
- [ ] `P2` UI transforms and render-to-texture/3D-world UI
- [x] `P1` Basic UI accessibility roles, labels, and missing-label diagnostics
- [x] `P1` Broader screen-reader diagnostics for focusable names, progressbar names, and list/listitem structure
- [x] `P1` Static disabled UI metadata for focus/action suppression and ARIA/AccessKit state
- [ ] `P2` UI debug overlay/gizmos

### 💾 Persistence, Settings, and Local Data

- [ ] `P1` Portable save slots for declared resources/components
- [ ] `P1` Local settings/key-value persistence for audio, video, accessibility options, and broader save/settings APIs
- [ ] `P2` Save migration/version metadata and diagnostics
- [ ] `P2` Checkpoint/autosave lifecycle hooks
- [ ] `P3` Cloud save and account-bound storage integration

### 🔊 Audio

- [x] Local OGG/WAV asset validation
- [x] Web HTML-audio sink and Bevy autoplay loop spawning
- [x] Portable volume and deterministic audio command observations
- [x] Bus, listener, and spatial-emitter metadata
- [x] Fixed loop start/stop lifecycle traces
- [x] Playback-id controls for pause, resume, seek, stop, and query traces
- [ ] `P1` Real 3D spatial attenuation and listener movement
- [ ] `P1` Mixer buses, effects, ducking, and routing behavior
- [ ] `P2` Pitch control and generated tone playback
- [ ] `P1` Soundtrack/state-driven music transitions
- [ ] `P3` Custom audio source/decoder support
- [ ] `P3` Streaming and network audio
- [ ] `P2` Platform-specific audio diagnostics

### 🧪 Diagnostics, Tooling, Packaging, and Performance

- [x] Stable IR/compiler/CLI/native diagnostic shapes
- [x] JSON severity, suggestions, paths, and metadata preservation
- [x] Conformance reports for web and Bevy observations
- [x] Release verification gates and artifact presence checks
- [x] Desktop package manifest and runtime args for V7 packaging
- [x] Fixed metric reports for frame/load/draw/entity/package-size budgets
- [ ] `P2` Live profiler captures and native platform profiler evidence
- [ ] `P2` GPU profiling and render-pass timing breakdowns
- [ ] `P1` In-app FPS overlay and custom diagnostics
- [ ] `P3` Signed installers and app-store/mobile packaging
- [ ] `P1` Broader platform target profiles and repair hints
- [ ] `P1` Large-scene stress-test fixtures for UI, text, lights, cubes, and animated models
- [ ] `P1` Stable unsupported-feature diagnostics for advanced renderer, material, and runtime declarations
- [ ] `P1` Stable unsupported-networking diagnostics for multiplayer/websocket/replication declarations

### 🛠️ Editor, Debugging, and Developer Tools

- [x] Local editor project snapshot validation
- [x] Deterministic structured bundle-relative JSON diffs
- [x] CLI entry points for `tn editor snapshot`, `tn editor apply`, and `tn editor diff`
- [ ] `P1` Visual editor UI and inspector panels
- [x] Save/load round trips through structured SDK/ECS/IR data
- [ ] `P1` Scene hierarchy inspector and property editing
- [ ] `P2` Gizmo overlays for transforms, lights, bounds, cameras, and UI nodes
- [ ] `P1` Gamepad, scene viewer, and asset preview tools
- [ ] `P2` Hot reload with state policy
- [ ] `P1` Debug draw APIs for gameplay systems

### 🚧 Intentionally Deferred or Non-Portable

- [ ] `D` Direct Bevy authoring from user TypeScript
- [ ] `D` Raw Three.js authoring as the source of truth
- [ ] `D` Public plugin escape hatches into renderer/runtime internals
- [ ] `D` Online services, networking, replication, and collaboration
- [ ] `D` 2D sprite, tilemap, LDtk/Tiled, and 2D-specific collision workflows while ThreeNative is scoped as 3D-only
- [ ] `D` Arbitrary npm, filesystem, worker, timer, or platform APIs in portable scripts
- [ ] `D` Backend-only features that cannot be represented in portable IR

## Parity Table

| Feature | Status | Done | Missing / gap |
| --- | --- | --- | --- |
| ECS entities/components | ⚠️ | Stable entity IDs, transforms, hierarchy, component schemas, V4/V6 system declarations; web and native tests now prove command-buffer spawn/despawn reconciliation across later schedules, including querying a spawned component before despawn; V7 validates declared component `onAdd`/`onInsert` hook observations and exposes them through web/native `ctx.components.hooks()` fixed-trace evidence; component schemas now produce a portable reflection registry exposed through web/native `ctx.components.type()` / `ctx.components.types()`; editor snapshots can now serialize and apply structured scene/world JSON back to validated bundles. | Full gameplay host, broad dynamic reconciliation against live rendered Bevy entities, raw Bevy/renderer type IDs, command-time/removal component hook callbacks, system-local persisted state, and richer lifecycle remain incomplete. |
| Resources/events | ⚠️ | V6 resource schemas, resource reads/writes, event schemas, queued event payloads, web/native effect logs, `v6-resources-events` conformance; native direct event writes and command-buffer event writes now persist into the runtime world queue and feed later systems; V7 validates fixed-trace typed channels backed by declared event schemas and exposes them through web/native `ctx.channels.read()` / `ctx.channels.send()`. | Full resource/event runtime parity, event cleanup/windowing semantics, and broader gameplay scene proof are still incomplete. |
| Schedules/states | ⚠️ | `startup`, `fixedUpdate`, `update`, `postUpdate`; deterministic same-stage system-name ordering plus explicit `before`/`after` topological constraints with web/native evidence; shared startup-before-update trace; V7 lifecycle metadata requires fixed-trace replay, hot-reload invalidation, and no system-local persisted state; V7 also validates resource-derived app states, computed states, substates, component hook observations, target-to-ancestor observer propagation, fixed-trace task declarations, event-backed channel handoff, and portable plugin/plugin-group composition exposed through web/native `ctx.states.get()`, `ctx.components.hooks()`, `ctx.observers.propagate()`, `ctx.tasks.*()`, `ctx.channels.*()`, and `ctx.plugins.*()` evidence; focused web/native tests now prove startup-created entities/events/resources are observable from later schedules. | State-preserving hot reload, broader dynamic lifecycle/state transitions, command-time/removal component hook callbacks, event clearing/windowing rules, stoppable observer propagation, dynamic runtime plugin loading, true async timers/workers/promises, and richer state handoff remain unsupported or incomplete. |
| 3D transforms/hierarchy | ✅ | V1 contract across IR, web, Bevy, and conformance. | Keep conformance green. |
| Mesh primitives | ✅ | Box, sphere, plane, capsule, cylinder, cone, conical frustum, torus, circle, annulus, regular polygon, and extruded rectangle are promoted through SDK constructors, compiler size tuples, IR validation, Three.js geometry mapping, and Bevy mesh primitives including `Extrusion<Rectangle>`; `primitive-mapping` now covers all promoted generated primitive names as a shared web/Bevy conformance fixture; custom generated meshes now carry validated float vertex attributes, optional U32 triangle indices, Three.js `BufferGeometry` mapping, and Bevy `Mesh` attributes including stable `custom:<name>` attributes; generated mesh `uv1` and `color` attributes map to Three.js/Bevy secondary UV and vertex color attributes, with web materials enabling `vertexColors` when color attributes are present; web and Bevy expose matching generated-mesh sampling, AABB, bounding-sphere, AABB intersection, and sphere intersection helpers; V8-04 promotes static `MeshBuilder` procedural authoring, organic helpers such as pine tree/mushroom/rock, deterministic binary generated mesh payloads, compiler-only BufferGeometry snapshot normalization, and same-bundle Three.js/Bevy screenshot evidence under `artifacts/v8/procedural-mesh/`. | Runtime mesh deformation, CSG, chunk streaming, storage-buffer/shader-driven procedural geometry, and broad dynamic mesh-collider parity remain future work. |
| Curves and path sampling | ✅ | Web and Bevy expose matching quadratic easing helpers plus line, quadratic Bezier, cubic Bezier, and Catmull-Rom path sampling utilities with focused parity tests. | Broader authored path components and editor curve handles can build on these helpers. |
| Transform interpolation | ✅ | Web and Bevy expose matching vec3 interpolation, shortest-arc quaternion interpolation, full transform interpolation, and exponential smoothing helpers with focused parity tests. | Broader animation/state smoothing APIs can build on these helpers. |
| Gizmo geometry | ✅ | Web and Bevy expose matching debug/editor-only axis, wire-box, and wire-sphere line geometry helpers with per-line colors and focused conversion tests for Three.js `BufferGeometry` and Bevy `LineList` meshes. | Larger editor overlay systems can compose these helpers for cameras, lights, bounds, and UI nodes. |
| Cameras | ✅ | Perspective and orthographic cameras, active camera selection, first-person/controller metadata, camera helper metadata, multiple ordered cameras, split-screen/sub-views, normalized viewports, render layers, render-to-texture and depth-only camera targets, custom projections, and screenshot/export workflows are promoted through V8-06 with shared conformance and web/native screenshot evidence under `artifacts/v8/camera-views/`. | Future camera work is residual editor/debug tooling, diagnostics, and advanced renderer integrations rather than a missing core camera parity contract. |
| Lights | ✅ | Ambient, directional, point range, spot range/angle in SDK/compiler/IR, web, Bevy, and conformance observations. | Advanced lighting parity beyond promoted fields remains renderer-specific. |
| Materials | ⚠️ | Standard color, metalness, roughness, and validated texture refs; web maps texture slots; Bevy maps refs to `StandardMaterial` image handles and now loads promoted texture asset paths through Bevy `AssetServer` in runtime apps; authored `alphaMode` (`opaque`, `mask`, `blend`), `opacity`, and `alphaCutoff` now validate through SDK/IR, emit from scene capture, map to Three.js `transparent`/`opacity`/`alphaTest`, map to Bevy `StandardMaterial` `AlphaMode` and base-color alpha, and appear in web/native conformance material observations; authored `blendMode`, `renderOrder`, `depthWrite`, and `depthTest` now validate and map to Three.js material/mesh policy with Bevy observations/diagnostics, while native non-`normal` blend modes remain explicitly unsupported; authored `emissive` color and `emissiveIntensity` now validate and map to Three.js emissive material fields plus Bevy `StandardMaterial.emissive`, with web/native conformance observations; authored `specularIntensity`, `clearcoat`, `clearcoatRoughness`, and `transmission` now validate, emit, map to Three.js physical material fields and Bevy `StandardMaterial` physical factors, and appear in conformance material observations; `specularTexture` now validates, emits, maps to Three.js physical specular intensity maps, and appears in conformance observations; texture assets now carry portable wrap, filter, repeat, offset, center, and rotation metadata through SDK/IR/compiler output, Three.js texture objects, Bevy image sampler configuration, `StandardMaterial.uv_transform`, and web/native conformance asset observations; `clearcoatTexture`, `clearcoatRoughnessTexture`, and `transmissionTexture` validate and map to Three.js physical maps plus Bevy gated PBR texture fields; constrained extended presets (`unlitMasked`, `foliage`) validate, emit, and map to web `MeshBasicMaterial` plus Bevy unlit/masked `StandardMaterial` with screenshot evidence in `artifacts/v8/material-parity/`. | Advanced blend parity on Bevy, native specular texture rendering, custom shader surfaces, and broader extended-material catalogs remain incomplete. |
| Shadows/color/fog/sky | ⚠️ | Promoted fields for shadows, fog, sky/horizon color, tone mapping, exposure, and color spaces are serialized and observed; mesh renderers now carry optional `castShadow` and `receiveShadow` controls through SDK/IR/compiler output, web Three.js mesh flags, Bevy `NotShadowCaster` / `NotShadowReceiver` markers, manifest capabilities, validation, and conformance observations; directional, point, and spot lights now carry optional `shadowBias`, `shadowNormalBias`, PCF `shadowFilter`, and debug-gizmo metadata through SDK/IR/compiler output, validation, manifest capabilities, and web/native conformance reports; V8-11 `pnpm verify:v8:rendering-quality` adds focused fog/sky visual parity evidence with GitHub-visible snapshots under `docs/pr-evidence/v8-11-rendering-quality/`; V8 color parity evidence adds `pnpm verify:v8:color-parity` for near-exact unlit swatches plus lit PBR sphere probes with full-frame average color deltas around `1%`; V8-12 adds `pnpm verify:v8:lights-shadows` report-only evidence for shadow policy/bias metadata and shadow-sensitive web/native screenshots; V9-04 adds validated bundle-local cubemap/equirect skybox, environment-map, bounded light-probe IR, dynamic light-budget observations, web color-grading tone-mapping/exposure, and web/native/diff/contact-sheet evidence for skybox, reflection-probe, point-shadow PCF, dense/HLOD, and debug-gizmo regions under `artifacts/v9/rendering-lights/`. | Broader atmospheric scattering, compressed skybox texture formats, FXAA/TAA/SMAA, depth of field, deferred rendering, motion vectors, SSR, volumetrics, virtual geometry, custom post passes, and full editor debug overlay systems remain incomplete or explicitly deferred. |
| Assets/glTF/scenes | ⚠️ | Bundle-local glTF/GLB, `.bin`, and texture dependencies; V3 environment instances resolve to real model scenes in web and Bevy; V8-10 now has a narrow web/native `threenative.asset-load-sync-trace` that proves deterministic bundle-local path-asset load ordering, a `bundle.requiredAssets` ready barrier, and environment glTF source-asset to instance/LOD inspection data under `artifacts/conformance/v8-asset-load-gltf-inspection/`; V9-03 promotes manifest-level `sourceMode` support for bundle, bounded embedded, and HTTPS network assets, declared asset groups, glTF named-node/extras/custom-attribute metadata, spawned glTF handle transform/visibility/material/extras operations, `tn editor inspect` scene JSON, and explicit dev reload diagnostics with state-preserving reload classification evidence under `artifacts/v9/assets-gltf-scene-workflow/`. | Custom asset loaders/custom asset types, arbitrary runtime file/network asset access from scripts, custom shader consumption of glTF custom attributes, and broader live asset streaming remain deferred. |
| Instancing/dense content | ⚠️ | Web instancing plan, concrete dense-content budget estimates, repeated group observations, source asset LOD metadata; V7 compares fixed web/native environment content traces for LOD selection and model-backed repeated-instance observations through `v7-renderer-dense-content`; V9-04 adds validated visibility range and HLOD fade metadata plus web/native conformance observations in `artifacts/v9/rendering-lights/dense-content-budget.json`. | Actual renderer-level native instancing, visual runtime LOD mesh swapping, and broad portable post-processing are not claimed. |
| Animation | ⚠️ | V6 model clip metadata, validation, conformance reporting, and `animation.play` service-call trace; V7 validates and emits constrained animation graph, event-marker, and bounded particle-emitter metadata, and `v7-animation-graphs-particles` compares fixed web/native graph transition, active clip, queued animation event payload, and bounded particle spawn traces; model-backed renderers now receive active playback state and deterministic time advancement in web and Bevy; web and Bevy model renderers load bundle-local glTF/GLB scene assets; web drives selected clips through `AnimationMixer`; Bevy attaches generated one-clip `AnimationGraph` handles to glTF-created `AnimationPlayer` entities and starts the selected clip with authored loop/speed; V8 transform animation clips now author position/rotation/scale tracks through SDK/IR and `pnpm verify:v8:animation-transform` compares exact web/native sampled transform traces under `artifacts/v8/animation-transform/`; V8 `animation.query` / `animation.stop` services are declared in SDK/IR and exposed by web and Bevy QuickJS contexts, with `pnpm verify:v8:animation-controls` comparing command-shape/service-payload effect logs under `artifacts/v8/animation-controls/`; `pnpm verify:v9:skeletal-animation` proves cross-runtime skinned-mesh deformation through `examples/v9-skeletal-animation` with web and native motion screenshot evidence under `artifacts/v9/skeletal-animation/`; V9-01 promotes stateful `animation.play/query/stop` runtime state through `pnpm verify:v9:animation-state` with web/native service traces under `artifacts/v9/animation-state/`, bounded crossfade blending through `pnpm verify:v9:animation-blending` under `artifacts/v9/animation-blending/`, and rendered bounded CPU particle emitters through `pnpm verify:v9:animation-particles` with web/native traces and SVG evidence under `artifacts/v9/animation-particles/`. | Animation masks/layers (`TN_IR_ANIMATION_MASKS_UNSUPPORTED`), morph-target animation (`TN_IR_MORPH_TARGET_ANIMATION_UNSUPPORTED`), retargeting (`TN_IR_RETARGETING_UNSUPPORTED`), IK (`TN_IR_IK_UNSUPPORTED`), UI/property animation (`TN_IR_PROPERTY_ANIMATION_UNSUPPORTED`), and arbitrary blend trees remain deferred. |
| Physics/collision | ⚠️ | V6 box/sphere/capsule collider validation, rigid-body fields, deterministic collision/trigger event phases for fixed traces; V7 contract metadata validates portable collider `layer`/`mask` filters and declares `physics.overlap` / `physics.shapeCast` service permissions; `v7-advanced-physics-character` now compares fixed web/native primitive overlap, swept box shape-cast service traces, and the narrow grounded/blocking character trace with portable layer filters; web/native runtime tests pin deterministic ordering for simultaneous contacts; V9-02 promotes the `physics:primitive-solver-v2` SDK/IR/compiler contract for bounded primitive multi-body declarations and web/native traces for stacked boxes, bounce/friction, kinematic contacts, broad primitive sensors, occupant snapshots, and backend-handle diagnostics. | Dynamic mesh colliders, joints/constraints, CCD, soft bodies, ragdolls, vehicles, and public backend physics handles remain deferred. |
| Character controller | ⚠️ | V6 character controller metadata, input references, movement axes, speed, grounding/blocking/interaction declarations; V7 fixed web/native character trace covers one-step axis movement, raycast-style grounding, stop-before-penetration blocking, promoted `stepOffset`, ledge ungrounding, ground-entity observations, moving-platform carry from rigid-body velocity, and promoted box-ramp slope walkability gated by `slopeLimit`; portable scripts can declare `character.move` and call `ctx.character.move(entity, { axes, fixedDelta })` for the same deterministic trace observation in web and Bevy QuickJS. V9-02 adds bounded `pushPolicy` observations for light-object pushes and too-heavy blocks, plus static `Navigation` region/path queries through `navigation.path` and matching web/native evidence under `artifacts/conformance/v9-physics-character/`. | Arbitrary sloped mesh terrain, dynamic navmesh rebakes, crowd steering, off-mesh links, and backend navmesh handles remain deferred. |
| UI | ⚠️ | Retained `ui.ir.json` UI IR, validation, web DOM overlay, Bevy entity spawning, conformance UI tree, resource-bound bar, focusable button; V7 focus order, navigation links, input action refs, safe-area metadata, and fixed web/native focus/activation trace now include Tab/Shift+Tab semantics, while the web DOM overlay moves focus with Tab/arrow keys and activates focused controls with Enter/Space. Web clicks and Bevy `Interaction::Pressed` now enqueue portable UI action events for buttons and touch controls. Explicit flex layout metadata now validates and maps direction, alignment, justification, gaps, padding, size, grow, min/max constraints, overflow clipping, z-index layering, absolute positioning, inset anchors, basic vertical scroll containers, and basic repeat-count grid rows/columns with auto-flow across web DOM overlay and Bevy UI. Common visual style metadata now validates and maps background/text color, border color/width, border radius, opacity, font size, text alignment, word/character/no-wrap behavior, portable shadow/linear-gradient metadata, and portable text weight/decoration metadata; web DOM renders shadows, gradients, weight, underline, and strikethrough, while Bevy preserves the same metadata for native mapping. Basic UI image nodes now validate bundle-relative `src`, render as DOM images, and map to Bevy UI images through `AssetServer` when available. Accessibility metadata now validates portable roles and labels, reports missing accessible names for image/button/bar/focusable controls, validates explicit progressbar names and list/listitem structure, maps presentation roles to ARIA without names in web, maps to Bevy AccessKit nodes, and V8-15 static disabled metadata keeps authored disabled controls visible while removing them from initial focus/action dispatch with matching web `aria-disabled`/native button state and Bevy `NativeUiDisabled`/AccessKit disabled state. V9-05 Phase 2 adds deterministic retained-UI-over-mesh drag picking plus structured picking debug overlay observations for UI bounds, mesh bounds, rays, capture, hover, drag path, and event log. `pnpm verify:v8:ui-disabled` writes focused UI parity reports under `artifacts/conformance/v8-retained-ui-disabled/`. V8 adds an explicit optional React/CSS webview overlay contract through `overlays.ir.json`, `requiredCapabilities.overlay`, a web iframe host, typed bridge message validation, deterministic input-capture policy that lets `none`/`keyboard` modes pass Bevy/game clicks through, native bridge/input diagnostics tests, an adapter-private optional `native-webview` host feature using `wry`, default `TN_OVERLAY_TARGET_UNSUPPORTED` diagnostics when that host is disabled, and focused inventory-overlay evidence under `artifacts/v8-overlay-webview/`. | Native-rendered UI shadows/gradients/text decorations, runtime disabled-to-enabled UI updates, font assets, rich inline spans, nested/axis-specific scroll behavior, arbitrary grid placement/named areas/dense packing, texture atlases/9-slice/flipping/tiling, platform widgets, spatial navigation heuristics, broad gamepad/touch coverage, focus narration, target-specific accessibility audits, and broad manually inspected desktop webview packaging remain incomplete. |
| Persistence/settings | ⚠️ | V9-05 Phase 1 promotes a narrow controls-only local binding override record and web/native round-trip helpers so input settings survive restart. | General save slots, typed settings keys for audio/video/accessibility, migration, import/export, and checkpoint contracts remain open V9-06 scope. |
| Audio | ⚠️ | Local OGG/WAV validation, web HTML-audio sink, Bevy autoplay loop spawning, portable volume, deterministic audio command observations, and V7 bus/listener/spatial-emitter metadata with routed command reports plus fixed loop start/stop lifecycle traces through `v7-spatial-audio-buses`; portable playback ids now support validated pause, resume, seek, stop, and query control traces in web and Bevy. | Real spatial attenuation, mixer effects, streaming/network audio, platform-native handles, and richer UI/audio services remain incomplete or unsupported. |
| Input | ⚠️ | First-person config, pointer-lock expectations, movement update, input references, UI action queue metadata; Bevy runtime now loads `axis.value` input bindings, captures keyboard actions/axes, mouse-button actions, pointer delta/position axes, and optional gamepad button/axis controls from Bevy input resources/events, and feeds captured native input into portable system snapshots during live preview/runtime updates; web and Bevy now expose touch control/axis state hooks for portable touch bindings plus deterministic tap/swipe/pinch gesture recognizers; web and Bevy report gamepad capability snapshots with declared controls, connected device counts/metadata, unavailable-device diagnostics, and unknown-control diagnostics; web and Bevy provide deterministic input rebinding helpers with missing-target, duplicate-binding, and required-gamepad diagnostics; V9-05 Phase 1 adds controls settings rows with retained UI node links, persisted logical binding overrides, deterministic override sorting/validation, web local storage helpers, and Bevy local JSON reload/apply before the first input snapshot; V9-05 Phase 2 adds picking target metadata validation, deterministic drag phases, retained-UI-over-mesh ordering with `pointerEvents: "pass-through"`, web/native cancel behavior, and a focused V9 gate that requires picking overlay evidence; portable scripts can declare `picking.pointerRay` and `picking.mesh` to generate camera-based pointer rays and query generated mesh renderer bounds in web and Bevy; basic UI control picking dispatches portable action events across web and Bevy. | Full visual settings-screen UX polish, platform touch event stream wiring, richer gestures, richer device overlays, and richer navigation diagnostics remain incomplete. |
| Scripting | ✅ | V4 portable scripts, deterministic bundle output, web runner, Bevy QuickJS host, declared effect validation, patch/event/command/service logs; V7 `v7-scripting-lifecycle` compares a script-heavy multi-schedule web/native effect log with resource, event, command, service, explicit same-stage `before`/`after` system ordering, `ctx.states.get()` app/computed/substate reads, `ctx.components.hooks()` component-hook reads, `ctx.components.type()` component-reflection reads, `ctx.observers.propagate()` observer-route reads, fixed-trace task/channel reads plus channel sends through `ctx.tasks.*()` / `ctx.channels.*()`, query ordering/pagination/changed filters through `ctx.query(...)`, read-only plugin composition through `ctx.plugins.*()`, deterministic seeded random helpers through `ctx.random.float/range/int/bool/pick`, deterministic timer/cooldown helpers through `ctx.timers.elapsed/remaining/progress/done/ready`, read-only bundle asset manifest metadata through `ctx.assets.get()` / `ctx.assets.list()`, declared bundle-local asset load service effects through `ctx.assets.load()` / `assets.load`, and declared `ctx.character.move()` / `character.move` fixed-trace character-controller observations. | Arbitrary async timers/promises/workers, arbitrary npm/platform APIs, network/file asset loading, custom runtime asset loaders, hidden runtime diffing for changed queries, state-preserving hot reload, dynamic runtime plugin loading, full dynamic scene reconciliation, raw Bevy/renderer type IDs, command-time/removal component hook callbacks, stoppable observers, and system-local persisted state remain unsupported or bounded. |
| Diagnostics | ⚠️ | Stable IR/compiler/CLI/native diagnostic shapes, severity, suggestions, metadata preservation, V5/V6 ranges. | Some asset/runtime failures still need better domain-specific codes and target-specific repair hints. |
| Packaging/platforms | ⚠️ | Templates and verify gates build local bundles and web evidence; V7 adds `tn package --target desktop`, target-profile diagnostics, a local desktop package manifest, runtime args, `artifacts/v7/packaging`, and packaged `examples/v7-functional` evidence. | Signed installers, mobile app-store packaging, online publishing, hosted services, and broader platform diagnostics are not implemented. |
| Performance/profiling | ⚠️ | V3/V5 dense-content budget artifacts and release-gate reports; V7 adds target-profile-aware fixed metric reports for frame/load/draw/entity/package-size budgets through `v7-performance-budgets` and `artifacts/v7/performance`. | Live browser profiling, native platform profiler captures, script/UI/audio timing breakdowns, and larger-scene budget tuning remain incomplete. |
| Editor/inspector | ⚠️ | V8 has started the local/offline editor track with structured editor project snapshot validation, deterministic bundle-relative JSON diffs, validated save/load round trips through `tn editor snapshot` / `tn editor apply`, and CLI entry points for `tn editor snapshot` / `tn editor apply` / `tn editor diff`. | Visual editor UI, inspector panels, preview evidence, and richer editor diagnostics are not complete. |
| Online/plugins/raw renderer | ⏭️ | Product boundary keeps Bevy as an internal adapter and V8 local/offline only. | Online services, networking, replication, collaboration, public plugins, raw Three.js authoring, direct Bevy authoring, and broad shader graphs are deferred or never portable. |

V7 is complete for the promoted parity slices only when `pnpm verify:v7`
passes. That report links docs and diagnostics inputs, conformance output,
focused Rust tests, rendered web functional-scene evidence, packaged desktop
artifacts, template smoke output, packaging diagnostics, and performance budget
reports. Rows marked deferred or never portable remain outside the V7 support
surface.

V8 begins the local editor and inspector track through [V8 PRDs](PRDs/v8/README.md).
That work is scoped to offline structured SDK/ECS/IR project data, local
save/load, structured diffs, diagnostics, and bundle preview evidence. Online
services, networking, replication, collaboration, public plugins, raw Three.js
authoring, and direct Bevy authoring remain outside V8.

The first V8 slices add IR-level editor project snapshot validation,
deterministic structured diffs for bundle-relative JSON documents, validated
save/load through structured snapshot application, and CLI entry points for
`tn editor snapshot` / `tn editor apply` / `tn editor diff`. V8-06 through
V8-12 plus the pending V8-15 PR are also treated as completed or partially
promoted parity slices for camera views, material/texture parity, transform
animation and animation service traces, primitive rigid-body traces, asset/glTF
inspection, focused rendering-quality fog/sky evidence, lights/shadows trace
evidence, and static disabled retained-UI behavior. Latest color-parity work
adds focused web/native color and lighting-tone evidence.

[V9 PRDs](PRDs/v9/README.md) convert the remaining unchecked checklist backlog
into category PRDs that aim to complete the most checks per category without
making any single PRD too broad to verify. V9 covers animation/particles,
physics/character, assets/glTF/scene workflow, rendering/lights/post-processing,
input/UI/accessibility, and audio/persistence/tooling support.

## Sources

| Source | Link |
| --- | --- |
| Bevy feature overview | https://bevy.org/ |
| Bevy examples catalog | https://bevy.org/examples/ |
| Bevy 0.14 release notes | https://bevy.org/news/bevy-0-14/ |
| Bevy crate documentation | https://docs.rs/bevy |
| Open Bevy game: Jumpy | https://github.com/fishfolk/jumpy |
| Open Bevy game: Ethertum | https://github.com/Dreamtowards/Ethertum |
| Open Bevy game: Lost In Time | https://github.com/RaminKav/LostInTime |
| Open Bevy game: gdclone | https://github.com/opstic/gdclone |
| Open Bevy game: sokoban-rs | https://github.com/ShenMian/sokoban-rs |
| Open Bevy game: Golab | https://github.com/NiiightmareXD/golab |
| Open Bevy game: Tsumi | https://github.com/PraxTube/tsumi |
| Open Bevy game: Flyconomy | https://github.com/chriamue/flyconomy |
