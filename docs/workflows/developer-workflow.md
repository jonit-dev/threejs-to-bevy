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

## Artifact and Fixture Ownership

Generated artifacts are outputs. Fixtures are stable inputs. Keep those roles
separate when adding gates, examples, or runtime evidence.

Canonical roots:

- `examples/<name>/dist/*`: generated bundles for one example.
- `examples/<name>/artifacts/<gate>/`: screenshots, traces, visual diffs, and
  focused reports produced by running or inspecting one example.
- `tools/verify/artifacts/<gate>/`: release and verifier-owned feature reports.
- `packages/ir/artifacts/conformance/`: shared conformance reports and diffs.
- `packages/ir/fixtures/*`: shared IR contract fixtures consumed by tests,
  conformance gates, and runtimes.
- `runtime-bevy/artifacts/<gate>/`: Bevy-only adapter evidence that is not
  generated from a specific example bundle.

Checked-in inputs belong under source, fixture, or template fixture paths.
Generated outputs are ignored unless a PRD explicitly promotes them as evidence.
Templates should use `templates/<name>/fixtures/*` for intentional checked-in
inputs; generated `templates/<name>/artifacts/*` and `tmp/**/artifacts/*` are
scratch output.

Root `artifacts/*` paths are not canonical. New gates must write to the owning
example, package, runtime, or verification-tool artifact directory listed above.
Historical generated evidence should be regenerated from the owning gate when
needed instead of being kept under a docs archive.

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
tn init my-game
tn create my-game
tn help scaffold
tn doctor --project my-game
tn dev --target web
tn dev --target desktop
tn validate
tn scene validate [scene-id] --json
tn scene inspect <scene-id> --json
tn scene add-entity <scene-id> <entity-id> --prefab <prefab-id> --json
tn scene set-transform <scene-id> <entity-id> --position x,y,z --rotation x,y,z --scale x,y,z --json
tn scene set-camera <scene-id> <camera-id> --mode third-person-follow --target <entity-id> --json
tn scene attach-script <scene-id> <system-id> --module <path> --export <name> --json
tn scene bind-ui <scene-id> <ui-node-id> --resource <resource.path> --json
tn build
tn package --target desktop
tn verify
tn model-test assets/hero.glb --out artifacts/model-test --verify
tn screenshot --url http://127.0.0.1:5173 --out artifacts/proof/frame.png
tn record --url http://127.0.0.1:5173 --out artifacts/proof/clip.webm --seconds 5
```

Command expectations:

- `tn init` is the first-project alias for `tn create`. It creates a project
  from a maintained template and prints exact next commands.
- `tn create` creates a project from a maintained template.
- `tn create my-game --template v5-game-starter` creates the V5 game-first
  starter using `defineGame`, a portable scene, input, world, runtime config,
  and a small movement system.
- `tn scene validate [scene-id] --json` validates structured source
  `.scene.json` authoring documents with machine-readable diagnostics for AI
  repair loops.
- `tn scene inspect <scene-id> --json` returns source scene metadata such as the
  owning file and declared entity, prefab, resource, system, and UI node IDs.
- `tn scene add-entity`, `set-transform`, `set-camera`, `attach-script`, and
  `bind-ui` mutate supported structured source scenes only after preflight
  validation, then validate again before writing deterministic source JSON.
- SDK projects may keep one-file `Scene`/`World` authoring or split source into
  modular `defineSceneModule`, `defineEntity`, `definePrefabModule`,
  `defineResourceModule`, `defineInputModule`, `defineUiModule`,
  `defineAudioModule`, and `defineAssetModule` declarations. These helpers
  lower to the existing portable bundle path and add source metadata for
  authoring graph provenance.
- `tn dev` starts watch mode, IR generation, validation, and a runtime preview.
- `tn validate` runs schema, semantic, asset, API, and target-profile checks.
- `tn build` emits a versioned game bundle.
- `tn package --target desktop` emits a local desktop artifact directory with a
  copied `game.bundle`, package manifest, and Bevy runtime argument file.
- `tn verify` runs visual self-verification for the web preview.
- `tn model-test <asset-path>` generates a one-model proof project with copied
  GLB/glTF assets, dependency copies, a 1m ruler, translucent bounds marker,
  and calibration-derived camera/scale hints. Add `--verify` to build and
  validate the generated project.
- `tn screenshot --url <preview-url> --out <file.png>` captures a PNG proof
  frame from a running web preview using the same Playwright browser stack as
  visual verification.
- `tn record --url <preview-url> --out <file.webm|file.mp4> --seconds <n>`
  records a short Chromium video. WebM is captured directly; MP4 requires
  `ffmpeg` on `PATH` for conversion.
- `tn help <topic>` gives task-oriented references for scaffolding, assets,
  camera, transform, visual QA, screenshot, and record workflows.
- `tn doctor` inspects project setup, package scripts, source entrypoint, and
  emitted bundle files with stable diagnostics and next commands.

## First Project Flow

Use `tn init` when starting from an empty directory or when instructing an
agent to create a reproducible prototype:

```bash
tn init my-game --template game-starter --json
cd my-game
pnpm install
pnpm run validate
pnpm run build
pnpm run dev:web
pnpm run verify
```

The JSON scaffold payload includes:

- `template`: the canonical template name used.
- `path`: the absolute project path created.
- `nextCommands`: install, validate, build, web preview, and verify commands.
- `referenceDocs`: workflow docs and `tn help` topics to inspect next.

Run `tn doctor --project my-game --json` after scaffolding or after a failed
build. The initial scaffold may report `TN_DOCTOR_BUNDLE_MISSING` as a warning
until `pnpm run build` emits the configured bundle. Missing `package.json`,
required scripts, config, source entrypoint, or bundle files are reported with
stable diagnostic codes and exact follow-up commands.

## Task Help For Visual Debugging

Use `tn help` to discover agent-consumable workflows without guessing command
names:

```bash
tn help
tn help scaffold --json
tn help assets
tn help camera
tn help transform
tn help visual-qa
tn help screenshot
tn help record
```

The help topics call out common visual failure modes such as black canvas,
HUD-only frames, loaded-but-invisible models, missing external textures, camera
clipping, and transform scale wipe risks. Use `tn screenshot` for still proof,
`tn record` for short motion proof, and `tn verify --json` when you need the
runtime report fields including canvas, nonblank output, frame diff, and
projected nonblank bounds/occupancy diagnostics.

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

V7 desktop packaging is intentionally a local artifact layout, not a signed
installer: `dist/package/desktop` contains the copied bundle,
`package.manifest.json`, and `runtime.args.json` for the Bevy runtime loader.
Mobile packaging, app-store publishing, online deployment, and hosted services
remain outside the V7 packaging contract. The first mobile milestone should
target one known Android device and one known iPhone profile before broad device
support.

## Verification And Naming Conventions

ThreeNative is migrating away from milestone-numbered command and folder names
(`verify:v7`, `examples/physics-character`, `templates/starter-functional`) toward
capability-based names (`verify:release`, `physics-character`,
`starter-functional`). The migration plan lives in
[PRDs/archive/cleanup-versioned-debt.md](../PRDs/archive/cleanup-versioned-debt.md).

Current contributor commands:

```bash
pnpm check:names
pnpm check:docs
pnpm verify
pnpm verify:smoke
pnpm verify:changed
pnpm verify:focused <gate>
pnpm verify:alias <legacy-command>
pnpm verify:release
pnpm verify:full
pnpm verify:conformance
pnpm verify:parity:smoke
pnpm verify:parity:push
```

Verification ownership is tracked in
[status/verification-script-classification.md](../status/verification-script-classification.md).
Use package tests for assertions that can run against one package, in-memory
data, or a small fixture: schema validation, diagnostics, compiler emission,
runtime-local mapping, CLI argument behavior, artifact helper behavior, and
verify-tool command selection. Use focused gates only when the proof needs a
generated bundle, cross-package flow, runtime adapter evidence, visual/native
comparison, or durable artifacts consumed by status and release reports.

`pnpm verify:conformance` owns shared IR fixture parity across web Three.js and
native Bevy. `pnpm verify:release` owns aggregation: required focused gates,
conformance, sample-scene/visual evidence, and artifact presence checks. Legacy
milestone commands remain compatibility entry points only; use `pnpm verify:alias
<legacy-command>` when an old script name is still referenced in docs or
automation. Prefer the canonical capability or release command in new docs.

Profile guidance:

| Profile | Command | Use when |
| --- | --- | --- |
| `smoke` | `pnpm verify:smoke` | Fast local confidence for docs and naming drift before broader package or runtime gates. |
| `changed` | `pnpm verify:changed` | Normal changed-code review when the change is package-local or covered by ordinary tests. |
| `focused` | `pnpm verify:focused <gate>` | A capability slice changed and needs its durable focused evidence report. |
| `release` | `pnpm verify:release` | Preparing release evidence, changing release orchestration, or validating required aggregate artifacts. |
| `full` | `pnpm verify:full` | Full compatibility sweep before broad merges or release handoff. |

Do not use `pnpm verify:release` as the default local loop. Start with
`verify:smoke` or `verify:changed`, add `verify:conformance` for shared
IR/runtime contract changes, use `verify:parity:smoke` when you need the
web/Bevy screenshot hook proof, and run the narrowest focused gate for
capability evidence before promoting to release aggregation.

### Git hooks (Husky)

After `pnpm install`, Husky installs local git hooks:

| Hook | Command | Purpose |
|------|---------|---------|
| `pre-commit` | `pnpm verify:smoke` | Fast naming/docs drift check |
| `pre-push` | `pnpm verify:pre-push` | Orchestrated workspace verify + conformance + seven-scene visual parity (~2–3 min target). |

Run `pnpm verify:parity:smoke` explicitly when you need the one-scene web↔Bevy
screenshot proof before pushing. The smoke scene (`examples/parity-smoke`)
combines color probes, ACES tone mapping, atmosphere sun/ambient, exponential
fog with depth markers, sky colors, PBR material cards, and a point-light fill
so one capture exercises most cross-runtime rendering guardrails in ~20–30
seconds.

Evidence:

- smoke: `tools/verify/artifacts/parity-smoke/verification-report.json`
- push: `tools/verify/artifacts/baseline-visual-parity/verification-report.json`

Use `git commit --no-verify` or `git push --no-verify` to bypass hooks when
necessary.

New verification gates live in `tools/verify/src` with package-owned tests.
Use `tools/verify/src/cli/run.ts` for focused gate command composition so root
`package.json` names gates instead of repeating build chains. `scripts/` is wrapper-only
for verification behavior: keep it to temporary compatibility shims, thin CLI
bridges, or non-gate repo maintenance.

`pnpm check:names` scans the repo against
`scripts/version-name-allowlist.json` and fails when a new unclassified milestone
label appears outside the documented migration policy. Legacy script names such
as `verify:v9` and `check:docs:v8` remain supported compatibility aliases until
later cleanup phases replace them with canonical commands.

When adding new examples, templates, docs, or package scripts, prefer capability
names. If a legacy milestone label must remain temporarily, classify it in the
allowlist with owner, rationale, and removal policy.

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

Root verification is split by cost and runtime scope: `pnpm verify` is the
default JavaScript workspace gate, while `pnpm verify:all` runs that gate plus
shared web/native conformance and the Bevy runtime Cargo tests.

V7 performance evidence is target-profile driven. The current fixed reports
record frame/load/draw/entity/package-size metrics in JSON, separate warnings
from hard failures, and include metric, measured value, threshold, and artifact
path on `TN_PERF_*` diagnostics. Live browser and native profiler captures are
future additions, not prerequisites for the deterministic V7 budget gate.

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

### V9 Quality-Control Workflow

For latest V9 merge work, run the focused gate for the area you changed first,
then the aggregate quality gate:

```bash
pnpm verify:v9:<area>
pnpm check:quality:v9
pnpm verify:release
```

Use `pnpm verify:all` when shared runtime contracts change outside the V9 slice.
Release evidence is written under `tools/verify/artifacts/release/verification-report.json`,
`tools/verify/artifacts/sample-scenes/`, `tools/verify/artifacts/visual-matrix/`, and the focused
gate directories referenced by `packages/ir/fixtures/conformance/v9-fixture-catalog.json`.

### V2 Arena Workflow

The canonical playable V2 proof lives in `examples/v2-arena` and can also be
scaffolded from the maintained template:

```bash
pnpm tn -- create my-arena --template v2-arena
pnpm tn -- build --project examples/v2-arena
pnpm tn -- dev --target web --watch --project examples/v2-arena
pnpm tn -- verify --project examples/v2-arena
```

Keep arena edits within `@threenative/sdk`, `@threenative/r3f`, and
`@threenative/ui` declarations so the same bundle remains portable across web
and native runtime paths.

Before treating V2 as releasable, run the candidate gate:

```bash
pnpm check:docs:v2
pnpm verify:conformance
pnpm verify:v2
```

`pnpm verify:v2` rebuilds `examples/v2-arena`, validates the emitted bundle,
runs conformance before arena smoke checks, exercises the web and native paths,
and writes a machine-readable report under `tools/verify/artifacts/milestones/v2`.

The equivalent raw CLI watch command is `tn dev --target web --watch`.

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
