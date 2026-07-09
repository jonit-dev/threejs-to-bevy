# Portable Scripting APIs

> Status: V4 established the primitive portable scripting MVP. Later promoted
> gates add game-root authoring, richer fixed-trace host services, animation
> controls, sensors, navigation, scene lifecycle effects, runtime gameplay host
> semantics, UI/persistence/settings facades, and persistence/reload evidence.
> The current maintained evidence is the capability/release gate set
> (`pnpm verify:conformance`,
> `pnpm verify:runtime-gameplay-host`, `pnpm verify:persistence-reload`, and
> `pnpm verify:release`), while legacy `verify:v*` commands remain historical
> aliases or focused milestone proofs.

This document tracks the TypeScript gameplay APIs that sit on top of the
scripting model in [scripting.md](scripting.md). V4 is the completed primitive
portable scripting baseline. Later gates add required game-authoring ergonomics
and bounded runtime-host features, but broader scripting APIs should still be
promoted only when they preserve portable ECS reads, patches, events, commands,
service calls, and deterministic web/native observations.

The public rule:

```txt
User code calls TypeScript APIs.
Web implements them directly in JavaScript.
Native runs the same JavaScript bundle in QuickJS and calls Rust-owned services.
No script receives raw Three.js, Bevy, renderer, filesystem, or platform handles.
```

## Status Legend

| Status | Meaning |
| --- | --- |
| [x] Implemented | Works across the SDK/IR, web runtime, and Bevy QuickJS where claimed. |
| [ ] Partial | Some contract or evidence exists, but the behavior is intentionally narrow or not fully aligned. |
| [ ] Missing | Not implemented as a portable scripting API in this repo. |
| [ ] Design only | Directional design, not a supported runtime contract. |
| [ ] Unsupported | Intentionally rejected or not portable. |

## Portable Scripting Checklist

This checklist is the implementation tracker for portable scripting APIs. A
checked item is promoted only for the version scope and runtime behavior named
in the item; unchecked items remain future-facing, partial, design-only, or
unsupported.

### Core Systems, Queries, and Entities

- [x] `defineSystem(config, run)` portable system registration.
- [x] Declared system stages: `startup`, `fixedUpdate`, `update`, and
  `postUpdate`.
- [x] Deterministic same-stage system ordering with `before`/`after`
  constraints and system-name tie breaks.
- [x] Query snapshots through `ctx.query()`.
- [x] Entity lookup helpers through `ctx.entity(id)` and
  `ctx.entities.byId({ key: id })`; missing IDs return `undefined`.
- [x] Stable entity identity through `entity.id`.
- [x] Component reads through `entity.get(Component)`.
- [x] Component reads with shallow default hydration through
  `entity.get(Component, defaults)`. Defaults are copied first and stored
  component fields override matching keys.
- [x] Component patches through `entity.patch(Component, partial)`.
  Patches are shallow merges over the live component value on both web and
  Bevy hosts.
- [x] Component replacement through `entity.set(Component, value)`.
- [x] Transform facade reads/writes through `entity.transform()`, including
  `positionOr`, `yawOr`, `setPosition`, `setRotation`, and `setPose`.
  Transform facade writes lower to normal `Transform` patches and use the
  existing component write validators.
- [x] Marker/tag checks through `entity.has(ComponentOrTag)`.
- [x] Query sorting by entity ID with `orderBy: "id"`.
- [x] Query pagination with deterministic `offset` and `limit` windows.
- [x] Changed-query filters from explicit fixed-trace change metadata.
- [x] Hidden runtime diffing for changed queries through schedule-stage
  component snapshots.

### Time, Input, Randomness, and Timers

- [x] Variable timestep reads through `ctx.time.dt`.
- [x] Unity-aligned variable timestep aliases through `ctx.time.deltaTime`
  and `ctx.time.time` for elapsed runtime seconds.
- [x] Fixed timestep reads through `ctx.time.fixedDt`.
- [x] Unity-aligned fixed timestep alias through `ctx.time.fixedDeltaTime`.
- [x] Clamped fixed timestep helper through
  `ctx.time.fixedDelta({ fallback, min, max })`.
- [x] Logical input axes through `ctx.input.axis(name)`.
- [x] Unity-aligned axis reads through `ctx.input.getAxis(name)` and 2D reads
  through `ctx.input.getAxis2(xAxis, yAxis, { deadzone?, normalize? })`.
- [x] Normalized one-axis helper through
  `ctx.input.axis1(axis, { negative, positive })`.
- [x] Logical input actions through `ctx.input.action(name)`.
- [x] Logical input edge reads through `ctx.input.pressed(name)` and
  `ctx.input.released(name)` where the runtime host exposes captured input
  transitions.
- [x] Unity-aligned button aliases through `ctx.input.getButton(name)`,
  `ctx.input.getButtonDown(name)`, and `ctx.input.getButtonUp(name)`.
- [x] Deterministic seeded random helpers through
  `ctx.random.float/range/int/bool/pick`.
- [x] Deterministic timer/cooldown helpers through
  `ctx.timers.elapsed/remaining/progress/done/ready`.
- [x] Bounded fixed-tick delayed command scheduling through
  `ctx.schedule.afterTicks({ id, delayTicks })` and declared
  `delayedCommands` metadata.
- [ ] Unsupported wall-clock timer scheduling inside portable systems.
- [ ] Unsupported platform RNG access inside portable systems.

### Pure Script Helper Imports

Scripts may import promoted pure helpers by named import from
`@threenative/script-stdlib`. The compiler records these helper imports in
script provenance and rejects default, namespace, relative, host, or backend
imports.

- [x] Gameplay math and data helpers: `Mathf`, `AngleEx`, `Vector2`, `Vector3`,
  `Quat`, `TransformMath`, `Bounds2`, `Bounds3`, `ColorEx`, `Ease`, `TextEx`,
  `InputEx`, `MotionEx`, `TimerEx`, `ArrayEx`, `CameraMath`, and `RandomEx`.
  Legacy aliases `NumberEx`, `Vec2`, and `Vec3` remain supported.
- [x] GameBlocks-informed pure gameplay helpers: `BasisEx`,
  `ControllerEx`, `CheckpointRaceEx`, and `SpawnEx`.
- [x] Promoted reducer-kit helper imports:
  `@threenative/collector-kit`, `@threenative/lane-runner-kit`, and
  `@threenative/checkpoint-race-kit`.
- [ ] Unsupported helper imports that expose Three.js, Rapier, Bevy, DOM,
  localStorage, filesystem, worker, timer, renderer, or native runtime handles.

### Resources, Events, Commands, and Lifecycle

- [x] Typed event emission through `ctx.events.emit(Event, payload)`.
- [x] Typed event reads through `ctx.events.read(Event)`.
- [x] Resource reads through `ctx.resources.get(name)`.
- [x] Resource reads with shallow default hydration through
  `ctx.resources.get(name, defaults)`.
- [x] Resource writes through `ctx.resources.set(name, value)`.
- [x] Resource patches through `ctx.resources.patch(name, partial)`. Patches
  are shallow merges over the live resource value and require the same
  `resourceWrites` declaration as `set`.
- [x] Shallow resource-state facade through `ctx.state(name, defaults)`.
  Assigning top-level fields queues a normal resource write, so existing
  `resourceWrites` validation still applies.
- [x] Command-buffer entity spawn through `ctx.commands.spawn(id, components)`.
- [x] Command-buffer entity despawn through `ctx.commands.despawn(id, policy)`.
- [x] Command-buffer component add through
  `ctx.commands.addComponent(id, component)`.
- [x] Command-buffer component removal through
  `ctx.commands.removeComponent(id, Component)`.
- [x] Command-buffer component replacement through
  `ctx.commands.setComponent(id, Component, value)`.
- [x] Command-buffer event emission through
  `ctx.commands.emitEvent(Event, payload)`.
- [x] Fixed-trace replay and hot-reload invalidation metadata.
- [x] Resource-derived app states, computed states, and substates through
  `ctx.states.get(id)`.
- [x] Component reflection and hook observations through
  `ctx.components.types/type/hooks`.
- [x] Target-to-ancestor observer propagation through
  `ctx.observers.propagate(event, target)`.
- [x] Fixed-trace task metadata and event-backed channels through
  `ctx.tasks.*` and `ctx.channels.*`.
- [x] Plugin and plugin-group declaration metadata through `ctx.plugins.*`.
- [x] Runtime gameplay host evidence for live entity reconciliation,
  event-windowing, state handoff, command-time/removal hooks, bounded
  timer/channel behavior, and stoppable observer propagation.
- [x] State-preserving hot reload policy and persistence/reload evidence.

### Services

- [x] Animation command shape through `ctx.animation.play(entity, clip, options)`.
- [x] Animation state reads and stop commands through
  `ctx.animation.query(entity, clip?)` and
  `ctx.animation.stop(entity, clip?)`.
- [x] Primitive raycast service through `ctx.physics.raycast(options)`.
- [x] Primitive overlap query service through `ctx.physics.overlap(options)`.
- [x] Primitive shape-cast query service through
  `ctx.physics.shapeCast(options)`.
- [x] Primitive sensor snapshots through `ctx.physics.sensor(options)`.
- [x] Narrow fixed-trace character movement through
  `ctx.character.move(entity, options)`.
- [x] Static navigation path queries through `ctx.navigation.path(options)`.
- [x] Pointer ray generation through `ctx.picking.pointerRay(options)`.
- [x] Generated mesh bounds picking through `ctx.picking.mesh(options)`.
- [x] Asset manifest lookup through `ctx.assets.get(id)` and
  `ctx.assets.list()`.
- [x] Declared bundle-local asset load service through `ctx.assets.load(id)`.
- [x] Collision/trigger event phases for promoted primitive fixed traces.
- [x] Bounded animation blending/state-machine, marker, and particle evidence
  through promoted animation fixtures and runtime observations.
- [x] Script audio play/stop/query through `ctx.audio.play`, `ctx.audio.stop`,
  and `ctx.audio.query` against declared audio IR.
- [ ] Missing arbitrary particle commands beyond bounded portable emitter data.
- [x] UI action/focus/value/disabled/read script APIs through `ctx.ui.*`.
- [x] Persistence save/load/list/delete script APIs through
  `ctx.persistence.*`.
- [x] Settings get/set/export/import script APIs through `ctx.settings.*`.

### Authoring Ergonomics

- [x] `defineGame({ scene, world, input, runtimeConfig })` game-root
  composition.
- [x] `defineControls({ movement, actions })` portable input-map helper.
- [x] `primitiveActorPrefab(...)` primitive actor prefab helper.
- [x] `modelActorPrefab(...)` model actor metadata helper.
- [x] `tn create --template structured-source-starter` starter template.
- [x] `defineScene()`, `sceneTransition.*`, and
  `defineGame({ scenes, initialScene })` lifecycle scene composition.
- [x] `scriptLifecycle({ module, awake, fixedUpdate, update, lateUpdate })`
  authoring facade. The SDK and structured-source compiler lower lifecycle
  export names to ordinary `startup`, `fixedUpdate`, `update`, and
  `postUpdate` systems while preserving source module/export refs in
  `scripts.manifest.json`.
- [ ] Unsupported `scriptLifecycle` `onEnter`/`onExit` script hooks until they
  can lower to the promoted scene lifecycle contract. SDK declarations throw
  `TN_SDK_SCRIPT_LIFECYCLE_HOOK_UNSUPPORTED`; structured source reports
  `TN_AUTHORING_SCRIPT_LIFECYCLE_HOOK_UNSUPPORTED`.
- [x] ECS tags as queryable zero-field marker components.
- [x] Scene `Group` containers as hierarchy-only `SceneContainer` entities.
- [x] Runtime prefab instantiation through `ctx.commands.instantiate(...)`.
- [x] Child hierarchy commands through `ctx.commands.setParent(...)` and
  `ctx.commands.clearParent(...)`.

### Portable Helper Stdlib

- [x] Named imports from `@threenative/script-stdlib` are the supported way to
  share pure script helper code across `src/scripts/**/*.ts`.
- [x] Type-only `ScriptContext`, `ScriptEntity`, `ScriptVec3Tuple`,
  `ScriptQuatTuple`, and `ScriptTransformFacade` imports from
  `@threenative/script-stdlib` are supported for scripts. Type-only imports do
  not appear in `scripts.manifest.json` helper import metadata.
- [x] `Mathf.clamp(value, min, max)`,
  `Mathf.finite(value, fallback)`, and
  `Mathf.round(value, precision?)`.
- [x] `Vector3.from(value, fallback?)`, `Vector3.add/sub/scale/lerp`,
  `Vector3.normalize/cross`, `Vector3.distance2d(a, b)`, and
  `Vector3.round(value, precision?)`.
- [x] `Quat.fromYaw(yaw)`, `Quat.yaw(rotation, fallback?)`, and
  `Quat.lookAt(eye, target)`.
- [x] `TransformMath.position(value, fallback?)`,
  `TransformMath.yaw(rotation, fallback?)`, and
  `TransformMath.pose({ position, yaw })`.
- [x] Compiler script source resolution accepts the stdlib import path, bundles
  the helper declarations into `scripts.bundle.js`, and records helper import
  metadata in `scripts.manifest.json`.
- [ ] Missing arbitrary helper packages or local helper module graphs in
  portable scripts. Unsupported helper imports fail with
  `TN_SCRIPT_UNSUPPORTED_IMPORT`.

Use the stdlib for repeated math/transform glue in AI-authored gameplay
scripts. Do not copy local `clamp`, vector, quaternion, `lookAt`, or transform
parsing helpers into each script unless the helper is truly one-off and has no
supported stdlib equivalent.

### Optional Domain Kits

- [x] Named imports from `@threenative/racing-kit` are supported for opt-in,
  pure racing helpers. The initial surface exposes `Track2D` and
  `CheckpointRace`.
- [x] `Track2D.loop({ points, width })`, `track.contains2d(position)`, and
  `track.pointAtPhase(phase)` provide data-first 2D loop-track helpers.
- [x] `CheckpointRace.advance(state, position, checkpoints, options)` and
  `CheckpointRace.hud(state)` provide checkpoint/lap state helpers without
  adding racing concepts to `ISystemContext`.
- [x] Compiler script source resolution accepts the racing-kit import path,
  bundles helper declarations into `scripts.bundle.js`, and records helper
  import metadata in `scripts.manifest.json`.
- [x] Named imports from `@threenative/collector-kit`,
  `@threenative/lane-runner-kit`, and
  `@threenative/checkpoint-race-kit` are supported for promoted game velocity
  reducers. These expose `CollectorKit`, `LaneRunnerKit`, and
  `CheckpointRaceKit` as pure data reducers; scripts still own all runtime
  context access and source-backed state persistence.

Domain kits are opt-in packages. They must stay pure, deterministic, and
data-driven; engine APIs such as `ctx.input`, `ctx.entity`, resources, and
transform writes remain in the core script context.

The focused evidence gate for stdlib imports, optional racing-kit imports,
lifecycle lowering, the rally example, web playtest behavior, and the Bevy
context-helper bridge is `pnpm verify:scripting-helpers-lifecycle`.

### Intentionally Unsupported Or Non-Portable

- [ ] Unsupported direct Three.js, Bevy, renderer, DOM, filesystem, network,
  worker, or platform access.
- [ ] Unsupported arbitrary npm dependencies in portable scripts.
- [ ] Unsupported namespace, default, aliased, re-exported, relative, or
  arbitrary package helper imports in portable scripts; use named
  `@threenative/script-stdlib`, `@threenative/racing-kit`,
  `@threenative/collector-kit`, `@threenative/lane-runner-kit`, or
  `@threenative/checkpoint-race-kit` imports for promoted helpers.
- [ ] Unsupported unbounded async/await, promises, workers, and unrestricted
  async timers in systems; bounded fixed-trace tasks/channels and deterministic
  timer helpers are the portable subset.
- [ ] Unsupported runtime file/network asset loading, custom loaders, and raw
  runtime asset handles from scripts.
- [ ] Unsupported dynamic runtime plugin loading.
- [ ] Unsupported raw Bevy/renderer handles, workers, unbounded promises, and
  arbitrary platform timers; use fixed schedules, deterministic helpers, and
  declared services instead.

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

- [x] `defineSystem(config, run)` registers portable systems with declared
  access. The proof scene declares all scripted behavior through systems.
- [x] `ctx.query()` iterates matching entity snapshots. The proof scene rotates
  all `Rotator` cubes and moves one platform.
- [x] `entity.id` exposes stable entity identity. Event payloads and commands
  reference entities by ID.
- [x] `entity.get(Component)` reads declared component data such as `Transform`,
  `Rotator`, `Velocity`, or `Health`.
- [x] `entity.patch(Component, partial)` emits component patches for
  `Transform.rotation` and `Transform.position`.
- [x] `entity.set(Component, value)` replaces declared component data for marker
  or health resets.
- [x] `entity.has(ComponentOrTag)` checks marker/tag presence, such as
  `Disabled` or target tags.
- [x] `ctx.time.dt` provides variable timestep data for smooth rotation or
  visual-only movement.
- [x] `ctx.time.fixedDt` provides deterministic fixed timestep data for golden
  patch-log movement fixtures.
- [x] `ctx.input.axis(name)` reads logical axis values such as `moveX`.
- [x] `ctx.input.action(name)` reads logical action state such as `fire`.
- [x] `ctx.events.emit(Event, payload)` emits typed transient data.
- [x] `ctx.events.read(Event)` consumes typed events from another system.
- [x] `ctx.commands.spawn(id, components)` adds entities at schedule boundaries.
- [x] `ctx.commands.despawn(id, policy)` removes entities at schedule
  boundaries.
- [x] `ctx.commands.addComponent(id, component)` adds marker/data components.
- [x] `ctx.commands.removeComponent(id, Component)` removes marker/data
  components.
- [x] `ctx.animation.play(entity, clip, options)` proves the engine-service
  command shape.
- [x] `ctx.physics.raycast(options)` proves the host query service shape.
- [x] `ctx.picking.pointerRay(options)` generates portable camera rays from
  normalized pointer coordinates.
- [x] `ctx.picking.mesh(options)` queries generated mesh renderer bounds without
  exposing renderer handles.

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

- [x] `defineGame({ scene, world, input, runtimeConfig })` composes existing
  portable declarations into one captured root. It lowers through the existing
  `Scene`/`World`/input/runtime-config bundle paths.
- [x] `defineControls({ movement, actions })` builds portable input maps from
  narrow WASD, optional gamepad, and action-button recipes. It lowers through
  the existing input map contract.
- [x] `primitiveActorPrefab(...)` creates a renderable primitive actor plus
  deterministic ECS component declarations. It lowers through existing `Mesh`,
  `World.spawn`, and component declaration paths.
- [x] `modelActorPrefab(...)` creates deterministic model actor metadata. It
  records model asset metadata only; it does not add runtime model loading.
- [x] `tn create --template structured-source-starter` scaffolds a small
  structured-source starter. The V5 gate creates, builds, and validates the
  starter as release evidence.

Rules:

- V5 helpers are authoring sugar over existing portable contracts.
- The starter may use V4-supported systems and V5-promoted visual contracts, but
  it must not imply unrestricted gameplay scripting.
- Native behavior is claimed only for the emitted existing contracts that have
  conformance and Rust evidence.
- Unsupported editor, networking, raw Three.js, runtime plugin, custom renderer,
  filesystem, DOM, and platform access remains invalid.

## V6 Gameplay Schedule Contract

V6 promotes a small declared schedule vocabulary for portable systems:

| Stage | Intent | Ordering |
| --- | --- | --- |
| `startup` | One-shot setup before gameplay frames. | Runs before repeating gameplay stages. |
| `fixedUpdate` | Deterministic simulation and physics-facing gameplay. | Runs before `update` for each fixed tick. |
| `update` | Per-frame gameplay and input-facing behavior. | Runs after fixed ticks for the frame. |
| `postUpdate` | Cleanup, follow-up events, and presentation-facing state. | Runs after `update` for the frame. |

Within a stage, systems run in deterministic system-name order unless explicit
same-stage `before`/`after` constraints are declared. The IR validator rejects
missing, cross-stage, self-referential, and cyclic ordering constraints before
runtime. A system may only read or write the components, resources, events,
commands, and services listed in `systems.ir.json`; undeclared effects are
rejected before mutation.

V6 still rejects portable systems that depend on async work, timers, direct
runtime handles, DOM, filesystem, network, platform APIs, or undeclared
system-local state. Use components and resources for persisted gameplay state.

V7 adds explicit systems lifecycle metadata for fixed-trace replay, hot-reload
invalidation, and disallowed system-local persisted state. The effect log
remains the replay contract: resource writes, events, commands, and services are
compared as canonical web/native entries with first-mismatch paths in V7
reports.

## Missing Or Post-V4 API Inventory

Keep this list close to the scripting API so implementation tickets can promote
items deliberately. Starting in V5, promoted APIs must be demonstrated in a
functional 3D scene when the behavior has visible output, interaction, or
runtime state. Use `assets-source/environment` assets where they reasonably
show the feature.

### Implemented

- [x] V5 query sorting and stable iteration order for `orderBy: "id"`.
  Query declarations and `ctx.query(...)` can request deterministic entity-id
  ordering in SDK/IR/web/Bevy QuickJS.
- [x] V5 changed-query filters for fixed-trace metadata. `changed: [...]`
  filters against structured change metadata from `world.resources.__changed`,
  `world.resources.Changed`, or entity `__changed` markers.
- [x] Runtime changed-query diffing. When explicit fixed-trace metadata is
  absent, web and Bevy compare deterministic schedule-stage component snapshots;
  `changed: [...]` filtering runs before `orderBy`, `offset`, and `limit`.
- [x] V5 same-stage system ordering constraints. SDK/IR/compiler/web/Bevy
  support deterministic topological `before`/`after` ordering with system-name
  tie breaks; validation rejects missing, cross-stage, self, and cyclic
  constraints.
- [x] V5 bulk query snapshots/pagination for deterministic `offset` and
  `limit` windows after filtering and optional ordering.
- [x] V5 deterministic random helpers. `ctx.random.float/range/int/bool/pick`
  uses seeded randomness from `world.resources.Random.seed` or
  `world.resources.__randomSeed`.
- [x] V5 deterministic timer/cooldown helpers.
  `ctx.timers.elapsed/remaining/progress/done/ready` derive values from
  `ctx.time.elapsed`.
- [x] V7 primitive shape casts and overlap queries. Systems declare
  `physics.overlap` and `physics.shapeCast`; web and Bevy QuickJS return
  deterministic primitive collider results with portable filters and service
  logs.
- [x] V5 narrow character controller API. Systems declare `character.move`, and
  `ctx.character.move(entity, { axes, fixedDelta })` returns deterministic
  fixed-trace observations in web and Bevy QuickJS.
- [x] V5 game root composition. `defineGame` composes existing portable
  scene/world/input/runtime config declarations; it is not a new runtime
  contract.
- [x] V5 game starter template. The current `structured-source-starter` smoke is
  release-gated through `verify:v5` as a small SDK ergonomics proof.
- [x] V6 resource write API for current resource/event traces. Resource write
  effects are validated and compared across web/native fixed trace artifacts.
- [x] V5 asset lookup from scripts. `ctx.assets.get(id)` and
  `ctx.assets.list()` expose cloned bundle manifest metadata in web and Bevy
  QuickJS without granting file, network, renderer, or native asset handles.
- [x] V6 declared bundle-local asset loading from scripts. `ctx.assets.load(id)`
  is a declared `assets.load` service that returns deterministic ready/missing
  results for assets already present in `assets.manifest.json`.
- [x] V8/V9 animation runtime controls. `ctx.animation.query` and
  `ctx.animation.stop` are declared services with matching web/native effect
  logs; promoted fixtures cover playback state, stop reason, bounded blend
  observations, event markers, transform animation, and bounded particle
  emitters.
- [x] V9 primitive sensors and navigation. `ctx.physics.sensor` returns
  deterministic primitive sensor snapshots, and `ctx.navigation.path` returns
  stable static pathfinding success/failure payloads.
- [x] Scene lifecycle service effects. Systems may declare `scene.current`,
  `scene.change`, `scene.push`, `scene.pop`, `scene.loadAdditive`, and
  `scene.unload`; web and Bevy record matching service effects and lifecycle
  traces.
- [x] Runtime gameplay host context surfaces. `ctx.states`, `ctx.components`,
  `ctx.observers`, `ctx.tasks`, `ctx.channels`, and `ctx.plugins` expose
  declared host metadata, fixed-trace handoff, resource-derived state,
  reflection, hook, observer, task, channel, and plugin metadata.
- [x] Runtime gameplay host semantics. The focused runtime gameplay host gate
  covers live rendered-entity reconciliation, event-window cleanup, dynamic
  state handoff, command-time/removal hook ordering, system-local evidence,
  stoppable observer propagation, bounded timer/channel semantics, and
  diagnostics for raw handles, runtime plugins, workers, unbounded promises,
  and arbitrary platform timers.
- [x] Persistence and reload evidence. `definePersistence`, scene persistence
  policy, save slots, autosave/checkpoint restore, settings, migration
  diagnostics, and state-preserving reload are promoted through the
  persistence/reload evidence path without exposing filesystem, cloud-save, or
  platform storage handles to scripts.
- [x] Script UI, persistence, and settings facades. Systems may declare
  `ui.actions`, `ui.activate`, `ui.focus`, `ui.read`, `ui.setDisabled`,
  `ui.setValue`, `persistence.save`, `persistence.load`, `persistence.listSlots`,
  `persistence.delete`, `settings.get`, `settings.set`, `settings.export`, and
  `settings.import` services and receive plain-data results without raw DOM,
  filesystem, cloud-save, or platform handles.
- [x] V7/V9 character movement beyond the narrow fixed-trace service. Slopes,
  step-up, push policy, and ordered primitive contact observations are promoted
  through `CharacterController`, collider metadata, and `ctx.character.move`
  plain-data observations. Navmesh-backed controller behavior remains outside
  this claim.
- [x] V10 grouping ergonomics. `defineTag()` creates queryable zero-field ECS
  marker components, and scene `Group` lowers to hierarchy-only
  `SceneContainer` entities for transform/editor organization.

### Partial

- [ ] Full physics solver contact filtering beyond promoted primitive
  collision/trigger/sensor observations remains intentionally narrow.

### Missing

- [ ] Arbitrary particle commands beyond bounded portable emitter data.
  Promote only when the command surface has deterministic web/native behavior
  and visual verification artifacts.
- [x] Runtime prefab instantiation. Bundle-local `prefabs.ir.json` catalogs
  expand through caller-provided deterministic prefixes and are verified across
  web and Bevy by `pnpm verify:runtime-prefabs-hierarchy`.
- [x] Child hierarchy commands. `setParent` and `clearParent` mutate the
  portable `Hierarchy` component with cycle checks and matching web/native
  command application.
- [x] Delayed command scheduling beyond bounded timer/channel services when it
  uses fixed ticks, declared command metadata, bounded max delay, ownership,
  and cancellation policy.

### Design Only

- [ ] General cloud-save, platform storage, DOM-backed widget handles, and
  broad runtime mixer mutation. The promoted script facades return bounded
  plain data only.

### Unsupported

- [ ] Unbounded async/await in systems. Bounded fixed-trace task/channel and
  timer semantics are promoted; arbitrary workers, promises, and platform
  timers remain diagnostic-only.
- [ ] Network/file/platform APIs. Network belongs behind explicit service
  boundaries; file/platform access should remain outside portable systems.
- [ ] Arbitrary npm dependencies. Native QuickJS sandbox cannot assume them.
- [ ] Direct Three.js/Bevy access. Use portable context and service facades
  only.
- [ ] Dynamic runtime plugin loading. Portable plugin/group metadata is
  declarative only.

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
  services: ["physics.raycast", "animation.play", "animation.query", "assets.load"],
  events: {
    reads: [],
    writes: [FootstepEvent],
  },
  commands: ["spawn", "despawn", "addComponent", "removeComponent", "setComponent", "emitEvent"],
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
| `ctx.query()` | Iterates matching entities. | Returns stable entity IDs and declared component snapshots only; supports `with`, `without`, `changed`, `orderBy: "id"`, `offset`, and `limit`. |
| `ctx.time` | Fixed and variable timestep data. | Runtime-provided resource with `dt`/`delta`, `fixedDt`/`fixedDelta`, `elapsed`, and paused state where available; no wall-clock access from scripts. |
| `ctx.timers` | Deterministic timer and cooldown calculations. | Pure helpers over `ctx.time.elapsed`; no async scheduling, wall-clock access, or hidden timer state. |
| `ctx.schedule` | Bounded fixed-tick delayed command scheduling. | `afterTicks({ id, delayTicks })` can enqueue only declared `delayedCommands`; each declaration has a max delay, scene/entity ownership, and cancellation policy. Commands flush through the normal command buffer after fixed ticks. |
| `ctx.input` | Logical actions, axes, and edge states. | Reads `input.ir.json` mappings and current input state; promoted host contexts expose `action`, `axis`, `pressed`, and `released`. |
| `ctx.random` | Deterministic seeded random values. | Per-context PRNG seeded from a world resource; exposes `float`, `range`, `int`, `bool`, and `pick` without platform RNG access. |
| `ctx.resources` | Reads and writes declared singleton world state. | Reads are cloned snapshots; writes are queued effects and apply only after `resourceWrites` validation. |
| `ctx.events` | Reads and emits typed events. | Event schemas are declared and queues are runtime-owned. |
| `ctx.commands` | Structural world changes and command-buffer event emission. | Commands flush at schedule boundaries after validation; supports spawn, despawn, add/remove/set component, and emit event. |
| `ctx.physics` | Controlled physics queries, sensors, and bounded character-facing observations. | Runtime service facade; no Rapier or Bevy physics handles. |
| `ctx.navigation` | Static path queries. | Reads portable `Navigation` resource data and returns stable success/failure path payloads. |
| `ctx.picking` | Pointer ray and generated-mesh bounds picking. | Uses portable camera, transform, and generated bounds data; no renderer handles. |
| `ctx.animation` | Playback commands, state queries, and stop commands. | Runtime service facade; graph/controller state is runtime-owned and serialized as plain data. |
| `ctx.audio` | Declared audio play/stop/query against bundle-local audio IR. | Returns logical playback IDs and status only; streaming, network URLs, custom decoders, and platform handles remain private or diagnostic-only. |
| `ctx.assets` | Stable asset lookup by ID. | `get`/`list` return cloned manifest metadata; `load` is a declared `assets.load` service returning deterministic ready/missing metadata, not renderer or native handles. |
| `ctx.ui` | Retained UI focus, activation, value, disabled-state, and read operations. | Operates on declared `ui.ir.json` node IDs and returns plain status payloads; no DOM, WebView, Bevy UI entity, or platform widget handle is exposed. |
| `ctx.scenes` | Scene lifecycle service effects. | Queues current/change/push/pop/load-additive/unload effects and drives deterministic scene lifecycle traces. |
| `ctx.persistence` | Declared save-slot operations. | `save`, `load`, `listSlots`, and `delete` operate on structured local-data declarations and runtime-owned stores; scripts never receive filesystem, cloud-save, or platform storage handles. |
| `ctx.settings` | Declared setting reads and writes. | `get`, `set`, `export`, and `import` validate values against local-data setting specs and return booleans, numbers, strings, or plain records only. |
| `ctx.states` | Resource-derived app, computed, and substate reads. | Reads declared lifecycle state metadata; state values are plain strings or null. |
| `ctx.components` | Component reflection and hook observations. | Exposes declared component type metadata and hook observations, not backend component IDs. |
| `ctx.observers` | Deterministic observer route reads. | Returns declared target/bubble propagation steps; raw callbacks are not exposed. |
| `ctx.tasks` / `ctx.channels` | Fixed-trace task metadata and event-backed handoff. | Channels map to declared event queues; arbitrary async workers/promises remain unsupported. |
| `ctx.plugins` | Portable plugin and plugin-group metadata. | Declaration metadata only; dynamic runtime plugin loading remains unsupported. |

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
- `patch` merges the supplied top-level component fields with the current
  component value. For `Transform`, `entity.patch(Transform, { position })`
  preserves existing `rotation` and `scale`; use `entity.set(Transform, value)`
  only when replacing the whole transform intentionally. Web runtime diagnostics
  may include `TN_WEB_TRANSFORM_PARTIAL_PATCH_MERGED` to make that merge
  behavior explicit for lower-level partial transform effects.
- Component values are plain structured data.
- Entity identity is a stable string, not a Bevy `Entity` or Three.js object.

For SDK-authored object transforms, prefer the chainable helpers
`object.setPosition(x, y, z)`, `object.setRotation(x, y, z)`,
`object.setScale(x, y, z)`, or `object.patchTransform({ position })`. Omitted
fields are preserved, matching runtime component patch semantics.

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
ctx.commands.setComponent("enemy.3", Health, { current: 0, max: 100 });
ctx.commands.emitEvent(EnemyDefeated, { entity: "enemy.3" });
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
  mask: ["world"],
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
- V7 query permissions add `physics.overlap` and `physics.shapeCast` for
  backend-neutral overlap and swept-shape checks. Query filters use portable
  layer names and masks, not backend bitsets or handles.
- V9 primitive solver declarations are backend-neutral metadata on `RigidBody`
  and `Collider`, scoped to box, sphere, and capsule bodies. Dynamic,
  kinematic, and static primitive bodies may carry bounded mass, inverse mass,
  linear velocity, angular velocity, gravity scale, damping, friction,
  restitution, sleep threshold, and solver iteration policy. Static and
  kinematic inverse mass is `0`; dynamic inverse mass must be positive and must
  match `1 / mass` when both are authored.
- V9 broad sensors are primitive non-solid `Collider.sensor` volumes. Scripts
  declare `physics.sensor` and call `ctx.physics.sensor({ sensor?, phases? })`
  for deterministic fixed-step sensor snapshots containing ordered occupants,
  enter/stay/exit phases, and filtered-out entity IDs.
- V9 character pushing is declared with `CharacterController.pushPolicy`.
  `ctx.character.move(...)` observations may include `pushed` for light dynamic
  primitive bodies or `tooHeavy` when policy blocks movement against a dynamic
  primitive above the authored mass limit. Extended observations may include
  ordered contact, slope, and step data when primitive solver metadata resolves
  ramps, step-up, or push interactions.
- V9 static pathfinding uses a built-in `Navigation` world resource containing
  bounded static convex regions, area costs, and optional fixture queries.
  Scripts declare `navigation.path` and call `ctx.navigation.path({ start,
  goal, id? })`; results include `status`, `path`, `visitedRegions`,
  `totalCost`, and a stable failure reason for invalid start/goal or no route.
- Bounded mesh colliders are promoted for static collision and dynamic or
  kinematic racing-style AABB traces when `Collider.mesh` includes explicit
  bounds and `triangleCount` metadata. Unbounded mesh colliders, mesh triggers,
  cylinder solver bodies, backend solver handles, random seeds, and
  nondeterministic solver settings are rejected before runtime. Joint metadata
  is portable for hinge, slider, and suspension observations; full constraint
  solving and arbitrary triangle narrow phase remain deferred.
- Character movement uses the `character.move` service permission and returns a
  fixed-trace observation for one declared character controller. Scripts pass an
  entity id or entity view plus optional axis values and fixed delta; runtimes
  return plain data such as `desired`, `resolved`, `grounded`, `groundEntity`,
  `blockedBy`, `contacts`, `slope`, `step`, and `pushed`.
- Mesh picking uses the `picking.mesh` service permission and intersects rays
  with generated mesh renderer bounds. It does not expose Three.js or Bevy
  renderer handles.
- Pointer ray generation uses the `picking.pointerRay` service permission and
  returns a ray from portable camera/transform IR plus normalized pointer
  coordinates.
- Body mutation APIs lower to commands or component patches.
- Backend-specific concepts such as Rapier handles or Bevy components are not
  script-visible.

## Animation API

Animation is commanded and observed through stable clip, graph, state, and
entity IDs. Named clip metadata is declared on model assets and validated
before runtime playback is claimed:

```ts
const heroModel = modelAsset("model.hero", "assets/hero.glb", {
  animations: [
    animationClip("idle", { loop: true, speed: 1 }),
    animationClip("run", { loop: true, sourceClip: "Armature|Run", speed: 1.25 }),
  ],
});
```

```ts
ctx.animation.play(entity, "run", {
  speed: 1.0,
  loop: true,
});

const state = ctx.animation.query(entity, "run");
if (state.normalizedTime > 0.95) {
  ctx.animation.stop(entity, "run");
}
```

Runtime effects:

- Clip IDs, optional source clip names, loop flags, positive playback speeds,
  animation graph state IDs, bounded blend weights, marker events, transform
  animation tracks, and bounded particle emitters are represented as portable
  data.
- `ctx.animation.play`, `ctx.animation.query`, and `ctx.animation.stop` are
  declared service calls with canonical web/native effect logs.
- Scripts see only stable IDs, booleans, numbers, arrays, and plain data.
- IK, retargeting, backend animation controllers, arbitrary blend trees, and
  unbounded particle behavior must fail with stable diagnostics rather than
  being ignored.

## Audio API

Audio playback currently starts from structured audio IR and bundle-local
assets. Autoplay looped music, event-matched one-shots, bus routing,
listener/emitter metadata, mixer/effect-chain reports, UI-triggered audio
actions, and native device diagnostics are represented through promoted audio
IR and runtime observations. Adapters keep audio handles private:

```ts
defineAudio({
  music: [loopingMusic("music.arena", { asset: audioAsset("arena.music", "assets/arena.ogg"), volume: 0.4 })],
  oneShots: [oneShotSound("sound.hit", { asset: audioAsset("hit.sound", "assets/hit.wav"), event: "DamageEvent", volume: 0.75 })],
});
```

Script `ctx.audio.play`, `ctx.audio.stop`, and `ctx.audio.query` resolve
declared one-shots, looping music, and tones from audio IR and return stable
logical playback IDs. Real streaming/network audio, custom decoders, platform
audio handles, and broad runtime mixer mutation remain adapter-private or
diagnostic-only.

## Host Lifecycle And Metadata APIs

Runtime host metadata is deliberately narrow and deterministic:

- `ctx.states.get(id)` reads resource-derived app states, computed states, and
  substates.
- `ctx.components.types()`, `ctx.components.type(Component)`, and
  `ctx.components.hooks(Component)` expose component reflection and lifecycle
  observations without exposing Bevy component IDs or renderer internals.
- `ctx.observers.propagate(Event, target)` returns deterministic
  target-to-ancestor propagation steps for declared observer routes.
- `ctx.tasks.*` and `ctx.channels.*` expose fixed-trace task metadata and
  event-backed channel handoff.
- `ctx.plugins.*` exposes declared portable plugin and plugin-group metadata;
  dynamic runtime plugin loading remains unsupported.
- Scene lifecycle services (`ctx.scenes.current/change/push/pop/loadAdditive/
  unload`) queue service effects and drive deterministic scene lifecycle traces.
- Persistence, save slots, settings, autosave restore, migrations, and
  state-preserving reload are promoted through structured IR, script facades,
  and runtime evidence, but scripts do not receive filesystem, cloud-save, or
  platform storage handles.
- UI services (`ctx.ui.actions/focus/activate/read/setDisabled/setValue`)
  operate on declared retained-UI node IDs and return deterministic plain-data
  statuses.

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
- Native QuickJS uses the same queued resource effect shape; release promotion
  still requires fixed web/native trace, conformance, and scene evidence.

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
ctx.picking.pointerRay(...)
ctx.picking.mesh(...)
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
