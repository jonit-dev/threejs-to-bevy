# Portable Scripting APIs

> Status: Future-facing design for V4 native scripting and later gameplay
> systems. Not part of the V3 release gate unless explicitly referenced by the
> V3 completion checklist.

This document sketches the TypeScript gameplay APIs that should sit on top of
the scripting model in [scripting.md](scripting.md). These APIs should feel like
direct engine APIs, but they must lower to portable ECS reads, patches, events,
commands, and service calls.

The public rule:

```txt
User code calls TypeScript APIs.
Web implements them directly in JavaScript.
Native runs the same JavaScript bundle in QuickJS and calls Rust-owned services.
No script receives raw Three.js, Bevy, renderer, filesystem, or platform handles.
```

## API Shape

Gameplay systems should receive a typed context:

```ts
export const playerMovement = defineSystem({
  id: "playerMovement",
  stage: "fixedUpdate",
  query: {
    with: [PlayerController, Transform, RigidBody],
    without: [Disabled],
  },
  reads: [PlayerController, Transform, Input, Time],
  writes: [Transform, RigidBody],
  services: ["physics.raycast", "animation.play"],
  events: {
    reads: [],
    writes: [FootstepEvent],
  },
  commands: ["spawn", "despawn", "addComponent", "removeComponent"],
}, (ctx) => {
  for (const entity of ctx.query()) {
    const controller = entity.get(PlayerController);
    const transform = entity.get(Transform);
    const moveX = ctx.input.axis("moveX");
    const moveZ = ctx.input.axis("moveZ");

    const next = [
      transform.position[0] + moveX * controller.speed * ctx.time.fixedDt,
      transform.position[1],
      transform.position[2] + moveZ * controller.speed * ctx.time.fixedDt,
    ] as Vec3;

    const ground = ctx.physics.raycast({
      origin: [next[0], next[1] + 1, next[2]],
      direction: [0, -1, 0],
      maxDistance: 2,
      layers: ["world"],
    });

    if (ground.hit) {
      entity.patch(Transform, { position: [next[0], ground.point[1], next[2]] });
      ctx.animation.play(entity, "run", { fadeSeconds: 0.1 });
    }
  }
});
```

This feels like engine scripting, but every capability is declared up front and
validated against `systems.ir.json`.

## Context Fields

| Field | Purpose | Runtime Contract |
| --- | --- | --- |
| `ctx.query()` | Iterates matching entities. | Returns stable entity IDs and declared component snapshots only. |
| `ctx.time` | Fixed and variable timestep data. | Runtime-provided resource; no wall-clock access from scripts. |
| `ctx.input` | Logical actions and axes. | Reads `input.ir.json` mappings and current input state. |
| `ctx.events` | Reads and emits typed events. | Event schemas are declared and queues are runtime-owned. |
| `ctx.commands` | Structural world changes. | Commands flush at schedule boundaries after validation. |
| `ctx.physics` | Controlled physics queries and body commands. | Runtime service facade; no Rapier or Bevy physics handles. |
| `ctx.animation` | Playback commands and simple state queries. | Runtime service facade; animation graph state is runtime-owned. |
| `ctx.audio` | One-shot and looping audio commands. | Runtime service facade; audio handles stay adapter-private. |
| `ctx.assets` | Stable asset lookup by ID. | Returns IDs and metadata, not renderer or native handles. |

## Entity API

Entities are stable script-facing IDs with component accessors:

```ts
const transform = entity.get(Transform);
entity.patch(Transform, { position: [1, 0, 0] });
entity.set(Health, { current: 80, max: 100 });
entity.has(Enemy);
```

Rules:

- `get` is allowed only for declared query/read components.
- `patch` and `set` are allowed only for declared writes.
- Component values are plain structured data.
- Entity identity is a stable string, not a Bevy `Entity` or Three.js object.

## Commands

Structural mutation goes through a command buffer:

```ts
ctx.commands.spawn("projectile.42", [
  Transform.from({ position: muzzle }),
  Velocity({ value: [0, 0, -20] }),
  Projectile({ owner: entity.id }),
]);

ctx.commands.despawn("enemy.3", { recursive: true });
ctx.commands.addComponent("enemy.3", Burning({ duration: 2 }));
ctx.commands.removeComponent("enemy.3", Frozen);
```

Commands lower to serializable IR-level operations:

```json
{
  "kind": "spawn",
  "entity": "projectile.42",
  "components": {
    "Transform": { "position": [0, 1, 0] },
    "Velocity": { "value": [0, 0, -20] }
  }
}
```

## Physics API

Physics APIs should expose game-engine conveniences without exposing the physics
backend:

```ts
const hit = ctx.physics.raycast({
  origin: [0, 2, 0],
  direction: [0, -1, 0],
  maxDistance: 5,
  layers: ["world"],
  ignore: [entity.id],
});

if (hit.hit) {
  ctx.events.emit(FootstepEvent, {
    entity: entity.id,
    surface: hit.material,
    position: hit.point,
  });
}

ctx.physics.setLinearVelocity(entity, [0, 0, 4]);
ctx.physics.applyImpulse(entity, [0, 3, 0]);
```

Return values must be plain data:

```ts
type RaycastHit =
  | { hit: false }
  | {
      hit: true;
      entity: EntityId;
      point: Vec3;
      normal: Vec3;
      distance: number;
      material?: string;
    };
```

Rules:

- Query APIs are declared as service permissions such as `physics.raycast`.
- Body mutation APIs lower to commands or component patches.
- Backend-specific concepts such as Rapier handles or Bevy components are not
  script-visible.

## Animation API

Animation should be commanded by stable clip and state IDs:

```ts
ctx.animation.play(entity, "run", {
  fadeSeconds: 0.12,
  speed: 1.0,
  loop: true,
});

ctx.animation.stop(entity, "run", { fadeSeconds: 0.08 });

const state = ctx.animation.state(entity);
if (state.current === "idle") {
  ctx.animation.play(entity, "attack", { restart: true });
}
```

Runtime effects:

- Web maps commands to Three.js animation mixers or a portable animation runner.
- Native maps commands to Bevy animation state.
- Scripts see only stable clip IDs, state names, booleans, numbers, and plain
  data.

## Events

Events are typed transient data:

```ts
ctx.events.emit(DamageEvent, {
  target: enemy.id,
  source: player.id,
  amount: 10,
});

for (const event of ctx.events.read(CollisionEvent)) {
  if (event.a === player.id || event.b === player.id) {
    ctx.events.emit(PlayerHitEvent, { player: player.id });
  }
}
```

Rules:

- Systems may read only declared event queues.
- Systems may emit only declared event types.
- Events reference entities and assets by stable IDs.
- Durable state belongs in components or resources, not events.

## Native QuickJS Host

The TypeScript source and emitted JavaScript bundle are the authoring and
execution source of truth. Native QuickJS hosting is an implementation detail:

```txt
ctx.physics.raycast(...)
  web: call JavaScript runtime service
  native: QuickJS calls host function, Rust executes service, JS receives plain object
```

The native host should log service calls and returned patches in a canonical
shape so conformance can compare browser JavaScript and native QuickJS behavior.

## Validation

Portable systems should fail at build time when they use unsupported APIs:

- direct DOM, browser, Three.js, Bevy, filesystem, network, worker, or platform
  APIs
- undeclared component writes
- undeclared commands or service calls
- undeclared event emissions
- unrestricted async/promise behavior
- hidden mutable module state that is not modeled as a resource
- arbitrary npm dependencies or JS built-ins that are not available in the
  native QuickJS sandbox

The compiler should prefer stable diagnostics with a code, severity, source
location or system ID, and suggested portable replacement.
