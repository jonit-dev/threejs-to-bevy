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
| 1 | [V2-01 ECS Gameplay Core](./V2-01-ecs-gameplay-core.md) | V2-00 | ECS gameplay declarations can express one moving/damaging arena entity flow. |
| 2 | [V2-02 TypeScript Systems and Runtime Host](./V2-02-typescript-systems-and-runtime-host.md) | V2-01 | Constrained TypeScript systems run through declared schedules on web and native strategy is proven. |
| 3 | [V2-03 Input and Time](./V2-03-input-and-time.md) | V2-01, V2-02 | Logical input maps and timestep resources drive player movement consistently. |
| 4 | [V2-04 R3F JSX Authoring Capture](./V2-04-r3f-jsx-authoring-capture.md) | V2-00, V2-01 | Supported JSX scene authoring emits the same world/material/asset IR as SDK authoring. |
| 5 | [V2-05 Asset Pipeline](./V2-05-asset-pipeline.md) | V2-00, V2-04 | Static models, textures, and audio references validate before runtime. |
| 6 | [V2-06 Rendering Parity Extensions](./V2-06-rendering-parity-extensions.md) | V2-04, V2-05 | Demo-needed lights, cameras, visibility, and primitive placeholders render on web and Bevy. |
| 7 | [V2-07 Physics Foundation](./V2-07-physics-foundation.md) | V2-01, V2-03 | Portable colliders, rigid bodies, sensors, and collision events drive gameplay. |
| 8 | [V2-08 Portable UI Foundation](./V2-08-portable-ui-foundation.md) | V2-01, V2-03 | HUD, touch controls, and pause/menu basics emit and render through UI IR. |
| 9 | [V2-09 Audio Runtime](./V2-09-audio-runtime.md) | V2-01, V2-05 | Gameplay events trigger one-shot sounds and looping music on web and native. |
| 10 | [V2-10 Arena Demo Template](./V2-10-arena-demo-template.md) | V2-01 through V2-09 | One playable third-person arena demo proves the V2 workflow. |
| 11 | [V2-11 Dev Loop and Release Gate](./V2-11-dev-loop-and-release-gate.md) | All V2 tickets | Watch/rebuild diagnostics, smoke tests, docs checks, and `verify:v2` gate V2. |

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
pnpm check:docs:v2
```

`pnpm verify:v2` should build the arena demo, validate every emitted IR file,
run web visual/gameplay smoke checks, run native desktop smoke checks, verify
representative input/UI/audio/physics behavior, and save machine-readable
artifacts for failures.

## Checkpoint Protocol

After each implementation phase in every V2 ticket, spawn the automated PRD
reviewer:

```txt
subagent_type: prd-work-reviewer
prompt: Review checkpoint for phase N of PRD at docs/PRDs/v2/<ticket>.md
```

Continue only when the reviewer reports PASS, or update the PRD with the
accepted scope change before proceeding.

