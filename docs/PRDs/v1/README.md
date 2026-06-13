# V1 PRDs

Complexity: 8 -> HIGH mode

V1 uses [docs/ROADMAP.md](../../ROADMAP.md) as the controlling scope. Other docs
are implementation guidance, but where they conflict with the roadmap, V1 keeps
the smaller end-to-end proof:

```txt
create scaffolded project
  -> TypeScript game code using supported SDK abstractions
  -> captured SDK world
  -> validated ECS/game IR bundle
  -> web preview running through Three.js
  -> Playwright visual self-verification
  -> native desktop Bevy runtime loading the same bundle
```

## V1 Scope Decisions

- Repository layout: use `packages/*`, top-level `runtime-bevy/`, `examples/`,
  and `docs/`.
- Bundle naming: standardize on `world.ir.json`, not `scene.ir.json` or
  `ecs.ir.json`.
- Package names: use provisional `@threenative/*` package names until a naming
  decision changes docs and code together.
- CLI: use `tn create`, `tn validate`, `tn build`, `tn dev --target web`,
  `tn dev --target desktop`, and `tn verify`.
- Web runtime: require Three.js rendering; WebGPU is allowed but not a V1 gate.
- Native runtime: require desktop Bevy loading/rendering static validated IR.
- Scripting: V1 may include one built-in movement/rotation proof, but native
  JavaScript hosting is not a V1 gate.
- UI: portable `ui.ir.json` is not required for V1 completion despite some docs
  labeling UI primitives as V1. UI implementation moves to V2 unless explicitly
  promoted.
- Mobile, MCP, broad assets, arbitrary scripts, full Three.js compatibility,
  raw WebGL/WebGPU access, advanced shaders, multiplayer, and editor tooling are
  out of V1.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V1-00 Docs and Schema Alignment](./V1-00-docs-and-schema-alignment.md) | None | Resolves doc inconsistencies before implementation hardens. |
| 1 | [V1-01 Monorepo and CLI Skeleton](./V1-01-monorepo-and-cli-skeleton.md) | V1-00 | Workspace, scripts, package boundaries, and empty CLI commands exist. |
| 2 | [V1-02 Project Scaffold and Template](./V1-02-project-scaffold-and-template.md) | V1-01 | `tn create` generates a clean V1 starter project. |
| 3 | [V1-03 Minimal SDK Surface](./V1-03-minimal-sdk-surface.md) | V1-01 | Supported scene objects can be authored in TypeScript. |
| 4 | [V1-04 IR Bundle and Schemas](./V1-04-ir-bundle-and-schemas.md) | V1-03 | Versioned JSON bundle contract exists and is fixture-tested. |
| 5 | [V1-05 Compiler Capture and Emit](./V1-05-compiler-capture-and-emit.md) | V1-03, V1-04 | SDK authoring code emits deterministic IR. |
| 6 | [V1-06 Validator Diagnostics](./V1-06-validator-diagnostics.md) | V1-04, V1-05 | Unsupported and invalid usage fails with structured diagnostics. |
| 7 | [V1-07 Web Three Runtime](./V1-07-web-three-runtime.md) | V1-04, V1-06 | The bundle renders in a browser through Three.js. |
| 8 | [V1-08 Native Bevy Runtime](./V1-08-native-bevy-runtime.md) | V1-04, V1-06 | The same bundle renders in a native Bevy desktop window. |
| 9 | [V1-09 Canonical Example](./V1-09-canonical-example.md) | V1-02 through V1-08 | One example proves the full source-to-runtime path. |
| 10 | [V1-10 Visual Self Verification](./V1-10-visual-self-verification.md) | V1-07, V1-09 | Playwright verifies nonblank rendering and visible change. |
| 11 | [V1-11 Release Gate and Docs Consistency](./V1-11-release-gate-and-docs-consistency.md) | All V1 tickets | V1 is checked as one coherent release candidate. |

## V1 Acceptance Criteria

- A user can write a small scene using the supported SDK subset.
- The compiler emits a valid `game.bundle/` with `manifest.json` and
  `world.ir.json`.
- The validator rejects unsupported SDK or IR usage before runtime startup.
- The web runtime renders the bundle through Three.js.
- The Bevy runtime loads the same bundle and renders a native desktop window.
- The CLI can scaffold, validate, build, preview web, run native desktop, and
  run visual verification from documented commands.
- Screenshot artifacts and machine-readable reports let an AI agent identify
  blank canvas, missing canvas, frozen scene, and camera framing failures.
- Docs and examples match the actually supported V1 surface.
