# Tech Stack Plan

This document defines the planned implementation stack for the SDK, compiler,
CLI, runtimes, and tooling. It is a planning contract, not a claim that these
packages already exist in the repository.

## Stack Principles

- TypeScript is the public authoring language.
- Rust is the native runtime implementation language.
- The IR is the platform boundary between authoring and runtimes.
- Bevy is the first native engine backend, but not public API.
- Three.js is the web preview/distribution backend, but not the native contract.
- Versions should be pinned per release train, with upgrade work gated by
  conformance tests.
- Choose boring infrastructure for the SDK/compiler/CLI so the hard work stays
  focused on IR, runtime mapping, validation, and AI repair loops.

## Monorepo

Recommended baseline:

| Area | Choice | Reason |
| --- | --- | --- |
| JavaScript package manager | `pnpm` workspaces | Fast installs, strict dependency layout, good monorepo ergonomics. |
| Task runner | `turbo` or plain `pnpm` scripts initially | Start simple; add Turborepo only when package graph caching matters. |
| TypeScript | `typescript` with strict mode | Public API and compiler types need strong checking. |
| Formatting | `prettier` | Stable formatting for generated docs/examples and TS code. |
| Linting | `eslint` | Useful for SDK/compiler/CLI packages. |
| Rust workspace | Cargo workspace under `runtime-bevy/` | Keeps Bevy crates isolated from TS packages. |

Use `pnpm` workspaces as the default from day one. Start with plain `pnpm`
scripts unless build times become painful. Adding a task runner before the
package graph exists creates coordination cost without much benefit.

Suggested workspace shape:

```txt
packages/
  sdk/
  r3f/
  compiler/
  cli/
  runtime-web-three/
runtime-bevy/
  crates/
examples/
docs/
```

## TypeScript SDK

Default choices:

- Language: TypeScript.
- Module target: ESM.
- Runtime target for compiler execution: Node.js.
- Public package name while provisional: `@threenative/sdk`.
- API validation: TypeScript types plus runtime schema builders.

Core dependencies should stay minimal:

- schema/type helpers owned by the SDK where possible
- no direct dependency on Bevy, Three.js runtime internals, DOM APIs, or native
  platform APIs
- Three.js and React Three Fiber compatibility helpers should live in separate
  packages, not in the core SDK contract

The SDK should expose authoring objects and ECS declarations, then hand a
structured graph to the compiler. It should not require source-string scraping
for normal operation.

## Three.js And React Three Fiber

Three.js should be a real dependency of the web runtime and compatibility
tooling. React Three Fiber should be treated as an important authoring and
preview bridge because it is familiar to AI models, common in existing Three.js
work, and likely overlaps with existing project assets/components.

Recommended package split:

| Package | Responsibility |
| --- | --- |
| `@threenative/sdk` | Runtime-neutral scene/ECS authoring contract. |
| `@threenative/ui` | Post-V1 React-style portable game UI components that compile to `ui.ir.json`. |
| `@threenative/three-compat` | Helpers that convert supported Three.js objects/snippets into SDK declarations or IR. |
| `@threenative/r3f` | R3F host components/hooks that capture a supported React scene into SDK/IR declarations. |
| `@threenative/runtime-web-three` | Browser runtime that consumes IR and renders with Three.js. |

R3F should not become the core portable contract. It should be a productive
authoring path that lowers to the same IR as the scene API and ECS API.

Supported R3F-style direction:

```tsx
import { Canvas } from "@threenative/r3f";

export default function GameScene() {
  return (
    <Canvas>
      <mesh tn:id="player" position={[0, 1, 0]}>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="#ff3b30" />
      </mesh>
      <directionalLight intensity={2} position={[3, 5, 2]} />
    </Canvas>
  );
}
```

Compiler requirements:

- Capture only the supported ThreeNative/R3F subset.
- Reject arbitrary React side effects, DOM dependencies, imperative renderer
  access, and unsupported Three.js internals.
- Map JSX element identity to stable SDK entity IDs.
- Treat hooks as authoring helpers unless they register explicit systems,
  resources, input maps, or assets.
- Emit the same `world.ir.json` and related bundle files as other authoring
  styles. Portable `ui.ir.json` output is a post-V1 addition.

Why this is worth doing:

- Existing R3F components can become migration targets.
- AI models are strong at JSX/R3F-style scene composition.
- Web previews can share more code with existing Three.js/R3F examples.
- The project can offer an approachable React authoring surface without making
  React or the browser mandatory for native builds.

Boundary:

- R3F is allowed as an authoring/capture layer.
- Three.js is allowed as the web runtime implementation.
- Neither R3F nor Three.js renderer internals are allowed as the native runtime
  contract.

## Compiler And IR

Default choices:

| Area | Choice | Reason |
| --- | --- | --- |
| Compiler language | TypeScript on Node.js | Same ecosystem as authoring code and CLI. |
| Source loading | controlled Node execution of SDK entry points | Lets the SDK capture structured authoring graphs. |
| Typecheck | `tsc --noEmit` | First validation layer before extraction. |
| Bundling scripts | `esbuild` initially | Fast, simple, good enough for bundled TS systems. |
| IR format | canonical JSON V1 | Easy to diff, validate, inspect, and repair with AI. |
| Schema format | JSON Schema or TypeBox-style generated JSON Schema | Runtimes, CLI, MCP, and docs can consume it. |
| Binary format | deferred | Only add after JSON schemas stabilize and profiling proves need. |

The compiler should emit:

```txt
game.bundle/
  manifest.json
  world.ir.json
  assets.manifest.json
  materials.ir.json
  animations.ir.json
  input.ir.json
  systems.ir.json
  target.profile.json
  scripts.bundle.js
  schemas/
```

Open decision: whether schemas are authored in TypeScript and emitted to JSON
Schema, or authored as JSON Schema and imported into TypeScript types. The first
spike should choose whichever produces fewer duplicated definitions.

## CLI

Default choices:

- Language: TypeScript.
- Runtime: Node.js.
- Command parser: `commander` or `clipanion`.
- Output: human-readable text plus machine-readable JSON diagnostics.
- Package name while provisional: `tn`.

Required command groups:

```bash
tn create
tn validate
tn build
tn dev --target web
tn dev --target desktop
tn verify
```

This is the V1 command surface. Later releases can add `tn profile`,
`tn convert`, `tn doctor`, mobile build targets, and MCP-backed workflows. The
CLI should orchestrate TypeScript, compiler, validator, Rust builds, web dev
server, runtime startup, and visual verification instead of scattering that
logic across packages.

## Native Runtime

Default choices:

| Area | Choice | Reason |
| --- | --- | --- |
| Language | Rust | Native runtime, Bevy integration, mobile packaging. |
| Engine | Bevy first | ECS, renderer, assets, animation, input, plugins, and platform support already exist. |
| Graphics | Bevy renderer through wgpu | Avoid custom renderer until the product loop is proven. |
| Native package layout | Cargo workspace | Keeps loader/components/runtime crates separate. |
| Bevy version policy | pinned exact version | Bevy changes quickly; upgrades need adapter tests. |

Suggested top-level native workspace and crates:

```txt
runtime-bevy/
  crates/
    threenative_runtime/      # app setup, schedules, plugins
    threenative_loader/       # bundle and IR loading
    threenative_components/   # Bevy-side component mappings
    threenative_script_host/  # TS/JS host when selected
```

Runtime rules:

- Map stable SDK entity IDs to Bevy `Entity` handles at load time.
- Insert a stable ID component on every Bevy entity spawned from IR.
- Keep Bevy components and schedule labels private to the adapter.
- Use Bevy plugins internally to organize loader, rendering, input, script host,
  assets, diagnostics, and profiling.

## UI Runtime

Default post-V1 direction:

| Area | Choice | Reason |
| --- | --- | --- |
| UI authoring | React-style TSX through `@threenative/ui` | Best fit for AI and web developers. |
| Portable contract | `ui.ir.json` | Lets native and web recreate the same game UI. |
| Web UI renderer | React DOM overlay | Fastest and most ergonomic web path. |
| Native UI renderer | Bevy UI first | Keeps game UI native and inside the Bevy app lifecycle. |
| Dev UI | React DOM on web; egui or Bevy UI later for native | Dev tools do not need to block game UI architecture. |

React is an authoring model, not the native runtime dependency. The compiler
captures supported UI primitives, bindings, styles, and events into `ui.ir.json`.
The Bevy adapter recreates that tree natively. V1 does not require portable UI
runtime support or `ui.ir.json` fixtures.

Do not use WebViews for core native game UI. They may be considered later for
account/store/community screens, but not for low-latency HUDs, touch controls,
or gameplay overlays.

## Native Script Host

This is the highest-risk stack decision and should be spiked before becoming a
hard dependency.

Candidate approaches:

| Approach | Pros | Cons |
| --- | --- | --- |
| No native script host in Phase 0 | Fastest cube-to-Bevy proof. | No runtime gameplay scripting yet. |
| JavaScriptCore | Mature on Apple platforms. | Cross-platform packaging and Android story need care. |
| QuickJS-based embedding | Small embeddable JS runtime. | Need binding layer, performance testing, and mobile validation. |
| V8/deno_core | Powerful and familiar JS semantics. | Heavier binary and integration cost. |
| Compile selected systems to Rust later | Best native performance. | Not a v1 authoring path; high compiler complexity. |

Recommendation:

1. Phase 0 should not require native TS execution. Load static IR into Bevy.
2. Phase 2 should spike QuickJS-style embedding and one alternative.
3. Keep system host APIs narrow: declared queries, command buffers, time, input,
   assets, events, and resources.
4. Treat script host choice as adapter-private so the IR and SDK do not depend
   on a specific JS engine.

## Web Runtime

Default choices:

| Area | Choice | Reason |
| --- | --- | --- |
| Renderer | Three.js `WebGPURenderer` where available | Matches the Three.js-like authoring surface and modern browser path. |
| Fallback | Three.js WebGL2 path controlled by adapter/profile | Keeps previews usable when WebGPU is unavailable. |
| Optional preview shell | React + React Three Fiber | Useful for existing R3F work, examples, dev overlays, and AI-authored JSX scenes. |
| Dev server | Vite initially | Fast TS/web dev loop and static asset handling. |
| Script execution | Browser JavaScript | Natural target for TypeScript systems. |

The web runtime should consume the same IR as Bevy. It must not become a backdoor
for browser-only gameplay APIs.

There are two valid web paths:

- `runtime-web-three`: direct IR to Three.js runtime. This is the canonical web
  adapter.
- `runtime-web-r3f` or an R3F preview shell: useful for authoring, examples,
  overlays, and compatibility work, but it should still consume or emit the same
  IR contract.

## Asset Pipeline

Default choices:

| Asset type | V1 choice |
| --- | --- |
| Models | glTF/GLB |
| Textures | PNG, JPEG, WebP initially |
| Production texture candidates | KTX2/Basis later |
| Mesh optimization candidates | meshopt later |
| Audio | manifest references first; exact backend deferred |
| Generated geometry | deterministic compiler-side asset entries |

The asset manifest should be the source of truth. Runtime adapters may convert
or cache assets, but logical asset IDs stay stable.

## Physics

Physics should be optional in early phases.

Candidate default:

- Use simple built-in collider metadata for Phase 2 movement/collision tests.
- Evaluate Rapier integration for native and web parity before committing to a
  full physics API.

Rules:

- Do not expose a physics engine's native API as the SDK contract.
- Keep collider, rigid body, layer, trigger, and query concepts portable.
- Validate target support before allowing physics-dependent gameplay.

## Input

Default choices:

- SDK exposes logical actions and axes.
- Input bindings live in `input.ir.json`.
- Web adapter maps keyboard, pointer, touch, and gamepad.
- Bevy adapter maps keyboard, mouse, touch, and gamepad through Bevy input.
- Mobile virtual controls are target-profile data, not DOM-specific code.

This keeps gameplay systems independent of browser events and native device
event handles.

## Diagnostics And Profiling

Default choices:

- Diagnostic format: stable code, severity, source range, IR path, target,
  message, suggestion.
- CLI output: readable by default, JSON with `--json`.
- Runtime logs: adapter-specific details mapped back to stable entity IDs and
  asset IDs.
- Profiling schema: target-neutral metrics plus adapter-specific extensions.

Bevy runtime profiling can start with frame time, entity count, asset load time,
and render estimates. Deeper tracing can be added after the runtime loop exists.

## Testing

Default choices:

| Layer | Tools |
| --- | --- |
| SDK/compiler/CLI unit tests | `vitest` |
| Type checks | `tsc --noEmit` |
| Schema fixtures | JSON snapshots plus validator tests |
| Web runtime smoke tests | Playwright once rendering exists |
| Bevy runtime tests | `cargo test` plus runtime smoke fixtures |
| Rust lint/format | `cargo fmt`, `cargo clippy` |
| Cross-runtime conformance | shared IR fixtures loaded by web and Bevy |

The first conformance fixture should be one cube, one camera, one light. Every
new public SDK feature should add at least one compiler fixture and one runtime
conformance expectation.

## CI

Initial CI should run:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm check:rust
```

Mobile builds should not block every early PR. Add Android/iOS smoke checks once
the packaging pipeline exists and build time is understood.

## Version Policy

- Pin Bevy exactly in the runtime workspace.
- Pin Three.js and document tested renderer behavior.
- Keep SDK, compiler, CLI, and IR schema versions aligned until there is a real
  need to split release trains.
- Add IR migration tests before accepting old bundle versions.
- Upgrade runtime dependencies only after conformance fixtures pass.

## Phase Defaults

Phase 0:

- TypeScript SDK stub
- Node compiler
- JSON `world.ir.json`
- Rust Bevy loader
- no native script host
- no physics engine

Phase 1:

- Three.js web adapter
- R3F authoring/preview spike if existing R3F code can accelerate examples
- Vite dev preview
- schema validator
- `esbuild` script bundling for web
- first conformance fixtures

Phase 2:

- ECS gameplay API
- query/read/write declarations
- command buffer
- logical input
- portable UI primitives and `ui.ir.json`
- native script-host spike
- simple collision or physics decision

Phase 3 and later:

- glTF animation
- asset preprocessing
- mobile texture/profile rules
- profiling
- MCP server over CLI/docs/schemas

## Open Decisions

- Native JavaScript engine for TypeScript systems.
- Exact schema authoring source of truth.
- Physics backend and minimum portable physics feature set.
- Whether the web adapter should use only WebGPURenderer in stable examples or
  document a formal WebGL2 fallback profile.
- How much state-preserving hot reload is needed before MVP.
- Whether examples should live inside the monorepo from day one or be generated
  by `tn create` templates first.
