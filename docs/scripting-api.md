# Portable Scripting APIs

> Status: V4-supported only for the primitive portable scripting MVP verified
> by `pnpm verify:v4`. Broader gameplay APIs in this document remain design
> direction until promoted by a later PRD.

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

## V4 MVP Proof Scene

V4 should prove the scripting APIs with a small primitive scene, not the V3
forest. The scene should be deterministic and easy to inspect:

- rotating cubes driven by `ctx.time`
- one moving platform or target that patches `Transform`
- keyboard or scripted input that changes movement direction
- one spawned primitive entity, such as a projectile or marker cube
- one despawn or component removal command
- one typed event emitted by one system and consumed by another
- one simple engine-service call, such as an animation command or physics
  raycast against a primitive floor
- identical web JavaScript and native QuickJS patch/event/command logs for a
  fixed input trace

The primitive scene must be driven by the same `scripts.bundle.js` in web
JavaScript and native QuickJS.

The goal is not visual richness. The goal is to prove that authored TypeScript
systems can run through both runtimes and produce the same validated ECS
effects.

## V4 MVP API Surface

Only the APIs in this section are V4-supported, and only for the primitive demo
trace that compares web JavaScript and native QuickJS patch/event/command and
service logs through `verify:v4`. Everything else in this document is design
direction until promoted by a PRD.

| API | V4 Need | Proof In Primitive Scene |
| --- | --- | --- |
| `defineSystem(config, run)` | Register portable systems with declared access. | All scripted behavior is declared through systems. |
| `ctx.query()` | Iterate matching entity snapshots. | Rotate all `Rotator` cubes and move one platform. |
| `entity.id` | Stable entity identity. | Event payloads and commands reference entities by ID. |
| `entity.get(Component)` | Read declared component data. | Read `Transform`, `Rotator`, `Velocity`, or `Health`. |
| `entity.patch(Component, partial)` | Emit component patches. | Update `Transform.rotation` and `Transform.position`. |
| `entity.set(Component, value)` | Replace declared component data. | Reset a marker or health component. |
| `entity.has(ComponentOrTag)` | Check marker/tag presence. | Skip disabled cubes or identify targets. |
| `ctx.time.dt` | Variable timestep. | Smooth rotation or visual-only movement. |
| `ctx.time.fixedDt` | Deterministic fixed timestep. | Golden patch-log movement fixture. |
| `ctx.input.axis(name)` | Read logical axis value. | Move a cube or platform on `moveX`. |
| `ctx.input.action(name)` | Read logical button/action state. | Spawn marker/projectile on `fire`. |
| `ctx.events.emit(Event, payload)` | Emit typed transient data. | Emit `HitEvent` or `ReachedMarkerEvent`. |
| `ctx.events.read(Event)` | Consume typed events. | A second system flashes, moves, or despawns a target. |
| `ctx.commands.spawn(id, components)` | Add entities at schedule boundary. | Spawn a projectile or marker cube. |
| `ctx.commands.despawn(id, policy)` | Remove entities at schedule boundary. | Despawn projectile/marker after an event. |
| `ctx.commands.addComponent(id, component)` | Add marker/data component. | Mark a cube as `Activated`. |
| `ctx.commands.removeComponent(id, Component)` | Remove marker/data component. | Clear `Activated` or `Disabled`. |
| `ctx.animation.play(entity, clip, options)` | Prove engine service command shape. | Start a simple named transform animation or mocked clip command. |
| `ctx.physics.raycast(options)` | Prove host query service shape. | Raycast from a cube to a primitive floor or target. |

V4 may stub or narrowly implement `ctx.animation` and `ctx.physics` if the
proof logs service calls and validates the host response shape. V4 must not
turn into a full animation or physics milestone.

## V4 Minimal Components And Events

The primitive proof scene should need only a small data vocabulary:

```ts
type Transform = {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
};

type Rotator = {
  axis: Vec3;
  radiansPerSecond: number;
};

type Velocity = {
  value: Vec3;
};

type Lifetime = {
  remainingSeconds: number;
};

type HitEvent = {
  source: EntityId;
  target: EntityId;
  point?: Vec3;
};
```

Use marker components or tags for `Player`, `Target`, `Projectile`,
`Activated`, and `Disabled`.

## Missing Or Post-V4 API Inventory

Keep this list close to the scripting API so implementation tickets can promote
items deliberately.

| API Area | Status | Notes |
| --- | --- | --- |
| Query sorting and stable iteration order | Missing | V4 should not rely on implicit order. Add explicit sort later. |
| Changed-query filters | Missing | Useful for optimization, not needed for V4 proof. |
| System ordering constraints | Partial design | V4 can use stage order and fixed fixture ordering. |
| System-local persisted state | Missing | Use resources/components in V4; state-preserving hot reload is later. |
| Resources write API | Missing | V4 can read time/input and mutate components/events/commands only. |
| Random resource | Missing | Needed for deterministic gameplay later; avoid randomness in V4 proof. |
| Timers/cooldowns helpers | Missing | Can be modeled with `Lifetime` component in V4. |
| Prefab instantiation | Missing | Use `commands.spawn` with explicit components in V4. |
| Child hierarchy commands | Missing | Spawn flat primitive entities in V4. |
| Bulk query snapshots/pagination | Missing | Important for performance later; V4 scene should stay small. |
| Collision events from physics backend | Missing | V4 may use raycast/service proof, not full physics collision. |
| Shape casts and overlap queries | Missing | Post-V4 physics API expansion. |
| Character controller API | Missing | Post-V4. |
| Full animation blending/state machine | Missing | V4 only proves command shape such as `animation.play`. |
| Audio commands | Design only | Post-V4 unless a ticket pulls in one-shot command proof. |
| UI commands/focus/input | Design only | Post-V4 portable UI milestone. |
| Asset loading from script | Missing | Scripts may reference stable asset IDs only; no runtime loading in V4. |
| Async/await in systems | Unsupported | Avoid until scheduler, determinism, and QuickJS behavior are specified. |
| Network/file/platform APIs | Unsupported | Must remain outside portable systems. |
| Arbitrary npm dependencies | Unsupported | Native QuickJS sandbox cannot assume them. |
| Direct Three.js/Bevy access | Unsupported | Use portable context and service facades only. |

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
