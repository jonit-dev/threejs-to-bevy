# ThreeNative API Card

Compact local contract for generated-project agents. Prefer this card,
`tn cookbook <id> --json`, and `pnpm run iterate` before reading repo
package source.

## ScriptContext

```ts
interface ScriptContext {
  commands: {
  addComponent(entity: string, component: Record<string, unknown>): void;
  clearParent(child: string): void;
  despawn(entity: string, policy?: string): void;
  emitEvent(event: string, payload?: Record<string, unknown>): void;
  instantiate(prefab: string, prefix: string, overrides?: Record<string, unknown>): void;
  materialPatch(entity: string, value: { color?: unknown; emissive?: unknown; emissiveIntensity?: number; opacity?: number }): void;
  removeComponent(entity: string, component: unknown): void;
  setComponent(entity: string, component: unknown, value: unknown): void;
  setParent(child: string, parent: string): void;
  spawn(entity: string, components?: unknown): void;
  };
  entity(id: string): ScriptEntity | undefined;
  entities: {
  byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ScriptEntity | undefined };
  };
  events: {
  emit(event: string, payload?: Record<string, unknown>): void;
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
  picking: {
  mesh(options: IPickMeshRequest): IPickMeshResult;
  pointerRay(options: IPointerRayRequest): IPointerRayResult;
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
- Refresh project types with `tn types generate --project . --json`; `tn build`
  and `tn dev --watch` do this automatically.
- Prefer `defineBehavior(metadata, fn)` for new systems. Put schedule,
  access, services, and query metadata in code; keep systems JSON as
  module/export attachments.
- Read movement with `context.input.getAxis("MoveX")` /
  `context.input.getAxis("MoveZ")` or `context.input.getButton("<name>")`.
- Move entities through `entity.transform().position`,
  `setPosition([x, y, z])`, or `setPose(position, rotation)`.
- Use `context.resources.get/set/patch` for game state and HUD bindings.
- If a script calls `entity.patch("MeshRenderer", ...)`, declare
  `writes: ["MeshRenderer"]` in `defineBehavior`; transform movement declares
  `writes: ["Transform"]`. `writes` are component names, not entity IDs.
- Use `context.time.fixedDelta` for deterministic fixed-step movement.
- Import portable helpers such as `Mathf`, `Vector2`, `Vector3`, `Quat`,
  `MaterialEx`, and `CameraMath` from `@threenative/script-stdlib`.
- Legacy aliases `NumberEx`, `Vec2`, and `Vec3` remain supported.
- Do not import DOM, Node, filesystem, timer, network, Three.js, or Bevy APIs
  from portable scripts.

## Structured Source Shapes

- Scenes: `content/scenes/*.scene.json` own entities, transforms, components,
  cameras, resources, UI bindings, and script references.
  Perspective cameras use `fovY`; orthographic cameras use `size`.
- Input: `content/input/*.input.json` uses `keyboard.KeyW`-style bindings;
  see `docs/contracts/input-binding-syntax.md` for the grammar.
- Systems: `content/systems/*.systems.json` attaches script module/export
  entries. New access metadata should live in `defineBehavior`.
- UI: `content/ui/*.ui.json` binds HUD text to resource paths such as
  `GameState.score`.
- Typed spec: `src/game.spec.ts` is compiled by
  `tn authoring compile-typed-spec --json`; HUD bindings use
  `{ node, resource: "GameState", fields: ["scoreText"] }`.

## Actor Shortcuts

```bash
tn actor list --project . --json
tn actor add character --id hero --scene <scene> --project . --json
tn actor add vehicle --id player.vehicle --scene <scene> --project . --json
tn actor add pickup --id pickup.01 --scene <scene> --project . --json
tn actor update hero --set speed=5 --project . --json
```

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
