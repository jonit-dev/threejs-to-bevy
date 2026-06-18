# Roadmap

This roadmap is organized around product claims, not implementation phases. The
project should advance only when a version makes the TypeScript authoring loop
more useful, more portable, and easier to verify.

The short version:

```txt
Build a Three.js-syntax-first game engine from the ground up.
Use Bevy behavior as the game-engine reference model.
Keep Bevy adapter-private and preserve easy TypeScript authoring for humans and
LLMs.
Promote features only when SDK, IR, validation, web Three.js, native Bevy,
conformance, examples, and docs agree.
```

## Product Direction

ThreeNative is a TypeScript game SDK with a familiar Three.js-like authoring
surface, validated portable game IR, a Three.js web runtime, and a native Bevy
runtime adapter.

```txt
Three.js-like TypeScript authoring
  -> optional supported R3F/JSX capture
  -> SDK/ECS capture and validation
  -> versioned game IR bundle
  -> Three.js web runtime
  -> Bevy native runtime
```

The core claim is not "compile arbitrary Three.js to Rust." The core claim is:

```txt
Write game code with a small, easy, Three.js-shaped TypeScript API.
Get explicit portable ECS/game data.
Run it on web through Three.js.
Run it natively through Bevy.
```

The public API should stay easy for LLMs and TypeScript developers: simple
constructors, predictable object composition, explicit components, direct asset
references, stable diagnostics, and examples that can be copied and modified.
Bevy is the reference for engine behavior and feature coverage, not the authoring
surface users write against.

Three.js is a rendering engine and browser runtime substrate. Bevy is the
game-engine reference for common portable behavior: ECS, schedules, resources,
input, physics, animation, audio, UI, assets, scenes, diagnostics, packaging,
and runtime behavior. The web target implements those game-engine features on
top of Three.js. The native target maps the same portable contracts onto Bevy.

The active status and release gate live in [STATUS.md](STATUS.md). The detailed
drift tracker and Bevy-derived backlog live in
[bevy-feature-parity.md](bevy-feature-parity.md). This roadmap should stay
short enough to guide priorities without duplicating those evidence documents.

## Non-Negotiable Boundaries

- Users write TypeScript, not Bevy Rust.
- Bevy remains an internal native runtime adapter.
- The SDK supports a useful Three.js-like game-engine subset, not arbitrary
  Three.js projects.
- Raw Three.js objects, renderer internals, Bevy handles, browser APIs,
  filesystem APIs, network APIs, workers, timers, and arbitrary npm packages are
  not portable gameplay APIs.
- R3F/JSX is an optional authoring/capture layer, not the runtime contract.
- Supported R3F/JSX lowers to the same IR as the direct SDK API.
- The compiler emits explicit versioned IR instead of compiling arbitrary
  JavaScript or Three.js state.
- Web runs directly on Three.js. Native runs through Bevy first, not through a
  WebView.
- Gameplay authoring stays TypeScript. Native scripting runs the same
  constrained JavaScript bundle through an embedded QuickJS-style host.
- Unsupported APIs fail with explicit diagnostics rather than being ignored.
- MCP, online services, collaboration, public plugins, and custom renderer work
  come after the SDK, compiler, CLI, validator, runtime, and conformance
  foundations are real.

## Version Goals

| Version | Goal | Main Proof |
| --- | --- | --- |
| V1 | Prove the full source-to-runtime loop. | A scaffolded TypeScript scene emits IR, validates, renders in web Three.js, runs in native Bevy, and can be visually verified. |
| V2 | Prove a small playable game loop. | A developer or AI can build, validate, preview, and iterate on a playable arena-style game with portable assets, input, UI, audio, physics, and constrained gameplay systems. |
| V3 | Prove rich environment bundling and runtime content. | A dense first-person forest-path scene validates as one bundle and runs through web and Bevy with budget and visual evidence. |
| V4 | Prove native TypeScript gameplay scripting. | The same `scripts.bundle.js` runs in web JavaScript and embedded QuickJS in Bevy with equivalent ECS effects and diagnostics. |
| V5 | Prove the foundation is maintainable while improving visual quality. | Refactoring, conformance, Rust coverage, fixture cleanup, diagnostics, release gates, and selected rendering/content upgrades reduce drift. |
| V6 | Close the highest-value common game-engine gaps. | The most common missing gameplay, rendering, input, UI, audio, asset, animation, physics, tooling, and diagnostics features are promoted with cross-runtime evidence. |
| V7 | Close deeper engine/runtime gaps. | Advanced or harder parity work left after V6 is promoted or explicitly deferred with the same evidence standard. |
| V8 | Prove local editor and inspector workflows. | Local save/load, structured diffs, inspector/editor data, and preview workflows author the same SDK/ECS/IR data without online scope. |
| V9 | Prove online service boundaries. | Publishing, hosted validation, asset-cache/sync foundations, auth boundaries, and remote artifacts are optional and have deterministic local fallback. |
| V10 | Prove collaboration and replication. | Multi-user editing and runtime replication build on stable V8 data flows and V9 service boundaries. |

## Completed Foundation: V1-V5

V1-V5 are treated as the completed foundation for planning purposes. Their
detailed evidence belongs in [STATUS.md](STATUS.md), PRDs, gates, examples, and
artifacts rather than in this roadmap.

What they established:

- scaffolded project creation, validation, bundle build, web preview, native
  run, and visual self-verification loops
- a supported Three.js-like SDK subset that captures to explicit ECS/game IR
- web Three.js and native Bevy runtime adapters consuming the same bundle data
- bundle-local glTF/GLB, texture, material, camera, light, transform, hierarchy,
  UI, audio, input, physics, environment, and scripting contracts where claimed
- constrained TypeScript systems emitted as `systems.ir.json` and
  `scripts.bundle.js`
- embedded QuickJS native scripting with cross-runtime effect-log conformance
  under `pnpm verify:v4`
- conformance reports, native tests, visual artifacts, diagnostics, and release
  gates that make drift visible

Historical detail should not be re-expanded here. If a completed feature later
regresses or turns out to be schema-only, move it back into the parity tracker
and promote it again through a current gate.

## Current Priority: Ground-Up Three.js-Style Engine

The next roadmap work should keep reinforcing the same product shape:

- Make the TypeScript API feel like a deliberately small Three.js game engine,
  not a Bevy binding and not an arbitrary Three.js compatibility layer.
- Prefer simple authoring primitives that LLMs can use reliably: meshes,
  materials, lights, cameras, scenes, components, systems, input maps, UI nodes,
  sounds, colliders, animations, and assets with stable names and examples.
- Use Bevy behavior to decide what "game-engine complete" means, then expose it
  through TypeScript concepts that fit the existing SDK.
- Treat the IR bundle as the source of truth between authoring, compiler, CLI,
  web runtime, and native runtime.
- Keep examples self-contained and runnable so agents can build, preview,
  inspect artifacts, and repair failures without manual interpretation.

## V6: Common Game-Engine Feature Parity

Goal: make the engine cover the common feature set needed by most small 3D
games, while preserving the easy Three.js-like syntax.

V6 should promote the highest-value open items from
[bevy-feature-parity.md](bevy-feature-parity.md). A V6 item is done only when
the supported surface is present in SDK authoring, IR/schema, validation,
compiler output, web runtime behavior, Bevy runtime behavior where claimed,
conformance, docs, examples, and the release gate.

### V6 Focus Areas

- Camera and view basics:
  - multiple active cameras, camera ordering, viewports, render layers, and
    common camera helpers such as orbit, pan, zoom, shake, and view models
- Material and texture gaps:
  - transparency sorting and richer blend behavior
  - HDR bloom contribution from emissive materials
  - specular texture maps
  - native visual application of texture sampler and UV transform controls
- Rendering basics:
  - native visual parity for fog, sky, atmosphere, shadows, color management,
    and environment maps where already represented in IR
  - skyboxes and cubemap/compressed texture handling
  - renderer-level instancing and batching for repeated content
- Assets and scenes:
  - multi-asset load synchronization
  - query/update APIs for spawned glTF scene entities
  - stable asset diagnostics and repair hints for common import failures
- Animation and particles:
  - visual skeletal animation deformation from loaded glTF clips
  - transform animation authored in code/IR
  - stop/state query APIs
  - rendered particle systems for bounded common cases
- Physics and character movement:
  - full rigid-body solver parity for common cases
  - broader sensors beyond current trigger/overlap scope
  - character interaction volumes and object pushing
  - pathfinding/navmesh only if it is needed by the V6 functional game proof
- Input, picking, and controls:
  - interactive rebinding UI/persistence
  - richer gamepad/touch event streams and diagnostics
  - drag-and-drop picking events and picking debug overlays
- UI, text, and accessibility:
  - native-rendered UI shadows, gradients, weight, and decoration parity
  - font assets and inline rich text spans
  - UI texture atlases, 9-slice scaling, flipping, and tiling
  - standard widgets needed by small games, such as sliders and scrollbars
  - target-specific accessibility diagnostics where practical
- Audio:
  - real 3D spatial attenuation and listener movement
  - mixer buses, effects, ducking, routing behavior, and state-driven music
    transitions
- Diagnostics, tooling, packaging, and performance:
  - in-app FPS/diagnostics overlay
  - broader target profiles and repair hints
  - larger stress-test fixtures for UI, text, lights, cubes, animated models,
    and dense repeated content

### V6 Success Criteria

- A maintained V6 functional game demonstrates the promoted common features
  through visible gameplay or inspectable artifacts.
- The SDK examples preserve easy Three.js-like syntax and do not expose Bevy
  concepts as user-facing requirements.
- Promoted features fail closed on unsupported targets with stable diagnostics.
- The parity tracker has no ambiguous "partly works" claim for any V6-promoted
  feature; each row is either supported with evidence, intentionally partial
  with named gaps, or deferred.
- `pnpm verify:v6` or the current successor gate is authoritative for the V6
  claim and writes machine-readable artifacts an AI agent can use to localize
  failures.

### V6 Explicit Exclusions

- online services, networking, replication, or collaboration
- visual editor and inspector UI
- public plugin/native extension APIs
- arbitrary Three.js, R3F, Drei, React DOM, browser, filesystem, network, or
  platform API compatibility
- arbitrary npm dependencies or unrestricted async behavior inside portable
  systems
- custom Rust/wgpu runtime replacement
- broad shader/material graph work without a narrow portable contract

## V7: Deep Engine Gap Closure

Goal: close deeper parity gaps that are important for richer 3D games but too
large or risky for the common-feature milestone.

V7 should continue to use [bevy-feature-parity.md](bevy-feature-parity.md) as
the backlog. Promote only the slices that can pass the full evidence chain.
Everything else should be explicitly deferred with diagnostics or documented as
not portable.

### V7 Focus Areas

- Advanced camera and rendering:
  - render-to-texture, depth-only camera targets, custom projections, screenshot
    and export workflows
  - FXAA/TAA/SMAA, color grading, depth of field, decals, HLOD fade behavior,
    custom post-processing, and other target-gated renderer features
- Advanced lights and atmosphere:
  - clustered-light budgets, point-light shadow-filter parity, light probes,
    lightmaps, mixed baked/dynamic lighting, area-light behavior, and debug
    light gizmos
- Advanced materials and shaders:
  - custom materials, extended materials, parallax/depth maps, advanced PBR
    fields, custom shaders, shader defs, storage buffers, render phases, and
    bindless material/texture strategies
- Advanced assets and animation:
  - embedded assets, web/network asset loading if it can remain deterministic,
    glTF extras/custom vertex attributes, hot reload with state policy, masks,
    morph targets, retargeting, IK, UI/property animation, and richer particle
    behavior
- Advanced physics and navigation:
  - dynamic mesh colliders, external physics backend strategy, navmesh/pathing,
    richer solver behavior, and arbitrary sloped mesh terrain support
- Advanced UI/audio/input:
  - render-to-texture and 3D-world UI, virtual keyboards/context menus, UI
    transforms, platform audio diagnostics, generated tone playback, streaming
    only if target-gated, and richer device overlays
- Performance and packaging:
  - live profiler captures, native platform profiler evidence, GPU timing,
    signed installers, mobile packaging, and broader platform target profiles
- Debugging tools:
  - debug draw APIs, scene viewer, asset preview, gamepad tools, hierarchy
    inspection, property editing, and gizmo overlays that feed the later editor
    track

### V7 Success Criteria

- Every V7-promoted item has SDK/IR/compiler/validation/runtime/conformance/docs
  evidence, or is explicitly documented as web-only/native-only where that is
  the intended contract.
- A maintained functional scene or runtime artifact demonstrates the promoted
  deep features.
- Remaining gaps in the parity tracker are triaged as V8 editor work, later
  product work, or intentionally non-portable.
- The V7 gate includes focused web, Bevy, Rust, conformance, docs, visual, and
  artifact evidence for every V7 claim.

### V7 Explicit Exclusions

- online services, auth, hosted projects, publishing, or remote asset sync
- collaboration, multiplayer, replication, presence, or conflict resolution
- public plugin/native extension APIs unless a later roadmap revision promotes
  them explicitly
- custom runtime/editor renderer replacement
- arbitrary npm dependencies, platform APIs, raw Three.js/Bevy access, or broad
  shader graph compatibility

## V8: Local Editor And Inspector Foundations

Goal: introduce editor-oriented workflows after core engine gaps are under
control, without taking on online services, collaboration, networking, or
replication.

V8 should prove that editor-authored data can be a first-class input to the same
SDK/ECS/IR pipeline as code-authored projects. The editor is a structured
authoring surface over portable scene, asset, component, and system data. It is
not a separate runtime, not a hidden source of truth, and not an excuse to bypass
compiler validation.

Candidate work:

- visual scene hierarchy and property inspector
- transform, light, bounds, camera, collider, and UI gizmos
- asset preview and scene viewer workflows
- structured project snapshots, diffs, apply, save, and load
- bundle preview and local verification artifacts
- debug draw surfaces that reuse runtime/editor-safe geometry helpers

## V9: Online Project And Publishing Foundations

Goal: introduce optional online service boundaries for project workflows without
taking on real-time collaboration, gameplay networking, or replication.

Candidate work:

- auth and project identity boundaries
- hosted project metadata
- publish/share flows for built bundles or previews
- remote validation jobs that produce local-compatible diagnostics
- optional remote asset/artifact cache with deterministic keys
- explicit login/logout, target profile handling, and service-disabled mode

Success requires offline build, validate, preview, and native workflows to keep
working with no service credentials.

## V10: Collaboration And Runtime Replication

Goal: introduce real-time collaboration and runtime networking only after local
editor data flows and online service boundaries are deterministic.

Candidate work:

- presence and selection sharing
- operation logs or structured patches for scene data
- conflict detection and deterministic merge rules
- replayable collaboration fixtures
- target-gated network capability declarations
- replication for selected ECS components, resources, events, and commands
- deterministic local simulation fallback
- multi-client artifact logs for operations, replicated state, conflicts, and
  rollbacks

## V11+ Candidates: Advanced Engine Extensibility

These remain outside committed version gates until feature parity, editor,
online-service, and collaboration/replication foundations are proven:

- public native extension or plugin API
- sandboxed Luau or Lua mods
- custom Rust/wgpu runtime evaluation if Bevy blocks product-critical needs
- binary bundle format
- React Native WebGPU experiments for validation

## Cross-Version Release Gates

Before calling any version complete:

- supported APIs are documented
- unsupported APIs fail with explicit diagnostics
- IR schema changes are versioned
- CLI behavior is stable enough for examples
- validator covers the new surface area
- at least one functional 3D scene uses the new capability when applicable
- examples can be rebuilt from source
- web and Bevy behavior is tested for every cross-runtime claim
- conformance artifacts make SDK/compiler/runtime drift inspectable
- docs match the actual supported API and parity tracker

The roadmap should stay honest: move forward only when the end-to-end
source-to-runtime loop gets stronger, not when isolated pieces exist.
