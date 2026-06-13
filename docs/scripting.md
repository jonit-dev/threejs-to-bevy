# Scripting Model

TypeScript is the primary gameplay scripting language, but TypeScript scripts do
not compile into Rust systems in V1. Rust and Bevy own the native engine. TS
systems run as hosted scripts against a constrained ECS API and return component
patches, events, and commands that the native runtime validates and applies.

The core rule:

```txt
TypeScript authors behavior.
Rust owns execution authority.
The ECS/IR boundary defines what can cross.
```

## Chosen Direction

Use TypeScript ECS systems as the public scripting model.

Do not start with:

- arbitrary JavaScript running inside Bevy
- JavaScript-to-Rust transpilation
- user-authored Bevy Rust
- Lua/Luau as the primary gameplay language
- direct JS access to Bevy `World`, `Entity`, `Commands`, or renderer internals

The runtime shape is:

```txt
systems.ir.json
  declares system IDs, schedules, queries, reads, writes, resources, events

scripts.bundle.js
  contains compiled TypeScript system exports

runtime-bevy
  hosts JS, marshals declared ECS data, applies returned patches/commands
```

## Native Execution Loop

The Bevy adapter should execute TS systems like this:

```txt
Bevy schedule stage starts
  -> collect matching entities/components for declared query
  -> copy or proxy allowed component/resource data into script host
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
JS output:
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

Allowed data crossing into JS:

- component snapshots for declared query results
- declared resources such as `Time`, `Input`, target profile, and game state
- entity IDs as stable strings
- asset IDs and handles represented as stable IDs
- event queues exposed through typed APIs

Allowed data crossing back to Rust:

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

1. Phase 0: no native script host. TS only authors static IR.
2. Phase 1: scripts run in web runtime; native uses static IR and built-in
   fixture systems only.
3. Phase 2: spike QuickJS-style embedding for one movement system.
4. Phase 2: compare one alternative, likely JavaScriptCore or V8/deno_core,
   against mobile size, startup, bindings, and performance.
5. Phase 3+: optimize hot paths or allow engine-owned Rust systems.

Evaluation criteria:

- iOS and Android viability
- binary size
- startup time
- call overhead
- ability to sandbox capabilities
- source maps and diagnostics
- memory behavior under mobile constraints
- ease of binding plain JSON-like data

## Scheduling

Portable stages:

- `startup`
- `preUpdate`
- `input`
- `fixedUpdate`
- `update`
- `physics`
- `animation`
- `postUpdate`

Adapter-owned stages such as Bevy render extraction are not user-script stages.

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
