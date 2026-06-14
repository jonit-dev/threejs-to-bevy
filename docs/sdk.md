# TypeScript SDK

The TypeScript SDK is the public authoring surface for ThreeNative games. It is intentionally familiar to Three.js users and AI code generators, but it is not a drop-in compiler for arbitrary Three.js projects.

The SDK produces a validated intermediate representation (IR). Runtimes consume the IR and implement the game on native or web backends.

```txt
TypeScript source
  -> SDK object graph and ECS declarations
  -> compiler validation
  -> stable IR bundle
  -> Bevy native runtime or Three.js web runtime
```

## Design Contract

The SDK must provide:

- A Three.js-like scene API for common visual authoring.
- An ECS-first API for gameplay and runtime behavior.
- A React-style UI authoring package for portable game UI.
- Deterministic serialization to IR.
- Runtime-independent abstractions for input, time, assets, transforms, materials, and systems.
- Clear validation errors when code uses unsupported APIs.

The SDK must not expose:

- Bevy APIs.
- Raw WebGL, WebGPU, renderer internals, or browser DOM APIs.
- Arbitrary Three.js internals, monkey-patching, or side-effect based scene discovery.
- Native platform APIs except through explicit SDK capabilities.

## Supported Authoring Styles

### Scene-First API

Use this style for static or mostly visual content.

```ts
import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "@threenative/sdk";

export default function createScene() {
  const scene = new Scene();

  const player = new Mesh(
    new BoxGeometry(1, 2, 1),
    new MeshStandardMaterial({ color: "#ff3b30" }),
  );
  player.name = "player";
  player.position.set(0, 1, 0);
  scene.add(player);

  const camera = new PerspectiveCamera({
    fov: 60,
    near: 0.1,
    far: 200,
  });
  camera.position.set(0, 4, 8);
  camera.lookAt(player.position);
  scene.add(camera);

  scene.add(new DirectionalLight({ intensity: 2 }).setPosition(3, 5, 2));

  return scene;
}
```

### ECS-First API

Use this style for gameplay entities, reusable components, and systems.

```ts
import {
  Material,
  MeshRenderer,
  PlayerController,
  Transform,
  World,
} from "@threenative/sdk";

export default function createWorld() {
  const world = new World();

  world.spawn("player",
    Transform.from({ position: [0, 1, 0] }),
    MeshRenderer.box({ size: [1, 2, 1] }),
    Material.standard({ color: "#ff3b30" }),
    PlayerController({ speed: 5 }),
  );

  return world;
}
```

Both styles compile to the same ECS-shaped IR. In V2, supported R3F/JSX scene
authoring also lowers into this same SDK graph and emitted IR; arbitrary R3F,
Drei, React app, or browser behavior is outside the portable contract.

### Game Root Helper

Use `defineGame` when a project has more than one portable root. It is authoring
sugar over the existing bundle root shape; it does not introduce new IR.

```ts
import { Scene, World, defineGame, defineInputMap } from "@threenative/sdk";

const scene = new Scene({ id: "scene.game" });
const world = new World();
const input = defineInputMap({ actions: [], axes: [] });

export default defineGame({
  input,
  scene,
  world,
});
```

The equivalent low-level export is:

```ts
export default {
  input,
  scene,
  world,
};
```

`defineGame` can compose existing `scene`, `world`, `input`, `audio`,
`environment`, and `ui` declarations. `runtimeConfig` is supported only when a
`World` is provided, because it lowers through the existing ECS runtime config
path. Empty roots and unsupported runtime config placement throw stable
`TN_SDK_GAME_*` errors.

### Prefab And Controls Recipes

Use `primitiveActorPrefab` and `defineControls` for common game pieces that
should still lower into existing scene, world, and input declarations.

```ts
import {
  BoxGeometry,
  MeshStandardMaterial,
  World,
  defineComponent,
  defineControls,
  primitiveActorPrefab,
} from "@threenative/sdk";

const Player = defineComponent("Player", { speed: "number" });

const player = primitiveActorPrefab({
  components: [Player({ speed: 2.4 })],
  geometry: new BoxGeometry({ size: [0.5, 0.5, 0.5] }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#2f80ed" }),
  position: [0, 0.35, 0],
});

scene.add(player.mesh);

const world = new World().spawn(player.id, ...player.components);
const input = defineControls({
  actions: [{ id: "Interact", keys: ["Space"] }],
  movement: { gamepad: true },
});
```

`modelActorPrefab` creates deterministic ECS metadata for model-backed actors.
It does not create a renderable scene object; add renderable model support
through the promoted asset/runtime paths rather than runtime asset loading.
Unsupported prefab and control options throw stable `TN_SDK_PREFAB_*` and
`TN_SDK_CONTROLS_*` errors instead of being ignored.

### R3F/JSX Scene API

Use this style when a JSX scene tree is clearer than direct SDK object
construction. The portable package is `@threenative/r3f`, not
`@react-three/fiber`.

```tsx
/** @jsxImportSource @threenative/r3f */
import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "@threenative/r3f";

export default (
  <Scene id="scene">
    <Mesh id="cube" position={[0, 0, 0]}>
      <BoxGeometry size={[1, 1, 1]} />
      <MeshStandardMaterial color="#2f80ed" />
    </Mesh>
    <PerspectiveCamera id="camera" position={[0, 1.5, 4]} />
    <DirectionalLight id="light.key" intensity={2} />
  </Scene>
);
```

Supported V2 JSX elements are `Scene`, `Group`, `Mesh`, `PerspectiveCamera`,
`AmbientLight`, `DirectionalLight`, `BoxGeometry`, `SphereGeometry`,
`PlaneGeometry`, `MeshStandardMaterial`, and `MeshBasicMaterial`. The supported
props are `id`, `name`, `position`, `rotation`, `scale`, `visible`, primitive
geometry dimensions, camera clip/FOV values, light color/intensity, and material
color/metalness/roughness.

Unsupported React hooks, refs, effects, Drei helpers, raw Three.js renderer
access, and browser globals fail during compiler capture with diagnostics. Use
direct SDK authoring for logic that is not expressible as portable scene data.

### React-Style UI API

Use this style for HUDs, menus, dialogue, inventory, and touch controls.

```tsx
import { Bar, Stack, Text, bind } from "@threenative/ui";

export function HUD() {
  return (
    <Stack id="hud.root" anchor="top-left" padding={16} gap={8}>
      <Text text={bind.template`HP ${bind.resource("PlayerStats.health")}`} />
      <Bar value={bind.resource("PlayerStats.healthPercent")} />
    </Stack>
  );
}
```

UI authoring compiles to `ui.ir.json`. Web runtimes may render that with React
DOM. Native runtimes recreate it through Bevy UI or another native UI renderer.
React DOM, CSS selectors, arbitrary HTML, and browser event handlers are not the
portable native UI contract.

## Supported V1 Subset

### Scene Objects

Supported:

- `Scene`
- `Object3D`
- `Group`
- `Mesh`
- `PerspectiveCamera`
- `OrthographicCamera`
- `AmbientLight`
- `DirectionalLight`
- `PointLight`
- `SpotLight`

Deferred:

- Multiple render passes.
- Custom render targets.
- Custom cameras with user-defined projection matrices.
- Object types that depend on renderer internals.

Rules:

- `Object3D.add(child)` creates one parent-child relationship. Adding a child to
  a new parent removes the previous parent, matching the familiar Three.js
  authoring model.
- `name` is a debug label, not a stable reference. Use explicit IDs for stable
  references.
- `userData` may be supported only when it is plain JSON-compatible data and
  mapped to a declared component or metadata namespace. Functions, class
  instances, DOM objects, and runtime handles in `userData` are invalid.

### Transform API

Supported:

- `position: Vector3`
- `rotation: Euler`, serialized in radians.
- `quaternion: Quaternion`, serialized as `[x, y, z, w]`.
- `scale: Vector3`
- `lookAt(target)`
- Parent-child transform hierarchy.

Rules:

- The compiler serializes local transforms.
- World transforms are runtime-derived.
- If both Euler rotation and quaternion are assigned, the last explicit assignment wins.
- Non-uniform scale is allowed for rendering but may be rejected by physics components that require uniform scale.

### Geometry

Supported:

- `BoxGeometry`
- `SphereGeometry`
- `PlaneGeometry`
- `CapsuleGeometry`
- `CylinderGeometry`
- External glTF mesh assets.

Deferred:

- Arbitrary `BufferGeometry`.
- Runtime-generated geometry mutation.
- Direct attribute buffer writes.

V1 may add an import path for static `BufferGeometry` later, but it must be
captured as immutable mesh asset data. Runtime mutation of geometry attributes is
not portable to the Bevy adapter without a dedicated dynamic mesh capability.

### Materials

Supported:

- `MeshStandardMaterial`
- `MeshBasicMaterial`
- PBR parameters: `baseColor`, `metallic`, `roughness`, `emissive`, `alphaMode`.
- Texture slots: `baseColorTexture`, `normalTexture`, `metallicRoughnessTexture`, `emissiveTexture`, `occlusionTexture`.

Rules:

- Colors serialize as `#rrggbb` or linear RGBA arrays.
- Texture references must resolve through the asset manifest.
- Unsupported material fields are validation errors, not silent no-ops.

Deferred:

- Raw shader materials.
- Node materials.
- Arbitrary postprocessing chains.
- Renderer-specific material extensions.
- `onBeforeCompile`, `onBeforeRender`, and custom renderer callbacks.

### Assets

Supported:

- glTF and GLB models.
- PNG, JPEG, WebP textures.
- Audio files by manifest reference.
- Named animation clips from glTF assets.

Rules:

- Assets must be referenced by stable logical IDs or import handles.
- The compiler emits `assets.manifest.json`.
- Runtime paths are generated by the bundler and are not authored manually.

### Input

Supported:

- Keyboard actions.
- Pointer/touch actions.
- Touch-ready virtual controls declared through `input.ir.json` and target
  profile data.

Deferred:

- Gamepad actions are V3 unless added as an explicitly optional, non-blocking
  capability.
- Mobile packaging is V3; V2 can declare touch-ready controls without producing
  Android or iOS packages.

Input is action-based rather than platform-event based:

```ts
ctx.input.axis("moveX");
ctx.input.action("jump").pressed;
ctx.input.pointer("primary").position;
```

Unsupported:

- Direct DOM events.
- Browser-specific pointer lock calls.
- Native platform event handles.

## Object Lifecycle

SDK objects move through four lifecycle states.

### 1. Authored

Objects are created in TypeScript. Properties can be mutated freely while building the initial scene or world.

```ts
const mesh = new Mesh(geometry, material);
mesh.position.y = 1;
scene.add(mesh);
```

### 2. Captured

The compiler evaluates the entry point and captures the resulting scene or world. Captured objects must be reachable from the returned root or explicitly registered as systems, assets, or resources. Prefab registration is post-V2.

### 3. Serialized

Captured objects are converted to IR. During serialization:

- Object references become stable IDs.
- Components become JSON-compatible data.
- Functions are rejected except for registered systems.
- Runtime-only values are rejected.
- Default values may be omitted only when the schema declares the default.

### 4. Instantiated

The runtime loads the IR, creates entities, attaches components, resolves assets, registers systems, and starts the schedule.

After instantiation, gameplay state belongs to the runtime ECS. TypeScript code can modify state only through system context APIs.

## Identity and References

Every serializable object receives a stable ID.

Rules:

- User-supplied IDs must be unique within the bundle.
- If omitted, the compiler may generate IDs, but generated IDs are not stable API.
- Cross-entity references serialize by ID.
- Object identity cannot depend on JavaScript object memory identity at runtime.

Example:

```ts
const door = world.spawn("door", Door({ locked: true }));
world.spawn("switch", OpensDoor({ target: door.id }));
```

## Systems

Systems are named TypeScript functions registered with a schedule.

```ts
import { defineSystem, PlayerController, Transform } from "@threenative/sdk";

export const movePlayer = defineSystem({
  name: "movePlayer",
  stage: "update",
  query: [PlayerController, Transform],
}, (ctx, entities) => {
  for (const entity of entities) {
    const controller = entity.get(PlayerController);
    const transform = entity.get(Transform);
    transform.position.x += ctx.input.axis("moveX") * controller.speed * ctx.dt;
  }
});
```

System rules:

- Systems must be registered exports or passed to the world during authoring.
- System names must be unique.
- Systems run in declared schedule stages.
- Systems may read and write components through `ctx` and query results.
- Systems may spawn and despawn entities through command buffers.
- Systems must not capture unserializable local state.
- Systems must not perform network, filesystem, DOM, or platform calls unless an SDK capability explicitly allows it.
- Systems should declare read/write component access. This lets the Bevy adapter
  map systems into native scheduling rules and lets validators catch accidental
  mutation.

V1 supports TypeScript systems as bundled scripts called by runtime lifecycle hooks. Performance-critical native systems can be added later without changing the public component data contract.

## Validation

The compiler must validate SDK usage before emitting a bundle.

Required checks:

- Entry point returns `Scene`, `World`, or `Game`.
- All objects reachable from the root are serializable.
- Entity and asset IDs are unique.
- Referenced assets exist.
- Component data matches schema.
- System queries reference known components.
- Systems use supported schedule stages.
- UI bindings reference known resources, components, actions, or entities.
- Unsupported Three.js APIs are reported as errors.
- Target profile constraints are enforced.

Example error shape:

```txt
TN-SDK-1203 Unsupported material property
MeshStandardMaterial.envMap is not supported in v1.
File: src/game.ts:18:5
Suggestion: use scene environment settings or remove envMap.
```

## Public Boundaries

ThreeNative accepts code written against `@threenative/sdk`. It does not promise to run arbitrary Three.js applications.

Not supported:

- Importing `three` directly and expecting native compilation.
- Accessing `renderer`, `gl`, `canvas`, `document`, or `window`.
- Mutating internal renderer state.
- Patching prototypes.
- Depending on JavaScript evaluation order outside declared entry points, systems, and registered resources.
- Loading assets dynamically from arbitrary URLs at runtime unless an explicit networking capability is enabled.

Compatibility helpers may exist for migration, but the supported contract is the SDK API and the emitted IR schemas.

## Minimal Game Shape

A complete game module should be explicit about scene, systems, input, and targets.

```ts
import {
  Game,
  InputMap,
  MeshRenderer,
  PlayerController,
  Transform,
  World,
} from "@threenative/sdk";
import { movePlayer } from "./systems/move-player";
import { HUD } from "./ui/hud";

export default new Game({
  world: new World()
    .spawn("player",
      Transform.from({ position: [0, 1, 0] }),
      MeshRenderer.box({ size: [1, 2, 1] }),
      PlayerController({ speed: 5 }),
    ),
  systems: [movePlayer],
  input: new InputMap()
    .axis("moveX", { keys: ["KeyA", "KeyD"], touch: "leftStick.x" })
    .axis("moveY", { keys: ["KeyS", "KeyW"], touch: "leftStick.y" }),
  ui: [HUD],
  targets: {
    web: { renderer: "three-webgpu" },
    native: { runtime: "bevy" },
  },
});
```
