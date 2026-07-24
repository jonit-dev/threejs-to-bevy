# ThreeNative API Card

Contract for agents. Prefer this card,
`tn cookbook <id> --json`, and `pnpm run iterate` before reading repo
package source. `tn authoring inspect --project . --json` returns the canonical
compiler-derived capability, lifecycle, direct-edit, and absence profile.

## ScriptContext

```ts
interface ScriptContext {
  commands: ScriptCommandsFacade;
  entities: ScriptEntitiesFacade;
  entity(id: string): ScriptEntity | undefined;
  events: ScriptEventsFacade;
  input: ScriptInputFacade;
  query(query?: IScriptSystemQuery): ScriptEntity[];
  random: ScriptRandomFacade;
  schedule: ScriptScheduleFacade;
  state<T extends Record<string, unknown>>(key: string, defaults: T): T;
  time: ScriptTimeFacade;
  timers: ScriptTimersFacade;
  persistence: ScriptPersistenceFacade;
  resources: ScriptResourcesFacade;
  settings: ScriptSettingsFacade;
  animation: ScriptAnimationFacade;
  assets: ScriptAssetsFacade;
  audio: ScriptAudioFacade;
  cameras: ScriptCamerasFacade;
  effects: ScriptEffectsFacade;
  particles: ScriptParticlesFacade;
  picking: ScriptPickingFacade;
  ui: ScriptUiFacade;
  channels: ScriptChannelsFacade;
  character: ScriptCharacterFacade;
  components: ScriptComponentsFacade;
  navigation: ScriptNavigationFacade;
  observers: ScriptObserversFacade;
  physics: ScriptPhysicsFacade;
  plugins: ScriptPluginsFacade;
  scenes: ScriptScenesFacade;
  sequences: ScriptSequencesFacade;
  states: ScriptStatesFacade;
  tasks: ScriptTasksFacade;
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
  get<T = unknown>(name: string): T;
  get<T extends Record<string, unknown>>(name: string, defaults: T): T;
  patch(name: string, value: Record<string, unknown>): void;
  set(name: string, value: unknown): void;
  delta: number;
  deltaTime: number;
  dt: number;
  elapsed: number;
  fixedDelta: number;
  fixedDeltaTime: number;
  fixedDt: number;
  paused: boolean;
  time: number;
}
```

## Entity And Transform

```ts
interface ScriptEntity {
  readonly components?: Record<string, unknown>;
  readonly id: string;
  readonly tags?: string[];
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

- Services: `animation(play/query/stop)`, `assets(load)`, `audio(play/query/stop)`, `camera(shake)`, `character(move)`, `effects(play)`, `navigation(path)`, `particles(burst/clear/emit/play/reset/start/stop)`, `persistence(delete/listSlots/load/save)`, `physics(addForce/addForceAtPoint/addTorque/applyAngularImpulse/applyImpulse/applyImpulseAtPoint/overlap/raycast/sensor/setAngularVelocity/setLinearVelocity/shapeCast)`, `physics.aerodynamics(setInputs)`, `physics.vehicle(setInputs)`, `picking(mesh/pointerRay)`, `scene(change/current/loadAdditive/pop/push/unload)`, `sequences(play/query/stop)`, `settings(export/get/import/set)`, `ui(actions/activate/focus/read/setDisabled/setValue)`.
- Entity lifecycle: `context.commands.spawn`, `context.commands.instantiate`, `context.commands.despawn`.
- Component commands: `addComponent`, `removeComponent`, `setComponent`; entity access: `get`, `has`, `patch`, `set`.
- Source edits: prefer bounded-cli; direct durable source is supported-when-no-bounded-operation; follow with authoring-validation.
- Refresh project types with `tn types generate --project . --json`; prefer `defineBehavior(metadata, fn)` for referenced systems.
- Portable helpers include `Mathf`, `Vector2`, `Vector3`, `Quat`, `MaterialEx`, and `CameraMath`. Legacy aliases `NumberEx`, `Vec2`, and `Vec3` remain supported.
- Use ScriptContext facades only; browser, DOM, Node, timer, network, Three.js, and Bevy handles are not portable.
- Keep each referenced export self-contained: close over no module-local mutable state or helper declarations.
- Declare every component and literal resource read/write on the owning system or defineBehavior metadata.
- Absent: Use stable entity, asset, clip, material, and component IDs; raw renderer/native handles and imported model sub-node handles are not exposed.
- Absent: DOM, network, Node, filesystem, worker, and ambient timer APIs remain outside portable gameplay scripts.

## Structured Source Shapes

- Scenes: `content/scenes/*.scene.json` own entities, components, cameras,
  resources, UI bindings, and script references.
- Input: `content/input/*.input.json` uses `keyboard.KeyW`-style bindings;
  see `docs/contracts/input-binding-syntax.md` for the grammar.
- Systems: `content/systems/*.systems.json` attaches script module/export
  entries. New access metadata should live in `defineBehavior`.
- UI: `content/ui/*.ui.json` binds HUD text to resource paths such as
  `GameState.score`.

## Actor Shortcuts

```bash
tn actor list --project . --json
tn actor add character --id hero --scene <scene> --project . --json
tn actor add vehicle --id player.vehicle --scene <scene> --project . --json
```

## Default Loop

```bash
pnpm run iterate
tn playtest report --latest --scenario <name> --json
tn cookbook player-move-wasd --json
tn cookbook follow-camera --json
```
