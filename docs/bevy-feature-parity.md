# Three.js Game Engine x Bevy Parity

| Scope | Value |
| --- | --- |
| Contract | Three.js-style TypeScript game engine -> validated IR bundle -> web Three.js + native Bevy |
| Native baseline | Bevy and `bevy_ecs` pinned to `=0.14.2` |
| Evidence anchors | native test, visual scene, game-authoring ergonomics, V6 PRDs, verify:v6, V7 PRDs, verify:v7, V8 PRDs, examples/v7-functional, artifacts/v7 |

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
- [x] Mesh bounds, AABB/sphere intersection utilities, and sampling
- [x] Curves, splines, easing functions, and path sampling
- [x] Transform interpolation/smoothing helpers
- [x] Gizmo geometry as debug/editor-only output

### 🎥 Cameras and Views

- [x] Perspective camera and active camera selection
- [x] Orthographic projection metadata and conformance observation
- [x] First-person camera/controller metadata
- [ ] Multiple active cameras, camera ordering, and split-screen
- [ ] Viewports, sub-views, and render layers
- [ ] Render-to-texture and depth-only camera targets
- [ ] Custom projections
- [ ] Camera effects: screen shake, orbit, pan, zoom, and view models
- [ ] Screenshot/export camera workflows

### 💡 Lights, Shadows, and Global Illumination

- [x] Ambient light
- [x] Directional light
- [x] Point light with range
- [x] Spot light with range and angle
- [x] Shadow metadata and shadow conformance observations
- [ ] Dynamic light limits, clustered-light behavior, and light culling budgets
- [ ] Point-light PCF/shadow-filtering parity
- [ ] Shadow bias controls
- [ ] Per-mesh shadow caster/receiver controls
- [ ] Spherical/area-light behavior
- [ ] Lightmaps and mixed baked/dynamic lighting
- [ ] Light probes and environment maps
- [ ] Light gizmos/debug visualization

### 🎨 Materials, Textures, and Shaders

- [x] Standard material base color, metalness, roughness
- [x] Texture references and web/native material slot observations
- [x] Visibility flags on mesh renderers
- [ ] Full native texture image loading and texture sampling parity
- [ ] Alpha modes, transparency sorting, and blend modes
- [ ] Emissive materials and HDR bloom contribution
- [ ] Normal, occlusion, specular, clearcoat, and transmission maps
- [ ] Parallax mapping and depth maps
- [ ] Anisotropy, specular tint, and advanced PBR fields
- [ ] Texture repeat/wrap/filter/UV transform controls
- [ ] Multiple UV channels
- [ ] Vertex colors
- [ ] Custom materials and extended materials
- [ ] Custom shaders, shader defs, storage buffers, and render phases
- [ ] Bindless materials/textures

### 🌌 3D Rendering, Atmosphere, and Post-Processing

- [x] Basic 3D scene rendering through web Three.js and native Bevy
- [x] Fog, sky/horizon color, tone mapping, exposure, and color-space metadata
- [x] Dense-content budget estimates and repeated-instance observations
- [x] Source asset LOD metadata and fixed LOD-selection traces
- [ ] Visual fog/sky/atmosphere parity in native output
- [ ] Atmospheric scattering and atmospheric fog
- [ ] Volumetric fog and volumetric lighting
- [ ] Skyboxes and cubemap/compressed texture handling
- [ ] Bloom
- [ ] Anti-aliasing modes: MSAA, FXAA, TAA, SMAA
- [ ] Color grading and filmic controls
- [ ] Auto exposure
- [ ] Depth of field
- [ ] Motion blur and motion vectors
- [ ] Screen-space reflections and mirrors
- [ ] Decals
- [ ] Deferred rendering
- [ ] Visibility ranges/HLOD fade behavior
- [ ] Renderer-level native instancing and batching parity
- [ ] Virtual geometry/meshlet rendering
- [ ] Custom post-processing passes

### 📦 Assets, glTF, and Scenes

- [x] Bundle-local glTF/GLB assets
- [x] glTF `.bin` and texture dependency bundling
- [x] Model scene instances in web and Bevy
- [x] Material/texture/mesh asset diagnostics and conformance observations
- [x] Typed animation clip metadata from model assets
- [ ] Embedded assets
- [ ] Web/network asset loading
- [ ] Custom asset loaders and custom asset types
- [ ] Multi-asset load synchronization
- [ ] glTF extras and custom glTF vertex attributes
- [ ] Query/update spawned glTF scene entities
- [ ] Scene viewer/editor inspection workflow
- [ ] Asset hot reload and state-preserving reload behavior

### 🎞️ Animation and Particles

- [x] Animation clip metadata and validated clip refs
- [x] `animation.play` service-call trace
- [x] Constrained animation graph metadata
- [x] Animation event-marker metadata and fixed event traces
- [x] Bounded particle-emitter metadata and deterministic spawn traces
- [ ] Visual skeletal animation playback parity
- [ ] Transform animation authored in code/IR
- [ ] Animation blending beyond fixed graph traces
- [ ] Animation masks
- [ ] Animation stop/state query APIs
- [ ] Morph-target animation
- [ ] Retargeting and inverse kinematics
- [ ] UI/property animation
- [ ] Rendered particle systems

### 🧱 Physics, Collision, and Character Movement

- [x] Fixed-timestep movement contract
- [x] Box, sphere, and capsule colliders
- [x] Rigid-body metadata
- [x] Trigger/contact event phases for fixed traces
- [x] Collision layer/mask metadata
- [x] Raycast-style grounding trace
- [x] Overlap and shape-cast service traces
- [x] Narrow character controller movement and blocking trace
- [ ] Full rigid-body solver parity
- [ ] Dynamic mesh colliders
- [ ] Broad sensors beyond current trigger/overlap scope
- [ ] Slopes, steps, ledges, moving platforms, and richer grounded state
- [ ] Character interaction volumes and object pushing
- [ ] Navmesh/pathfinding behavior
- [ ] External physics backend integration strategy

### 🎮 Input, Picking, and Controls

- [x] Keyboard/mouse-style input references for promoted systems
- [x] Pointer-lock expectation metadata
- [x] UI action queue metadata
- [x] Fixed first-person movement trace
- [ ] Native input capture parity
- [ ] Gamepad controls and gamepad viewer-style diagnostics
- [ ] Touch input and gestures
- [ ] Mouse picking and mesh picking
- [ ] UI picking
- [ ] Drag-and-drop picking events
- [ ] Picking debug overlay
- [ ] Input rebinding and device capability diagnostics

### 🧭 UI, Text, and Accessibility

- [x] Retained UI IR and validation
- [x] Web DOM overlay and Bevy UI entity spawning
- [x] Text, resource-bound bars, and focusable buttons
- [x] Focus order, navigation links, input action refs, and safe-area metadata
- [x] Fixed web/native focus and activation trace
- [ ] Flex layout parity beyond promoted HUD cases
- [ ] CSS grid-style layout
- [ ] Anchors, size constraints, overflow, clipping, scrolling, and z-index
- [ ] Borders, rounded corners, shadows, gradients, and transparency
- [ ] Rich text styling: fonts, weights, wrapping, underline, strikethrough
- [ ] Images, texture atlases, 9-slice scaling, flipping, and tiling
- [ ] Standard widgets: sliders, scrollbars, virtual keyboard, context menus
- [ ] Automatic directional navigation and tab navigation parity
- [ ] UI transforms and render-to-texture/3D-world UI
- [ ] Accessibility semantics and screen-reader-oriented diagnostics
- [ ] UI debug overlay/gizmos

### 🔊 Audio

- [x] Local OGG/WAV asset validation
- [x] Web HTML-audio sink and Bevy autoplay loop spawning
- [x] Portable volume and deterministic audio command observations
- [x] Bus, listener, and spatial-emitter metadata
- [x] Fixed loop start/stop lifecycle traces
- [ ] Real 3D spatial attenuation and listener movement
- [ ] Mixer buses, effects, ducking, and routing behavior
- [ ] Playback handles for pause/resume/seek/stop/query
- [ ] Pitch control and generated tone playback
- [ ] Soundtrack/state-driven music transitions
- [ ] Custom audio source/decoder support
- [ ] Streaming and network audio
- [ ] Platform-specific audio diagnostics

### 🧪 Diagnostics, Tooling, Packaging, and Performance

- [x] Stable IR/compiler/CLI/native diagnostic shapes
- [x] JSON severity, suggestions, paths, and metadata preservation
- [x] Conformance reports for web and Bevy observations
- [x] Release verification gates and artifact presence checks
- [x] Desktop package manifest and runtime args for V7 packaging
- [x] Fixed metric reports for frame/load/draw/entity/package-size budgets
- [ ] Live profiler captures and native platform profiler evidence
- [ ] GPU profiling and render-pass timing breakdowns
- [ ] In-app FPS overlay and custom diagnostics
- [ ] Signed installers and app-store/mobile packaging
- [ ] Broader platform target profiles and repair hints
- [ ] Large-scene stress-test fixtures for UI, text, lights, cubes, and animated models

### 🛠️ Editor, Debugging, and Developer Tools

- [x] Local editor project snapshot validation
- [x] Deterministic structured bundle-relative JSON diffs
- [x] CLI entry points for `tn editor snapshot`, `tn editor apply`, and `tn editor diff`
- [ ] Visual editor UI and inspector panels
- [x] Save/load round trips through structured SDK/ECS/IR data
- [ ] Scene hierarchy inspector and property editing
- [ ] Gizmo overlays for transforms, lights, bounds, cameras, and UI nodes
- [ ] Gamepad, scene viewer, and asset preview tools
- [ ] Hot reload with state policy
- [ ] Debug draw APIs for gameplay systems

### 🚧 Intentionally Deferred or Non-Portable

- [ ] Direct Bevy authoring from user TypeScript
- [ ] Raw Three.js authoring as the source of truth
- [ ] Public plugin escape hatches into renderer/runtime internals
- [ ] Online services, networking, replication, and collaboration
- [ ] Arbitrary npm, filesystem, worker, timer, or platform APIs in portable scripts
- [ ] Backend-only features that cannot be represented in portable IR

## Parity Table

| Feature | Status | Done | Missing / gap |
| --- | --- | --- | --- |
| ECS entities/components | ⚠️ | Stable entity IDs, transforms, hierarchy, component schemas, V4/V6 system declarations; web and native tests now prove command-buffer spawn/despawn reconciliation across later schedules, including querying a spawned component before despawn; V7 validates declared component `onAdd`/`onInsert` hook observations and exposes them through web/native `ctx.components.hooks()` fixed-trace evidence; component schemas now produce a portable reflection registry exposed through web/native `ctx.components.type()` / `ctx.components.types()`; editor snapshots can now serialize and apply structured scene/world JSON back to validated bundles. | Full gameplay host, broad dynamic reconciliation against live rendered Bevy entities, raw Bevy/renderer type IDs, command-time/removal component hook callbacks, system-local persisted state, and richer lifecycle remain incomplete. |
| Resources/events | ⚠️ | V6 resource schemas, resource reads/writes, event schemas, queued event payloads, web/native effect logs, `v6-resources-events` conformance; native direct event writes and command-buffer event writes now persist into the runtime world queue and feed later systems; V7 validates fixed-trace typed channels backed by declared event schemas and exposes them through web/native `ctx.channels.read()` / `ctx.channels.send()`. | Full resource/event runtime parity, event cleanup/windowing semantics, and broader gameplay scene proof are still incomplete. |
| Schedules/states | ⚠️ | `startup`, `fixedUpdate`, `update`, `postUpdate`; deterministic same-stage system ordering; shared startup-before-update trace; V7 lifecycle metadata requires fixed-trace replay, hot-reload invalidation, and no system-local persisted state; V7 also validates resource-derived app states, computed states, substates, component hook observations, target-to-ancestor observer propagation, fixed-trace task declarations, event-backed channel handoff, and portable plugin/plugin-group composition exposed through web/native `ctx.states.get()`, `ctx.components.hooks()`, `ctx.observers.propagate()`, `ctx.tasks.*()`, `ctx.channels.*()`, and `ctx.plugins.*()` evidence; focused web/native tests now prove startup-created entities/events/resources are observable from later schedules. | State-preserving hot reload, broader dynamic lifecycle/state transitions, command-time/removal component hook callbacks, event clearing/windowing rules, stoppable observer propagation, dynamic runtime plugin loading, true async timers/workers/promises, and richer state handoff remain unsupported or incomplete. |
| 3D transforms/hierarchy | ✅ | V1 contract across IR, web, Bevy, and conformance. | Keep conformance green. |
| Mesh primitives | ✅ | Box, sphere, plane, capsule, cylinder, cone, conical frustum, torus, circle, annulus, regular polygon, and extruded rectangle are promoted through SDK constructors, compiler size tuples, IR validation, Three.js geometry mapping, and Bevy mesh primitives including `Extrusion<Rectangle>`; custom generated meshes now carry validated float vertex attributes, optional U32 triangle indices, Three.js `BufferGeometry` mapping, and Bevy `Mesh` attributes including stable `custom:<name>` attributes; web and Bevy expose matching generated-mesh sampling, AABB, bounding-sphere, AABB intersection, and sphere intersection helpers. | Keep conformance green as additional primitive parameters are promoted. |
| Curves and path sampling | ✅ | Web and Bevy expose matching quadratic easing helpers plus line, quadratic Bezier, cubic Bezier, and Catmull-Rom path sampling utilities with focused parity tests. | Broader authored path components and editor curve handles can build on these helpers. |
| Transform interpolation | ✅ | Web and Bevy expose matching vec3 interpolation, shortest-arc quaternion interpolation, full transform interpolation, and exponential smoothing helpers with focused parity tests. | Broader animation/state smoothing APIs can build on these helpers. |
| Gizmo geometry | ✅ | Web and Bevy expose matching debug/editor-only axis, wire-box, and wire-sphere line geometry helpers with per-line colors and focused conversion tests for Three.js `BufferGeometry` and Bevy `LineList` meshes. | Larger editor overlay systems can compose these helpers for cameras, lights, bounds, and UI nodes. |
| Cameras | ⚠️ | Perspective camera and active camera path are usable; orthographic camera projection maps in web and Bevy and is now exposed as a runtime conformance observation in `v5-drift-surface`. | General camera resource model and full orthographic visual parity are not complete. |
| Lights | ✅ | Ambient, directional, point range, spot range/angle in SDK/compiler/IR, web, Bevy, and conformance observations. | Advanced lighting parity beyond promoted fields remains renderer-specific. |
| Materials | ⚠️ | Standard color, metalness, roughness, and validated texture refs; web maps texture slots; Bevy maps refs to `StandardMaterial` image handles. | Full native texture image loading and visual texture parity remain adapter-dependent. |
| Shadows/color/fog/sky | ⚠️ | Promoted fields for shadows, fog, sky/horizon color, tone mapping, exposure, and color spaces are serialized and observed. | Native fog/sky/color rendering parity is still limited. |
| Assets/glTF/scenes | ✅ | Bundle-local glTF/GLB, `.bin`, and texture dependencies; V3 environment instances resolve to real model scenes in web and Bevy. | Asset diagnostics still need more stable domain codes in some paths. |
| Instancing/dense content | ⚠️ | Web instancing plan, concrete dense-content budget estimates, repeated group observations, source asset LOD metadata; V7 compares fixed web/native environment content traces for LOD selection and model-backed repeated-instance observations through `v7-renderer-dense-content`. | Actual renderer-level native instancing, visual runtime LOD mesh swapping, and portable post-processing are not claimed. |
| Animation | ⚠️ | V6 model clip metadata, validation, conformance reporting, and `animation.play` service-call trace; V7 validates and emits constrained animation graph, event-marker, and bounded particle-emitter metadata, and `v7-animation-graphs-particles` compares fixed web/native graph transition, active clip, queued animation event payload, and bounded particle spawn traces. | Full visual mixer playback, scripted graph playback beyond the fixed trace, stop/state query APIs, IK, retargeting, and rendered particle systems are incomplete. |
| Physics/collision | ⚠️ | V6 box/sphere/capsule collider validation, rigid-body fields, deterministic collision/trigger event phases for fixed traces; V7 contract metadata validates portable collider `layer`/`mask` filters and declares `physics.overlap` / `physics.shapeCast` service permissions; `v7-advanced-physics-character` now compares fixed web/native primitive overlap, swept box shape-cast service traces, and the narrow grounded/blocking character trace with portable layer filters; web/native runtime tests pin deterministic ordering for simultaneous contacts. | Full solver behavior, dynamic mesh colliders, and broader sensors are not claimed yet. |
| Character controller | ⚠️ | V6 character controller metadata, input references, movement axes, speed, grounding/blocking/interaction declarations; V7 fixed web/native character trace covers one-step axis movement, raycast-style grounding, and stop-before-penetration blocking. | Full runtime interaction parity, slopes, steps, navmesh behavior, and richer controller state are incomplete. |
| UI | ⚠️ | Retained UI IR, validation, web DOM overlay, Bevy entity spawning, conformance UI tree, resource-bound bar, focusable button; V7 focus order, navigation links, input action refs, safe-area metadata, and fixed web/native focus/activation trace. | Rich platform widget behavior, broad gamepad/touch coverage, styling/layout parity, and richer UI/audio UX are incomplete. |
| Audio | ⚠️ | Local OGG/WAV validation, web HTML-audio sink, Bevy autoplay loop spawning, portable volume, deterministic audio command observations, and V7 bus/listener/spatial-emitter metadata with routed command reports plus fixed loop start/stop lifecycle traces through `v7-spatial-audio-buses`. | Real spatial attenuation, mixer effects, streaming/network audio, platform handles, and richer UI/audio services remain incomplete or unsupported. |
| Input | ⚠️ | First-person config, pointer-lock expectations, movement update, input references, UI action queue metadata. | Native input capture and richer gamepad/touch navigation remain smoke-level or deferred. |
| Scripting | ✅ | V4 portable scripts, deterministic bundle output, web runner, Bevy QuickJS host, declared effect validation, patch/event/command/service logs; V7 `v7-scripting-lifecycle` compares a script-heavy multi-schedule web/native effect log with resource, event, command, service, `ctx.states.get()` app/computed/substate reads, `ctx.components.hooks()` component-hook reads, `ctx.components.type()` component-reflection reads, `ctx.observers.propagate()` observer-route reads, fixed-trace task/channel reads plus channel sends through `ctx.tasks.*()` / `ctx.channels.*()`, and read-only plugin composition through `ctx.plugins.*()`. | Arbitrary async timers/promises/workers, arbitrary npm/platform APIs, state-preserving hot reload, dynamic runtime plugin loading, full dynamic scene reconciliation, raw Bevy/renderer type IDs, command-time/removal component hook callbacks, stoppable observers, and system-local persisted state remain unsupported or bounded. |
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
`tn editor snapshot` / `tn editor apply` / `tn editor diff`. This is local data
plumbing, not a visual editor runtime.

## Sources

| Source | Link |
| --- | --- |
| Bevy feature overview | https://bevy.org/ |
| Bevy examples catalog | https://bevy.org/examples/ |
| Bevy 0.14 release notes | https://bevy.org/news/bevy-0-14/ |
| Bevy crate documentation | https://docs.rs/bevy |
