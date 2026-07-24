import type { IComponentReflectionRegistry, IComponentReflectionType } from "@threenative/ir/reflection";
import type {
  IAssetsManifest,
  IPickMeshRequest,
  IPickMeshResult,
  IPointerRayRequest,
  IPointerRayResult,
  IScriptAnimationPlayResult,
  IScriptAnimationQueryResult,
  IScriptAnimationStopResult,
  IScriptAudioPlayOptions,
  IScriptAudioPlayResult,
  IScriptAudioQueryResult,
  IScriptAudioStopResult,
  IScriptAudioUpdateOptions,
  IScriptAudioUpdateResult,
  IScriptAssetLoadResult,
  IScriptCameraShakeOptions,
  IScriptCameraShakeResult,
  IScriptCharacterMoveRequest,
  IScriptCharacterMoveResult,
  IScriptComponentHookObservation,
  IScriptFeedbackPlayOptions,
  IScriptFeedbackPlayResult,
  IScriptInstantiateResult,
  IScriptNavigationPathRequest,
  IScriptNavigationPathResult,
  IScriptPersistenceLoadResult,
  IScriptPersistenceSaveResult,
  IScriptPhysicsBodyCommandResult,
  IScriptAerodynamicsSetInputsResult,
  IScriptAerodynamicsInputs,
  IScriptPhysicsOverlapRequest,
  IScriptPhysicsOverlapResult,
  IScriptPhysicsRaycastRequest,
  IScriptPhysicsRaycastResult,
  IScriptPhysicsSensorEvent,
  IScriptPhysicsSensorRequest,
  IScriptPhysicsSensorResult,
  IScriptPhysicsShapeCastRequest,
  IScriptPhysicsShapeCastResult,
  IScriptPluginDeclarationView,
  IScriptPluginGroupView,
  IScriptObserverPropagationStep,
  IScriptParticleCommandOptions,
  IScriptParticleCommandResult,
  IScriptSceneServiceResult,
  IScriptScheduleAfterTicksOptions,
  IScriptScheduleAfterTicksResult,
  IScriptSequenceQueryResult,
  IScriptSequenceServiceResult,
  IScriptSystemQuery,
  IScriptTaskDeclarationView,
  IScriptTweenCommandOptions,
  IScriptTweenCommandResult,
  IScriptVehicleSetInputsResult,
  IScriptUiActionEvent,
  IScriptUiActivateResult,
  IScriptUiDisabledResult,
  IScriptUiFocusResult,
  IScriptUiReadResult,
  IScriptUiValueResult,
  IScriptWorldTextCommandOptions,
  IScriptWorldTextCommandResult,
  IUiIr,
  IVehicleControllerInput,
  IWorldEntity,
  IrSystemService,
  IrTweenEasing,
  IrTweenProperty,
} from "@threenative/ir";

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
  localOffsetOr(fallback?: {
    position?: readonly [number, number, number];
    rotation?: readonly [number, number, number, number];
    scale?: readonly [number, number, number];
  }): {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
  position: [number, number, number];
  positionOr(fallback: readonly [number, number, number]): [number, number, number];
  setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
  setPosition(position: readonly [number, number, number]): void;
  setRotation(rotation: readonly [number, number, number, number]): void;
  setLocalOffset(offset: {
    position?: readonly [number, number, number];
    rotation?: readonly [number, number, number, number];
    scale?: readonly [number, number, number];
  }): void;
  resetLocalOffset(): void;
  yawOr(fallback: number): number;
}

export interface ISystemCommandBuffer {
  addComponent(entity: string, component: unknown, value?: unknown): void;
  clearParent(child: string): void;
  despawn(entity: string): void;
  emitEvent(event: unknown, payload?: unknown): void;
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
    play(entity: string | ISystemEntityView, clip: string, options?: Record<string, unknown>): IScriptAnimationPlayResult;
    query(entity: string | ISystemEntityView, clip?: string): IScriptAnimationQueryResult;
    stop(entity: string | ISystemEntityView, clip?: string): IScriptAnimationStopResult;
  };
  audio: {
    play(soundId: string, options?: IScriptAudioPlayOptions): IScriptAudioPlayResult;
    query(playbackId: string): IScriptAudioQueryResult;
    stop(playbackId: string): IScriptAudioStopResult;
    update(playbackId: string, options: IScriptAudioUpdateOptions): IScriptAudioUpdateResult;
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
    move(entity: string | ISystemEntityView, options?: ICharacterMoveRequest): IScriptCharacterMoveResult | null;
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
    emit(event: unknown, payload?: unknown): void;
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
    actions(): IScriptUiActionEvent[];
    focus(nodeId: string): IUiFocusResult;
    read(nodeId: string): IUiReadResult;
    setDisabled(nodeId: string, disabled: boolean): IUiDisabledResult;
    setValue(nodeId: string, value: boolean | number | string): IUiValueResult;
  };
  persistence: {
    delete(slot: string): { accepted: boolean; slot: string; status: "deleted" | "missing-save" };
    listSlots(): string[];
    load(slot: string): IScriptPersistenceLoadResult;
    save(slot: string): IScriptPersistenceSaveResult;
  };
  observers: {
    propagate(event: unknown, target: string): IObserverPropagationStep[];
  };
  plugins: {
    group(id: unknown): IPluginGroupView | null;
    has(id: unknown): boolean;
    list(): IPluginDeclarationView[];
  };
  query(query?: IScriptSystemQuery): ISystemEntityView[];
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
    aerodynamics: {
      setInputs(entity: string, inputs: IScriptAerodynamicsInputs): IScriptAerodynamicsSetInputsResult;
    };
    addForce(entity: string, force: readonly [number, number, number]): IPhysicsBodyCommandResult;
    addForceAtPoint(entity: string, force: readonly [number, number, number], point: readonly [number, number, number]): IPhysicsBodyCommandResult;
    addTorque(entity: string, torque: readonly [number, number, number]): IPhysicsBodyCommandResult;
    applyAngularImpulse(entity: string, impulse: readonly [number, number, number]): IPhysicsBodyCommandResult;
    applyImpulse(entity: string, impulse: readonly [number, number, number]): IPhysicsBodyCommandResult;
    applyImpulseAtPoint(entity: string, impulse: readonly [number, number, number], point: readonly [number, number, number]): IPhysicsBodyCommandResult;
    overlap(options: IScriptPhysicsOverlapRequest): IScriptPhysicsOverlapResult;
    raycast(options: IScriptPhysicsRaycastRequest): IScriptPhysicsRaycastResult;
    sensor(options?: IPhysicsSensorRequest): IPhysicsSensorResult;
    shapeCast(options: IScriptPhysicsShapeCastRequest): IScriptPhysicsShapeCastResult;
    setAngularVelocity(entity: string, velocity: readonly [number, number, number]): IPhysicsBodyCommandResult;
    setLinearVelocity(entity: string, velocity: readonly [number, number, number]): IPhysicsBodyCommandResult;
    vehicle: {
      setInputs(entity: string, inputs: IVehicleControllerInput): IScriptVehicleSetInputsResult;
    };
  };
  navigation: {
    path(options: IScriptNavigationPathRequest): IScriptNavigationPathResult;
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

export type IPhysicsBodyCommandResult = IScriptPhysicsBodyCommandResult;
export type IScheduleAfterTicksOptions = IScriptScheduleAfterTicksOptions;
export type IScheduleAfterTicksResult = IScriptScheduleAfterTicksResult;
export type IObserverPropagationStep = IScriptObserverPropagationStep;
export type IComponentHookObservation = IScriptComponentHookObservation;
export type ITaskDeclarationView = IScriptTaskDeclarationView;

export interface IEntityLifecycleQueryOptions {
  tag?: string;
}

export type ISequenceServiceResult<TOperation extends string> = IScriptSequenceServiceResult<TOperation>;
export type ISequenceQueryResult = IScriptSequenceQueryResult;
export type IPluginDeclarationView = IScriptPluginDeclarationView;
export type IPluginGroupView = IScriptPluginGroupView;

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

export type IInstantiateResult = IScriptInstantiateResult;

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

export type ITweenCommandOptions = IScriptTweenCommandOptions;
export type ITweenCommandResult = IScriptTweenCommandResult;
export type IWorldTextCommandOptions = IScriptWorldTextCommandOptions;
export type IWorldTextCommandResult = IScriptWorldTextCommandResult;
export type ICameraShakeOptions = IScriptCameraShakeOptions;
export type ICameraShakeResult = IScriptCameraShakeResult;
export type IFeedbackPlayOptions = IScriptFeedbackPlayOptions;
export type IFeedbackPlayResult = IScriptFeedbackPlayResult;
export type IParticleCommandOptions = IScriptParticleCommandOptions;
export type IParticleCommandResult = IScriptParticleCommandResult;

export type IUiFocusResult = IScriptUiFocusResult;
export type IUiActivateResult = IScriptUiActivateResult;
export type IUiDisabledResult = IScriptUiDisabledResult;
export type IUiValueResult = IScriptUiValueResult;
export type IUiReadResult = IScriptUiReadResult;
export type ISceneServiceResult<TOperation extends "change" | "loadAdditive" | "push" | "unload"> = IScriptSceneServiceResult<TOperation>;
export type IAssetLoadResult = IScriptAssetLoadResult;
export type ICharacterMoveRequest = IScriptCharacterMoveRequest;
export type IPhysicsSensorRequest = IScriptPhysicsSensorRequest;
export type IPhysicsSensorResult = IScriptPhysicsSensorResult;
