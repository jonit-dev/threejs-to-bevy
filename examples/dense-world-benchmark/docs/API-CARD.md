# ThreeNative API Card

Compact local contract for generated-project agents. Prefer this card,
`tn cookbook <id> --json`, and `pnpm run iterate` before reading repo
package source.

## ScriptContext

```ts
interface ScriptContext {
  entity(id: string): ScriptEntity | undefined;
  entities: {
  byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ScriptEntity | undefined };
  };
  input: {
  action(name: string): boolean;
  axis(name: string): number;
  axis1(axis: string, buttons?: { negative?: string; positive?: string }): number;
  getAxis(axis: string): number;
  getAxis2(xAxis: string, yAxis: string, options?: { deadzone?: number; normalize?: boolean }): [number, number];
  getButton(name: string): boolean;
  getButtonDown(name: string): boolean;
  getButtonUp(name: string): boolean;
  pressed(name: string): boolean;
  released(name: string): boolean;
  };
  query(query?: { changed?: unknown[]; limit?: number; offset?: number; orderBy?: string; with?: unknown[]; without?: unknown[] }): ScriptEntity[];
  resources: {
  get<T = unknown>(name: string): T;
  get<T extends Record<string, unknown>>(name: string, defaults: T): T;
  patch(name: string, value: Record<string, unknown>): void;
  set(name: string, value: unknown): void;
  };
  state<T extends Record<string, unknown>>(key: string, defaults: T): T;
  time: {
  delta: number;
  deltaTime: number;
  dt: number;
  elapsed: number;
  fixedDelta: number;
  fixedDeltaTime: number;
  fixedDt: number;
  paused: boolean;
  time: number;
  };
  [surface: string]: unknown;
}
```

## Entity And Transform

```ts
interface ScriptEntity {
  readonly components?: Record<string, unknown>;
  readonly id: string;
  get<T = unknown>(component: unknown): T;
  get<T extends Record<string, unknown>>(component: unknown, defaults: T): T;
  has(component: unknown): boolean;
  patch(component: unknown, value: Record<string, unknown>): void;
  set(component: unknown, value: unknown): void;
  transform(): ScriptTransformFacade;
}

interface ScriptTransformFacade {
  position: ScriptVec3Tuple;
  positionOr(fallback: readonly [number, number, number]): ScriptVec3Tuple;
  setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
  setPosition(position: readonly [number, number, number]): void;
  setRotation(rotation: readonly [number, number, number, number]): void;
  yawOr(fallback: number): number;
}
```

## Script Authoring Rules

- Put durable behavior in `src/scripts/**/*.ts`; reference module/export from
  `content/**/*.json`.
- Read movement with `context.input.getAxis("MoveX")` /
  `context.input.getAxis("MoveZ")` or `context.input.getButton("<name>")`.
- Move entities through `entity.transform().position`,
  `setPosition([x, y, z])`, or `setPose(position, rotation)`.
- Use `context.resources.get/set/patch` for game state and HUD bindings.
- If a script calls `entity.patch("MeshRenderer", ...)`, declare
  `writes: ["MeshRenderer"]`; transform movement declares
  `writes: ["Transform"]`. `writes` are component names, not entity IDs.
- Use `context.time.fixedDelta` for deterministic fixed-step movement.
- Supported helper imports: `Mathf`, `Vector2`, `Vector3`, `Quat`,
  `TransformMath`, `Bounds2`, `Bounds3`, `Ease`, `RandomEx`,
  `ColorEx`, `TextEx`, `InputEx`, `MotionEx`, `TimerEx`,
  `ArrayEx`, and `CameraMath` from `@threenative/script-stdlib`.
  Legacy aliases `NumberEx`, `Vec2`, and `Vec3` remain supported for one
  compatibility cycle.
- Do not import DOM, Node, filesystem, timer, network, Three.js, or Bevy APIs
  from portable scripts.

## Structured Source Shapes

- Scenes: `content/scenes/*.scene.json` own entities, transforms, components,
  cameras, resources, UI bindings, and script references.
- Input: `content/input/*.input.json` uses actions with
  `keyboard.KeyW`-style bindings and axes named `MoveX` / `MoveZ`.
- Systems: `content/systems/*.systems.json` declares every script module,
  export, component read/write, and resource read/write.
- UI: `content/ui/*.ui.json` binds HUD text to resource paths such as
  `GameState.score`.
- Typed spec: `src/game.spec.ts` is compiled by
  `tn authoring compile-typed-spec --json`; HUD bindings use
  `{ node, resource: "GameState", fields: ["scoreText"] }`.
- Assets/materials/meshes stay in `content/assets`, `content/materials`,
  and `content/meshes`; preserve stable IDs and schema fields.

## Default Loop

```bash
pnpm run iterate
tn playtest report --latest --scenario <name> --json
tn cookbook player-move-wasd --json
tn cookbook follow-camera --json
tn cookbook hud-score-binding --json
tn cookbook top-down-collector-recipe --json
tn cookbook lane-runner-spawn --json
```
