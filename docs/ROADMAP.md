# Roadmap

This roadmap is organized around version goals instead of implementation
phases. The project should advance only when each version proves a sharper
product claim than the previous one.

The short version:

```txt
V1 proves this works.
V1 also gives an AI agent enough scaffold and visual feedback to keep building.
V2 proves someone can build a real small game with it.
V3 proves it can become a production platform.
V4 proves it can support advanced engine and tooling extensions without
breaking the portable contract.
```

## Product Direction

Build an AI-friendly TypeScript game SDK that feels familiar to Three.js
developers, compiles to a stable ECS/game IR, and runs through multiple runtime
adapters:

```txt
Three.js-like TypeScript authoring
  -> optional R3F/JSX authoring capture
  -> SDK capture and validation
  -> ECS/game IR bundle
  -> Three.js web runtime
  -> Bevy native runtime
```

The core claim is not "compile arbitrary Three.js to Rust." The core claim is:

```txt
Write against a supported Three.js-like SDK.
Optionally author scenes through supported R3F/JSX components.
Get portable ECS/game output.
Run it on the web through Three.js.
Run it natively through Bevy.
```

Bevy is an internal runtime adapter, not a public authoring target. Three.js is
the familiar authoring and web-runtime reference point, not an unlimited
compatibility promise.

V1 is treated as the completed foundation. The active roadmap starts at V2 and
focuses on turning the proven pipeline into a real game-making workflow.

## Non-Negotiable Boundaries

- Users write TypeScript, not Bevy Rust.
- Bevy remains an internal native runtime adapter.
- The SDK supports a useful Three.js-like subset, not arbitrary Three.js
  projects.
- R3F is an authoring/capture layer, not the portable runtime contract.
- Supported R3F/JSX lowers to the same IR as the direct SDK API.
- The compiler emits explicit IR instead of compiling arbitrary JavaScript to
  Rust.
- Web runs directly on Three.js, not through the native runtime.
- Native runs through Bevy first, not through a WebView.
- MCP and AI control-plane work comes after SDK, CLI, compiler, validator, and
  runtime foundations are real.
- Lua or Luau may be considered later for mods, not as the primary authoring
  language.
- A custom Rust/wgpu runtime is a later escape hatch only if Bevy blocks
  product-critical needs.

## Version Goals

| Version | Goal | Main Proof |
| --- | --- | --- |
| V1 | Prove the full flow works end to end. | A scaffolded project can be created, code written with Three.js-like abstractions becomes ECS/game IR, runs on web directly through Three.js, builds a native Rust/Bevy game, and can be visually self-verified. |
| V2 | Prove the flow can support an actual small game. | A developer or AI can build, validate, preview, and iterate on a playable arena game with R3F/JSX scene authoring, assets, input, UI, audio, physics, and TypeScript gameplay systems. |
| V3 | Prove the platform can become production-grade. | Mobile packaging, stronger tooling, AI repair loops, performance profiles, target capability profiles, and maintained templates make the SDK usable beyond the core team. |
| V4 | Prove advanced parity and extensibility can fit the model. | Optional editor, networking, advanced rendering, plugin/native extension, and richer content workflows are added only where they preserve SDK-to-IR portability. |

## V1: End-To-End Proof

Goal: prove the central technical and product bet with the smallest complete
vertical slice.

V1 is successful when this loop works:

```txt
create scaffolded project
  -> TypeScript game code using Three.js-like SDK abstractions
  -> captured SDK world
  -> validated ECS/game IR bundle
  -> web preview running directly on Three.js
  -> automated screenshot/self-verification loop
  -> Rust/Bevy native build running the same game data
```

This version should be narrow, opinionated, and complete. It should avoid
feature breadth until the loop above is undeniable.

### Required Capabilities

- Project scaffold:
  - CLI command to create a new project from the V1 template
  - predictable directory layout
  - starter scene
  - starter config
  - scripts for validate, web preview, bundle build, and native run
  - documented commands that work from a clean checkout
- Minimal SDK entry points:
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
- Minimal ECS shape:
  - entities
  - components
  - transforms
  - hierarchy
  - tags or names
  - simple resources if needed
- Compiler/capture path from TypeScript SDK usage to IR.
- Versioned JSON bundle format.
- Validator with stable diagnostics for unsupported APIs.
- Three.js web runtime adapter that renders the supported subset directly in
  the browser.
- Rust/Bevy runtime adapter that loads the same bundle and renders the same
  scene natively.
- CLI commands for:
  - create project
  - validate
  - build bundle
  - run web/dev preview
  - run native Bevy build
- Self-verification tools:
  - Playwright-backed web preview launch
  - screenshot capture from the running preview
  - multi-screenshot capture for before/after comparison
  - frame-to-frame image comparison for visible movement detection
  - screenshot artifacts saved to predictable paths
  - machine-readable verification report with pass/fail diagnostics
  - a way to surface screenshots back to the developer or AI agent reviewing
    progress
- Autonomous development skills:
  - create a fresh project from the scaffold
  - inspect generated project structure
  - run validation and read structured errors
  - launch the web preview
  - capture one or more screenshots
  - compare screenshots for visual changes
  - detect blank canvas, missing canvas, frozen scene, and obvious camera
    framing failures
  - map verification failures back to likely SDK, compiler, runtime, or example
    code areas
  - rerun the full loop after edits without manual browser inspection
- One canonical example that exercises the whole path.

### V1 Demo

The V1 demo should be deliberately simple:

- one scene
- one player-like object
- camera
- light
- a few primitive meshes
- one material model
- basic keyboard input if feasible
- one simple ECS-style behavior if feasible, such as movement or rotation
- same source and same emitted bundle used by web and Bevy
- screenshot verification showing the scene is nonblank
- multi-screenshot verification showing that the moving/rotating object changes
  over time when movement is enabled

The demo does not need to be a good game. It needs to prove that the platform
shape is real.

### V1 Self-Verification

V1 must include basic visual verification because rendering bugs can pass type
checks and still produce a blank canvas, broken camera, or frozen scene.

The first verification target is the web runtime because Playwright can inspect
it cheaply and repeatedly. The native runtime can use lighter smoke checks in
V1, then gain deeper image capture later.

Required checks:

- preview starts successfully
- canvas exists and has nonzero size
- screenshot is not blank
- expected dominant scene objects are visible enough for a smoke check
- two or more screenshots can be captured across time
- image differences can detect simple motion, rotation, or animation
- verification failures include the preview URL, screenshot paths, and a short
  diagnostic message

The verification system should be callable from the CLI so an AI agent can run:

```txt
create project
build bundle
start preview
capture screenshots
compare screenshots
read verification report
repair code if needed
```

This is not a full visual regression test framework in V1. It is a practical
eyes-on-the-output loop for proving that generated code actually renders and
changes over time.

### V1 Autonomous Development Skills

V1 should give an AI coding agent enough local feedback to develop the engine
without relying on a human to visually inspect every change.

The minimum autonomous loop is:

```txt
scaffold project
  -> edit SDK/compiler/runtime code
  -> validate generated game code
  -> run web preview
  -> capture screenshots
  -> compare screenshots
  -> inspect structured report
  -> localize likely failure area
  -> patch and repeat
```

Useful V1 skills:

- project scaffold generation
- structured compiler and validator diagnostics
- web preview orchestration
- Playwright screenshot capture
- multi-screenshot comparison
- movement/change detection
- blank-canvas detection
- basic camera/framing sanity checks
- artifact collection for screenshots, logs, bundles, and reports
- deterministic example replay

The point is practical autonomy: an AI agent should be able to tell whether a
change made the demo render, move, freeze, disappear, or fail validation.

### V1 Success Criteria

- A user can write a small game scene using the SDK's Three.js-like API.
- The compiler emits a valid ECS/game IR bundle.
- The validator catches unsupported SDK usage before runtime.
- The web runtime renders the bundle through Three.js.
- The Bevy runtime loads the same bundle and renders a native desktop window.
- The CLI can scaffold a new project from the V1 template.
- The web preview can be self-verified with Playwright screenshots.
- Multi-screenshot comparison can detect simple scene movement or animation.
- Verification artifacts are structured enough for an AI agent to localize and
  repair common failures.
- The example can be rebuilt from source with documented commands.
- The docs clearly explain what is supported and what is intentionally
  unsupported.

### V1 Explicit Exclusions

- mobile packaging
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
- broad asset pipeline
- MCP server

### V1 Risks

| Risk | Mitigation |
| --- | --- |
| The SDK drifts toward full Three.js compatibility. | Document the supported subset and make unsupported APIs validator errors. |
| The web runtime becomes the hidden source of truth. | Treat IR fixtures and conformance tests as the source of truth. |
| The Bevy adapter leaks into the public API. | Keep Bevy names out of SDK and portable IR. |
| The compiler depends on arbitrary JavaScript behavior. | Capture structured SDK calls and emit explicit IR. |
| The visual output is broken even though validation passes. | Add Playwright screenshot checks and movement detection to V1. |
| The scaffold works only on the author's machine. | Treat scaffold generation and clean-checkout commands as release gates. |
| The demo is too ambitious. | Keep V1 focused on proving the pipeline, not game quality. |

## V2: Playable Game Foundation

Goal: prove that the V1 loop can support a real small game, not just a rendered
scene.

V2 should turn the platform into a usable game-making loop:

```txt
author scene and gameplay with supported SDK or R3F/JSX
  -> validate
  -> preview on web
  -> run natively
  -> iterate without rewriting for each target
```

### Required Capabilities

- First-class R3F/JSX authoring:
  - `@threenative/r3f` package for supported React Three Fiber-style scenes
  - JSX scene capture that emits the same world/material/asset IR as the SDK API
  - stable entity IDs from JSX elements or explicit ThreeNative props
  - supported geometry, material, camera, light, transform, hierarchy, and asset
    components
  - validator errors for arbitrary React side effects, unsupported Drei helpers,
    direct Three.js renderer access, and browser-only APIs
  - direct SDK API remains available as the lower-level portable contract
- ECS gameplay API:
  - `World`
  - `Entity`
  - `Component`
  - `System`
  - custom component schemas
  - resources
  - events
  - game states
  - query API
  - command buffer
  - update and post-update schedules
  - deterministic fixed update
  - declared read/write access for systems
- Input abstraction:
  - keyboard
  - pointer/mouse
  - touch-ready logical actions and axes
  - action maps shared by web and native runtimes
- Time and runtime configuration:
  - fixed and variable timestep resources
  - window and resolution settings
  - pause/play state hooks
- Basic gameplay primitives:
  - player movement
  - camera follow
  - basic enemies
  - simple collision hooks
  - health and damage
  - spawn/despawn commands
- Portable scripting model for constrained TypeScript systems.
- Asset support:
  - static glTF/GLB model loading
  - texture references
  - standard material texture slots
  - audio asset references
  - asset manifest validation
  - import diagnostics for missing or unsupported assets
- Rendering parity needed by the demo:
  - capsule and cylinder primitives if used by gameplay placeholders
  - point and spot lights
  - orthographic camera support where UI or 2D overlays need it
  - consistent visibility handling
- Basic audio:
  - one-shot sound playback from gameplay events
  - looping music
- Portable UI foundation:
  - HUD
  - touch control surface
  - pause/menu basics
  - text, buttons, bars, focusable controls, and simple layout
  - `ui.ir.json` emitted from React-style TSX or a similarly constrained UI API
- Basic physics:
  - colliders
  - static, kinematic, and dynamic rigid bodies
  - triggers/sensors
  - collision events
  - Rapier is the leading backend candidate for web and native parity, but the
    SDK exposes portable physics IR rather than Rapier APIs
- Animation foundation:
  - transform animation clips
  - named glTF animation clip playback if needed by the arena demo
- Better CLI/dev loop:
  - dev server
  - rebuild on change
  - runtime diagnostics
  - example smoke tests

### V2 Demo

The V2 demo should be one mobile-friendly third-person arena game:

- R3F/JSX scene authoring through `@threenative/r3f`
- player movement
- camera follow
- keyboard controls
- touch controls
- 3D model loading
- basic enemies
- simple ECS systems
- collision
- health and damage
- one level
- basic HUD
- web preview
- native desktop build

Android and iOS builds can start in V2 if the foundations are ready, but they
are not allowed to block the core playable-game proof.

### V2 Success Criteria

- A developer or AI can create or modify the arena demo from the documented SDK
  surface or the supported R3F/JSX authoring surface.
- The same game source validates, previews on web, and runs natively.
- ECS-first, scene-style, and R3F/JSX APIs all map to the same IR model.
- Gameplay systems declare enough read/write intent for validation and runtime
  scheduling.
- Assets fail validation before runtime when paths, formats, or capabilities are
  unsupported.
- Input, UI, audio, physics, and gameplay events behave consistently enough
  across web and native runtimes for the demo to be playable on both.
- UI is portable through UI IR, not arbitrary React DOM.

### V2 Explicit Exclusions

- polished editor tooling
- broad physics engine abstraction beyond the selected V2 subset
- arbitrary R3F, Drei, or React app compatibility outside the supported capture
  subset
- multiplayer
- advanced material graph
- arbitrary shader authoring
- advanced animation state machines
- full mobile app-store packaging
- custom renderer
- general plugin marketplace

## V3: Production Platform Direction

Goal: make the SDK credible for real projects beyond the initial examples.

V3 should harden the platform around mobile, AI-assisted development, templates,
performance, and maintainability.

### Required Capabilities

- Mobile targets:
  - Android build pipeline
  - iOS build pipeline where toolchain access allows
  - touch controls
  - safe-area-aware UI
  - pause/resume lifecycle
  - resolution scaling
  - FPS caps
  - mobile validation rules
- Production gameplay/content foundations:
  - prefab and scene instancing
  - reflection/type registry for components, resources, and events
  - change detection or changed-query semantics
  - save/load for scenes or game state where needed by templates
  - gamepad input
  - directional UI navigation
  - skeletal animation playback
  - simple animation state machines and blending
  - spatial audio and basic audio mixing
- AI control plane:
  - MCP docs resources
  - schema resources
  - component discovery tools
  - scene validator tool
  - snippet converter for supported Three.js-like patterns
  - build and preview tools backed by the CLI
  - structured diagnostics for automated repair
- Product polish:
  - maintained templates
  - starter game kits
  - checked documentation examples
  - better error messages
  - inspector/dev overlay
  - profiling reports
  - hot reload improvements
- Runtime maturity:
  - conformance fixtures for web and Bevy
  - target capability negotiation
  - target feature collections
  - stronger asset preprocessing
  - asset budgets for generated and imported content
  - mobile performance profiles

### V3 Success Criteria

- A developer can start from a template and build a small game without personal
  explanation from the project author.
- Examples are maintained as tests, not just demos.
- AI tools can create, validate, build, and repair a simple game through stable
  CLI/MCP-backed contracts.
- The mobile build path works on at least one Android device profile and one
  iPhone profile if available.
- Performance and capability diagnostics explain target-specific failures before
  users hit obscure runtime behavior.

## V4: Advanced Parity and Extensibility

Goal: add higher-end engine and tooling capabilities after the portable product
contract has proven itself through V1, V2, and V3.

V4 should be selective. A feature belongs here only when it has a clear SDK
surface, IR representation, validation story, and both web and native runtime
mapping. Native-only or web-only features can exist as explicitly marked target
capabilities, not as silent portability breaks.

### Candidate Capabilities

- Advanced rendering:
  - custom shader/material IR with target restrictions
  - post-processing chains
  - render-to-texture
  - atmosphere, fog, skybox, and environment probes
  - shadows beyond the V2/V3 minimum
- Advanced content:
  - richer physics integration
  - raycasts and shape casts
  - character controller helpers
  - advanced animation blending, masks, IK, and morph targets
  - particles
  - LOD support
  - meshopt and KTX2/Basis texture pipelines
- Tooling and editor:
  - visual scene editor
  - runtime inspector
  - richer devtools
  - editor-oriented widgets
  - broader R3F and Drei compatibility where components have portable IR
    meaning
- Runtime extensibility:
  - native extension or plugin API
  - sandboxed Luau or Lua mods
  - custom Rust/wgpu runtime evaluation if Bevy blocks product-critical needs
- Online/runtime services:
  - networking experiments
  - replication model
  - external service integration points
- Additional game shapes:
  - stronger 2D rendering
  - sprite sheets and atlases
  - tilemaps
  - React DOM-only app shell screens

### V4 Success Criteria

- Advanced capabilities fail closed when a target does not support them.
- Optional extensions do not leak Bevy, Three.js internals, or native-only
  assumptions into the base SDK contract.
- At least one maintained example demonstrates each promoted V4 capability.
- Validation can explain whether a feature is portable, web-only, native-only,
  or unavailable for the selected target profile.

## Later Candidates

These remain outside the committed version gates until they have a clear
runtime mapping, validation plan, and example:

- binary bundle format
- asset cache
- React Native WebGPU experiments for validation

Each candidate should enter a numbered version only when it strengthens the
source-to-runtime loop rather than adding isolated engine surface area.

## Cross-Version Release Gates

Before calling any version complete:

- supported APIs are documented
- unsupported APIs fail with explicit diagnostics
- IR schema changes are versioned
- CLI behavior is stable enough for examples
- validator covers the new surface area
- at least one example uses the new capability
- web and Bevy runtime adapter behavior is tested
- examples can be rebuilt from source
- docs match the actual supported API

The roadmap should stay honest: move forward only when the end-to-end
source-to-runtime loop gets stronger, not when isolated pieces exist.
