# ECS Model

The runtime model is entity-component-system (ECS). The Three.js-like SDK is an authoring convenience; the compiled game is an ECS world with data components, schedules, systems, resources, assets, and events.

The ECS contract must be stable across runtimes. Bevy is the first native implementation, but Bevy types are adapter details and are not public API.

## Core Concepts

### Shared Types

ECS schemas use these semantic aliases:

```ts
type EntityId = string;
type AssetId = string;
type PrefabId = string;
type SystemId = string;
type Color = string | [number, number, number] | [number, number, number, number];
```

Rules:

- IDs are stable strings, not runtime pointers or array indexes.
- Colors are either CSS hex strings or linear numeric arrays, according to the declaring schema.
- Vectors and quaternions are fixed-length arrays.

### Entity

An entity is a stable ID with zero or more components.

Rules:

- Entities have no behavior by themselves.
- Entity IDs are unique within a world.
- Entity IDs must be stable in serialized IR.
- Runtime-generated entities receive IDs from the runtime command buffer.
- Parent-child relationships are represented by components, not by JavaScript object ownership.

Example:

```json
{
  "id": "player",
  "components": {
    "Transform": { "position": [0, 1, 0] },
    "MeshRenderer": { "mesh": "mesh.player", "material": "mat.player" },
    "PlayerController": { "speed": 5 }
  }
}
```

### Component

A component is typed data attached to an entity.

Rules:

- Components are plain data.
- Components must have JSON-schema-compatible definitions.
- Components must not contain functions, class instances, cyclic references, promises, DOM objects, native handles, or runtime resources.
- Components may reference entities, assets, animations, or resources by ID.
  Prefab references are post-V2 and should not be required by V2 gameplay.
- Component names are globally unique within the bundle.
- Built-in component names are reserved.
- Marker components are allowed as zero-field components and should be used for
  classifications such as `Player`, `Enemy`, `Projectile`, or `Disabled`.

### Tag

A tag is a shorthand for a zero-field marker component.

Rules:

- Tags compile to marker components in `world.ir.json`.
- Tags are queryable with the same `with` and `without` filters as data
  components.
- Tags should not carry values. If values are needed, define a component.
- Tags are useful because Bevy commonly models entity classification with marker
  components, and the same pattern maps cleanly to the web runtime.

### System

A system is a named function that reads and writes component data through queries and commands.

Rules:

- Systems are registered in a schedule stage.
- Systems declare the components they query.
- Systems cannot assume iteration order unless an explicit sort is declared.
- Structural changes use commands and are applied at schedule boundaries.
- Systems should be deterministic for the same input state and `dt`.

### Resource

A resource is singleton state associated with the world.

Examples:

- Time.
- Input state.
- Physics settings.
- Active camera.
- Game score.
- Current level.

Rules:

- Resource schemas follow the same data restrictions as components.
- Resources are addressed by type name.
- Portable systems that read or write serialized resources declare
  `resourceReads` and `resourceWrites` alongside component and event access.
  These declarations are emitted into `systems.ir.json` and validated against
  `schemas/resources.schema.json` before runtime.
- Runtime-provided resources can be read through context APIs but are not always serialized.
- Runtime adapter resources should stay private unless surfaced through an SDK
  resource schema or context API.

### Event

An event is transient data passed between systems during a frame or across a bounded queue.

Rules:

- Events have schemas.
- Events are not long-term storage.
- Portable systems declare `eventReads` and `eventWrites`; emitted systems that
  read or write undeclared event schemas fail validation before runtime.
- Events may be dropped according to queue policy.
- Events that must survive save/load should become components or resources.
- Events should reference entities by stable entity ID at the SDK/IR boundary,
  even if a runtime maps them to native entity handles internally.

## Built-In Components

### Transform

Local transform for an entity.

Schema:

```ts
type Transform = {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
};
```

Rules:

- `rotation` is a quaternion `[x, y, z, w]`.
- Defaults are position `[0, 0, 0]`, rotation `[0, 0, 0, 1]`, scale `[1, 1, 1]`.
- World transform is computed by the runtime.

### Hierarchy

Parent-child relationship.

```ts
type Hierarchy = {
  parent?: EntityId;
  children?: EntityId[];
};
```

Rules:

- Parent references must point to existing entities.
- Cycles are invalid.
- Children inherit parent transforms.
- Despawning a parent uses the declared despawn policy.

### Name

Human-readable label for debugging and editor views.

```ts
type Name = {
  value: string;
};
```

`Name` is not a stable lookup key. Use entity IDs for references.

### MeshRenderer

Render mesh and material binding.

```ts
type MeshRenderer = {
  mesh: AssetId;
  material: AssetId;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
};
```

Rules:

- `mesh` must resolve to a mesh asset or generated geometry asset.
- `material` must resolve to a material asset.
- Visibility affects rendering only, not simulation.

### Camera

Camera projection and render role.

```ts
type Camera =
  | {
      kind: "perspective";
      fovY: number;
      near: number;
      far: number;
      priority?: number;
    }
  | {
      kind: "orthographic";
      size: number;
      near: number;
      far: number;
      priority?: number;
    };
```

Rules:

- Active camera selection is runtime-specific but must respect `priority`.
- Projection values must be finite and positive where applicable.

### Light

Lighting data.

```ts
type Light =
  | { kind: "ambient"; color: Color; intensity: number }
  | { kind: "directional"; color: Color; intensity: number; shadows?: boolean }
  | { kind: "point"; color: Color; intensity: number; range?: number; shadows?: boolean }
  | { kind: "spot"; color: Color; intensity: number; range?: number; angle: number; shadows?: boolean };
```

### RigidBody

Physics body declaration.

```ts
type RigidBody = {
  kind: "static" | "dynamic" | "kinematic";
  mass?: number;
  velocity?: [number, number, number];
};
```

Physics is optional per target profile. If enabled, physics components must be interpreted consistently across runtimes.

### Collider

Collision shape.

```ts
type Collider =
  | { kind: "box"; size: [number, number, number]; trigger?: boolean }
  | { kind: "sphere"; radius: number; trigger?: boolean }
  | { kind: "capsule"; radius: number; height: number; trigger?: boolean }
  | { kind: "mesh"; trigger?: false };
```

Rules:

- V6 portable collision supports primitive box, sphere, and capsule colliders
  for static, dynamic, and kinematic bodies.
- Mesh colliders are accepted only for static collision. Dynamic mesh colliders
  and mesh trigger colliders fail validation.
- Collider dimensions are required local-space dimensions and must be positive
  finite numbers.
- Cylinder colliders and deeper contact filtering are deferred to V7.
- Layer and mask filtering is deferred to the V7 physics contract; V6 bundles
  that include collider layer or mask fields fail validation.
- Primitive collision and trigger observations are delivered as
  `CollisionEvent` and `TriggerEvent` payloads with `{ a, b, phase }`, where
  `phase` is `enter`, `stay`, or `exit`.
- Runtime scale handling must be documented by the physics adapter.

### AnimationPlayer

Animation state for an entity.

```ts
type AnimationPlayer = {
  clips: AssetId[];
  current?: AssetId;
  speed?: number;
  loop?: boolean;
};
```

## Custom Components

Custom components are declared with schemas.

```ts
import { defineComponent } from "@threenative/sdk";

export const PlayerController = defineComponent("PlayerController", {
  speed: "number",
  jumpImpulse: { type: "number", default: 8 },
  grounded: { type: "boolean", default: false },
});
```

Compiled schema:

```json
{
  "name": "PlayerController",
  "fields": {
    "speed": { "type": "number", "required": true },
    "jumpImpulse": { "type": "number", "default": 8 },
    "grounded": { "type": "boolean", "default": false }
  }
}
```

Supported field types:

- `boolean`
- `number`
- `integer`
- `string`
- `enum`
- `vec2`
- `vec3`
- `vec4`
- `quat`
- `color`
- `entity`
- `asset`
- `array`
- `object` with declared fields
- nullable versions of the above

Unsupported field types:

- Functions.
- Arbitrary classes.
- Maps with non-string keys.
- Sets.
- Weak references.
- Symbols.
- BigInts unless a schema explicitly serializes them as strings.

## Queries

Systems declare queries over components.

```ts
const query = ctx.query({
  with: [PlayerController, Transform],
  without: [Disabled],
});

for (const entity of query) {
  const player = entity.get(PlayerController);
  const transform = entity.get(Transform);
}
```

Rules:

- Queries are evaluated against the world state at the start of the system unless the runtime documents a stricter rule.
- Added or removed components through commands are visible after command application.
- Query result order is unspecified by default.
- `one()` must fail validation or throw a controlled runtime error if the result count is not exactly one.
- V2 query filters support `with` and `without`. `added` and `changed`
  query semantics are V3 performance work and are not required for the V2
  playable-game proof.

## Commands

Structural changes are performed through command buffers.

```ts
ctx.commands.spawn("projectile", [
  Transform.from({ position: muzzlePosition }),
  Velocity({ value: [0, 0, -20] }),
]);

ctx.commands.despawn(entity.id);
ctx.commands.add(entity.id, Health({ value: 100 }));
ctx.commands.remove(entity.id, Burning);
```

Rules:

- Commands apply at schedule boundaries.
- Commands must validate component schemas before application.
- Despawning an entity must define what happens to children: `recursive`, `detach`, or `reject`.

## Schedule

V2 gameplay schedule stages:

```txt
fixedUpdate
update
postUpdate
```

Adapter-owned input collection, physics stepping, animation sampling, render
extraction, render, cleanup, and platform lifecycle stages remain internal until
a later milestone needs them in portable IR.

Rules:

- `fixedUpdate` runs zero or more times per rendered frame based on fixed timestep policy.
- `update` runs once per rendered frame for normal gameplay systems.
- `postUpdate` runs after `update` for follow cameras, late commands, cleanup,
  and derived state.
- Rendering is not performed by TypeScript systems.
- Systems in the same stage may run in parallel if their read/write sets do not conflict.
- Ordering within a stage requires explicit `before` or `after` constraints.
- Related systems should be grouped into modules/plugins internally, but plugins
  are runtime organization units, not a public requirement for gameplay authors.

Example:

```ts
world.addSystem(movePlayer, {
  stage: "update",
  after: ["readInput"],
  before: ["cameraFollow"],
});
```

## Time

The runtime provides:

```ts
ctx.dt;        // seconds since previous update stage tick
ctx.elapsed;   // seconds since world start
ctx.frame;     // monotonically increasing frame number
ctx.fixedDt;   // seconds per fixed update tick
```

Rules:

- System code must use `ctx.dt` or `ctx.fixedDt`; it must not call wall-clock APIs for simulation.
- Runtime pause/resume affects time resources according to target profile.

## Input

Input is represented as resources and read through action APIs.

Rules:

- Gameplay systems read logical actions, not physical device events.
- Input mappings are serialized in the bundle.
- Mobile controls are declared as profile data, not hard-coded DOM overlays.

Example:

```ts
if (ctx.input.action("jump").justPressed) {
  velocity.y = controller.jumpImpulse;
}
```

## Prefabs

Prefabs are a reusable entity-tree design for a later version. They are not
required V2 scope; V2 gameplay should use explicit entity declarations,
component schemas, resources, events, and command-buffer spawning.

Rules:

- Prefabs serialize as templates in IR.
- Prefab instances may override component fields.
- Prefab entity IDs are scoped inside the prefab.
- Instantiated entities receive world IDs.

Example:

```ts
world.prefab("enemy.basic", (prefab) => {
  prefab.root(
    Transform.from({ position: [0, 0, 0] }),
    MeshRenderer.asset("mesh.enemy", "mat.enemy"),
    EnemyAI({ aggroRange: 12 }),
  );
});
```

## Save and Load

Serializable ECS state is the basis for save/load.

Rules:

- Components and resources opt in to persistence.
- Runtime-only resources are excluded.
- Asset references save by stable ID.
- System local variables are not persistent.
- Versioned schemas must provide migrations before loading old saves.

## Runtime Adapter Boundary

The Bevy adapter maps world and systems IR to Bevy entities, components,
resources, events, and schedules.

Public contract:

- Component schemas.
- Entity IDs.
- Schedule stage names.
- Event schemas.
- Asset IDs.
- Target profiles.

Private adapter details:

- Bevy component type names.
- Bevy plugin setup.
- Bevy schedule labels.
- Renderer resource layout.
- Native desktop window lifecycle implementation.
- Mobile lifecycle implementation after V1.

No TypeScript SDK or game code may depend on private adapter details.

## Validation

The ECS validator must reject:

- Duplicate entity IDs.
- Unknown component names.
- Component data that fails schema validation.
- Entity reference cycles in hierarchy.
- References to missing entities, assets, prefabs, systems, or resources.
- Multiple singleton resources of the same type.
- Systems with unknown stages or unresolved ordering constraints.
- Query declarations for unknown components.
- Components that require unavailable target capabilities.

Validation should produce stable diagnostic codes so AI tools can repair code reliably.
