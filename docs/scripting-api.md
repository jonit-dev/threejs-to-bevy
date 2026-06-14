# Portable Scripting APIs

> Status: V4-supported for the primitive portable scripting MVP verified by
> `pnpm verify:v4`. V5 additionally verifies the `defineGame`/`v5-game-starter`
> authoring path through `pnpm verify:v5`; that path is SDK composition over
> existing portable scene, world, input, runtime config, and system contracts,
> not a new script runtime surface.

This document tracks the TypeScript gameplay APIs that sit on top of the
scripting model in [scripting.md](scripting.md). V4 is the completed primitive
portable scripting baseline. V5 adds required game-authoring ergonomics through
`defineGame` and `v5-game-starter`, but broader scripting APIs should still be
promoted only when they preserve portable ECS reads, patches, events, commands,
and service calls.

The public rule:

```txt
User code calls TypeScript APIs.
Web implements them directly in JavaScript.
Native runs the same JavaScript bundle in QuickJS and calls Rust-owned services.
No script receives raw Three.js, Bevy, renderer, filesystem, or platform handles.
```

## V4 Completed Proof Scene

V4 proved the scripting APIs with a small primitive scene, not the V3 forest.
The scene is deterministic and easy to inspect:

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

The primitive scene is driven by the same `scripts.bundle.js` in web
JavaScript and native QuickJS.

The goal was not visual richness. The completed V4 proof shows that authored
TypeScript systems can run through both runtimes and produce the same validated
ECS effects.

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

V4 narrowly implements `ctx.animation` and `ctx.physics` as service-shape proof
points. The proof logs service calls and validates host response shape, but it
does not make V4 a full animation or physics milestone.

## V4 Minimal Components And Events

The primitive proof scene uses only a small data vocabulary:

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

## V5 Game Authoring Ergonomics

V5 makes the SDK easier to start with by adding a game-root composition path,
not by giving scripts direct renderer or native handles.

Supported V5 authoring ergonomics:

| API | V5 Contract | Runtime Meaning |
| --- | --- | --- |
| `defineGame({ scene, world, input, runtimeConfig })` | Compose existing portable declarations into one captured root. | Lowers through the existing `Scene`/`World`/input/runtime-config bundle paths. |
| `defineControls({ movement, actions })` | Build portable input maps from narrow WASD, optional gamepad, and action-button recipes. | Lowers through the existing input map contract. |
| `primitiveActorPrefab(...)` | Create a renderable primitive actor plus deterministic ECS component declarations. | Lowers through existing `Mesh`, `World.spawn`, and component declaration paths. |
| `modelActorPrefab(...)` | Create deterministic model actor metadata. | Records model asset metadata only; it does not add runtime model loading. |
| `tn create --template v5-game-starter` | Scaffold a small playable starter that uses the V5 helper path. | The V5 gate creates, builds, and validates the starter as release evidence. |

Rules:

- V5 helpers are authoring sugar over existing portable contracts.
- The starter may use V4-supported systems and V5-promoted visual contracts, but
  it must not imply unrestricted gameplay scripting.
- Native behavior is claimed only for the emitted existing contracts that have
  conformance and Rust evidence.
- Unsupported editor, networking, raw Three.js, runtime plugin, custom renderer,
  filesystem, DOM, and platform access remains invalid.

## Missing Or Post-V4 API Inventory

Keep this list close to the scripting API so implementation tickets can promote
items deliberately. Starting in V5, promoted APIs must be demonstrated in a
functional 3D scene when the behavior has visible output, interaction, or
runtime state. Use `assets-source/environment` assets where they reasonably
show the feature.

| API Area | Starting Version | Status | Notes |
| --- | --- | --- | --- |
| Query sorting and stable iteration order | V5 | Missing | Add explicit stable ordering so visual and native conformance fixtures do not rely on incidental entity order. |
| Changed-query filters | V5 | Missing | Useful for optimization and harness-scale regression fixtures. |
| System ordering constraints | V5 | Partial design | Tighten stage ordering into explicit fixture-backed behavior before broader gameplay APIs depend on it. |
| Bulk query snapshots/pagination | V5 | Missing | Important for dense 3D scenes, particles, and large environment fixtures. |
| Random resource | V5 | Missing | Add deterministic seeded randomness only when visual scenes can replay the same scatter/gameplay result. |
| Timers/cooldowns helpers | V5 | Missing | Promote as deterministic helpers over component state such as `Lifetime`. |
| Collision events from physics backend | V5 | Missing | Promote only with web and Bevy fixture parity; V4 proved raycast service shape, not full collision events. |
| Shape casts and overlap queries | V5 | Missing | Advanced 3D content quality candidate; requires target-gated service declarations and Rust tests. |
| Character controller API | V5 | Missing | Candidate for 3D movement quality; must be visible in a functional scene and backed by native tests if claiming Bevy support. |
| Game root composition | V5 | Implemented | `defineGame` composes existing portable scene/world/input/runtime config declarations; it is not a new runtime contract. |
| Game starter template | V5 | Implemented | `v5-game-starter` is release-gated through `verify:v5` as a small playable SDK ergonomics proof. |
| Full animation blending/state machine | V5 | Missing | Candidate for visual quality; V4 only proved command shape such as `animation.play`. |
| Particle commands | V5 | Missing | Candidate only when particles are represented by portable scene/runtime data and visual verification artifacts. |
| Resources write API | V5 or later | Missing | Requires deterministic scheduling and conformance coverage before broad gameplay use. |
| System-local persisted state | V5 or later | Missing | Prefer resources/components first; state-preserving hot reload remains later. |
| Runtime prefab instantiation | V6 or later | Missing | V5 authoring-time prefab helpers expand to existing declarations; runtime instantiation remains future scope. |
| Child hierarchy commands | V5 or V6 | Missing | Needs scene-visible proof and deterministic command application across web and Bevy. |
| Audio commands | V5 or later | Design only | Promote only with a maintained scene or gameplay fixture that needs audible runtime behavior. |
| UI commands/focus/input | V6 or later | Design only | Better aligned with editor/inspector and online workflows unless a V5 visual-quality scene requires a narrow HUD. |
| Asset lookup from script | V5 | Missing | Scripts may reference stable asset IDs and metadata; no arbitrary runtime file loading. |
| Runtime asset loading from script | V6 or later | Unsupported | Requires service boundaries and offline fallback behavior. |
| Async/await in systems | V6 or later | Unsupported | Avoid until scheduler, determinism, and QuickJS behavior are specified. |
| Network/file/platform APIs | V6 or later | Unsupported | Network belongs to V6 service boundaries; file/platform access should remain outside portable systems. |
| Arbitrary npm dependencies | Later | Unsupported | Native QuickJS sandbox cannot assume them. |
| Direct Three.js/Bevy access | Never portable | Unsupported | Use portable context and service facades only. |

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
| `ctx.resources` | Reads and writes declared singleton world state. | Reads are cloned snapshots; writes are queued effects and apply only after `resourceWrites` validation. |
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

## Resources

Resources are typed singleton world state:

```ts
const score = ctx.resources.get("Score");
ctx.resources.set("Score", { value: score.value + 1 });
```

Rules:

- Systems may write only resources listed in `resourceWrites`.
- Web resource writes are queued as runtime effects, validated before mutation,
  and recorded in the canonical system effect log.
- Resource reads return cloned snapshots; systems should not rely on mutating a
  returned object.
- Native resource write parity is V6 runtime work and must be proven with Bevy
  QuickJS evidence before release.

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
