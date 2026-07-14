import type { IComponentReflectionRegistry, IComponentReflectionType } from "@threenative/ir/reflection";
import type { IAssetsManifest, IIrSystemQuery, IPickMeshRequest, IPickMeshResult, IPointerRayRequest, IPointerRayResult, IUiIr, IWorldEntity, IrSystemService, IrTweenEasing, IrTweenProperty } from "@threenative/ir";
import type { IScriptAudioPlayOptions } from "../audio.js";
import type { ICharacterTraceObservation } from "../character.js";
import type { IUiActionEvent } from "../ui/inputBridge.js";
import type { IPhysicsSensorEvent } from "../sensors.js";
import type { animationPlayPayload, animationQueryPayload, animationStopPayload } from "./services/animation.js";
import type { audioPlayPayload, audioQueryPayload, audioStopPayload } from "./services/audio.js";
import type { IWebPersistenceService } from "./services/persistence.js";
import type { IOverlapRequest, IOverlapResult, IRaycastRequest, IRaycastResult, IShapeCastRequest, IShapeCastResult } from "./services/physics.js";
import type { INavigationPathRequest, INavigationPathResult } from "../navigation.js";

export interface ISystemEntityView {
  components: IWorldEntity["components"];
  get<T = unknown>(component: unknown, defaults?: Record<string, unknown>): T;
  has(component: unknown): boolean;
  id: string;
  patch(component: unknown, value: Record<string, unknown>): void;
  set(component: unknown, value: unknown): void;
  tags: string[];
  transform(): ISystemTransformFacade;
}

export interface ISystemTransformFacade {
  position: [number, number, number];
  positionOr(fallback: readonly [number, number, number]): [number, number, number];
  setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
  setPosition(position: readonly [number, number, number]): void;
  setRotation(rotation: readonly [number, number, number, number]): void;
  yawOr(fallback: number): number;
}

export interface ISystemCommandBuffer {
  addComponent(entity: string, component: unknown, value?: unknown): void;
  clearParent(child: string): void;
  despawn(entity: string): void;
  emitEvent(event: unknown, payload: unknown): void;
  instantiate(prefab: string, prefix: string): IInstantiateResult;
  materialPatch(entity: string, value: Record<string, unknown>): void;
  removeComponent(entity: string, component: unknown): void;
  setComponent(entity: string, component: unknown, value: unknown): void;
  setParent(child: string, parent: string): void;
  spawn(entity: string, components?: Record<string, unknown>, tags?: readonly string[]): void;
  tween(entity: string, options: ITweenCommandOptions): ITweenCommandResult;
  worldText(entity: string, options: IWorldTextCommandOptions): IWorldTextCommandResult;
}

export interface ISystemContext {
  animation: {
    play(entity: string | ISystemEntityView, clip: string, options?: Record<string, unknown>): ReturnType<typeof animationPlayPayload>["result"];
    query(entity: string | ISystemEntityView, clip?: string): ReturnType<typeof animationQueryPayload>["result"];
    stop(entity: string | ISystemEntityView, clip?: string): ReturnType<typeof animationStopPayload>["result"];
  };
  audio: {
    play(soundId: string, options?: IScriptAudioPlayOptions): ReturnType<typeof audioPlayPayload>["result"];
    query(playbackId: string): ReturnType<typeof audioQueryPayload>["result"];
    stop(playbackId: string): ReturnType<typeof audioStopPayload>["result"];
  };
  cameras: {
    shake(options?: ICameraShakeOptions): ICameraShakeResult;
  };
  particles: {
    burst(asset: string, emitter: string, options?: IParticleCommandOptions): IParticleCommandResult;
    clear(asset: string, emitter: string, options?: Pick<IParticleCommandOptions, "seed">): IParticleCommandResult;
    emit(asset: string, emitter: string, options?: IParticleCommandOptions): IParticleCommandResult;
    play(asset: string, emitter: string, options?: IParticleCommandOptions): IParticleCommandResult;
    reset(asset: string, emitter: string, options?: Pick<IParticleCommandOptions, "seed">): IParticleCommandResult;
    start(asset: string, emitter: string, options?: IParticleCommandOptions): IParticleCommandResult;
    stop(asset: string, emitter: string): IParticleCommandResult;
  };
  assets: {
    get(id: unknown): IAssetsManifest["assets"][number] | null;
    list(): IAssetsManifest["assets"];
    load(id: unknown): IAssetLoadResult;
  };
  character: {
    move(entity: string | ISystemEntityView, options?: ICharacterMoveRequest): ICharacterTraceObservation | null;
  };
  commands: ISystemCommandBuffer;
  effects: {
    play(preset: string, options?: IFeedbackPlayOptions): IFeedbackPlayResult;
  };
  components: {
    hooks(component: unknown): IComponentHookObservation[];
    type(component: unknown): IComponentReflectionType | null;
    types(): IComponentReflectionRegistry;
  };
  channels: {
    read(channel: unknown): unknown[];
    send(channel: unknown, payload: unknown): void;
  };
  events: {
    emit(event: unknown, payload: unknown): void;
    read(event: unknown): unknown[];
  };
  input: {
    action(name: string): boolean;
    axis1(axis: string, buttons?: { negative?: string; positive?: string }): number;
    axis(name: string): number;
    getAxis(axis: string): number;
    getAxis2(xAxis: string, yAxis: string, options?: { deadzone?: number; normalize?: boolean }): [number, number];
    getButton(name: string): boolean;
    getButtonDown(name: string): boolean;
    getButtonUp(name: string): boolean;
    pressed(name: string): boolean;
    released(name: string): boolean;
  };
  entities: {
    byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ISystemEntityView | undefined };
    countTag(tag: string): number;
    despawned(options?: IEntityLifecycleQueryOptions): string[];
    spawned(options?: IEntityLifecycleQueryOptions): string[];
    withTag(tag: string): ISystemEntityView[];
  };
  entity(id: string): ISystemEntityView | undefined;
  ui: {
    activate(nodeId: string): IUiActivateResult;
    actions(): IUiActionEvent[];
    focus(nodeId: string): IUiFocusResult;
    read(nodeId: string): IUiReadResult;
    setDisabled(nodeId: string, disabled: boolean): IUiDisabledResult;
    setValue(nodeId: string, value: boolean | number | string): IUiValueResult;
  };
  persistence: {
    delete(slot: string): { accepted: boolean; slot: string; status: "deleted" | "missing-save" };
    listSlots(): string[];
    load(slot: string): ReturnType<IWebPersistenceService["load"]>;
    save(slot: string): ReturnType<IWebPersistenceService["save"]>;
  };
  observers: {
    propagate(event: unknown, target: string): IObserverPropagationStep[];
  };
  plugins: {
    group(id: unknown): IPluginGroupView | null;
    has(id: unknown): boolean;
    list(): IPluginDeclarationView[];
  };
  query(query?: IIrSystemQuery): ISystemEntityView[];
  random: {
    bool(probability?: number): boolean;
    float(): number;
    int(min: number, max: number): number;
    pick<T>(values: readonly T[]): T | undefined;
    range(min: number, max: number): number;
  };
  scenes: {
    change(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"change">;
    current(): string | null;
    loadAdditive(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"loadAdditive">;
    pop(options?: Record<string, unknown>): { accepted: true; operation: "pop" };
    push(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"push">;
    unload(scene: string, options?: Record<string, unknown>): ISceneServiceResult<"unload">;
  };
  schedule: {
    afterTicks(options: IScheduleAfterTicksOptions): IScheduleAfterTicksResult;
  };
  sequences: {
    play(sequence: string, options?: Record<string, unknown>): ISequenceServiceResult<"play">;
    query(sequence?: string): ISequenceQueryResult;
    stop(sequence: string): ISequenceServiceResult<"stop">;
  };
  timers: {
    done(start: number, duration: number): boolean;
    elapsed(start: number): number;
    progress(start: number, duration: number): number;
    ready(lastRun: number, cooldown: number): boolean;
    remaining(start: number, duration: number): number;
  };
  resources: {
    get<T = unknown>(name: string, defaults?: Record<string, unknown>): T;
    patch(name: string, value: Record<string, unknown>): void;
    set(name: string, value: unknown): void;
  };
  settings: {
    export(): Record<string, boolean | number | string>;
    get(key: string): boolean | number | string | undefined;
    import(values: Record<string, unknown>): Record<string, boolean | number | string>;
    set(key: string, value: boolean | number | string): boolean;
  };
  states: {
    get(id: string): string | null;
  };
  tasks: {
    channel(id: unknown): string | null;
    has(id: unknown): boolean;
    list(): ITaskDeclarationView[];
  };
  physics: {
    addForce(entity: string, force: readonly [number, number, number]): IPhysicsBodyCommandResult;
    addTorque(entity: string, torque: readonly [number, number, number]): IPhysicsBodyCommandResult;
    applyAngularImpulse(entity: string, impulse: readonly [number, number, number]): IPhysicsBodyCommandResult;
    applyImpulse(entity: string, impulse: readonly [number, number, number]): IPhysicsBodyCommandResult;
    overlap(options: IOverlapRequest): IOverlapResult;
    raycast(options: IRaycastRequest): IRaycastResult;
    sensor(options?: IPhysicsSensorRequest): IPhysicsSensorResult;
    shapeCast(options: IShapeCastRequest): IShapeCastResult;
    setAngularVelocity(entity: string, velocity: readonly [number, number, number]): IPhysicsBodyCommandResult;
    setLinearVelocity(entity: string, velocity: readonly [number, number, number]): IPhysicsBodyCommandResult;
  };
  navigation: {
    path(options: INavigationPathRequest): INavigationPathResult;
  };
  picking: {
    mesh(options: IPickMeshRequest): IPickMeshResult;
    pointerRay(options: IPointerRayRequest): IPointerRayResult;
  };
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
  state<T extends Record<string, unknown>>(key: string, defaults: T): T;
}

export interface IPhysicsBodyCommandResult {
  accepted: boolean;
  entity: string;
  status: "applied" | "invalid-body" | "invalid-vector" | "missing";
}

export interface IScheduleAfterTicksOptions {
  delayTicks: number;
  id: string;
}

export interface IScheduleAfterTicksResult {
  accepted: boolean;
  delayTicks: number;
  id: string;
  status: "enqueued" | "rejected";
}

export interface IObserverPropagationStep {
  entity: string;
  phase: "bubble" | "target";
}

export interface IComponentHookObservation {
  component: string;
  entity: string;
  hook: "onAdd" | "onInsert";
}

export interface ITaskDeclarationView {
  channel?: string;
  id: string;
  mode: "fixed-trace";
  schedule: "fixedUpdate" | "postUpdate" | "startup" | "update";
}

export interface IEntityLifecycleQueryOptions {
  tag?: string;
}

export interface ISequenceServiceResult<TOperation extends string> {
  accepted: boolean;
  operation: TOperation;
  sequence: string;
}

export interface ISequenceQueryResult {
  active: boolean;
  sequence: string | null;
}

export interface IPluginDeclarationView {
  id: string;
  systems: string[];
}

export interface IPluginGroupView {
  id: string;
  plugins: string[];
}

export interface IQueuedCommand {
  child?: string;
  components?: Record<string, unknown>;
  component?: string;
  entity: string;
  event?: string;
  kind: "addComponent" | "clearParent" | "despawn" | "emitEvent" | "instantiate" | "material.patch" | "removeComponent" | "setComponent" | "setParent" | "spawn" | "tween" | "worldText";
  parent?: string;
  payload?: unknown;
  prefab?: string;
  prefix?: string;
  property?: IrTweenProperty;
  source: "command" | "entity";
  tags?: string[];
  to?: number | number[];
  value?: unknown;
}

export interface IInstantiateResult {
  accepted: boolean;
  entities: string[];
  prefab: string;
  root: string | null;
  status: "enqueued" | "missing";
}

export interface IQueuedEvent {
  event: string;
  payload: unknown;
}

export interface IQueuedResourceWrite {
  resource: string;
  value: unknown;
}

export interface IQueuedServiceCall {
  payload: unknown;
  service: IrSystemService;
}

export interface ITweenCommandOptions {
  duration: number;
  easing?: IrTweenEasing;
  loops?: number;
  property: IrTweenProperty;
  to: number | readonly number[];
  yoyo?: boolean;
}

export interface ITweenCommandResult {
  accepted: boolean;
  id: string;
  status: "enqueued" | "rejected";
}

export interface IWorldTextCommandOptions {
  billboard?: boolean;
  color?: string | readonly number[];
  fade?: boolean;
  floatDistance?: number;
  lifetime?: number;
  offset?: readonly [number, number, number];
  size?: number;
  target?: string;
  text: string;
}

export interface IWorldTextCommandResult {
  accepted: boolean;
  entity: string;
  status: "enqueued" | "rejected";
}

export interface ICameraShakeOptions {
  amplitude?: number;
  camera?: string;
  duration?: number;
  frequency?: number;
  seed?: number | string;
}

export interface ICameraShakeResult {
  accepted: boolean;
  id: string;
  status: "enqueued" | "rejected";
}

export interface IFeedbackPlayOptions {
  camera?: string;
  entity?: string;
  seed?: number | string;
}

export interface IFeedbackPlayResult {
  accepted: boolean;
  preset: string;
  status: "enqueued" | "missing";
}

export interface IParticleCommandOptions {
  count?: number;
  seed?: number | string;
}

export interface IParticleCommandResult {
  accepted: boolean;
  active: boolean;
  asset: string;
  command: "burst" | "clear" | "emit" | "play" | "reset" | "start" | "stop";
  count: number;
  emitter: string;
  maxParticles: number;
  seed: number;
  status: "burst" | "cleared" | "emitted" | "missing-emitter" | "played" | "reset" | "started" | "stopped";
}

export interface IUiFocusResult {
  accepted: boolean;
  current: string | null;
  previous: string | null;
  status: "focused" | "missing" | "not-focusable";
}

export interface IUiActivateResult {
  accepted: boolean;
  action?: string;
  node: string;
  status: "activated" | "disabled" | "missing" | "no-action";
}

export interface IUiDisabledResult {
  accepted: boolean;
  disabled: boolean;
  node: string;
  status: "missing" | "updated";
}

export interface IUiValueResult {
  accepted: boolean;
  node: string;
  status: "missing" | "updated";
  value: boolean | number | string;
}

export interface IUiReadResult {
  action?: string;
  disabled: boolean;
  focusable: boolean;
  focused: boolean;
  kind?: string;
  node: string;
  status: "found" | "missing";
  value?: boolean | number | string;
}

export interface ISceneServiceResult<TOperation extends "change" | "loadAdditive" | "push" | "unload"> {
  accepted: true;
  operation: TOperation;
  scene: string;
}

export interface IAssetLoadResult {
  accepted: boolean;
  asset: IAssetsManifest["assets"][number] | null;
  id: string;
  status: "missing" | "ready";
}

export interface ICharacterMoveRequest {
  axes?: Record<string, number>;
  direction?: [number, number];
  fixedDelta?: number;
  speed?: number;
}

export interface IPhysicsSensorRequest {
  phases?: Array<"enter" | "exit" | "stay">;
  sensor?: string;
}

export interface IPhysicsSensorResult {
  events: IPhysicsSensorEvent[];
}
