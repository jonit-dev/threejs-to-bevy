# Scripting Model

TypeScript is the primary gameplay scripting language, but TypeScript scripts do
not compile into Rust systems in V2. Rust and Bevy own the native engine. TS
systems run against a constrained ECS API and return component patches, events,
and commands that the runtime validates and applies.

Web preview executes the compiled JavaScript system bundle directly. Native
Bevy should execute the same `scripts.bundle.js` through an embedded
QuickJS-ng-style JavaScript host for the first native scripting MVP. This keeps
the web and native paths on the same JavaScript runtime model while Rust/Bevy
continues to own execution authority.

The core rule:

```txt
TypeScript authors behavior.
Rust owns execution authority.
The ECS/IR boundary defines what can cross.
```

## Chosen Direction

Use TypeScript ECS systems as the public scripting model.

Do not start with:

- arbitrary host APIs exposed to JavaScript inside Bevy
- JavaScript-to-Rust transpilation
- user-authored Bevy Rust
- Lua/Luau as the primary gameplay language
- direct JS access to Bevy `World`, `Entity`, `Commands`, or renderer internals

The runtime shape is:

```txt
systems.ir.json
  declares system IDs, schedules, queries, reads, writes, resources, events

scripts.bundle.js
  contains compiled TypeScript system exports for web preview and native Bevy

runtime-web-three
  runs JS systems against the portable context

runtime-bevy
  embeds QuickJS-ng, marshals declared ECS data, applies returned patches/commands
```

V2 currently gates native TypeScript hosting behind an explicit runtime
diagnostic while the bundle, schedule, query, patch, event, and command
contracts are proven in web preview. The next native proof should emit
`scripts.bundle.js`, embed QuickJS-ng from Rust, run one movement or combat
fixture, and compare its patches with the web JavaScript path before treating
native gameplay scripting as shippable.

## Native Execution Loop

The Bevy adapter should execute TS systems like this:

```txt
Bevy schedule stage starts
  -> collect matching entities/components for declared query
  -> copy allowed component/resource data into QuickJS context
  -> call JS system export
  -> collect component patches, events, and command buffer
  -> validate writes against systems.ir.json declarations
  -> apply patches and commands to Bevy World at the stage boundary
  -> continue Bevy schedule
```

TS systems never receive native Bevy handles. They receive stable SDK entity IDs
and plain component/resource data.

Example system:

```ts
export const movePlayer = defineSystem({
  id: "movePlayer",
  stage: "update",
  query: {
    with: [PlayerController, Transform],
    without: [Disabled],
  },
  reads: [PlayerController, Input, Time],
  writes: [Transform],
}, (ctx) => {
  for (const entity of ctx.query()) {
    const controller = entity.get(PlayerController);
    const transform = entity.get(Transform);

    transform.position[0] +=
      ctx.input.axis("moveX") * controller.speed * ctx.time.dt;

    entity.set(Transform, transform);
  }
});
```

Equivalent runtime effect:

```txt
Script output:
  patch entity "player" Transform.position

Rust/Bevy:
  resolve "player" -> Bevy Entity
  validate Transform write is allowed
  apply Bevy Transform mutation
```

## Why Not Compile TS To Rust First?

Compiling arbitrary TypeScript gameplay into native Rust is the wrong starting
point.

Reasons:

- TypeScript semantics, closures, dynamic objects, async behavior, module
  loading, and JS built-ins are expensive to translate safely.
- AI-authored code will use JS/TS idioms that do not map cleanly to Rust.
- Rust generation would make diagnostics harder and force users to understand
  generated native code.
- The product needs to prove the SDK, IR, validation, and runtime mapping before
  optimizing hot paths.

Native Rust systems should exist later as an escape hatch for engine-owned or
performance-critical behavior. They should consume the same ECS component data
contract as TS systems.

## Systems IR Contract

Each TS system must declare enough metadata for runtimes to schedule and guard
execution.

```json
{
  "id": "movePlayer",
  "export": "movePlayer",
  "stage": "update",
  "query": {
    "with": ["PlayerController", "Transform"],
    "without": ["Disabled"]
  },
  "reads": ["PlayerController", "Input", "Time"],
  "writes": ["Transform"],
  "events": {
    "reads": [],
    "writes": ["DamageEvent"]
  },
  "commands": ["spawn", "despawn", "addComponent", "removeComponent"]
}
```

Validation rules:

- `export` must exist in `scripts.bundle.js`.
- `stage` must be a known portable schedule stage.
- `reads` and `writes` must reference known components/resources.
- Query filters must reference known components/tags.
- Systems may only mutate components listed in `writes`.
- Systems may only use command types listed in `commands`.
- Systems may only emit events listed in `events.writes`.

## Data Transfer Model

Start with a patch model, not live Bevy object proxies.

Allowed data crossing into script hosts:

- component snapshots for declared query results
- declared resources such as `Time`, `Input`, target profile, and game state
- entity IDs as stable strings
- asset IDs and handles represented as stable IDs
- event queues exposed through typed APIs

Allowed data crossing back to runtimes:

- component field patches
- resource field patches for declared writable resources
- event emissions
- command buffer entries

Disallowed:

- raw Bevy entity handles
- Rust references or pointers
- renderer/GPU handles
- arbitrary filesystem, network, DOM, or native platform access
- mutation of undeclared components

This is less magical than live object interop, but it keeps the native runtime
safe and testable.

## Command Buffer

Structural changes must go through commands:

```ts
ctx.commands.spawn("projectile.42", [
  Transform.from({ position: muzzle }),
  Velocity({ value: [0, 0, -20] }),
  Projectile({ owner: entity.id }),
]);

ctx.commands.despawn("enemy.3", { recursive: true });
ctx.commands.add("enemy.3", Burning({ duration: 2 }));
ctx.commands.remove("enemy.3", Frozen);
```

Rules:

- Commands apply at schedule boundaries.
- Command validation happens before mutation.
- Spawned entities need stable IDs or a declared generated-ID policy.
- Despawn must declare child behavior: `recursive`, `detach`, or `reject`.
- Commands should be serializable for diagnostics and replay tests.

## Script Host Options

The script host is adapter-private. The SDK and IR must not depend on a specific
JavaScript engine.

Candidate order:

1. V1/V2 foundation: no native script host. TS authors static IR and web
   gameplay scripts.
2. V2/V3 gate: scripts run in web runtime; native uses static IR and built-in
   fixture systems only.
3. V4: spike QuickJS-ng-style embedding for one movement or combat system.
4. V5+: optimize hot paths or allow engine-owned Rust systems.

Evaluation criteria:

- iOS and Android viability
- binary size
- startup time
- call overhead
- ability to sandbox capabilities
- source maps and diagnostics
- memory behavior under mobile constraints
- ease of binding plain JSON-like data
- parity between web JavaScript output and native QuickJS output for the same ECS
  snapshots, resources, events, and input stream

## QuickJS Native Backend

The native backend should preserve the public TypeScript API by running the same
compiled JavaScript system bundle used by web preview. QuickJS-ng is the first
native-host spike candidate because it is small, embeddable, cross-platform
focused, and keeps JavaScript semantics closer to the browser path.

```txt
User TypeScript system
  -> TypeScript typecheck
  -> ThreeNative portable-script diagnostics
  -> systems.ir.json
  -> scripts.bundle.js
  -> browser JavaScript for web
  -> embedded QuickJS-ng for Bevy native
```

The QuickJS host should expose only the same portable system context as the web
runtime. It must not expose Node, DOM, filesystem, networking, timers, workers,
Bevy entities, Bevy resources, renderer handles, platform APIs, or the QuickJS
standard library. The native adapter should embed the core engine and register
only ThreeNative host functions.

The first spike should prove:

- one movement or combat system runs from `scripts.bundle.js` in QuickJS
- Rust can load the JS bundle and call the exported system
- component snapshots and returned patches round-trip through the QuickJS host
- web JS execution and native QuickJS execution produce equivalent patch logs for
  a fixed input trace
- diagnostics can point back to TypeScript source or to the declared system ID
- unsupported TS/JS features fail at build time with stable diagnostics

Rust should call JavaScript once per system with a batch query snapshot, not
once per entity. Script output should be a serializable patch, event, command,
and service-call log that Rust validates before mutation.

Lua or Luau may be revisited later for mods, user-generated content, or a
separate alternate backend if QuickJS creates a hard blocker. That future path
would require a stricter PortableScript subset and golden patch-log parity tests
because Lua lowering can diverge from JavaScript semantics.

## Scheduling

Portable stages:

- `fixedUpdate`
- `update`
- `postUpdate`

Adapter-owned input collection, physics, animation, render extraction, render,
cleanup, and platform lifecycle stages are not V2 user-script stages.

Systems in the same stage may run in parallel only when their declared read/write
sets do not conflict. Initial implementations can run systems serially while
still requiring metadata so the contract is future-proof.

## Determinism

Gameplay systems should be deterministic for the same input stream and initial
world state where practical.

Rules:

- Use `ctx.time.dt` and `ctx.time.fixedDt`, not wall-clock APIs.
- Use runtime-provided random resources when randomness matters.
- Do not depend on default query iteration order.
- Do not mutate module-level hidden state unless it is declared as a resource.
- Do not perform implicit I/O from systems.

## Hot Reload

Script hot reload should be phased:

1. Full runtime restart after script changes.
2. Reload scripts while resetting system-local state.
3. Preserve compatible resources/components across script reload.
4. Preserve declared system-local state with versioned schemas.

The runtime should refuse state-preserving reload when component schemas, system
read/write sets, or command permissions change incompatibly.

## Native Rust Escape Hatch

Some behavior should eventually run as native Rust:

- physics integration
- animation evaluation
- pathfinding or navigation
- particle simulation
- expensive AI routines
- platform lifecycle
- rendering and asset streaming

Native systems must still respect the same component/resource schemas when they
operate on public SDK data. They are implementation optimizations, not a
different gameplay authoring model.

## MVP Scripting Scope

MVP scripting should support:

- `defineSystem`
- declared queries
- component reads/writes
- resource reads for time/input
- command buffer spawn/despawn/add/remove
- simple event emit/read
- web execution
- one native JS-host proof for movement or combat

MVP scripting should not support:

- arbitrary npm packages inside native runtime
- async network/file APIs
- DOM access
- direct Bevy access
- threads/workers
- user-defined native plugins
- TS-to-Rust compilation
