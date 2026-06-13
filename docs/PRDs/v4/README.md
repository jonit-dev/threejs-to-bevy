# V4 PRDs

Complexity: 10 -> HIGH mode

V4 uses [docs/ROADMAP.md](../../ROADMAP.md), [docs/scripting.md](../../scripting.md),
and [docs/scripting-api.md](../../scripting-api.md) as the controlling scope.
The goal is not a broad gameplay platform; it is proving that constrained
TypeScript systems can run through the same `scripts.bundle.js` on web and
native Bevy/QuickJS with equivalent ECS effects.

```txt
primitive scripted scene
  -> systems.ir.json + scripts.bundle.js
  -> web JavaScript system runner
  -> Bevy QuickJS system host
  -> validated patch/event/command/service-call logs
  -> equivalent deterministic outcome
```

## V4 Scope Decisions

- Public gameplay language: TypeScript.
- Native script backend: embedded QuickJS-ng-style JavaScript host.
- Public scripting API: the V4 MVP section in `docs/scripting-api.md`.
- Demo shape: primitive scene with rotating cubes, programmatic movement,
  spawn/despawn, events, input/time, and one narrow engine-service proof.
- Verification authority: cross-runtime patch-log conformance, not visual
  polish.
- Native execution authority: Rust/Bevy validates and applies returned patches,
  events, commands, and service calls.
- Out of V4: public Lua/Luau authoring, arbitrary npm dependencies, direct
  Bevy/Three.js access, async systems, state-preserving hot reload, full physics,
  full animation graphs, UI runtime parity, and broad performance optimization.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V4-00 Roadmap and Contract Alignment](./V4-00-roadmap-and-contract-alignment.md) | V3 complete | V4 docs, maturity, diagnostics, and gates agree on the QuickJS scripting proof. |
| 1 | [V4-01 Script IR and API Contract](./V4-01-script-ir-and-api-contract.md) | V4-00 | `systems.ir.json`, script permissions, and V4 MVP APIs are precise enough for both runtimes. |
| 2 | [V4-02 Script Bundling and Portable Diagnostics](./V4-02-script-bundling-and-portable-diagnostics.md) | V4-01 | `scripts.bundle.js` is deterministic and unsupported portable-script APIs fail before runtime. |
| 3 | [V4-03 Web System Runner and Patch Logs](./V4-03-web-system-runner-and-patch-logs.md) | V4-02 | Web executes systems through the portable context and emits canonical patch/event/command logs. |
| 4 | [V4-04 Bevy QuickJS Host](./V4-04-bevy-quickjs-host.md) | V4-02, V4-03 | Bevy embeds QuickJS, runs the same JS exports, and validates returned effects. |
| 5 | [V4-05 Host Service Facades](./V4-05-host-service-facades.md) | V4-03, V4-04 | Time/input/events/commands plus narrow animation and physics service facades work in both runtimes. |
| 6 | [V4-06 Primitive Scripting Demo](./V4-06-primitive-scripting-demo.md) | V4-03 through V4-05 | A maintained primitive scene proves rotating cubes, movement, spawn/despawn, events, and services. |
| 7 | [V4-07 Cross-Runtime Scripting Verification](./V4-07-cross-runtime-scripting-verification.md) | V4-06 | `verify:v4` compares web and Bevy QuickJS patch logs for a fixed input trace. |
| 8 | [V4-08 Release Gate and Docs Consistency](./V4-08-release-gate-and-docs-consistency.md) | All V4 tickets | `verify:v4`, docs checks, maturity/status updates, and unsupported API docs gate V4. |

## V4 Acceptance Criteria

- A constrained TypeScript system emits `systems.ir.json` and
  `scripts.bundle.js`.
- Web runs the JavaScript system bundle through the portable context.
- Bevy runs the same JavaScript system bundle through embedded QuickJS.
- Runtime mutations happen only through validated patches, events, commands,
  and declared host service calls.
- Web and native produce equivalent patch/event/command/service-call logs for
  the V4 primitive demo under a fixed input trace.
- Unsupported scripting features fail closed with stable diagnostics.
- The public scripting API remains TypeScript; QuickJS stays adapter-private.
- `docs/scripting-api.md` lists V4 MVP APIs and missing/post-V4 APIs.

## Release Gate

Run the V4 candidate gate before treating V4 as complete:

```bash
pnpm verify:v4
pnpm verify:conformance
pnpm check:docs:v4
```

`pnpm verify:v4` should build the primitive scripting demo, validate emitted IR,
run the web JavaScript path, run the Bevy QuickJS path, compare canonical logs,
check diagnostics for unsupported APIs, and save machine-readable artifacts.

## Checkpoint Protocol

After each implementation phase in every V4 ticket, spawn the automated PRD
reviewer:

```txt
subagent_type: prd-work-reviewer
prompt: Review checkpoint for phase N of PRD at docs/PRDs/v4/<ticket>.md
```

Continue only when the reviewer reports PASS, or update the PRD with the
accepted scope change before proceeding.

