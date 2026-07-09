# Three.js Game Engine x Bevy Parity

| Scope | Value |
| ----- | ----- |
| Contract | Three.js-style TypeScript game engine -> validated IR bundle -> web Three.js + native Bevy |
| Native baseline | Bevy and `bevy_ecs` pinned to `=0.14.2` |
| Evidence | Parity claims must point to focused gates, conformance reports, or artifact paths in the rows below. |

## Status

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| ✅     | Works across the Three.js-style API, IR, web runtime, and Bevy where claimed. |
| ⚠️     | Partly works, but web and Bevy are not fully aligned yet.                     |
| ❌     | Not implemented in this repo.                                                 |
| ⏭️     | Intentionally deferred or never portable.                                     |

## Promotion Rules

New Bevy/native promotions stay frozen unless a shipped-game need requires the
work and the PRD includes web evidence, native proof evidence, and a focused
gate. Prefer the desktop-web package path for demos when exact current Three.js
behavior matters more than native renderer promotion.

Use these anchors instead of duplicating long evidence prose here:

| Evidence area | Anchor |
| ------------- | ------ |
| Native path decision | [runtime/native-path.md](runtime/native-path.md) |
| Release and conformance gates | `pnpm verify:release`, `pnpm verify:conformance` |
| Native proof artifacts | `runtime-bevy/artifacts/` |
| Aggregate verification artifacts | `tools/verify/artifacts/` |
| Conformance artifacts | `packages/ir/artifacts/conformance/` |
| Finished PRDs | [PRDs/done](PRDs/done/) |

## Feature Area Parity Table

`Gap side` names where remaining work lives: web/Three.js, Bevy/native, both
adapters, shared SDK/IR/compiler contract, or an intentional product boundary.

| Status | Area | Gap side | Current parity focus | Primary evidence |
| ------ | ---- | -------- | -------------------- | ---------------- |
| ✅ | ECS, app, and scheduling | No active web or Bevy gap for promoted ECS/scheduling; dynamic plugins, arbitrary async/deferred callbacks, callable handles, and raw backend type IDs are diagnostic/product boundaries. | Portable ECS declarations, schedules, lifecycle, systems, resources, events, tags, groups, and runtime host semantics. | `pnpm verify:runtime-gameplay-host`, `pnpm verify:conformance` |
| ⚠️ | Transforms, math, and geometry | Promoted geometry has shared contract plus web/Bevy coverage; advanced deformation, CSG/boolean meshes, and storage-buffer geometry need shared contract plus both adapters. | Stable transforms, primitives, procedural meshes, bounds, paths, terrain, and geometry diagnostics. | `pnpm verify:focused verify:rendering-residuals`, source/IR/compiler tests |
| ✅ | Cameras and views | No active adapter gap for promoted camera behavior; custom projections remain bounded diagnostics. | Perspective/orthographic cameras, active camera selection, split views, render targets, camera helpers, and screenshot/export workflows. | `tn scene proof-camera`, `tn playtest --follow`, conformance gates |
| ⚠️ | Lights and shadows | Both adapters for visual calibration; shared contract for probes/environment maps; spherical/area lights and baked/mixed lighting remain diagnostic boundaries. | Ambient/directional/point/spot lights, shadows, probes, environment maps, and bounded quality profiles. | `pnpm verify:render-look`, `pnpm verify:focused verify:v10:visual-calibration` |
| ⚠️ | Materials, textures, and shaders | Both adapters for promoted material parity; shared import policy for PBR/glTF fields; advanced PBR, custom shaders, bindless, storage buffers, and raw render phases are diagnostic boundaries. | PBR fields, texture slots, alpha/emissive/specular controls, portable shader material v1, and advanced shader diagnostics. | `pnpm verify:portable-shader-material`, material/runtime tests |
| ⚠️ | Rendering and post-processing | Both adapters for visual calibration; shared renderer semantics are the gap for atmosphere, volumetrics, SSR/GI, deferred rendering, decals, custom post, and GPU instance attributes. | Web/Bevy scene rendering, fog/sky/tone, bloom, anti-aliasing, LOD, instancing, render-look profiles, and advanced renderer boundaries. | `pnpm verify:render-look`, `pnpm verify:rendering-photoreal` |
| ✅ | Assets, glTF, and scenes | No active adapter gap for promoted asset loading; custom loaders, runtime saving/export, arbitrary file/network access, and shader use of custom glTF attributes are shared boundaries. | Bundle-local assets, glTF dependency handling, asset catalogs, inspection, hot reload, streaming policy, and custom-loader diagnostics. | `tn asset inspect`, `pnpm verify:gltf-fidelity` |
| ⚠️ | Animation and particles | Promoted playback, masks, morphs, and bounded particles have shared contract plus web/Bevy proof; raw backend graphs, IK/retargeting, and backend handles are product boundaries. | Clip metadata, playback, events, bounded graph data, masks, morph targets, and deterministic lightweight VFX. | `pnpm verify:focused verify:animation-physics-residuals`, conformance fixtures |
| ⚠️ | Physics and character movement | Promoted behavior uses shared solver semantics with web/native trace diffs; deeper contacts, mesh terrain, nav, constraints, vehicles, and ragdolls are mostly Bevy/native proof depth plus shared boundaries. | Fixed-tick physics, primitive bodies/colliders, contacts, queries, character movement, mesh collider policy, joints, and nav diagnostics. | `pnpm verify:physics-self-verification`, `pnpm verify:character-physics-contacts` |
| ✅ | Input, picking, and controls | No active web or Bevy gap for promoted input/picking; richer gestures, repair overlays, and navigation diagnostics are product-polish boundaries. | Keyboard, mouse, pointer lock, gamepad, touch, picking, UI action dispatch, rebinding, and device diagnostics. | `pnpm verify:focused verify:input-ui-polish`, conformance fixtures |
| ⚠️ | UI, text, and accessibility | Mixed: Bevy/native for native UI pixels, text editing/caret/IME, and accessibility proof; both adapters for world-attached UI, effects, spatial nav, and visual parity; virtual keyboard/3D UI/custom UI shaders are boundaries. | Retained UI, layout/style/text/buttons, focus, navigation, recipes, accessibility diagnostics, and unsupported native/widget boundaries. | `pnpm verify:focused verify:input-ui-polish`, `pnpm verify:conformance` |
| ⚠️ | Window and platform runtime | Shared platform policy plus both adapters for resize/scale observations; custom cursors, power/background policy, clear-color updates, and multi-window are intentional boundaries. | Window metadata, target profiles, resize observations, cursor/power diagnostics, and single-window policy. | Runtime config tests, target-profile fixtures |
| ✅ | Persistence and settings | No active adapter gap for declared save/settings behavior; shared persistence contract stays guarded, and cloud/account storage is deferred. | Save slots, local settings, migration metadata, checkpoint/autosave, durable Bevy backend, and cloud boundary diagnostics. | `pnpm verify:focused verify:persistence-reload` |
| ⚠️ | Audio | Both adapters for promoted playback, spatial/listener, mixer, and music transitions; device routing, platform handles, custom decoders, streaming, and network audio are boundaries. | Local audio assets, playback commands, spatial/listener metadata, mixer/effect reports, routing diagnostics, and decoder/streaming boundaries. | `pnpm verify:focused verify:production-hardening`, conformance fixtures |
| ✅ | Diagnostics, tooling, packaging, and performance | No active adapter gap for release-gated diagnostics/tooling/package/perf reports; adapter-specific metrics vary by target, and live engine-integrated debug rendering remains tooling work. | Stable diagnostics, release gates, reports, budgets, profiler/debug evidence, package preflight, and repair hints. | `pnpm verify:release`, `pnpm verify:focused verify:production-hardening` |
| ⚠️ | Editor and developer tools | Shared source-operation/CLI/browser editor contract is promoted; native desktop visual editor shell is a deferred product boundary, not a Bevy runtime gap. | Source-backed editor operations, inspector mappings, preview/build proof, gizmos/debug tools, hot reload, and native editor boundary. | `pnpm verify:focused verify:editor-package`, editor operation tests |
| ⏭️ | Deferred or non-portable | Product boundary only: raw backend authoring/handles, networking/collaboration, 2D workflows, arbitrary platform APIs, and non-IR backend features are outside the portable contract. | Raw Bevy/Three.js authoring, backend handles, networking, 2D workflows, arbitrary platform APIs, and non-IR backend features. | Stable unsupported diagnostics |

## Detailed Parity Rows

Priority labels: `P0` blocks a simple game, `P1` is high-value small-game
parity, `P2` is production workflow or polish, `P3` is advanced/long-tail,
and `D` is deferred or intentionally non-portable.

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
- [x] Structured source/CLI/editor mutation for scene lifecycle kind, activation, and initial-scene metadata
- [x] Scene-local input, system, and UI scope references with web/Bevy active-scope snapshots
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
- [x] `P2` ECS callback components and callable system handles as a diagnostic-only boundary until named, permissioned declarations are promoted
- [x] `P2` Delayed command scheduling bounded to timer/channel-backed fixed-trace services; arbitrary deferred closures remain diagnostic-only
- [x] `P2` Query combination helpers and pairwise iteration semantics with deterministic ordering
- [x] `P2` Entity disabling/suspended ECS participation separate from renderer visibility with raw Bevy `Disabled` rejected
- [x] `D` Raw Bevy/renderer type IDs in portable gameplay APIs

### 📐 Transforms, Math, and Geometry

- [x] Translation, rotation, scale, and nested transforms
- [x] Basic 3D mesh primitives: box, sphere, plane, capsule, cylinder
  (renderable mesh primitive only; portable physics collider helpers remain
  box, sphere, capsule, and mesh, and raw cylinder colliders are rejected)
- [x] Source/editor primitive mesh declaration edits
- [x] Structured source and CLI torus primitive declarations for mesh rows and scene prefabs
- [x] Bounding/raycast-style queries for promoted physics traces
- [x] Full Bevy primitive catalog and extrusions
- [x] Custom mesh generation and custom vertex attributes
- [x] Structured source/CLI custom mesh declarations with binary bundle payloads
- [x] `P1` Portable procedural mesh authoring
  - [x] MeshBuilder API for generated static meshes
  - [x] Primitive composition helpers for organic props
  - [x] Compiler-only Three.js BufferGeometry import/snapshot
- [x] Mesh bounds, AABB/sphere intersection utilities, and sampling
- [x] Curves, splines, easing functions, and path sampling
- [x] `P1` Transform interpolation/smoothing helpers and fixed-tick visual transform interpolation in web/Bevy runtime loops
- [x] `P2` Gizmo geometry as debug/editor-only output
- [x] `P2` Runtime mesh deformation diagnostic boundary
- [x] `P2` Chunked/streamed mesh terrain and world geometry policy
  - [x] PRD-006 closed with structured heightmap assets, terrain heightmap
        references, splat-layer validation, target cell-budget diagnostics,
        compiler terrain chunk mesh emission, heightfield collider descriptors,
        web/Bevy generated terrain chunk rendering, Bevy heightfield collision,
        deterministic terrain-aware scatter expansion, and seeded
        `tn world generate`/`tn world proof` biome terrain/scatter source,
        flat-heightmap rejection, and preview proof artifacts.
- [x] `P3` CSG and boolean mesh operations diagnostic boundary
- [x] `P3` Storage-buffer/shader-driven procedural geometry diagnostic boundary

### 🎥 Cameras and Views

- [x] Perspective camera and active camera selection
- [x] Orthographic projection metadata and conformance observation
- [x] Source-authored camera projection/frustum fields lower into promoted IR camera components
- [x] First-person camera/controller metadata
- [x] `P1` Multiple active cameras, camera ordering, and split-screen
- [x] `P1` Viewports, sub-views, and render layers
- [x] `P2` Render-to-texture and depth-only camera targets
- [x] Web/Bevy runtime allocation for declared color and write-only depth render targets
- [x] Source/CLI/editor render-target declarations lower into the asset manifest
- [x] `P3` Custom projections
- [x] `P1` Camera effects: screen shake, orbit, pan, zoom, and view models
- [x] `P1` Follow/orbit camera helpers converge on both runtimes: the web
  adapter now runs camera helpers on the post-processing composer path and
  persists helper poses into the world IR transform (matching Bevy's persistent
  transform semantics), proven by `tn playtest --follow` assertions in
  `examples/humanoid-physics-course`
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
- [x] `P3` Spherical/area-light behavior as a diagnostic-only boundary until
      web/Bevy light-shape semantics, fallbacks, and screenshot proof exist
      (V10-02)
- [x] `P3` Lightmaps and mixed baked/dynamic lighting as a diagnostic-only
      boundary until authoring, bake provenance, asset packaging, and runtime
      fallback semantics exist (V10-02)
- [x] `P2` Light probes and environment maps
  - [x] V9-04 SDK/IR/compiler/runtime conformance contract and evidence for
        bundle-local skybox, environment-map, and bounded light-probe declarations
- [x] `P2` Light/probe gizmo debug observations
- [x] `P2` Shadow quality profile backlog for small-game polish: map bounded
      low/medium/high profile rows to point-light PCF, directional cascade
      distance/count, map size, bias defaults, light budgets, and screenshot
      evidence before treating the profile as a visual parity claim

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
- [x] `P1` Structured source/CLI/editor mutation for promoted material PBR fields and texture slots
- [x] `P3` Parallax mapping and depth maps as a diagnostic-only boundary (V10-02)
- [x] `P3` Anisotropy, specular tint, and advanced PBR fields as a
      diagnostic-only boundary until scalar/texture/tangent requirements,
      glTF extension import policy, web mapping, Bevy feature flags, and
      visual proof are defined (V10-02)
- [x] `P1` Authored texture repeat/wrap/filter/UV transform controls in IR, web runtime mapping, native sampler/UV application, and conformance observations
- [x] `P1` WebP texture asset format support across SDK/IR validation, compiler emission, web runtime loading, and Bevy asset loading
- [x] `P2` Multiple generated-mesh UV channels
- [x] `P2` Generated-mesh vertex colors
- [x] `P2` Constrained extended material presets (`unlitMasked`, `foliage`)
- [x] `P2` Explicit portable shader promotion criteria and unsupported-feature diagnostics
- [x] `P2` Bounded portable shader material v1 runtime parity for color,
      texture, alpha, time/emissive, and vertex-displacement fixture samples,
      proved by `pnpm verify:portable-shader-material` web/Bevy screenshots,
      diff, contact sheet, and region metrics under
      `tools/verify/artifacts/portable-shader-material/`
- [x] `P2` Advanced blend parity diagnostics on Bevy beyond normal alpha/mask/blend policy
- [x] `P2` Native specular texture rendering proof
- [x] `P2` Broader extended-material catalog policy beyond current constrained presets
- [x] `P2` glTF advanced material extension policy backlog: preserve/report Bevy
      0.14-supported texture transform, clearcoat, transmission, emissive
      strength, extras, and anisotropy metadata, but promote only fields with
      web/Bevy report or screenshot parity and stable unsupported-extension
      diagnostics
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
- [x] `P3` Atmospheric scattering and atmospheric fog through bounded atmosphere/fog profiles (V10-02, V10-03 calibration)
- [x] `P3` Volumetric fog and volumetric lighting diagnostic boundary until
      density/scattering profiles, participating light limits, shadow-map
      dependency, web fallback, and performance budgets are proven (V10-02,
      V10-03 calibration)
- [x] `P1` Skyboxes and cubemap/equirect texture handling
  - [x] V9-04 validates bundle-local cubemap/equirect texture refs, emits
        rendering capabilities, reports web/native skybox observations, and writes
        screenshot-level web/native/diff/contact-sheet evidence under
        `tools/verify/artifacts/rendering-lights/skybox-environment/`; compressed texture
        formats remain deferred
- [x] `P1` Bloom through runtime config in web and native camera runtime
- [x] `P1` MSAA anti-aliasing modes through runtime config in web and native
- [x] `P2` Render look profiles for `parity` and `balanced` source/runtime
      semantics with captured web screenshot metrics; release-profile
      promotion remains pending CI capture promotion
- [x] `P2` FXAA, TAA, and SMAA anti-aliasing modes
- [x] `P2` Color grading and filmic metadata observations
- [x] `P3` Auto exposure diagnostic boundary until deterministic histogram,
      adaptation-speed, EV-range, capture, and web fallback behavior exist
      (V10-02, V10-03 calibration)
- [x] `P2` Depth of field runtime-config/report boundary; visual blur
      calibration, camera ownership rules, mobile fallback, and performance
      budgets remain deferred
- [x] `P3` Motion blur and motion vectors diagnostic boundary until shutter,
      sample count, prepass, animated-mesh motion vectors, web fallback, and
      video/screenshot proof exist (V10-02, V10-03 calibration)
- [x] `P3` Screen-space reflections and mirrors diagnostic boundary; Bevy 0.14
      SSR is deferred-path and platform constrained, so portable promotion must
      define material/reflection intent and forward/web fallback first (V10-02,
      V10-03 calibration)
- [x] `P2` Decals diagnostic boundary; surface-aligned decal quads are the first
      portable candidate, while projected/deferred decals remain unsupported
      until shared renderer semantics exist (V10-02, V10-03 calibration)
- [x] `P3` Deferred rendering diagnostic boundary; portable source should express
      visual intent rather than selecting a Bevy render path directly (V10-02)
- [x] `P2` Visibility ranges/HLOD fade observations
- [x] `P1` Renderer-level native instancing and batching parity
- [x] `P1` Visual runtime LOD mesh swapping
- [x] `P2` Arbitrary user-authored instancing APIs as bounded report policy
- [x] `P2` Custom GPU instance attributes diagnostic boundary
- [x] `P2` Compressed skybox/environment texture format diagnostics
- [x] `P2` Billboard/impostor LOD metadata for camera-facing quad impostors with
      ordered distance/fade validation plus web/Bevy report evidence; visual
      screenshot calibration remains a later dense-scene polish gate
- [x] `P2` Texture delivery target-profile metadata for WebP/JPEG/PNG baseline
      fallback and optional KTX2/DDS/Basis/BC/ETC2/ASTC variants, with
      deterministic selected-path reports and unsupported-target diagnostics
- [x] `P3` Virtual geometry/meshlet rendering diagnostic boundary (V10-02, V10-03 calibration)
- [x] `P3` Custom post-processing passes diagnostic boundary (V10-02, V10-03 calibration)

V8-13 keeps volumetrics, atmospheric scattering/fog, deferred rendering,
SSR/GI/lightmaps, and custom post-processing behind stable advanced renderer
diagnostics until portable promotion criteria and web/Bevy evidence exist.

### 📦 Assets, glTF, and Scenes

- [x] Bundle-local glTF/GLB assets
- [x] glTF `.bin` and texture dependency bundling
- [x] Model scene instances in web and Bevy
- [x] Material/texture/mesh asset diagnostics and conformance observations
- [x] Source-authored stylized nature, ripple water, and sparkle component slice with SDK helpers, shared registry operations, web/Bevy runtime mapping, recursive glTF dependency waits for native proof capture, and aligned source-GLB grass placement/material policy
- [x] Typed animation clip metadata from model assets
- [x] `P1` Declared embedded asset manifest entries with bounded payload validation
- [x] `P1` Declared HTTPS network asset manifest entries with target-profile validation
- [x] `P3` Custom asset loaders and custom asset types diagnostic boundary (V10-04)
- [x] `P1` Deterministic multi-asset load synchronization trace
- [x] `P1` Declared asset groups and default `bundle.requiredAssets` manifest group
- [x] `P2` glTF extras and custom glTF vertex attributes
- [x] `P1` Query/update spawned glTF scene entities
- [x] `P2` glTF extension processing policy with promoted AnimationGraph metadata import and stable diagnostics for executable/custom transforms
- [x] `P2` Imported glTF visual-fidelity backlog: compiler/inspection metadata
      now preserves material extensions, texture transforms, material/node
      extras, and morph target names; `tn asset inspect` reports unsupported
      extension processors with stable diagnostics; web and Bevy conformance
      expose matching `gltfFidelity` report rows guarded by
      `pnpm verify:gltf-fidelity`.
- [x] `P1` Scene viewer/editor inspection workflow
- [x] `P1` CLI glTF/GLB asset inspection for bounds, dependency checks, and scale calibration (`tn asset inspect`)
- [x] `P1` Modular track proof reports connector continuity, actor-on-road placement, and actor footprint versus material-derived lane width (`tn scene proof-modular-track`)
- [x] `P1` Packaged CLI asset source catalog for reviewed direct GLB records and typed pack/material/texture/HDRI fallback records (`tn asset source search/get/suggest/export`)
- [x] `P1` CLI one-model proof reports with scale presets, screen occupancy verdicts, isolated-proof caveats, and screenshot captured/unavailable states (`tn model-test`)
- [x] `P1` Dev-time asset file watching and explicit reload diagnostics
- [x] `P2` Asset hot reload and state-preserving reload behavior
- [x] `P1` Broader live asset streaming through manifest asset-group policy
- [x] `P2` Runtime asset saving/export with subasset manifest policy as an artifact-root diagnostic boundary
- [x] `P2` Generated runtime assets that can be persisted or reloaded as schema-backed bundle artifacts
- [x] `P2` Arbitrary runtime file/network asset access from portable scripts diagnostic boundary
- [x] `P2` Custom shader consumption of glTF custom attributes diagnostic boundary

### 🎞️ Animation and Particles

- [x] Animation clip metadata and validated clip refs
- [x] `animation.play` service-call trace
- [x] Constrained animation graph metadata
- [x] Animation event-marker metadata and fixed event traces
- [x] Bounded particle-emitter metadata and deterministic spawn traces
- [x] Runtime animation playback binding, scripted `animation.play` service consumption, and time advancement for model renderers in web and Bevy
- [x] `P0` Visual skeletal animation deformation from loaded glTF clips
- [x] `P1` Transform animation authored in code/IR
- [x] `P1` `animation.query` / `animation.stop` declared command-shape/service-payload parity
- [x] `P1` Animation blending beyond fixed graph traces
- [x] `P2` Animation masks: portable skeleton target addressing, per-joint mask
      validation against loaded glTF nodes, web/Bevy blend behavior, and
      residual visual evidence are promoted for the bounded subset.
- [x] `P1` Stateful animation stop/state query runtime semantics
- [x] `P2` Morph-target animation: extracted glTF morph names, authored weight
      target validation, deterministic weight tracks, web/Bevy mapping, and
      visible residual evidence are promoted for the bounded subset.
- [x] `P3` Retargeting and inverse kinematics diagnostic boundary (V10-02)
- [x] `P2` UI/property animation
- [x] `P2` Arbitrary blend trees beyond bounded crossfade/graph traces as a
      diagnostic boundary; raw Bevy `AnimationGraph` assets, arbitrary graph
      topology, IK, retargeting, and backend animation handles remain outside
      the portable source contract
- [x] `P1` Script-triggered lightweight VFX through a ThreeNative-owned bounded
      command contract: `particles.play`, `particles.emit`, `particles.clear`,
      and `particles.stop` run only over declared emitters with deterministic
      seed/count/status observations, max count/rate/lifetime caps, simple mesh
      or billboard representation, alpha material constraints, and web/Bevy
      visible-region proof. `particles.start`, `particles.burst`, and
      `particles.reset` remain compatibility aliases. This is not Bevy-native
      particle-system parity and does not expose backend particle handles.

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
  - [x] Portable rigid-body translation and rotation axis locks
  - [x] Portable hinge, slider, and suspension joint metadata observations
- [x] `P1` Broad sensors beyond current trigger/overlap scope
- [x] Step offsets, ledge ungrounding, moving-platform carry, and richer ground contact trace
- [x] Native character move observations include stable slope, contact, and
      push payloads matching the web trace shape for portable collider
      layer/mask/material/contact phase metadata
- [x] Focused `verify:character-physics-contacts` gate compares web/native
      character contact traces for slopes, pushed primitives, and filtered
      contact payload ordering
- [x] `P0` Slope limits and sloped-surface walkability for promoted ramp colliders
- [x] `P1` Character interaction volumes and object pushing
- [x] Fixture-backed physics self-verification gate for gravity/collision,
      material response, mass/stacking, character obstacles, query services,
      bounded mesh CCD, joint metadata, and unsupported-boundary diagnostics;
      current aggregate conclusion is `PASS` with real Bevy traces, web/native
      trace diffs, selected P1 trace-diagram contact sheets, promoted physics
      gates, and conformance covered by `pnpm verify:physics-self-verification`;
      runtime camera screenshots and videos are not emitted by this gate
- [x] Portable collider local centers for aligning physics shapes to imported
      model origins across web and Bevy Rapier paths
- [x] `P1` Navmesh/pathfinding behavior
- [x] `P1` External physics backend integration strategy
- [x] `P1` Arbitrary sloped mesh terrain for character grounding
- [x] `P1` Full constraint solving beyond hinge/slider/suspension metadata as a deferred diagnostic boundary
- [x] `P2` Arbitrary triangle narrow phase for mesh colliders as a bounded-mesh-collider diagnostic boundary
- [x] `P2` Dynamic navmesh rebakes
- [x] `P2` Crowd steering and off-mesh links
- [x] `P2` Vehicle drivetrain and tire/friction models as deferred residuals
- [x] `P3` Soft bodies and ragdolls as deferred residuals
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
- [x] `P1` Structured source/CLI/editor mutation for input actions and keyboard axes
- [x] `P2` Drag-and-drop picking events
- [x] `P2` Picking debug overlay
- [x] `P1` Basic input rebinding helpers and device capability diagnostics
- [x] `P1` Controls settings rebind metadata and local input override persistence
- [x] `P1` Platform touch event stream wiring beyond deterministic hooks
- [x] `P1` Full visual settings-screen UX polish
- [x] `P2` Richer touch/gamepad gestures beyond tap, swipe, and pinch as a diagnostic-only boundary
- [x] `P2` Richer device diagnostics overlays and repair hints (V10-04)
- [x] `P2` Richer navigation diagnostics for input/UI flows

### 🧭 UI, Text, and Accessibility

Current UI rows use these labels:

- `Promoted`: behavior has a named web/native proof gate or artifact.
- `Partial/diagnostic`: structure, metadata, traces, or diagnostics exist, but
  runtime behavior is not fully implemented or not behaviorally proved.
- `Unsupported boundary`: the portable contract rejects or defers the feature
  with stable diagnostics.

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
- [x] `P1` Partial/diagnostic: native UI shadows and gradients are preserved as
      metadata/components and trace observations; they are not currently claimed
      as native-rendered pixels.
- [x] `P1` Build-time UI theme tokens and token refs lower to concrete retained layout/style/image fields before web or Bevy runtime mapping
- [x] `P1` Source-level reusable UI component instances expand to ordinary retained UI nodes with deterministic IDs and generated-node provenance before runtime mapping
- [x] `P1` UI screen stack, modal/dialog roles, focus scopes, restore policy, and input-capture metadata validate in IR with deterministic web focus-restoration and Bevy modal input-capture dispatch trace proof
- [x] `P1` Bounded game UI recipes generate ordinary editable source nodes, bindings, screens, focus order, and provenance with required screenshot/accessibility proof artifacts
- [x] `P1` Responsive target-class UI recipe metadata, bounded virtual range metadata for large retained lists, deterministic web/Bevy visible-range traces, and desktop/mobile UI-fit artifact checks
- [x] `P1` Common UI affordance metadata for input glyph prompts, tooltips, localization fallback/cases, progress/cooldown presentation, toast queues, and logical feedback hooks with web/native observation traces
- [x] `P1` Partial/diagnostic: bounded retained UI effect presets for glow,
      outline, pulse, tint, and focus rings have renderer escape-hatch
      diagnostics plus web/native strategy traces; they are not claimed as
      full rendered effect parity.
- [x] `P1` Partial/diagnostic: world-attached retained UI for nameplates,
      health bars, interact prompts, pickup labels, quest markers, and
      off-screen indicators has web/Bevy projection traces; screenshot-level
      visual parity remains required before promotion.
- [x] `P1` Basic UI text size, alignment, and wrapping
- [x] `P1` Portable UI text weight/decoration metadata and web DOM rendering
- [x] `P1` Rich text styling: font assets, inline spans, and native-rendered weight/decoration
- [x] `P1` Basic UI image nodes
- [x] `P1` Partial/diagnostic: UI image atlas/nine-slice metadata is preserved
      for web overlay/debug metadata and native traces; native atlas/nine-slice
      pixel rendering is not promoted.
- [x] `P2` Standard widgets: sliders, scrollbars, and web context menus with
      viewport clamping. Native context-menu behavior remains metadata/trace
      only.
- [x] Structured source/CLI/editor mutation for retained UI node type, label, and promoted style fields
- [x] `P1` Partial/diagnostic: editable text input widgets preserve metadata
      and deterministic value/action event observations, but native editing,
      caret, and IME behavior are not promoted.
- [x] `P1` Unsupported boundary: IME composition diagnostics reject unsupported
      text input targets.
- [x] `P1` Unsupported boundary: platform virtual keyboard behavior remains a
      diagnostic boundary.
- [x] `P1` Promoted: basic automatic tab/sequential focus navigation and
      explicit directional navigation links are covered by the
      `rich-ui-navigation` web/native trace diff in `pnpm verify:conformance`;
      disabled nodes are skipped for sequential and explicit navigation;
      geometric spatial-navigation fallback remains partial.
- [x] `P2` Unsupported boundary: UI transforms, render-to-texture, and
      3D-world UI are diagnostic boundaries.
- [x] `P2` UI viewport nodes with picking/input routing as a diagnostic-only boundary
- [x] `P1` Basic UI accessibility roles, labels, and missing-label diagnostics
- [x] `P1` Partial/diagnostic: broader screen-reader diagnostics cover
      focusable names, progressbar names, and list/listitem structure; focus
      narration is not verified against a platform screen reader.
- [x] `P1` Static disabled UI metadata for focus/action suppression and ARIA/AccessKit state
- [x] `P2` UI debug overlay/gizmos
- [x] `P1` Partial/diagnostic: runtime disabled-to-enabled UI updates have
      script facade and trace coverage, but native behavior is not yet promoted
      by a deterministic conformance proof.
- [x] `P1` Partial/diagnostic: nested and axis-specific scroll behavior has
      vertical-scroll support and metadata/traces; nested and horizontal-axis
      behavior remain unpromoted.
- [x] `P1` Partial/diagnostic: spatial navigation heuristics are implemented
      for web geometric lookup and explicit native links; cross-runtime
      heuristic fallback parity is not promoted.
- [x] `P1` Partial/diagnostic: focus narration is trace/accessibility metadata,
      not a screen-reader-verified runtime claim.
- [x] `P2` Native-rendered italic rich text as a diagnostic-only boundary until native font-style rendering is promoted
- [x] `P2` Letter spacing, generic/system font families, and OpenType font variation policy as a diagnostic-only boundary
- [x] `P2` Unsupported boundary: arbitrary grid placement, named areas, and
      dense packing remain diagnostic-only.
- [x] `P2` UI drag-and-drop node interactions distinct from world picking drag events as a diagnostic-only boundary
- [x] `P2` Custom UI material/shader declarations as diagnostic-only until bounded presets exist
- [x] `P2` Broad gamepad/touch UI coverage through focused interaction fixture evidence
- [x] `P2` Promoted packaging fallback: desktop-web packaging artifacts are
      measured by `pnpm verify:webview-package`; this does not claim native
      Bevy-rendered overlay parity.

### 🪟 Window and Platform Runtime

- [x] Source-backed window title, resolution, and runtime configuration metadata
- [x] Source-backed target profile documents for targets, budgets, and performance JSON
- [x] Target-profile diagnostics for web, offline/native, and package outputs
- [x] `P1` Window resize and scale-factor change observations in web and native runtimes
- [x] `P2` Custom cursor image and cursor animation policy as a diagnostic-only boundary
- [x] `P2` Low-power/present-mode and background throttling runtime policy as a diagnostic-only boundary
- [x] `P2` Clear-color/window background updates as a diagnostic-only boundary
- [x] `P2` Multi-window and per-window target diagnostics while portable runtime remains single-window

### 💾 Persistence, Settings, and Local Data

- [x] `P1` Portable save slots for declared resources/components
- [x] `P1` Local settings/key-value persistence for controls, audio, video, and accessibility options
- [x] `P2` Save migration/version metadata and diagnostics
- [x] `P2` Checkpoint/autosave lifecycle hooks
- [x] `P0` Durable Bevy save/settings backend for declared resources/components
- [x] `P1` Runtime autosave/checkpoint execution and restore flow
- [x] `P3` Cloud save and account-bound storage integration as a deferred boundary (V10-04)

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
- [x] `P3` Custom audio source/decoder support as a diagnostic boundary (V10-04)
- [x] `P3` Streaming and network audio as a diagnostic boundary (V10-04)
- [x] `P2` Platform-specific audio diagnostics

### 🧪 Diagnostics, Tooling, Packaging, and Performance

- [x] Stable IR/compiler/CLI/native diagnostic shapes
- [x] JSON severity, suggestions, paths, and metadata preservation
- [x] Web runtime advisory diagnostics for partial `Transform` patches that merge omitted rotation/scale fields
- [x] IR distribution capability manifest and diagnostics catalog metadata
- [x] AI-consumable packed artifacts and clean-consumer metadata access are release-gated
- [x] Agent game planning worksheet scaffold and catalog-first starter instructions are release-gated through template-production and distribution proof
- [x] Conformance reports for web and Bevy observations
- [x] Release verification gates and artifact presence checks
- [x] Desktop package manifest and runtime args for V7 packaging
- [x] Fixed metric reports for frame/load/draw/entity/package-size budgets
- [x] Target-profile schema, version, fixture, and native-loader drift gates
- [x] `P2` Live profiler captures and native platform profiler evidence
- [x] `P2` GPU profiling and render-pass timing breakdowns
- [x] `P1` In-app FPS overlay and custom diagnostics
- [x] `P3` Signed installers and app-store/mobile packaging preflight (V10-04)
- [x] `P1` Broader platform target profiles and repair hints
- [x] `P1` Large-scene stress-test fixtures for UI, text, lights, cubes, and animated models
- [x] `P1` Stable unsupported-feature diagnostics for advanced renderer, material, and runtime declarations
- [x] `P1` Stable unsupported-networking diagnostics for multiplayer/websocket/replication declarations
- [x] `P1` Better domain-specific asset/runtime failure codes and repair hints
- [x] `P1` `tn doctor --url` preview-readiness diagnostics for canvas, runtime errors, resource failures, visible meshes, page errors, and failed requests
- [x] `P1` Web preview runtime diagnostics for scene visibility, rendered-entity bounds, clipping state, material/texture state, and optional human debug overlay
- [x] `P2` Live engine-integrated debug rendering beyond current overlay/report helpers

### 🛠️ Editor, Debugging, and Developer Tools

- [x] Local editor project snapshot validation
- [x] Editor document classification for source, generated, runtime, and derived snapshots
- [x] Structured editor source patch validation over durable source documents
- [x] Shared authoring operation registry for CLI/MCP/editor mutation adapters
- [x] TypeScript authoring-client transaction and fluent scene facade over the shared operation registry, preserving structured source as the editable truth
- [x] Project-local TypeScript generator runner with authoring-client facade execution, last-run provenance, input/output hashes, and manual-output conflict diagnostics
- [x] Registry-backed authoring recipes and `tn recipe` command for common source-persistable game-object plans
- [x] Registry-backed CLI source mutation for asset catalogs and audio sound documents
- [x] Registry-backed CLI/editor source mutation for project metadata documents
- [x] Registry-backed CLI/editor source mutation for reusable resources documents
- [x] Registry-backed CLI/editor source mutation for system schedules after creation
- [x] Registry-backed CLI/source mutation and compiler lowering for reusable component/resource schema documents
- [x] Registry-backed CLI/source mutation and compiler lowering for input controls-settings and persisted binding override metadata
- [x] Typed CLI/source operations for common ECS components (`camera`, `light`, `mesh-renderer`, `render-layers`, `visibility`, `rigid-body`, `collider`, `character-controller`), including camera projection/frustum fields
- [x] Source-level camera framing proof with `tn scene set-camera-look-at` and `tn scene proof-camera`, reporting target visibility, projected occupancy, roll, clipping range, and world bounds before web/Bevy screenshot proof
- [x] Discoverable `tn physics add-rigid-body`, `tn physics add-collider`, and `tn nav add-agent` CLI aliases over promoted source components
- [x] CLI/source operations for promoted model animation clips, graph states, and bounded particle emitters
- [x] One-way generator provenance source documents plus `generator.record` / `tn generator record`
- [x] Editor workbench source inventory and structured operation dispatch
- [x] Live preview edit classification with provenance-backed source mapping
- [x] Deterministic structured bundle-relative JSON diffs
- [x] CLI entry points for `tn editor snapshot`, `tn editor apply`, and `tn editor diff`
- [x] `P1` Visual editor UI and inspector panels
- [x] Source-schema-backed inspector field mapping and Add Component compatibility/default metadata
- [x] Explicit `featureStatus` metadata for visible modal/Add Component actions, with tests that enabled actions have handlers/operations and unavailable actions have reasons
- [x] Add Component MeshRenderer, RenderLayers, Visibility, RigidBody, Collider, and CharacterController source-operation mappings with typed inspector rows
- [x] Add Object source-backed Primitive/Empty/Camera/Light modal operations
- [x] Add Object Terrain source operations update flat environment terrain/walkability and create a visible scene terrain entity
- [x] Focused editor required-operations smoke that creates a scene, adds a primitive/entity, moves it, attaches a component and script reference, rebuilds, and checks emitted `world.ir.json`
- [x] Focused editor required-operations smoke covers editor-authored RigidBody and Collider source plus emitted `world.ir.json` proof
- [x] Focused animation/physics residual gate emits web/native runtime evidence for promoted physics residual behavior
- [x] Script references remain module/export inspector fields backed by `system.attach_script`; inline script body editing stays in the separate code-mode workflow
- [x] Delete, Settings, hierarchy nesting, and playback controls are source-backed or explicitly disabled/view-only with stable user-visible reasons
- [x] Editor/CLI Light kind, intensity, color, range, angle, shadow bias, and shadow normal bias rows persist through `scene.set_light`
- [x] Editor custom component JSON payload rows persist through `scene.set_component`
- [x] Environment source document classification plus CLI/editor skybox, environment-map, terrain, path, walkability, light-probe, and source-asset LOD mutation rows
- [x] Editor prefab primitive/color/asset, asset catalog type/path, scene resource path/value, and environment path/walkability/light-probe/source-asset LOD rows persist through registry-backed source operations
- [x] Editor build-preview evidence for source scene, GLB assets, environment terrain/path/walkability, and asset manifest artifacts
- [x] Save/load round trips through structured SDK/ECS/IR data
- [x] `P1` Scene hierarchy inspector and property editing
- [x] `P2` Gizmo overlays for transforms, lights, bounds, cameras, and UI nodes
- [x] `P1` Gamepad, scene viewer, and asset preview tools
- [x] `P2` Connected-device gamepad inspection
- [x] `P2` Hot reload with state policy
- [x] Dev preview freshness metadata and stale-watch diagnostics for the CLI web preview loop (`tn dev --target web`)
- [x] `P1` Debug draw APIs for gameplay systems
- [x] `P1` Live runtime scene mutation
- [x] `P2` Full native desktop visual editor shell as an explicit deferred boundary; current editor support is browser/CLI plus package inspection

### 🚧 Intentionally Deferred or Non-Portable

- [x] `D` Direct Bevy authoring from user TypeScript (V10-01 boundary)
- [x] `D` Raw Three.js authoring as the source of truth (V10-01 boundary)
- [x] `D` Public plugin escape hatches into renderer/runtime internals (runtime gameplay host boundary)
- [x] `D` Online services, networking, replication, and collaboration (V10-01 boundary)
- [x] `D` 2D sprite, tilemap, LDtk/Tiled, and 2D-specific collision workflows while ThreeNative is scoped as 3D-only (V10-01 boundary)
- [x] `D` Arbitrary npm, filesystem, worker, timer, or platform APIs in portable scripts (runtime gameplay host and persistence boundary)
- [x] `D` Backend-only features that cannot be represented in portable IR (V10-01 boundary)

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
