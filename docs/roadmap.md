# Roadmap

This roadmap turns the concept into an implementation sequence. It favors a small end-to-end product loop over broad compatibility, custom rendering, or editor tooling.

## Strategy

Build an AI-first TypeScript game SDK that feels familiar to Three.js developers, compiles to a stable ECS/scene IR, and runs through native Bevy/wgpu runtimes for desktop and mobile with a Three.js web runtime for preview and distribution.

The main technical bet is:

```txt
Three.js-like TypeScript API
  -> stable ECS/scene/material IR
  -> Bevy native runtime first
  -> Three.js web runtime for preview
```

The escape hatch is a custom Rust/wgpu runtime later, only if Bevy blocks product-critical requirements.

## Non-Negotiable Boundaries

- Users write TypeScript, not Bevy Rust.
- Bevy remains an internal runtime adapter.
- The project supports a useful Three.js-like subset, not arbitrary Three.js projects.
- The compiler emits IR instead of compiling arbitrary JavaScript to Rust.
- MCP comes after SDK, CLI, and validator foundations.
- WebView is not the native performance strategy.
- Lua or Luau may be considered later for mods, not as the primary v1 language.

## MVP Definition

The first MVP is one mobile-friendly third-person arena demo.

Required capabilities:

- player movement
- camera follow
- touch controls
- keyboard controls
- 3D model loading
- basic enemies
- simple ECS systems
- TypeScript systems hosted through the portable scripting API
- React-style HUD and touch controls compiled to `ui.ir.json`
- collision
- health and damage
- one level
- one material model
- web preview
- desktop native build
- Android build
- iOS build if feasible

MVP success condition:

```txt
An AI can generate or modify a simple ThreeNative game,
validate it,
preview it on web,
and build it to native desktop/mobile.
```

Explicit MVP exclusions:

- visual editor
- multiplayer
- full Three.js compatibility
- arbitrary browser APIs
- arbitrary postprocessing chains
- raw WebGL access
- advanced shader customization
- arbitrary user scripts
- arbitrary React DOM as native UI
- general-purpose plugin system
- custom Rust/wgpu renderer

## Phase 0: Pipeline Spike

Goal: prove that TypeScript source can produce native rendered output through IR.

Build:

- minimal SDK entry points
- one TypeScript scene file
- minimal IR schema
- IR generator
- Bevy runtime loader
- cube mesh
- camera
- light
- desktop window

Success criteria:

- TypeScript creates a scene.
- Compiler emits a valid IR bundle.
- Bevy runtime loads the bundle.
- A native desktop window renders the cube, camera, and light.

Do not build:

- asset pipeline
- editor tooling
- web runtime parity
- mobile packaging
- generalized ECS scripting

Primary risks:

- premature abstraction before one scene works
- Bevy loader complexity
- unclear IR ownership between compiler and runtime

## Phase 1: Core SDK And Web Runtime

Goal: support simple AI-generated scenes in both web and native runtimes.

Build:

- `Scene`
- `Object3D`
- `Mesh`
- `Camera`
- `Light`
- `Transform`
- `BoxGeometry`
- `SphereGeometry`
- `PlaneGeometry`
- `MeshStandardMaterial`
- basic asset manifest
- first validator
- Three.js web runtime adapter
- CLI commands for validate, dev, and build basics
- React-style UI authoring spike for a simple web HUD

Success criteria:

- AI can write simple Three.js-like scenes.
- Compiler converts supported scenes into IR.
- Validator rejects unsupported APIs with stable diagnostics.
- Bevy runtime renders the scene.
- Web runtime renders the same scene.
- Web runtime renders a simple portable UI overlay.

Testing expectations:

- SDK unit tests.
- compiler extraction tests.
- IR schema tests.
- validator diagnostic snapshots.
- web and Bevy smoke tests for the same simple scene.

Primary risks:

- compatibility expectations drift toward "all of Three.js"
- web adapter behavior becomes the implicit source of truth
- diagnostics are too vague for AI repair

## Phase 2: ECS Gameplay

Goal: move from static scenes to small playable games.

Build:

- `World`
- `Entity`
- `Component`
- `System`
- query API
- update loop
- input abstraction
- time/delta API
- tags
- prefabs
- simple collision hooks
- systems IR read/write declarations
- command buffer patch application
- native script-host spike for one movement or combat system
- portable UI primitives for HUD, pause menu, and touch controls

Success criteria:

- A player character can move from the same source in web and native.
- Gameplay code compiles through constrained TypeScript systems.
- ECS-first and scene-style APIs both map to the same IR.
- React-style game UI compiles to `ui.ir.json`.
- Bevy recreates a simple HUD and touch controls from `ui.ir.json`.

Testing expectations:

- system execution tests.
- input abstraction tests.
- cross-runtime movement smoke test.
- validator tests for invalid components and queries.

Primary risks:

- runtime scripting grows too broad
- TypeScript behavior becomes hard to map deterministically
- ECS API diverges from scene API concepts
- UI expectations drift toward full React DOM/CSS instead of portable UI IR

## Phase 3: Assets And Animation

Goal: support real game assets without generalizing too early.

Build:

- glTF loading
- texture references
- asset manifest validation
- animation clips
- basic animation state machine
- asset preprocessor
- initial material constraints

Later candidates:

- KTX2/Basis texture pipeline
- meshopt
- LOD support
- asset cache

Success criteria:

- A real animated character loads and plays in web and native.
- Missing or unsupported assets fail validation before runtime.
- Asset paths and IDs remain stable enough for hot reload.

Testing expectations:

- asset manifest tests.
- glTF fixture tests.
- animation IR tests.
- runtime asset loading smoke tests.

Primary risks:

- asset pipeline complexity exceeds SDK progress
- material parity differs too much between Bevy and Three.js
- large assets make examples brittle

## Phase 4: Mobile

Goal: make the MVP demo viable on real phones.

Build:

- Android build pipeline
- iOS build pipeline
- touch controls
- safe-area-aware portable UI
- native UI recreation for MVP HUD and pause menu
- safe area handling
- lifecycle pause/resume
- resolution scaling
- FPS cap
- thermal-friendly profile
- mobile validation rules

Success criteria:

- MVP demo runs on one mid-range Android phone profile.
- MVP demo runs on one iPhone profile if feasible.
- Mobile validator catches obvious performance and lifecycle issues.
- Touch controls and HUD respect safe areas on mobile targets.

Testing expectations:

- Android build smoke test.
- iOS build smoke test where infrastructure allows it.
- mobile target-profile validation tests.
- input tests for touch and keyboard parity.

Primary risks:

- platform setup dominates product work
- Bevy mobile edge cases require adapter work
- performance disappoints because validation comes too late

## Phase 5: AI Control Plane

Goal: let AI agents create, validate, build, and repair projects through stable tools.

Build:

- MCP docs resources
- component discovery tools
- schema resources
- scene validator tool
- Three.js snippet converter
- build tool
- preview tool
- profile reader
- mobile optimization suggestions

Success criteria:

- An AI agent can create, validate, build, and fix a simple game using MCP-backed tools.
- MCP behavior is backed by CLI/compiler/validator APIs.
- Build and validation errors are structured enough for automated repair.

Testing expectations:

- MCP tool contract tests.
- CLI integration tests.
- diagnostics round-trip tests.
- converter tests for supported and unsupported snippets.

Primary risks:

- MCP is built before the underlying CLI behavior is stable
- tools duplicate CLI logic
- AI docs list APIs that validators do not support

## Phase 6: Product Polish

Goal: make the SDK usable by another developer without personal explanation.

Build:

- maintained templates
- examples
- docs optimized for AI and humans
- starter game kits
- better error messages
- inspector/dev overlay
- hot reload improvements
- profiling reports

Success criteria:

- A developer can build a small game from a template.
- Examples pass validation and build checks.
- Hot reload handles common scene, system, and asset edits.
- Error messages point to concrete fixes.

Testing expectations:

- template generation tests.
- example build matrix.
- hot reload smoke tests.
- documentation examples checked against current APIs.

Primary risks:

- polish work masks missing runtime correctness
- examples become demos instead of maintained tests
- hot reload preserves invalid state

## Backlog After MVP

Candidates after the MVP is reliable:

- particles
- richer physics integration
- richer animation state machines
- material variants
- postprocessing subset
- networking experiments
- sandboxed Luau or Lua mods
- richer portable UI widgets
- React DOM-only app shell screens
- editor/devtools
- visual inspector
- custom Rust/wgpu runtime evaluation
- React Native WebGPU experiments for validation

Each backlog item should enter only with a clear runtime mapping, validation plan, and example.

## Risk Matrix

| Risk | Severity | Mitigation |
| --- | ---: | --- |
| Bevy API churn | High | Pin Bevy, isolate `runtime-bevy`, and keep IR stable. |
| Three.js compatibility expectations | High | Document "Three.js-like" support and fail unsupported APIs clearly. |
| Mobile build complexity | High | Start with one Android device and one iPhone profile. |
| AI hallucinated APIs | High | Use MCP discovery, validators, generated examples, and stable diagnostics. |
| Asset pipeline complexity | High | Ship glTF first; defer KTX2, Basis, meshopt, and advanced optimization. |
| JS/TS runtime complexity | Medium | Compile to IR and constrain runtime scripting. |
| Native script-host risk | High | Phase it after static IR and web scripts; expose only ECS snapshots, patches, commands, and events. |
| Native UI portability | High | Author with React-style TSX, but ship `ui.ir.json`; start with Bevy UI fixtures and a small primitive set. |
| Renderer limitations | Medium | Use Bevy first; consider custom wgpu only after product proof. |
| Performance disappointment | Medium | Add mobile validation and profiling before broad feature expansion. |
| Hot reload state corruption | Medium | Start with restart reloads; preserve state only after stable entity identity exists. |
| Web/native divergence | Medium | Maintain cross-runtime IR golden tests and adapter smoke tests. |

## Release Gates

Before calling any phase complete:

- supported APIs are documented
- CLI command behavior is stable enough for examples
- validator covers the new surface area
- at least one example uses the new capability
- runtime adapter behavior is tested
- unsupported behavior fails with explicit diagnostics

The project should move to the next phase only when the current phase improves the end-to-end source-to-runtime loop, not just when isolated code exists.
