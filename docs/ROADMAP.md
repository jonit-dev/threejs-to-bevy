# Roadmap

This roadmap is organized around version goals instead of implementation
phases. The project should advance only when each version proves a sharper
product claim than the previous one.

The short version:

```txt
V1 proves this works.
V1 also gives an AI agent enough scaffold and visual feedback to keep building.
V2 proves someone can build a real small game with it.
V3 proves it can bundle and run a rich first-person environment scene.
V4 proves native gameplay scripting through an embedded JavaScript backend.
V5 proves the project can sustain itself while improving 3D visual quality:
refactoring, stronger testing, release-harness work, and selected advanced
rendering/content upgrades plus game-first authoring ergonomics reduce drift
after V1-V4.
V6 closes feature-parity and missing gameplay/runtime gaps before larger
product surfaces.
V7 closes the deeper engine/runtime parity gaps that do not fit safely in V6.
V8 proves local editor and inspector workflows without online scope.
V9 proves online service boundaries without multiplayer or collaboration.
V10 proves collaboration and replication only after local editor and online
service foundations are stable.
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

The product goal is to reach practical game-engine feature parity between Bevy
and the Three.js-based game engine SDK/runtime we are building. Three.js is a
3D rendering engine and browser runtime substrate, not the feature baseline for
gameplay. Bevy is the game-engine reference for the common capabilities the SDK
should expose portably: ECS, schedules, resources, input, physics, animation,
audio, UI, assets, scenes, diagnostics, and runtime behavior. The web target
should make those game-engine features work on top of Three.js; the native
target should map the same portable contracts onto Bevy.

The core claim is not "compile arbitrary Three.js to Rust." The core claim is:

```txt
Write against a supported Three.js-like SDK.
Optionally author scenes through supported R3F/JSX components.
Get portable ECS/game output.
Run it on the web through Three.js.
Run it natively through Bevy.
```

The product should be judged by whether an AI agent or TypeScript developer can
build a small playable 3D game faster here than with raw Three.js, R3F, Godot,
Unity, or Bevy. The SDK should expose ECS-compatible abstractions that make 3D
game development quick without giving up the path to native-like performance.

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
- Gameplay authoring stays TypeScript. Native scripting should first run the
  same JavaScript bundle through an embedded QuickJS-ng-style host. Lua or Luau
  may be revisited later for mods or as an alternate backend, not the initial
  native MVP.
- MCP and AI control-plane work comes after SDK, CLI, compiler, validator, and
  runtime foundations are real.
- A custom Rust/wgpu runtime is a later escape hatch only if Bevy blocks
  product-critical needs.

## Version Goals

| Version | Goal | Main Proof |
| --- | --- | --- |
| V1 | Prove the full flow works end to end. | A scaffolded project can be created, code written with Three.js-like abstractions becomes ECS/game IR, runs on web directly through Three.js, builds a native Rust/Bevy game, and can be visually self-verified. |
| V2 | Prove the flow can support an actual small game in web preview with a native data-path smoke. | A developer or AI can build, validate, preview, and iterate on a playable arena game faster than with raw Three.js, R3F, Godot, Unity, or Bevy, using ECS-compatible abstractions, R3F/JSX scene authoring, assets, input, UI, audio, physics, and constrained TypeScript gameplay systems. Native may gate scripted gameplay while still loading the same static bundle data. |
| V3 | Prove the platform can bundle and run a rich first-person environment scene. | The `assets-source/environment` forest pack is composed into a dense stylized path scene with performant Three.js first-person camera controls, validates as one portable bundle, and runs through web and Bevy with documented content budgets and scene verification. |
| V4 | Prove portable gameplay scripting can run natively. | The same constrained TypeScript systems emit one `scripts.bundle.js` that runs in web preview and embedded QuickJS-ng in Bevy native, with equivalent ECS patches, events, commands, and diagnostics for a representative gameplay fixture. |
| V5 | Prove the V1-V4 foundation is maintainable while raising 3D visual quality and authoring ergonomics. | Refactoring, conformance expansion, Rust/Bevy test coverage, fixture cleanup, diagnostic consistency, release-harness improvements, selected advanced rendering/content upgrades, and the `defineGame`/`v5-game-starter` path make existing contracts safer, richer, and easier to start with without taking on editor or online scope. |
| V6 | Prove the engine covers the common game-engine feature set needed by most small 3D games across web Three.js and native Bevy. | The highest-value missing contracts from V2-V5, roughly the "80% most common" feature set for playable 3D games, are promoted only when SDK, IR, validation, web, Bevy, conformance, docs, and examples agree. |
| V7 | Prove deeper engine/runtime parity gaps can be closed without bloating V6. | Advanced or harder parity work left after V6, such as deeper physics, animation, UI, audio, renderer/content parity, scripting determinism, packaging, and performance gaps, is promoted or explicitly deferred with the same cross-runtime evidence standard. |
| V8 | Prove local editor and inspector workflows can fit the model. | Scene editor, asset/entity inspectors, local save/load, bundle preview, and structured diffs author the same portable SDK/ECS/IR data without online services or collaboration. |
| V9 | Prove online service boundaries can support projects without compromising offline builds. | Project/session services, publishing, asset-cache/sync foundations, auth boundaries, and remote validation are introduced behind explicit capability flags with deterministic local fallback. |
| V10 | Prove collaboration and replication can work on top of stable editor and online foundations. | Multi-user editing, presence, conflict handling, and gameplay/network replication are introduced only after V8 editor data flows and V9 service boundaries are deterministic and testable. |

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
  -> run static bundle data natively
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
  - web runtime executes the first full gameplay scripting path
  - native runtime may explicitly gate scripted systems until V4 while still
    loading static bundle data and reporting actionable diagnostics
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
  - orthographic camera support where UI overlays need it
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
- native desktop build for static bundle data and non-scripted runtime smoke

Android and iOS builds can start in V2 if the foundations are ready, but they
are not allowed to block the core playable-game proof.

### V2 Success Criteria

- A developer or AI can create or modify the arena demo from the documented SDK
  surface or the supported R3F/JSX authoring surface.
- The same game source validates and previews on web.
- The native runtime loads the same bundle data and either runs supported
  non-scripted behavior or explicitly gates scripted systems with a stable
  diagnostic until V4.
- ECS-first, scene-style, and R3F/JSX APIs all map to the same IR model.
- Gameplay systems declare enough read/write intent for validation and runtime
  scheduling.
- Assets fail validation before runtime when paths, formats, or capabilities are
  unsupported.
- Input, UI, audio, physics, and gameplay events behave consistently enough in
  web preview for the demo to be playable, with native parity tracked by
  targeted conformance and V4 scripting work.
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
- native hosted gameplay scripting parity
- full mobile app-store packaging
- custom renderer
- general plugin marketplace

## V3: First-Person Environment Scene

Goal: prove that the V2 game foundation can ship a real content-heavy scene,
not just gameplay primitives or a sparse arena.

V3 should focus on the reference forest-path scene in
`assets-source/environment/Preview_2.jpg`: a stylized woodland path framed by
trees, rocks, grasses, bushes, mushrooms, flowers, warm sunlight, readable
depth, and a first-person camera. The web Three.js runtime is the strict
performance target for this version because the reference scene is dense and
vegetation-heavy. Production-platform work belongs in V3 only when it directly
helps author, validate, bundle, run, optimize, or verify that scene.

> V3 is not a production game-platform release. V3 is a rich-environment
> bundle/runtime proof. General gameplay ECS, native TypeScript/QuickJS
> gameplay scripting, portable UI, mobile packaging, and editor tooling remain
> post-V3 unless explicitly pulled into a narrow PRD.
>
> Native TypeScript gameplay execution is V4. V3 may include native scene
> loading, native screenshots, and native first-person smoke checks, but it does
> not require native hosted gameplay systems.

The available source art is enough for the scene composition proof:

- 68 glTF model assets with matching `.bin` files for trees, pines, dead trees,
  twisted trees, bushes, grasses, clover, ferns, flowers, mushrooms, path rocks,
  pebbles, petals, plants, and medium rocks
- duplicated FBX/OBJ source formats for conversion fallback
- 20 texture files covering bark, leaves, grass, flowers, mushrooms, and rocks
- four preview images, including `Preview_2.jpg`, for visual target guidance

The missing pieces are engine and pipeline capabilities, not more source props:

- no authored terrain/path surface, terrain material layering, or ground-shape
  representation for the winding path
- no prefab/scene instancing model for placing hundreds of repeated vegetation
  and rock props without hand-authored entities
- no deterministic scattering/placement data with validation and stable bundle
  output
- no first-person camera controller with pointer lock, keyboard movement, and
  collision against the scene
- no target-aware asset preprocessing, copied asset layout, budgets, or runtime
  load diagnostics for a dense content bundle
- no Three.js-specific performance gate for draw calls, instance counts,
  texture memory, load time, or frame pacing
- no scene lighting/atmosphere profile for sun direction, ambient fill, fog or
  haze, sky color, shadows, and color management parity
- no visual verification target that can compare the built scene against the
  reference composition at useful camera bookmarks

### Required Capabilities

- Scene asset bundling:
  - copy and package external glTF, `.bin`, and texture dependencies into a
    deterministic bundle layout
  - validate every model, texture, and material reference before runtime
  - report unsupported material, texture, extension, and missing-file issues
    with stable diagnostics
  - track source asset IDs separately from repeated scene instances
- Environment scene authoring:
  - terrain or ground-plane surface support sufficient for the forest path
  - path/clearing composition data for the central walkable route
  - prefab or scene instancing for repeated trees, rocks, grass, flowers,
    mushrooms, ferns, bushes, and pebbles
  - deterministic scattering with seed, bounds, density, scale, rotation, and
    exclusion zones
  - author-controlled hero placements for foreground trees, major rocks, and
    distant focal objects
- First-person runtime:
  - first-person camera component or controller helper
  - pointer-lock mouse look on web and equivalent native mouse capture
  - keyboard movement with configurable speed, acceleration, and camera height
  - walkable bounds and collision against terrain and blocking props
  - camera bookmarks for repeatable visual verification
- Rendering and atmosphere:
  - directional sun light, ambient fill, shadow settings, fog or haze, sky
    color, and color-management fields represented in portable IR
  - runtime mappings for the same scene profile in Three.js and Bevy
  - target diagnostics when a rendering field is unsupported or downgraded
  - enough material parity for the source pack to look stylized rather than
    untextured or flat
- Performance and capability budgets:
  - Three.js-first performance budgets for model count, texture memory,
    instance count, draw calls, triangle count, bundle size, load time, and
    frame pacing
  - runtime instancing or batching for repeated vegetation, rocks, mushrooms,
    flowers, pebbles, and grass clusters
  - asset preprocessing rules for texture sizing, unused source formats, and
    geometry simplification when source assets exceed web budgets
  - web and Bevy load-time diagnostics for the environment bundle, with web
    performance treated as the stricter gate
  - target capability profiles that can reject over-budget content before a
    confusing runtime failure
  - automated measurement artifacts for the V3 web preview, including at least
    draw-call/instance counts, asset load timing, and frame timing over a fixed
    camera walkthrough
- Scene verification:
  - automated build of the V3 environment bundle
  - web screenshot checks for nonblank output, camera framing, asset presence,
    and rough composition against `Preview_2.jpg`
  - native smoke check that loads the same bundle and reaches a first-person
    camera view
  - saved artifacts for screenshots, bundle manifests, validator output, and
    runtime logs

### V3 Success Criteria

- The V3 example builds one portable bundle from the environment asset pack and
  deterministic scene composition data.
- The scene visibly matches the `Preview_2.jpg` target at the product level:
  dense stylized woodland, central path, layered foreground and background
  vegetation, rocks, mushrooms, flowers, warm sunlight, and atmospheric depth.
- A user can move through the scene with a first-person camera on web, and the
  same bundle loads in the Bevy runtime.
- The Three.js web preview remains performant under the V3 budget: repeated
  foliage and prop classes use instancing or batching where needed, asset sizes
  are bounded, and frame/load timing is reported by the release gate.
- The validator catches missing assets, unsupported formats, over-budget
  content, and unsupported target capabilities before runtime where practical.
- Visual verification artifacts prove that the scene is nonblank, correctly
  framed from bookmarked camera positions, and populated with representative
  asset classes.

### V3 Explicit Exclusions

- mobile app-store packaging
- MCP control plane
- general visual editor
- multiplayer
- arbitrary terrain editor
- skeletal animation state machines
- broad Drei/R3F compatibility beyond the scene features above
- custom shaders, postprocessing chains, and advanced material graphs
- general production template catalog

## V4: Portable Native Scripting Host

Goal: prove that gameplay systems authored in TypeScript can run natively
without exposing Bevy or embedding an unrestricted JavaScript runtime.

V4 is the completed scripting product gate. Web remains the reference iteration
path and executes JavaScript directly. Native Bevy executes the same
`scripts.bundle.js` through an embedded QuickJS-ng-style JavaScript host. The
shared contract is equivalent ECS inputs producing equivalent patches, events,
commands, service calls, and diagnostics. The release gate is `pnpm verify:v4`.

```txt
TypeScript gameplay systems
  -> portable-script validation
  -> systems.ir.json
  -> scripts.bundle.js for web
  -> scripts.bundle.js for Bevy QuickJS
  -> cross-runtime patch-log conformance
```

### Required Capabilities

- Embedded JavaScript native backend:
  - QuickJS-ng-style embedding is the first candidate
  - deterministic `scripts.bundle.js` output
  - source mapping or system-ID mapping for diagnostics
  - stable diagnostics for unsupported TS/JS features
- Embedded JS native host:
  - Rust loads the JavaScript bundle into QuickJS
  - JavaScript receives only the portable system context
  - no raw Bevy handles, renderer handles, filesystem, network, or platform APIs
  - host service calls are capability-gated by `systems.ir.json`
  - Node, DOM, timers, workers, and the QuickJS standard library are not exposed
- Cross-runtime system conformance:
  - same fixed ECS snapshot
  - same input and time trace
  - same system schedule
  - comparable patch, event, command, and service-call logs from web JS and
    native QuickJS
- Portable engine-service APIs:
  - animation commands and state queries
  - physics raycast/shape-cast queries and body commands
  - input and time resources
  - event queues
  - spawn/despawn/add/remove command buffers
- Native gameplay fixture:
  - one movement or combat fixture runs through Bevy native QuickJS hosting
  - fixture proves at least one component patch, one command, one event, and one
    engine-service call
- Failure behavior:
  - unsupported scripts fail before runtime when possible
  - missing native script host support fails with stable diagnostics
  - unrestricted async, direct DOM/Three.js/Bevy access, arbitrary npm
    dependencies, excessive host-call patterns, and hidden module-level mutable
    state are rejected or documented as unsupported

### V4 Demo

The V4 demo is a small deterministic gameplay scene, not a larger content
milestone:

- one controllable entity
- one enemy or target
- one physics query or collision-driven event
- one animation command such as play/stop/blend
- one spawn or despawn command
- identical web and native patch-log verification for a fixed input trace

The demo keeps scope small and focuses on primitive scripting behavior.

### V4 Success Criteria

- A constrained TypeScript system emits both `scripts.bundle.js` and
  `systems.ir.json`.
- Web runs the JavaScript system bundle through the portable context.
- Bevy runs the JavaScript system bundle through an embedded QuickJS host.
- Runtime mutations happen through validated patches, events, commands, and
  portable engine services.
- Cross-runtime conformance proves equivalent script effects for the V4 demo.
- The public scripting API remains TypeScript; QuickJS stays adapter-private.
- Unsupported scripting features fail closed with actionable diagnostics.

### V4 Explicit Exclusions

- public Lua/Luau authoring
- arbitrary npm packages in portable systems
- arbitrary QuickJS standard-library modules in native systems
- direct Bevy API access
- direct Three.js object or renderer access from portable systems
- TS-to-Rust gameplay compilation
- hot reload with state preservation
- user-authored native plugins
- broad performance optimization for large script-heavy games

## V5: Refactoring, Harness Hardening, And 3D Visual Quality

Goal: make the V1-V4 platform easier to maintain while selectively improving
the 3D visual bar.

V5 should deliberately reduce scope pressure. It is not the editor milestone,
not the networking milestone, and not the plugin milestone. Advanced rendering
and advanced content can enter V5 only when they directly improve 3D scene
quality, have a portable contract, and are covered by validation and runtime
tests. Broad rendering systems and open-ended engine extensibility stay later.

### Required Capabilities

- Refactoring and architecture cleanup:
  - tighten package boundaries between SDK, IR, compiler, CLI, web runtime, and
    Bevy runtime
  - remove duplicated fixture construction where structured builders or shared
    fixtures can represent the same contract
  - split overly broad compiler/runtime helpers into smaller units where tests
    can cover behavior directly
  - keep all refactors behavior-preserving unless a V5 PRD explicitly changes a
    contract
- Test harness improvements:
  - make conformance fixture generation, normalization, and comparison easier to
    reuse across V1-V4 contracts
  - add focused regression tests around known drift areas from V3 and V4
  - improve failure output for web/Bevy conformance mismatches, including paths
    to the mismatched bundle fields and runtime observations
  - reduce flaky visual and runtime checks by standardizing fixed traces,
    deterministic clocks, and artifact paths
- Rust/Bevy test coverage:
  - expand `runtime-bevy` unit and integration tests for loader, renderer
    mapping, environment scene loading, scripting host behavior, service
    facades, and diagnostics
  - add native-side conformance fixtures for every V5 visual-quality feature
    that claims Bevy support
  - keep web and Rust tests reading the same bundle fixtures where the contract
    is shared instead of maintaining separate hand-written cases
  - make native test artifacts easier to inspect, including observed scene
    summaries, effect logs, screenshots where practical, and stable failure
    messages
  - include focused `cargo test` commands in each V5 PRD and add them to the V5
    release-gate loop when the changed contract touches Bevy
- Diagnostics and validation cleanup:
  - normalize diagnostic shape across compiler, CLI, IR validation, and runtime
    gates
  - promote generic failures that block common workflows into stable diagnostic
    codes with suggested fixes
  - add accepted/rejected fixture coverage for high-risk validation rules
- Release-gate and docs consistency:
  - keep `pnpm verify`, `verify:conformance`, `verify:v3`, and `verify:v4`
    aligned with the current status documents
  - add a V5 release gate that runs the relevant TypeScript tests, Rust tests,
    conformance checks, and visual-quality artifact checks repeatably
  - require `cd runtime-bevy && cargo test` or a narrower documented Rust test
    command for V5 work that changes shared IR, native runtime mapping, native
    scripting behavior, or Bevy diagnostics
  - document any intentional drift as future scope rather than accidental
    support
- Advanced 3D rendering quality:
  - tighten material, lighting, shadow, atmosphere, fog, skybox, and color-space
    parity where V3/V4 already expose partial contracts
  - add target-gated post-processing or render-quality controls only when they
    can fail closed with explicit diagnostics
  - improve screenshot and visual-diff artifacts so visual-quality changes are
    measurable instead of subjective
  - keep custom shader/material graph work narrow and target-gated unless a V5
    PRD defines a portable IR contract
- Advanced 3D content quality:
  - improve LOD, mesh/texture optimization, instancing, and asset budget
    reporting for dense 3D scenes
  - expand character-controller, raycast/shape-cast, animation, and particle
    support only where the feature improves the existing 3D examples and can be
    conformance-tested
  - keep all new content features tied to maintained 3D examples and explicit
    target capability profiles
- Functional V5 scene:
  - ship a functional 3D scene that visually demonstrates the V5 promoted
    features where applicable
  - use assets from `assets-source/environment` when they can reasonably show
    the feature, especially for visual quality, dense content, instancing, LOD,
    materials, lighting, atmosphere, movement, animation, or particles
  - keep nonvisual refactoring and harness work tied to the same scene through
    conformance fixtures, runtime observations, diagnostics, or artifact checks
  - require web and Bevy evidence for every scene-visible feature that claims
    cross-runtime support

### V5 Success Criteria

- Existing V1-V4 examples and gates still pass after refactoring.
- Conformance failures are easier to localize to SDK, compiler, IR, web runtime,
  Bevy runtime, or CLI behavior.
- Rust/Bevy tests cover every V5 feature that claims native support, and shared
  fixtures prove web/native behavior against the same IR inputs.
- The test suite covers the currently supported contracts more directly and
  with less duplicated setup.
- Diagnostics are more consistent and actionable for the highest-volume failure
  paths.
- Promoted V5 visual-quality features have SDK/IR/validation/runtime coverage,
  target capability behavior, and at least one maintained 3D example.
- The V5 functional 3D scene visibly exercises most or all promoted V5
  features where visual demonstration is applicable, using
  `assets-source/environment` assets where practical.
- No editor, online, plugin, or unrelated game-shape feature is claimed as
  supported by V5 unless it is explicitly scoped as harness-only or internal
  preparation.

### V5 Explicit Exclusions

- online services, networking, replication, or external integrations
- visual scene editor or collaborative editor workflows
- public plugin/native extension APIs
- broad material graph or custom render-pipeline work without a portable V5 IR
  contract
- custom Rust/wgpu runtime replacement work

## V6: Common Game-Engine Feature Parity

Goal: make the engine feel like a practical game engine by implementing the
highest-value common features used by most small 3D games in both web Three.js
and native Bevy.

V6 should not jump to online, collaboration, or editor workflows. It should make
the current TypeScript game SDK more capable and more predictable across web
Three.js and native Bevy by promoting the common feature set only when the full
contract is real:

```txt
SDK authoring
  -> IR schema and validation
  -> compiler emission
  -> web runtime behavior
  -> Bevy runtime behavior when claimed
  -> conformance and release-gate evidence
  -> functional scene proof
```

The V6 product bar is: a developer or AI agent can build the common shape of a
small 3D game without repeatedly hitting schema-only features, web-only
behavior, or silent native drift. Treat V6 as the "80% most common game-engine
features" milestone, not "finish every engine feature."

### Required Capabilities

- Feature maturity triage:
  - classify every high-visibility partial row in `docs/feature-maturity.md` as
    V6 must-ship, V7 deeper gap, later, or never portable
  - require each promoted feature to have SDK, IR, validation, web, Bevy if
    claimed, conformance, docs, and release-gate agreement
  - mark unsupported or deferred APIs with stable diagnostics rather than
    leaving them as ambiguous schema-only affordances
  - update `docs/bevy-feature-parity.md` as the drift tracker for every promoted
    cross-runtime feature
- Core gameplay systems:
  - strengthen general gameplay systems beyond the V4 primitive trace
  - promote stable query ordering, changed-query filters, system ordering
    constraints, and deterministic resource access where needed by real examples
  - add timers/cooldowns and deterministic random resources if they are needed
    by the V6 playable example
  - keep arbitrary npm dependencies, async systems, platform APIs, and direct
    renderer/native access unsupported
- Physics and character interaction baseline:
  - promote collision events, overlap queries, and a narrow character controller
    slice with web and Bevy evidence
  - keep shape casts or advanced solver behavior for V7 unless required by the
    V6 game proof
  - keep backend-specific physics handles private to adapters
  - use functional scene interactions, not just isolated service-call logs, to
    prove movement, grounding, triggers, and collision events
- Animation and particles baseline:
  - move from V4 `animation.play` service-shape proof to real named clip
    playback and a minimal blend/fade slice if backed by glTF assets and runtime
    observations
  - keep full animation graphs/state machines and complex particles for V7
- UI and audio baseline:
  - promote portable UI beyond schema-only status for HUDs, simple menus,
    retained layout, and basic input/focus when native behavior is release-gated
  - promote audio playback for one-shots, looping music, and event-driven audio
    with web/native behavior and offline diagnostics
  - keep arbitrary React DOM, CSS selectors, browser event handlers, and
    platform audio APIs outside the portable contract
- Asset and material parity:
  - finish texture-slot and material parity gaps that remain after V5
  - tighten native image loading, sampler/color-space behavior, asset
    diagnostics, and bundle-local dependency evidence
  - expand asset lookup from scripts through stable IDs and metadata without
    allowing arbitrary runtime file loading
- Environment and rendering parity:
  - reduce drift in atmosphere, fog, sky, shadows, color management, imported
    transforms, instancing, LOD, and dense-content budget observations
  - keep runtime mesh LOD swapping, renderer-level native instancing, and broad
    post-processing for V7 unless they are required by the V6 game proof
  - keep custom shader/material graph and custom render-pipeline work outside
    V6 unless a narrow portable IR contract is defined and gated
- Templates and examples:
  - evolve the V5 starter into a richer V6 playable example using promoted
    parity features
  - keep examples self-contained with required runtime assets inside the example
    folder or emitted bundle
  - include at least one maintained functional V6 scene that proves gameplay,
    visual, UI/audio, and native-parity claims where applicable
- Release gate:
  - add `verify:v6` with TypeScript tests, conformance, Rust tests, docs checks,
    visual artifacts, gameplay traces, UI/audio evidence where promoted, and
    first-failure diagnostics
  - make `verify:v6` fail when a promoted feature lacks a matching maturity row,
    parity-tracker entry, or docs claim

### V6 Success Criteria

- High-visibility partial rows in `docs/feature-maturity.md` are triaged into
  V6, V7, later, or never portable, and V6 rows are promoted with evidence.
- General gameplay systems are useful beyond the primitive V4 trace and remain
  deterministic across web JavaScript and native QuickJS where claimed.
- Common physics, animation, UI, audio, asset, material, and environment
  features promoted by V6 have SDK/IR/compiler/validation/runtime/conformance/
  docs agreement.
- Bevy parity drift is reduced through focused Rust tests, shared fixtures, and
  runtime observations rather than broad smoke tests.
- The V6 functional scene demonstrates most promoted features through visible
  gameplay or inspectable artifacts.
- Offline SDK/CLI workflows keep working without online, editor, or service
  dependencies.
- `verify:v6` is the authoritative release gate and writes machine-readable
  artifacts that let an AI agent localize failures.

### V6 Explicit Exclusions

- online services, networking, replication, or collaboration
- visual scene editor, editor-authored scenes, or editor inspectors
- public plugin/native extension APIs
- arbitrary Three.js, R3F, Drei, React DOM, browser, filesystem, or platform
  API compatibility
- arbitrary npm dependencies or unrestricted async behavior inside portable
  systems
- custom Rust/wgpu runtime replacement
- broad shader/material graph or render-pipeline work without a narrow portable
  contract

## V7: Deep Engine Gap Closure

Goal: finish the deeper game-engine and runtime parity gaps that are too large
or too risky for the V6 common-feature milestone.

V7 is still not editor, online, collaboration, networking, or plugins. It is the
second gap-closure milestone: take the V6 triage table, promote the next
highest-value engine features, and explicitly defer what remains. V7 should make
the engine credible for richer 3D games without pretending every Bevy or
Three.js capability is portable.

### Candidate Capabilities

- Deeper physics:
  - shape casts, contact filtering, sensors/triggers beyond the V6 baseline,
    richer character controller behavior, and deterministic event ordering
- Deeper animation and particles:
  - animation state machines, blending graphs, animation events, particles, and
    target capability behavior
- Deeper UI and audio:
  - richer layout/focus/navigation, gamepad/touch UI flows, spatial audio, audio
    buses, and native parity hardening
- Deeper rendering/content parity:
  - runtime mesh LOD swapping, renderer-level native instancing where practical,
    post-processing slices, imported asset edge cases, and performance budgets
- Deeper scripting/runtime behavior:
  - resources write API, system-local persisted state if justified, hot-reload
    boundaries, deterministic scheduling, and larger script-heavy fixtures
- Packaging and platform polish:
  - desktop packaging, target profiles, artifact layouts, and platform-specific
    diagnostics only where they preserve the portable authoring model

### V7 Explicit Exclusions

- online services, auth, hosted projects, publishing, or remote asset sync
- visual scene editor, editor-authored scenes, or editor inspectors
- multiplayer, networking, replication, collaboration, presence, or conflict
  resolution
- public plugin/native extension APIs
- custom runtime/editor renderer replacement
- arbitrary npm dependencies, platform APIs, raw Three.js/Bevy access, or broad
  custom renderer/shader graph compatibility

### V7 Success Criteria

- The V6 gap triage table is updated so V7-promoted items are backed by
  SDK/IR/compiler/validation/runtime/conformance/docs evidence.
- Deep physics, animation, UI, audio, rendering/content, scripting, or packaging
  features promoted by V7 are demonstrated in a maintained functional scene or
  explicit runtime artifact.
- Remaining gaps are explicitly deferred or marked never portable with stable
  diagnostics.
- `verify:v7` is the authoritative gate and includes focused web, Bevy, Rust,
  conformance, docs, and artifact evidence for every V7 claim.

## V8: Local Editor And Inspector Foundations

Goal: introduce editor-oriented workflows after V6 and V7 have closed the core
game-engine feature gaps, without taking on online services, collaboration,
networking, or replication.

V8 should prove that editor-authored data can be a first-class input to the same
SDK/ECS/IR pipeline as code-authored projects. The scene editor is a structured
authoring surface over portable scene, asset, component, and system data. It is
not a separate runtime, not a hidden source of truth, and not an excuse to bypass
compiler validation.

## V9: Online Project And Publishing Foundations

Goal: introduce online service boundaries for project workflows without taking
on real-time collaboration, gameplay networking, or replication.

V9 should prove hosted workflows can exist while preserving the offline SDK/CLI
contract. Online features must fail closed when unavailable and must not become
required for local build, validation, preview, or native runtime behavior.

### Candidate Capabilities

- Project/session services:
  - auth and project identity boundaries
  - hosted project metadata
  - publish/share flows for built bundles or previews
  - remote validation jobs that produce the same diagnostics as local CLI
- Asset and artifact services:
  - optional remote asset cache
  - artifact upload/download for verification reports, screenshots, bundles,
    and logs
  - deterministic cache keys and offline fallbacks
- Service-aware CLI/editor:
  - explicit login/logout and target profile handling
  - service-disabled mode that preserves all offline workflows
  - diagnostics for unavailable or unsupported services

### V9 Explicit Exclusions

- real-time multi-user editing
- runtime networking or multiplayer
- ECS replication
- conflict resolution for concurrent scene edits
- online-only builds or service-required validation

### V9 Success Criteria

- Offline build, validate, preview, and native workflows still work with no
  service credentials.
- Hosted validation and publishing produce diagnostics and artifacts compatible
  with local CLI reports.
- Service failures are explicit, actionable, and do not corrupt local project
  state.
- A V9 functional project demonstrates online publishing or hosted validation
  without claiming collaboration or multiplayer support.

## V10: Collaboration And Runtime Replication

Goal: introduce real-time collaboration and runtime networking only after local
editor data flows and online service boundaries are deterministic.

V10 should split two related but distinct problems and prove each through narrow
fixtures before broad claims:

- collaborative authoring over structured scene/project data
- runtime replication over explicit ECS resources, components, events, and
  commands

### Candidate Capabilities

- Collaborative editor workflows:
  - presence and selection sharing
  - operation logs or structured patches for scene data
  - conflict detection and deterministic merge rules
  - replayable collaboration fixtures
- Runtime networking and replication:
  - target-gated network capability declarations
  - replication model for selected ECS components/resources/events
  - deterministic local simulation fallback
  - diagnostics for unsupported target profiles
- Verification:
  - multi-client fixtures for editor and runtime cases
  - artifact logs for operations, replicated state, conflicts, and rollbacks

### V10 Explicit Exclusions

- general-purpose backend framework
- matchmaking, payments, commerce, or social features
- arbitrary network/file/platform APIs in portable systems
- broad MMO-scale networking claims
- public plugin/native extension APIs

### V10 Success Criteria

- Collaborative editing changes serialize back to the same portable project data
  model as V8 editor saves.
- Replicated runtime state is constrained to declared portable ECS contracts.
- Network-disabled builds have deterministic local fallback behavior.
- Multi-client tests and artifacts can replay collaboration and replication
  behavior.

## V11+ Candidates: Advanced Engine Extensibility

These are intentionally pushed beyond V6-V10 until feature parity, editor,
online-service, and collaboration/replication foundations are proven.

- Runtime extensibility:
  - native extension or plugin API
  - sandboxed Luau or Lua mods
  - custom Rust/wgpu runtime evaluation if Bevy blocks product-critical needs

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
- at least one functional 3D scene uses the new capability
- from V5 onward, the version scene should use assets from
  `assets-source/environment` when those assets can reasonably demonstrate the
  feature
- features with visible output, interaction, or runtime state must be shown in
  the version scene where applicable, not only covered by isolated unit tests
- web and Bevy runtime adapter behavior is tested
- examples can be rebuilt from source
- docs match the actual supported API

The roadmap should stay honest: move forward only when the end-to-end
source-to-runtime loop gets stronger, not when isolated pieces exist.
