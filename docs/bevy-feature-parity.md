# Three.js Game Engine x Bevy Parity

| Scope            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract         | Three.js-style TypeScript game engine -> validated IR bundle -> web Three.js + native Bevy                                                                                                                                                                                                                                                                                                                                                                                                             |
| Native baseline  | Bevy and `bevy_ecs` pinned to `=0.14.2`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Evidence anchors | native test, visual scene, game-authoring ergonomics, agent-safe authoring core diagnostics, agent-safe `tn scene create` first-document UX, structured authoring source-document boundary inventory, structured UI/material/asset/input/system/prefab/audio source document validation tests, recoverable bundle catalog import tests for structured source, initial full-source CLI mutation groups for UI/material/mesh/prefab/input/system documents, structured authoring provenance ownership tests, structured-source-starter template build and CLI source edit proof, authoring MCP wrapper smoke tests and structured UI/bundle-import adapter parity tests, read-only `@threenative/editor` shell and `tn editor dev/open` launch tests, editor `content/**` source-persistable IR classification and shared authoring operation registry tests, editor workbench source inventory and operation parity tests, editor runtime preview build/status, selection overlay, catalog preview, Vibe Coder-derived shell chrome, ThreeNative-branded editor chrome, source-backed Three.js editor viewport scene, hierarchy selection, viewport picking, selected-object inspector rows, source-schema-backed inspector field inventory, typed inspector controls, source row JSON-pointer and operation metadata, editor operation coverage matrix and read-only reason tests, editor Zustand session-store modal/selection/project/nesting/transform/async-action tests, editor Zustand refactor `verify:editor-package` browser proof, editor malformed operation diagnostics and unsupported component edit tests, real hierarchy icons, icon playback controls, AI chat rail, source-backed reference scene visual details, hierarchy drag/drop affordance, editor default scene creation with main camera/directional light/ambient light, editor scene load/save reload proof, source-derived editor LOD triangle footer status, project-served GLB/GLTF editor viewport loading with Draco decoder proof, attached-component-driven inspector panels, editor Add Object/Add Component/Save/New/Build modal smoke coverage, Add Object Primitive/Empty/Camera/Light source-operation payload tests, Add Component shared defaults/incompatibility/pack metadata and persistence tests, Playwright `verify:editor-package` inspector-control smoke, and browser primitive/color source/IR persistence proof, CLI-authored `.scene.json` build-entry proof with attached script, `tn scene proof` same-source/same-bundle report, headless Xvfb-wrapped native proof capture, and web/Bevy screenshots, modular SDK scene/entity/prefab/resource/input/UI/audio/asset source metadata tests, compiler authoring graph normalization tests, modular compiler capture tests, authoring provenance sidecar conformance proof, script module reference and generated manifest tests, scripting host matrix and web/Bevy effect validation parity tests, scene lifecycle SDK declaration tests, scene lifecycle IR validation tests, scene lifecycle compiler emission tests, scene lifecycle web/Bevy runtime trace tests, scene lifecycle example build smoke, animation/physics/navigation residual traces, input/UI polish traces, production hardening traces, rendering residual traces, bundle safety hardening traces, capability conformance fixtures, `pnpm verify:release`, `pnpm verify:conformance`, `pnpm verify:animation-physics-residuals`, `pnpm verify:input-ui-polish`, `pnpm verify:production-hardening`, `pnpm verify:rendering-residuals`, `pnpm verify:bundle-safety-hardening`, focused gates routed through `tools/verify/dist/cli/run.js`, release reports with step timing categories and budget warnings, `pnpm --filter @threenative/ir test` contract drift and bundle path coverage, `pnpm --filter @threenative/ir test -- --run contractDrift` schema literal and Bevy DTO drift coverage, web/Bevy generated-mesh payload rejection tests, starter-functional template, release artifacts under `tools/verify/artifacts/release/` and `packages/ir/artifacts/conformance/`, historical milestone archive under `docs/PRDs/archive/`, V10 PRDs, focused V10 evidence gates |

## Status

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| ✅     | Works across the Three.js-style API, IR, web runtime, and Bevy where claimed. |
| ⚠️     | Partly works, but web and Bevy are not fully aligned yet.                     |
| ❌     | Not implemented in this repo.                                                 |
| ⏭️     | Intentionally deferred or never portable.                                     |

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

### V10 Residual Ownership Map

V9 closes the practical small-game parity surface and leaves a smaller residual
set. V10 planning now assigns those remaining unchecked items without claiming
implementation:

- `V10-01` owns final-gap triage, aggregate V10 gate planning, and diagnostics
  for intentionally non-portable boundaries.
- `V10-02` owns advanced renderer, lighting, material/shader, post-processing,
  native-instancing, dynamic mesh-collider, and high-end physics residuals.
- `V10-03` now owns and implements the cross-runtime visual calibration gate for
  isolated color, material, lighting, atmosphere, post-processing, geometry,
  dense content, and combined-scene look-and-feel parity. Run
  `pnpm verify:v10:visual-calibration`; evidence and screenshot artifact paths
  are indexed from `docs/pr-evidence/v10-visual-calibration/`.
- `V10-04` owns production platform work: custom asset/audio extension policy,
  streaming diagnostics, cloud-save boundary, signed/mobile packaging, profiler
  maturity, and release hardening.
- `V10-05` now implements the grouping model: ECS tags as queryable zero-field
  marker components plus scene `Group` containers that lower to hierarchy-only
  `SceneContainer` entities with viewable multi-lane moving-cube web/Bevy
  conformance coverage.
- Broader authoring-tool UX remains outside this V10 batch except for bounded
  visual panel evidence explicitly promoted below. Tooling now includes
  `tn model-test` for one-model proof projects, `tn screenshot`/`tn record` for
  direct Playwright proof artifacts, and `tn verify --json` projected nonblank
  bounds diagnostics; these are CLI/runtime QA aids, not new portable Bevy
  runtime capabilities.

Unchecked rows below should remain unchecked until their V10 owner adds SDK/IR,
validation, compiler, web, Bevy, conformance, docs, and artifact evidence, or
adds stable diagnostics that make the feature explicitly unsupported.

### Post-V10 PRD Slice Map

The unchecked backlog is now split into current planning PRDs without claiming
implementation. These slices supersede the coarse V10 ownership map for future
execution order while keeping all checklist rows unchecked until evidence lands:

- [Runtime Gameplay Host Semantics](PRDs/done/other/post-v10-runtime-gameplay-host.md):
  now release-gated by `pnpm verify:runtime-gameplay-host` for P0/P1 ECS host
  execution, live rendered-entity reconciliation, event windows, dynamic state
  handoff, hooks, system-local state, bounded timer/channel evidence, stoppable
  observer controls, and runtime plugin/raw-handle diagnostics.
- [Durable Persistence and State-Preserving Reload](PRDs/done/other/post-v10-persistence-hot-reload.md):
  durable Bevy save/settings backend, autosave/checkpoint restore, hot reload
  with state policy, live scene mutation needed for reload proof, and
  cloud/filesystem boundary diagnostics.
- [Input, UI, and Platform UX Polish](PRDs/done/other/post-v10-input-ui-platform-polish.md):
  platform touch streams, settings-screen polish, richer gestures/device repair,
  virtual keyboard behavior, runtime disabled-state updates, nested scrolling,
  spatial navigation, focus narration, italic text, grid residuals, and desktop
  webview inspection.
- [Rendering, Materials, Geometry, and Asset Residuals](PRDs/done/other/post-v10-rendering-materials-geometry-residuals.md):
  runtime LOD swapping, mesh deformation/terrain streaming, material/specular/
  blend proof, instancing APIs, custom GPU attributes, compressed environment
  formats, broader live asset streaming, glTF custom attribute consumption, and
  advanced renderer/material/shader diagnostics.
- [Animation, Physics, and Navigation Residuals](PRDs/done/other/post-v10-animation-physics-navigation-residuals.md):
  animation masks, morph targets, UI/property animation, blend-tree residuals,
  sloped mesh grounding, constraints, triangle narrow phase, dynamic navmesh,
  crowd/off-mesh links, vehicle diagnostics, and advanced physics deferrals.
- [Production Audio, Diagnostics, Profiling, and Packaging](PRDs/done/other/post-v10-production-audio-diagnostics-packaging.md):
  live mixer/effects, audio routing diagnostics, UI/audio integration,
  profiler/GPU timing reports, signed/mobile packaging preflight,
  domain-specific repair hints, debug rendering, and production boundary
  diagnostics.

### Prioritized Native Gap Backlog

This pass treats the Bevy runtime crate as the source of truth and ranks
remaining gaps by usefulness for building and shipping ordinary 3D games:

- `P0` Durable native save/settings storage is promoted by
  `pnpm verify:persistence-reload`, which proves declared resource/component
  save records, settings, autosave restore, and migration diagnostics across web
  and Bevy.
- `P0` State-preserving reload is promoted by `pnpm verify:persistence-reload`
  for bundle-local asset replacement, retained state policy, reset state
  classification, and unsupported cloud/filesystem boundary diagnostics.
- `P1` Runtime gameplay lifecycle parity is promoted by
  `pnpm verify:runtime-gameplay-host`, which compares web and Bevy live
  rendered-entity reconciliation, event-window policy, dynamic state handoff,
  command-time/removal hook ordering, system-local evidence, stoppable observer
  propagation, bounded timer/channel semantics, and stable diagnostics for raw
  handles, runtime plugins, workers, timers, and unbounded promises.
- `P1` Portable scripting host conformance is backed by the service matrix,
  focused web and Bevy effect-validation tests that reject undeclared
  component/resource/event/command/service effects before mutation, canonical
  effect-log ordering, compiler module-state diagnostics, and native QuickJS
  ambient API isolation tests.
- `P1` Hidden runtime changed-query diffing is promoted by
  `pnpm verify:runtime-query-diffing`, which compares web and Bevy component
  snapshot diffing for `changed: [...]` queries after command-buffer mutation
  and before deterministic ordering, offset, and limit windows.
- `P1` Portable UI, persistence, and settings script facades are promoted by
  `pnpm verify:ui-persistence-settings-facades`, which compares web and Bevy
  retained UI state reads/writes plus declared local-data save/settings
  behavior without exposing DOM, filesystem, cloud, or native widget handles.
- `P1` Runtime prefab instantiation and hierarchy commands are promoted by
  `pnpm verify:runtime-prefabs-hierarchy`, which compares bundle-local prefab
  expansion, deterministic instance prefixes, and `setParent`/`clearParent`
  hierarchy mutation across web and Bevy.
- `P1` Production input/device UX. Keyboard, mouse, gamepad snapshots, touch
  hooks, rebinding, drag picking, and picking debug reports exist, but polished
  device repair overlays, platform touch stream wiring, and richer navigation
  diagnostics remain useful game-facing gaps.
- `P1` Runtime UI mutation and platform UI behavior. Bevy can spawn retained UI,
  widgets, images, rich text, actions, accessibility metadata, and debug reports;
  missing work is disabled-to-enabled updates, nested/axis-specific scrolling,
  virtual keyboard behavior, spatial navigation heuristics, focus narration, and
  native italic rich text.
- `P2` Native audio production depth is promoted by
  `pnpm verify:production-hardening` for bounded mixer/effect-chain reports,
  device routing diagnostics, internal-only native handle boundaries, and
  UI-triggered audio actions. Custom decoders and streaming/network audio remain
  diagnostic-only boundaries.
- `P2` Profiling and packaging hardening is promoted by
  `pnpm verify:production-hardening` for captured CPU profiler host state, GPU
  timer unavailable state, debug-render report evidence, domain repair hints,
  and signed/mobile package preflight without secrets. Actual signed installer
  generation still requires release credentials outside repo verification.
- `P2` Rendering/material/asset residuals are promoted by
  `pnpm verify:rendering-residuals` for runtime LOD selection reports, chunked
  terrain asset-group policy, bounded instancing policy, specular texture proof,
  extended material preset proof, manifest streaming diagnostics, and advanced
  renderer boundary diagnostics.
- `P3` Advanced renderer and physics breadth. Custom shaders, bindless,
  volumetrics, SSR, deferred rendering, decals, auto exposure, DOF, motion blur,
  virtual geometry, full constraints, vehicles, ragdolls, soft bodies, arbitrary
  triangle narrow phase, and dynamic navmesh rebakes are valuable but less
  important than the runtime/save/hot-reload gaps above.

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

### Upstream Bevy Example Catalog Watchlist

The current upstream Bevy examples catalog also exposes feature families that
were previously missing or too coarsely represented in this tracker. Some of
these rows may be beyond the pinned Bevy `=0.14.2` baseline, so they are tracked
as watchlist items until a PRD either verifies baseline relevance, promotes a
portable subset, or adds stable diagnostics. Newly added unchecked rows below
cover editable text and IME, UI viewport nodes, UI drag and drop, custom UI
materials, window/cursor/power behavior, runtime asset authoring/saving,
generated asset export, glTF extension processing, and deeper ECS query/callback
ergonomics. These rows are not implementation claims.

### 🧩 ECS, App, and Scheduling

- [x] Entities, stable IDs, components, and component schemas
- [x] ECS tags as queryable zero-field marker components
- [x] Scene `Group` containers as hierarchy-only `SceneContainer` entities
- [x] Parent/child hierarchy and local/global transform propagation
- [x] Resources and typed game events
- [x] Startup, fixed update, update, and post-update schedules
- [x] Deterministic system ordering and command-buffer spawn/despawn
- [x] State metadata and constrained lifecycle traces
- [x] Bevy-style computed states and substates
- [x] Observer/event propagation model
- [x] Component hooks and lifecycle hooks
- [x] Scene serialization/deserialization as an authoring feature
- [x] Named lifecycle scenes, stack/push/pop traces, and transition readiness
- [x] Reflection/type registration surface for portable components
- [x] Async task/channel patterns
- [x] Plugin/plugin-group composition as a portable declaration
- [x] `P0` Full gameplay host semantics against live rendered Bevy entities
- [x] `P1` Broad dynamic reconciliation for spawned/despawned rendered entities
- [x] `P1` Resource/event cleanup and event-windowing semantics
- [x] `P1` Dynamic app-state lifecycle transitions and richer state handoff
- [x] `P1` Command-time/removal component hook callbacks
- [x] `P1` System-local persisted state
- [x] `P2` Stoppable observer propagation
- [x] `P2` Dynamic runtime plugin loading diagnostic boundary
- [x] `P2` Bounded async timers and channels; arbitrary workers/promises remain diagnostic-only
- [ ] `P2` ECS callback components and callable system handles as portable declarations (permission diagnostic triage exists)
- [ ] `P2` Delayed command scheduling beyond bounded timer/channel services (bounded timer/channel alternative remains the promoted path)
- [ ] `P2` Query combination helpers and pairwise iteration semantics with deterministic ordering (web report triage exists)
- [ ] `P2` Entity disabling/suspended ECS participation separate from renderer visibility (native report triage exists)
- [x] `D` Raw Bevy/renderer type IDs in portable gameplay APIs

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
- [x] `P2` Runtime mesh deformation diagnostic boundary
- [x] `P2` Chunked/streamed mesh terrain and world geometry policy
- [x] `P3` CSG and boolean mesh operations diagnostic boundary
- [x] `P3` Storage-buffer/shader-driven procedural geometry diagnostic boundary

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
- [x] `P2` Residual camera diagnostics and editor/debug tooling

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
- [ ] `P3` Spherical/area-light behavior (V10-02)
- [ ] `P3` Lightmaps and mixed baked/dynamic lighting (V10-02)
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
- [x] `P1` HDR bloom contribution from emissive materials
- [x] `P1` Normal/occlusion texture refs plus authored specular, clearcoat, and transmission scalar factors
- [x] `P1` Clearcoat, clearcoat-roughness, and transmission texture maps
- [x] `P1` Specular texture maps
- [ ] `P3` Parallax mapping and depth maps (V10-02)
- [ ] `P3` Anisotropy, specular tint, and advanced PBR fields (V10-02)
- [x] `P1` Authored texture repeat/wrap/filter/UV transform controls in IR, web runtime mapping, native sampler/UV application, and conformance observations
- [x] `P2` Multiple generated-mesh UV channels
- [x] `P2` Generated-mesh vertex colors
- [x] `P2` Constrained extended material presets (`unlitMasked`, `foliage`)
- [x] `P2` Explicit portable shader promotion criteria and unsupported-feature diagnostics
- [x] `P2` Advanced blend parity diagnostics on Bevy beyond normal alpha/mask/blend policy
- [x] `P2` Native specular texture rendering proof
- [x] `P2` Broader extended-material catalog policy beyond current constrained presets
- [x] `P3` Custom shaders, shader defs, storage buffers, and render phases diagnostic boundary (V10-02)
- [x] `P3` Bindless materials/textures diagnostic boundary (V10-02)

V8-13 keeps custom shaders, storage buffers, and raw render phases behind
stable advanced renderer diagnostics until portable promotion criteria and
web/Bevy evidence exist.

### 🌌 3D Rendering, Atmosphere, and Post-Processing

- [x] Basic 3D scene rendering through web Three.js and native Bevy
- [x] Installed CLI package carries the Bevy runtime source and can compile the
      native preview binary from a generated npm project
- [x] Fog, sky/horizon color, tone mapping, exposure, and color-space metadata
- [x] Dense-content budget estimates and repeated-instance observations
- [x] Source asset LOD metadata and fixed LOD-selection traces
- [x] `P1` Focused visual fog/sky parity evidence in native output
- [x] `P1` Focused unlit color swatch and lit PBR sphere parity evidence
- [x] `P1` Seven-scene web/Bevy baseline visual parity gate, including v1
      canonical no-ambient fill and crystal runner ambient calibration evidence
- [ ] `P3` Atmospheric scattering and atmospheric fog (V10-02, V10-03 calibration)
- [ ] `P3` Volumetric fog and volumetric lighting (V10-02, V10-03 calibration)
- [x] `P1` Skyboxes and cubemap/equirect texture handling
  - [x] V9-04 validates bundle-local cubemap/equirect texture refs, emits
        rendering capabilities, reports web/native skybox observations, and writes
        screenshot-level web/native/diff/contact-sheet evidence under
        `examples/rendering-lights/artifacts/rendering-lights/skybox-environment/`; compressed texture
        formats remain deferred
- [x] `P1` Bloom through runtime config in web and native camera runtime
- [x] `P1` MSAA anti-aliasing modes through runtime config in web and native
- [x] `P2` FXAA, TAA, and SMAA anti-aliasing modes
- [x] `P2` Color grading and filmic metadata observations
- [ ] `P3` Auto exposure (V10-02, V10-03 calibration)
- [ ] `P2` Depth of field (V10-02, V10-03 calibration)
- [ ] `P3` Motion blur and motion vectors (V10-02, V10-03 calibration)
- [ ] `P3` Screen-space reflections and mirrors (V10-02, V10-03 calibration)
- [ ] `P2` Decals (V10-02, V10-03 calibration)
- [ ] `P3` Deferred rendering (V10-02)
- [x] `P2` Visibility ranges/HLOD fade observations
- [x] `P1` Renderer-level native instancing and batching parity
- [x] `P1` Visual runtime LOD mesh swapping
- [x] `P2` Arbitrary user-authored instancing APIs as bounded report policy
- [x] `P2` Custom GPU instance attributes diagnostic boundary
- [x] `P2` Compressed skybox/environment texture format diagnostics
- [ ] `P3` Virtual geometry/meshlet rendering (V10-02, V10-03 calibration)
- [ ] `P3` Custom post-processing passes (V10-02, V10-03 calibration)

V8-13 keeps volumetrics, atmospheric scattering/fog, deferred rendering,
SSR/GI/lightmaps, and custom post-processing behind stable advanced renderer
diagnostics until portable promotion criteria and web/Bevy evidence exist.

### 📦 Assets, glTF, and Scenes

- [x] Bundle-local glTF/GLB assets
- [x] glTF `.bin` and texture dependency bundling
- [x] Model scene instances in web and Bevy
- [x] Material/texture/mesh asset diagnostics and conformance observations
- [x] Typed animation clip metadata from model assets
- [x] `P1` Declared embedded asset manifest entries with bounded payload validation
- [x] `P1` Declared HTTPS network asset manifest entries with target-profile validation
- [x] `P3` Custom asset loaders and custom asset types diagnostic boundary (V10-04)
- [x] `P1` Deterministic multi-asset load synchronization trace
- [x] `P1` Declared asset groups and default `bundle.requiredAssets` manifest group
- [x] `P2` glTF extras and custom glTF vertex attributes
- [x] `P1` Query/update spawned glTF scene entities
- [ ] `P2` glTF extension processing policy for AnimationGraph and custom import transforms (executable processor diagnostic exists)
- [x] `P1` Scene viewer/editor inspection workflow
- [x] `P1` CLI glTF/GLB asset inspection for bounds, dependency checks, and scale calibration (`tn asset inspect`)
- [x] `P1` Dev-time asset file watching and explicit reload diagnostics
- [x] `P2` Asset hot reload and state-preserving reload behavior
- [x] `P1` Broader live asset streaming through manifest asset-group policy
- [ ] `P2` Runtime asset saving/export with subasset manifest policy (artifact-root diagnostic exists)
- [ ] `P2` Generated runtime assets that can be persisted or reloaded as bundle artifacts (compiler manifest-entry helper exists)
- [x] `P2` Arbitrary runtime file/network asset access from portable scripts diagnostic boundary
- [x] `P2` Custom shader consumption of glTF custom attributes diagnostic boundary

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
- [x] `P2` Animation masks
- [x] `P1` Stateful animation stop/state query runtime semantics
- [x] `P2` Morph-target animation
- [ ] `P3` Retargeting and inverse kinematics (V10-02)
- [x] `P2` UI/property animation
- [ ] `P2` Arbitrary blend trees beyond bounded crossfade/graph traces
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
- [x] `P2` Dynamic mesh colliders
  - [x] Bounded static/dynamic mesh collider AABB metadata for racing-style
        track and chassis traces
  - [x] Swept-AABB CCD metadata and deterministic high-speed track contact trace
  - [x] Portable hinge, slider, and suspension joint metadata observations
- [x] `P1` Broad sensors beyond current trigger/overlap scope
- [x] Step offsets, ledge ungrounding, moving-platform carry, and richer ground contact trace
- [x] `P0` Slope limits and sloped-surface walkability for promoted ramp colliders
- [x] `P1` Character interaction volumes and object pushing
- [x] `P1` Navmesh/pathfinding behavior
- [x] `P1` External physics backend integration strategy
- [x] `P1` Arbitrary sloped mesh terrain for character grounding
- [ ] `P1` Full constraint solving beyond hinge/slider/suspension metadata
- [ ] `P2` Arbitrary triangle narrow phase for mesh colliders
- [x] `P2` Dynamic navmesh rebakes
- [x] `P2` Crowd steering and off-mesh links
- [ ] `P2` Vehicle drivetrain and tire/friction models
- [ ] `P3` Soft bodies and ragdolls
- [x] `D` Public backend physics/navmesh handles in portable APIs

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
- [x] `P2` Drag-and-drop picking events
- [x] `P2` Picking debug overlay
- [x] `P1` Basic input rebinding helpers and device capability diagnostics
- [x] `P1` Controls settings rebind metadata and local input override persistence
- [x] `P1` Platform touch event stream wiring beyond deterministic hooks
- [x] `P1` Full visual settings-screen UX polish
- [ ] `P2` Richer touch/gamepad gestures beyond tap, swipe, and pinch
- [x] `P2` Richer device diagnostics overlays and repair hints (V10-04)
- [x] `P2` Richer navigation diagnostics for input/UI flows

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
- [x] `P1` Native Bevy overlay UI camera renders retained UI above multi-camera/viewport scenes
- [x] `P1` Native Bevy `Minimap` UI nodes render static paths and live resource-bound markers
- [x] `P1` UI min/max size constraints
- [x] `P1` Basic vertical UI scrolling containers
- [x] `P1` UI background/text color, borders, rounded corners, and opacity
- [x] `P1` Portable UI shadow/linear-gradient metadata and web DOM rendering
- [x] `P1` Native-rendered UI shadows and gradients
- [x] `P1` Basic UI text size, alignment, and wrapping
- [x] `P1` Portable UI text weight/decoration metadata and web DOM rendering
- [x] `P1` Rich text styling: font assets, inline spans, and native-rendered weight/decoration
- [x] `P1` Basic UI image nodes
- [x] `P1` UI texture atlases, 9-slice scaling, flipping, and tiling
- [x] `P2` Standard widgets: sliders, scrollbars, and context menus
- [ ] `P1` Editable text input widgets with deterministic value/action events (web event-order report triage exists)
- [ ] `P1` IME composition support and diagnostics for text input targets (target-profile diagnostic exists)
- [ ] `P1` Platform virtual keyboard behavior (V10-04)
- [x] `P1` Basic automatic tab/sequential directional navigation parity
- [ ] `P2` UI transforms and render-to-texture/3D-world UI (V10-04)
- [ ] `P2` UI viewport nodes with picking/input routing (promotion criteria tracked; no parity claim yet)
- [x] `P1` Basic UI accessibility roles, labels, and missing-label diagnostics
- [x] `P1` Broader screen-reader diagnostics for focusable names, progressbar names, and list/listitem structure
- [x] `P1` Static disabled UI metadata for focus/action suppression and ARIA/AccessKit state
- [x] `P2` UI debug overlay/gizmos
- [x] `P1` Runtime disabled-to-enabled UI updates
- [x] `P1` Nested and axis-specific scroll behavior
- [x] `P1` Spatial navigation heuristics
- [x] `P1` Focus narration
- [ ] `P2` Native-rendered italic rich text
- [ ] `P2` Letter spacing, generic/system font families, and OpenType font variation policy
- [ ] `P2` Arbitrary grid placement, named areas, and dense packing
- [ ] `P2` UI drag-and-drop node interactions distinct from world picking drag events (promotion criteria tracked; no parity claim yet)
- [ ] `P2` Custom UI material/shader declarations as diagnostics or bounded presets (diagnostic-only triage exists)
- [ ] `P2` Broad gamepad/touch UI coverage
- [ ] `P2` Broad manually inspected desktop webview packaging

### 🪟 Window and Platform Runtime

- [x] Window title, resolution, and runtime configuration metadata
- [ ] `P1` Window resize and scale-factor change observations in web and native runtimes (web/native report triage exists)
- [ ] `P2` Custom cursor image and cursor animation policy (window policy diagnostic triage exists)
- [ ] `P2` Low-power/present-mode and background throttling runtime policy (window policy diagnostic triage exists)
- [ ] `P2` Clear-color/window background updates as runtime-observable configuration (window policy diagnostic triage exists)
- [ ] `P2` Multi-window and per-window target diagnostics while portable runtime remains single-window (web/native diagnostic exists)

### 💾 Persistence, Settings, and Local Data

- [x] `P1` Portable save slots for declared resources/components
- [x] `P1` Local settings/key-value persistence for controls, audio, video, and accessibility options
- [x] `P2` Save migration/version metadata and diagnostics
- [x] `P2` Checkpoint/autosave lifecycle hooks
- [x] `P0` Durable Bevy save/settings backend for declared resources/components
- [x] `P1` Runtime autosave/checkpoint execution and restore flow
- [ ] `P3` Cloud save and account-bound storage integration (V10-04 boundary)

### 🔊 Audio

- [x] Local OGG/WAV asset validation
- [x] Web HTML-audio sink and Bevy autoplay loop spawning
- [x] Portable volume and deterministic audio command observations
- [x] Bus, listener, and spatial-emitter metadata
- [x] Fixed loop start/stop lifecycle traces
- [x] Playback-id controls for pause, resume, seek, stop, and query traces
- [x] `P1` Real 3D spatial attenuation and listener movement
- [x] `P1` Mixer buses, ducking, and routing observations
- [x] `P2` Pitch control and generated tone playback metadata
- [x] `P1` Soundtrack/state-driven music transitions
- [x] `P1` Live mixer/effect-chain behavior
- [x] `P2` Platform audio device routing diagnostics
- [x] `P2` Platform-native audio handles as internal-only diagnostics
- [x] `P2` Richer UI/audio service integration
- [ ] `P3` Custom audio source/decoder support (V10-04)
- [ ] `P3` Streaming and network audio (V10-04 boundary)
- [x] `P2` Platform-specific audio diagnostics

### 🧪 Diagnostics, Tooling, Packaging, and Performance

- [x] Stable IR/compiler/CLI/native diagnostic shapes
- [x] JSON severity, suggestions, paths, and metadata preservation
- [x] Conformance reports for web and Bevy observations
- [x] Release verification gates and artifact presence checks
- [x] Desktop package manifest and runtime args for V7 packaging
- [x] Fixed metric reports for frame/load/draw/entity/package-size budgets
- [x] `P2` Live profiler captures and native platform profiler evidence
- [x] `P2` GPU profiling and render-pass timing breakdowns
- [x] `P1` In-app FPS overlay and custom diagnostics
- [x] `P3` Signed installers and app-store/mobile packaging preflight (V10-04)
- [x] `P1` Broader platform target profiles and repair hints
- [x] `P1` Large-scene stress-test fixtures for UI, text, lights, cubes, and animated models
- [x] `P1` Stable unsupported-feature diagnostics for advanced renderer, material, and runtime declarations
- [x] `P1` Stable unsupported-networking diagnostics for multiplayer/websocket/replication declarations
- [x] `P1` Better domain-specific asset/runtime failure codes and repair hints
- [x] `P2` Live engine-integrated debug rendering beyond current overlay/report helpers

### 🛠️ Editor, Debugging, and Developer Tools

- [x] Local editor project snapshot validation
- [x] Editor document classification for source, generated, runtime, and derived snapshots
- [x] Structured editor source patch validation over durable source documents
- [x] Shared authoring operation registry for CLI/MCP/editor mutation adapters
- [x] Editor workbench source inventory and structured operation dispatch
- [x] Live preview edit classification with provenance-backed source mapping
- [x] Deterministic structured bundle-relative JSON diffs
- [x] CLI entry points for `tn editor snapshot`, `tn editor apply`, and `tn editor diff`
- [x] `P1` Visual editor UI and inspector panels
- [x] Source-schema-backed inspector field mapping and Add Component compatibility/default metadata
- [x] Add Object source-backed Primitive/Empty/Camera/Light modal operations
- [x] Environment source document classification and Camera inspector skybox rows
- [x] Save/load round trips through structured SDK/ECS/IR data
- [x] `P1` Scene hierarchy inspector and property editing
- [x] `P2` Gizmo overlays for transforms, lights, bounds, cameras, and UI nodes
- [x] `P1` Gamepad, scene viewer, and asset preview tools
- [x] `P2` Hot reload with state policy
- [x] `P1` Debug draw APIs for gameplay systems
- [x] `P1` Live runtime scene mutation
- [ ] `P2` Full native desktop visual editor shell
- [ ] `P2` Connected-device gamepad inspection

### 🚧 Intentionally Deferred or Non-Portable

- [ ] `D` Direct Bevy authoring from user TypeScript (V10-01 boundary)
- [ ] `D` Raw Three.js authoring as the source of truth (V10-01 boundary)
- [x] `D` Public plugin escape hatches into renderer/runtime internals (runtime gameplay host boundary)
- [ ] `D` Online services, networking, replication, and collaboration (V10-01 boundary)
- [ ] `D` 2D sprite, tilemap, LDtk/Tiled, and 2D-specific collision workflows while ThreeNative is scoped as 3D-only (V10-01 boundary)
- [x] `D` Arbitrary npm, filesystem, worker, timer, or platform APIs in portable scripts (runtime gameplay host and persistence boundary)
- [ ] `D` Backend-only features that cannot be represented in portable IR (V10-01 boundary)

## Sources

| Source                       | Link                                     |
| ---------------------------- | ---------------------------------------- |
| Bevy feature overview        | https://bevy.org/                        |
| Bevy examples catalog        | https://bevy.org/examples/               |
| Bevy 0.14 release notes      | https://bevy.org/news/bevy-0-14/         |
| Bevy crate documentation     | https://docs.rs/bevy                     |
| Open Bevy game: Jumpy        | https://github.com/fishfolk/jumpy        |
| Open Bevy game: Ethertum     | https://github.com/Dreamtowards/Ethertum |
| Open Bevy game: Lost In Time | https://github.com/RaminKav/LostInTime   |
| Open Bevy game: gdclone      | https://github.com/opstic/gdclone        |
| Open Bevy game: sokoban-rs   | https://github.com/ShenMian/sokoban-rs   |
| Open Bevy game: Golab        | https://github.com/NiiightmareXD/golab   |
| Open Bevy game: Tsumi        | https://github.com/PraxTube/tsumi        |
| Open Bevy game: Flyconomy    | https://github.com/chriamue/flyconomy    |
