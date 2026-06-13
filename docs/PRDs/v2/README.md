# V2 PRDs

Complexity: 10 -> HIGH mode

V2 uses [docs/ROADMAP.md](../../ROADMAP.md) as the controlling scope. The goal is
not production hardening; it is proving that the V1 source-to-IR-to-runtime loop
can support one real small playable game:

```txt
author scene and gameplay with supported SDK or R3F/JSX
  -> validate
  -> preview on web
  -> run natively
  -> iterate without rewriting for each target
```

## V2 Scope Decisions

- V2 proof game: one mobile-friendly third-person arena game.
- Authoring: direct SDK remains the lower-level contract; `@threenative/r3f`
  adds supported JSX capture that lowers to the same IR.
- ECS: V2 supports declared components, resources, events, game states, queries,
  command buffers, update/post-update schedules, and deterministic fixed update.
- Scripting: V2 requires constrained TypeScript systems for the arena gameplay.
  Native support may start with one hosted-system proof if full host parity is
  too large, but the release gate must document the chosen native path.
- Input: keyboard, pointer/mouse, and touch-ready logical actions/axes are V2;
  gamepad is V3 unless explicitly added as non-blocking.
- Assets: static glTF/GLB, textures, material texture slots, and audio
  references are V2; broad preprocessing, budgets, and caching are V3.
- UI: HUD, touch controls, pause/menu basics, text, buttons, bars, focusable
  controls, simple layout, and `ui.ir.json` are V2; arbitrary React DOM is not
  portable UI.
- Bundle file names: V2 uses `ui.ir.json` for portable UI, `input.ir.json` for
  logical input maps, and `assets.manifest.json` for external and generated
  asset references.
- Physics: V2 exposes portable physics IR, not Rapier APIs. Rapier may be the
  runtime backend.
- Animation: V2 includes transform clips and named glTF clip playback only if
  the arena demo needs them. Advanced animation state machines are V3+.
- Mobile: V2 is mobile-friendly through touch/control/UI data. Android and iOS
  packaging may start but must not block V2.
- Excluded from V2: polished editor tooling, arbitrary R3F/Drei compatibility,
  multiplayer, advanced material graphs, arbitrary shaders, prefab/scene
  instancing, changed-query semantics, profiling reports, MCP control plane,
  full mobile app-store packaging, custom renderer, and plugin marketplace.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V2-00 Roadmap and Contract Alignment](./V2-00-roadmap-and-contract-alignment.md) | V1 complete | V2 docs, schemas, and exclusions agree on the playable-game proof. |
| 1 | [V2-01 Cross-Runtime Conformance and Regression Harness](./V2-01-cross-runtime-conformance-and-regression-harness.md) | V2-00 | Shared Three.js/Bevy fixtures and regression gates exist before V2 feature work expands. |
| 2 | [V2-02 ECS Gameplay Core](./V2-02-ecs-gameplay-core.md) | V2-00, V2-01 | ECS gameplay declarations can express one moving/damaging arena entity flow. |
| 3 | [V2-03 TypeScript Systems and Runtime Host](./V2-03-typescript-systems-and-runtime-host.md) | V2-02 | Constrained TypeScript systems run through declared schedules on web and native strategy is proven. |
| 4 | [V2-04 Input and Time](./V2-04-input-and-time.md) | V2-02, V2-03 | Logical input maps and timestep resources drive player movement consistently. |
| 5 | [V2-05 R3F JSX Authoring Capture](./V2-05-r3f-jsx-authoring-capture.md) | V2-00, V2-01, V2-02 | Supported JSX scene authoring emits the same world/material/asset IR as SDK authoring. |
| 6 | [V2-06 Asset Pipeline](./V2-06-asset-pipeline.md) | V2-01, V2-05 | Static models, textures, and audio references validate before runtime. |
| 7 | [V2-07 Rendering Parity Extensions](./V2-07-rendering-parity-extensions.md) | V2-01, V2-05, V2-06 | Demo-needed lights, cameras, visibility, and primitive placeholders render on web and Bevy. |
| 8 | [V2-08 Physics Foundation](./V2-08-physics-foundation.md) | V2-01, V2-02, V2-04 | Portable colliders, rigid bodies, sensors, and collision events drive gameplay. |
| 9 | [V2-09 Portable UI Foundation](./V2-09-portable-ui-foundation.md) | V2-01, V2-02, V2-04 | HUD, touch controls, and pause/menu basics emit and render through UI IR. |
| 10 | [V2-10 Audio Runtime](./V2-10-audio-runtime.md) | V2-01, V2-02, V2-06 | Gameplay events trigger one-shot sounds and looping music on web and native. |
| 11 | [V2-11 Arena Demo Template](./V2-11-arena-demo-template.md) | V2-02 through V2-10 | One playable third-person arena demo proves the V2 workflow. |
| 12 | [V2-12 Dev Loop and Release Gate](./V2-12-dev-loop-and-release-gate.md) | All V2 tickets | Watch/rebuild diagnostics, smoke tests, docs checks, and `verify:v2` gate V2. |

## V2 Acceptance Criteria

- A developer or AI can create or modify the arena demo using documented SDK or
  supported R3F/JSX authoring.
- The same game source validates, previews on web, and runs natively.
- ECS-first, scene-style, and R3F/JSX authoring map to the same IR model.
- Gameplay systems declare enough read/write intent for validation and
  scheduling.
- Assets fail validation before runtime when paths, formats, or capabilities are
  unsupported.
- Input, UI, audio, physics, gameplay events, and time behave consistently
  enough across web and native runtimes for the demo to be playable.
- UI is portable through `ui.ir.json`, not arbitrary React DOM.
- Unsupported V2-adjacent APIs fail with explicit diagnostics.

## Release Gate

Run the V2 candidate gate before treating V2 as complete:

```bash
pnpm verify:v2
pnpm verify:conformance
pnpm check:docs:v2
```

`pnpm verify:v2` should build the arena demo, validate every emitted IR file,
run cross-runtime conformance checks, run web visual/gameplay smoke checks, run
native desktop smoke checks, verify representative input/UI/audio/physics
behavior, and save machine-readable artifacts for failures.

## Checkpoint Protocol

After each implementation phase in every V2 ticket, spawn the automated PRD
reviewer:

```txt
subagent_type: prd-work-reviewer
prompt: Review checkpoint for phase N of PRD at docs/PRDs/v2/<ticket>.md
```

Continue only when the reviewer reports PASS, or update the PRD with the
accepted scope change before proceeding.
