# Developer Workflow

This document defines the target development workflow for the ThreeNative project. It is written as implementation guidance for the initial repo setup, not as a claim that every command already exists.

## Product Boundary

ThreeNative is a TypeScript game SDK with a Three.js-like public API, a typed ECS/scene IR, and runtime adapters for native Bevy and web Three.js. Developers write TypeScript. They do not write Bevy code for normal game behavior, and they do not depend on browser or WebView runtime behavior for native builds.

The core loop is:

```txt
TypeScript source
  -> SDK object model or ECS API
  -> compiler extraction
  -> validated IR bundle
  -> runtime adapter
  -> web preview or desktop runtime
```

The first implementation should optimize for proving this loop with small
examples before broad Three.js compatibility, mobile packaging, portable UI, MCP,
or editor tooling.

## Expected Repository Layout

The target monorepo layout is:

```txt
packages/
  sdk/
    src/
      scene/
      ecs/
      materials/
      geometry/
      animation/
      input/
      physics/
  r3f/
    src/
  compiler/
    src/
      extract/
      validate/
      emit/
      ir/
  cli/
    src/
  runtime-web-three/
    src/
runtime-bevy/
  crates/
    threenative_runtime/
    threenative_loader/
    threenative_components/
examples/
  cube-runner/
docs/
```

The package boundaries should stay strict:

- `sdk` exposes public authoring APIs and serializable declarations.
- `ui` will expose React-style portable game UI primitives and bindings after
  the V1 runtime path is proven.
- `r3f` captures supported React Three Fiber scene authoring into SDK/IR.
- `compiler` extracts, validates, and emits IR bundles.
- `cli` owns user-facing commands and orchestration.
- `runtime-web-three` consumes IR and renders with Three.js.
- `runtime-bevy` consumes IR and spawns native Bevy ECS state.
- `mcp-server` will expose documented CLI-backed tools for AI agents after the
  CLI, SDK, compiler, and validator have real behavior.

Runtimes should depend on IR schemas, not on each other's internals.

## Prerequisites

The initial toolchain should assume:

- Node.js for TypeScript SDK, compiler, CLI, examples, and web runtime.
- A package manager chosen once for the monorepo, preferably `pnpm` for workspaces.
- Rust stable for the Bevy runtime.
- Bevy pinned to an explicit version.
- Android tooling after mobile builds enter scope.
- Xcode tooling after iOS builds enter scope.

Early setup should provide:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

When Rust is introduced, top-level scripts should wrap Rust checks so developers do not need to know the crate layout:

```bash
pnpm check:rust
pnpm test:rust
```

## CLI Contract

The CLI is the backbone of local development, CI, and AI workflows. MCP tools should call the CLI instead of duplicating build logic.

Expected commands:

```bash
tn create my-game
tn dev --target web
tn dev --target desktop
tn validate
tn build
tn verify
```

Command expectations:

- `tn create` creates a project from a maintained template.
- `tn dev` starts watch mode, IR generation, validation, and a runtime preview.
- `tn validate` runs schema, semantic, asset, API, and target-profile checks.
- `tn build` emits a versioned game bundle.
- `tn verify` runs visual self-verification for the web preview.

Post-V1 commands can add target-specific packaging, profiling, conversion, and
environment doctor flows once the core loop is stable.

The CLI should produce structured diagnostics by default. Human-readable output is useful, but every validation and build error should also have a stable code, severity, file reference, and suggested fix when possible.

## Development Lifecycle

### 1. Author

Developers write game code in one of two supported styles.

Three.js-like scene style:

```ts
const scene = new Scene();

const player = new Mesh(
  new BoxGeometry(1, 2, 1),
  new MeshStandardMaterial({ color: "red" })
);

player.position.set(0, 1, 0);
scene.add(player);
```

ECS-first style:

```ts
world.spawn(
  Transform.position(0, 1, 0),
  MeshRenderer.box({ size: [1, 2, 1] }),
  Material.standard({ color: "red" }),
  PlayerController({ speed: 5 })
);
```

Both styles must compile to the same IR model. The ECS-first API can expose more explicit gameplay structure, but it should not bypass validation or runtime portability.

### 2. Extract

The compiler extracts supported SDK declarations and gameplay systems into a game bundle. It should not attempt to compile arbitrary JavaScript or arbitrary Three.js projects.

The first supported source surface should include:

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
- basic assets
- simple systems
- input access
- time/delta access

Portable UI primitives move to a later milestone unless explicitly promoted.

Unsupported APIs should fail with explicit diagnostics instead of being ignored.

### 3. Validate

Validation is a required build step, not an optional lint pass.

The initial validator should check:

- IR schema compatibility.
- unsupported SDK or Three.js APIs.
- missing assets.
- invalid component shapes.
- invalid material parameters.
- invalid transform values.
- target-specific feature support.
- deterministic entity IDs where needed for hot reload.

Mobile performance warnings move to the mobile milestone after V1.

Validation output should be stable enough for humans, CI, and AI agents to use.

### 4. Emit

The compiler emits a bundle such as:

```txt
game.bundle/
  manifest.json
  world.ir.json
  materials.ir.json
  assets.manifest.json
  animations.ir.json
  input.ir.json
  systems.ir.json
  scripts.bundle.js
  target.profile.json
```

JSON is acceptable for early phases. Binary formats should wait until the schemas are stable and performance pressure is real.

### 5. Run

`tn dev --target web` should run the Three.js web adapter for fast preview and distribution checks.

`tn dev --target desktop` should run the Bevy adapter so native behavior is tested early.

The web runtime is a preview and distribution target. It is not the source of truth for native performance.

## Hot Reload

Hot reload should be designed around stable IR identity, not runtime-specific hacks.

Expected behavior:

- Rebuild IR when TypeScript source changes.
- Revalidate before pushing changes to a runtime.
- Preserve runtime state when component identity and shape allow it.
- Respawn entities when their component shape changes.
- Reload assets when asset content or manifest entries change.
- Surface unsupported hot reload changes as warnings with a required restart.

Phase 0 and Phase 1 can use full restart reloads. State-preserving reload should wait until entity IDs, component schemas, and runtime adapter boundaries are stable.

The Bevy runtime should stay behind a loader boundary so Bevy scene hot reload can be used where it helps without leaking Bevy concepts into the public SDK.

## Build And Package Flow

The build flow should be target-independent until the runtime adapter step:

```txt
source
  -> typecheck
  -> extract
  -> validate
  -> emit IR bundle
  -> runtime adapter packaging
  -> target package
```

Target expectations:

- `web`: static preview/distribution package using Three.js WebGPURenderer with fallback behavior handled by the web runtime.
- `desktop`: Bevy native executable plus game bundle.
- `android`: post-V1 Bevy Android package plus game bundle, mobile target profile, touch controls, and safe-area UI data.
- `ios`: post-V1 Bevy iOS package plus game bundle, mobile target profile, touch controls, and safe-area UI data.

Mobile packaging should enter after the desktop and web loop is stable. The first mobile milestone should target one known Android device and one known iPhone profile before broad device support.

## Testing Expectations

Testing should follow the architecture boundaries.

Required early tests:

- SDK unit tests for object model behavior and ECS helpers.
- Compiler tests for supported authoring patterns.
- Validator snapshot tests for diagnostics and schema failures.
- IR schema compatibility tests.
- Runtime adapter smoke tests with a minimal cube/camera/light scene.
- CLI tests for command argument behavior and structured output.

Required after V1 before the broader MVP:

- Cross-runtime golden tests for equivalent web and Bevy interpretation of the same IR.
- `pnpm verify:conformance` for shared IR fixtures before claiming a new V2
  runtime capability is supported.
- Asset manifest tests for glTF and texture references.
- Gameplay system tests for input and update-loop behavior.
- Example build tests for the MVP arena demo.
- UI IR tests for HUD, menu, and touch-control fixtures.
- Android build smoke test once mobile packaging is in scope.
- iOS build smoke test when iOS packaging is in scope.

Do not rely on manual visual checks alone. Visual smoke tests are useful, but the project needs schema, compiler, and adapter tests that fail deterministically.

### V2 Conformance Workflow

Every new V2 IR/runtime capability should add at least one shared conformance
fixture before it is treated as supported. The fixture should live in the shared
IR fixture catalog, declare its capability tags, and be consumed by both the
Three.js web runtime and Bevy native runtime.

The workflow is:

```txt
add or update shared IR fixture
  -> validate fixture through the IR validator
  -> run web runtime observation test
  -> run Bevy runtime observation test
  -> compare normalized semantic reports
  -> run pnpm verify:conformance
```

Conformance reports compare semantic behavior: stable entity IDs, component
presence, transforms, camera/light/material mappings, events, logical input
state, UI state, audio triggers, and physics events where applicable. They must
not compare runtime-private handles or renderer internals.

## Versioning And Compatibility

The IR is the internal platform contract and should be explicitly versioned from the start:

```json
{
  "schema": "threenative.bundle",
  "version": "0.1.0"
}
```

Compatibility rules:

- Public SDK changes require compiler and validator tests.
- IR schema changes require migration notes and adapter tests.
- Runtime adapter changes must not require user code changes unless the SDK explicitly changes.
- Bevy upgrades happen behind the runtime adapter and should not leak to game projects.

## V1 Boundary

V1 is a narrow end-to-end proof: scaffold a project, author a small TypeScript
scene through supported SDK abstractions, emit and validate `game.bundle/`, run
the web Three.js preview, run visual self-verification, and load the same bundle
in a native desktop Bevy runtime.

In scope:

- cube/camera/light scene
- supported SDK scene and ECS authoring subset
- deterministic `world.ir.json`
- structured validator diagnostics
- web preview
- desktop native build
- Playwright visual self-verification

Out of scope:

- full Three.js compatibility
- arbitrary JavaScript or browser APIs
- raw WebGL access
- advanced shaders
- editor tooling
- multiplayer
- arbitrary user scripting
- portable UI runtime and `ui.ir.json` as a V1 gate
- Android or iOS packaging
- visual node graphs
- custom Rust/wgpu renderer

## Working Rules

- Keep Bevy internal.
- Keep TypeScript as the primary authoring and gameplay language.
- Use IR as the contract between authoring and runtimes.
- Prefer explicit validation over permissive runtime fallback.
- Build MCP after the SDK, CLI, and validator have real behavior to expose.
- Add examples only when they are covered by build or validation checks.
- Treat mobile performance as a target profile with enforceable warnings, not as a late optimization pass.
