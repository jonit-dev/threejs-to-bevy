import type {
  IAssetsManifest,
  IPickMeshRequest,
  IPickMeshResult,
  IPointerRayRequest,
  IPointerRayResult,
  IScriptAnimationPlayResult,
  IScriptAnimationQueryResult,
  IScriptAnimationStopResult,
  IScriptAerodynamicsInputs,
  IScriptAerodynamicsSetInputsResult,
  IScriptAssetLoadResult,
  IScriptAudioPlayOptions,
  IScriptAudioPlayResult,
  IScriptAudioQueryResult,
  IScriptAudioStopResult,
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
  IScriptObserverPropagationStep,
  IScriptParticleCommandOptions,
  IScriptParticleCommandResult,
  IScriptPersistenceLoadResult,
  IScriptPersistenceSaveResult,
  IScriptPhysicsBodyCommandResult,
  IScriptPhysicsOverlapRequest,
  IScriptPhysicsOverlapResult,
  IScriptPhysicsRaycastRequest,
  IScriptPhysicsRaycastResult,
  IScriptPhysicsSensorRequest,
  IScriptPhysicsSensorResult,
  IScriptPhysicsShapeCastRequest,
  IScriptPhysicsShapeCastResult,
  IScriptVehicleSetInputsResult,
  IScriptPluginDeclarationView,
  IScriptPluginGroupView,
  IScriptSceneServiceResult,
  IScriptScheduleAfterTicksOptions,
  IScriptScheduleAfterTicksResult,
  IScriptSequenceQueryResult,
  IScriptSequenceServiceResult,
  IScriptTaskDeclarationView,
  IScriptSystemQuery,
  IScriptTweenCommandOptions,
  IScriptTweenCommandResult,
  IScriptUiActionEvent,
  IScriptUiActivateResult,
  IScriptUiDisabledResult,
  IScriptUiFocusResult,
  IScriptUiReadResult,
  IScriptUiValueResult,
  IScriptWorldTextCommandOptions,
  IScriptWorldTextCommandResult,
  ScriptSettingValue,
  IVehicleControllerInput,
} from "@threenative/ir";
import type { IComponentReflectionRegistry, IComponentReflectionType } from "@threenative/ir/reflection";

export type ScriptVec3Tuple = [number, number, number];
export type ScriptQuatTuple = [number, number, number, number];

export interface ScriptEntity {
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

export interface ScriptTransformFacade {
  position: ScriptVec3Tuple;
  positionOr(fallback: readonly [number, number, number]): ScriptVec3Tuple;
  setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
  setPosition(position: readonly [number, number, number]): void;
  setRotation(rotation: readonly [number, number, number, number]): void;
  yawOr(fallback: number): number;
}

export interface ScriptAnimationFacade {
  play(entity: string | ScriptEntity, clip: string, options?: Record<string, unknown>): IScriptAnimationPlayResult;
  query(entity: string | ScriptEntity, clip?: string): IScriptAnimationQueryResult;
  stop(entity: string | ScriptEntity, clip?: string): IScriptAnimationStopResult;
}

export interface ScriptAssetsFacade {
  get(id: string): IAssetsManifest["assets"][number] | null;
  list(): IAssetsManifest["assets"];
  load(id: string): IScriptAssetLoadResult;
}

export interface ScriptAudioFacade {
  play(soundId: string, options?: IScriptAudioPlayOptions): IScriptAudioPlayResult;
  query(playbackId: string): IScriptAudioQueryResult;
  stop(playbackId: string): IScriptAudioStopResult;
}

export interface ScriptCamerasFacade {
  shake(options?: IScriptCameraShakeOptions): IScriptCameraShakeResult;
}

export interface ScriptChannelsFacade {
  read(channel: string): unknown[];
  send(channel: string, payload: unknown): void;
}

export interface ScriptCharacterFacade {
  move(entity: string | ScriptEntity, options?: IScriptCharacterMoveRequest): IScriptCharacterMoveResult | null;
}

export interface ScriptCommandsFacade {
  addComponent(entity: string, component: unknown, value?: unknown): void;
  clearParent(child: string): void;
  despawn(entity: string): void;
  emitEvent(event: string, payload?: unknown): void;
  instantiate(prefab: string, prefix: string): IScriptInstantiateResult;
  materialPatch(entity: string, value: Record<string, unknown>): void;
  removeComponent(entity: string, component: unknown): void;
  setComponent(entity: string, component: unknown, value: unknown): void;
  setParent(child: string, parent: string): void;
  spawn(entity: string, components?: Record<string, unknown>, tags?: readonly string[]): void;
  tween(entity: string, options: IScriptTweenCommandOptions): IScriptTweenCommandResult;
  worldText(entity: string, options: IScriptWorldTextCommandOptions): IScriptWorldTextCommandResult;
}

export interface ScriptComponentsFacade {
  hooks(component: string): IScriptComponentHookObservation[];
  type(component: string): IComponentReflectionType | null;
  types(): IComponentReflectionRegistry;
}

export interface ScriptEffectsFacade {
  play(preset: string, options?: IScriptFeedbackPlayOptions): IScriptFeedbackPlayResult;
}

export interface ScriptEntitiesFacade {
  byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ScriptEntity | undefined };
  countTag(tag: string): number;
  despawned(options?: ScriptEntityLifecycleQueryOptions): string[];
  spawned(options?: ScriptEntityLifecycleQueryOptions): string[];
  withTag(tag: string): ScriptEntity[];
}

export interface ScriptEntityLifecycleQueryOptions {
  tag?: string;
}

export interface ScriptEventsFacade {
  emit(event: string, payload?: unknown): void;
  read(event: string): unknown[];
}

export interface ScriptInputFacade {
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
}

export interface ScriptNavigationFacade {
  path(options: IScriptNavigationPathRequest): IScriptNavigationPathResult;
}

export interface ScriptObserversFacade {
  propagate(event: string, target: string): IScriptObserverPropagationStep[];
}

export interface ScriptParticlesFacade {
  burst(asset: string, emitter: string, options?: IScriptParticleCommandOptions): IScriptParticleCommandResult;
  clear(asset: string, emitter: string, options?: Pick<IScriptParticleCommandOptions, "seed">): IScriptParticleCommandResult;
  emit(asset: string, emitter: string, options?: IScriptParticleCommandOptions): IScriptParticleCommandResult;
  play(asset: string, emitter: string, options?: IScriptParticleCommandOptions): IScriptParticleCommandResult;
  reset(asset: string, emitter: string, options?: Pick<IScriptParticleCommandOptions, "seed">): IScriptParticleCommandResult;
  start(asset: string, emitter: string, options?: IScriptParticleCommandOptions): IScriptParticleCommandResult;
  stop(asset: string, emitter: string): IScriptParticleCommandResult;
}

export interface ScriptPersistenceFacade {
  delete(slot: string): { accepted: boolean; slot: string; status: "deleted" | "missing-save" };
  listSlots(): string[];
  load(slot: string): IScriptPersistenceLoadResult;
  save(slot: string): IScriptPersistenceSaveResult;
}

export interface ScriptPhysicsFacade {
  aerodynamics: ScriptPhysicsAerodynamicsFacade;
  addForce(entity: string, force: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  addForceAtPoint(entity: string, force: readonly [number, number, number], point: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  addTorque(entity: string, torque: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  applyAngularImpulse(entity: string, impulse: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  applyImpulse(entity: string, impulse: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  applyImpulseAtPoint(entity: string, impulse: readonly [number, number, number], point: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  overlap(options: IScriptPhysicsOverlapRequest): IScriptPhysicsOverlapResult;
  raycast(options: IScriptPhysicsRaycastRequest): IScriptPhysicsRaycastResult;
  sensor(options?: IScriptPhysicsSensorRequest): IScriptPhysicsSensorResult;
  setAngularVelocity(entity: string, velocity: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  setLinearVelocity(entity: string, velocity: readonly [number, number, number]): IScriptPhysicsBodyCommandResult;
  shapeCast(options: IScriptPhysicsShapeCastRequest): IScriptPhysicsShapeCastResult;
  vehicle: ScriptPhysicsVehicleFacade;
}

export interface ScriptPhysicsAerodynamicsFacade {
  setInputs(entity: string | ScriptEntity, inputs: IScriptAerodynamicsInputs): IScriptAerodynamicsSetInputsResult;
}

export interface ScriptPhysicsVehicleFacade {
  setInputs(entity: string | ScriptEntity, inputs: IVehicleControllerInput): IScriptVehicleSetInputsResult;
}

export interface ScriptPickingFacade {
  mesh(options: IPickMeshRequest): IPickMeshResult;
  pointerRay(options: IPointerRayRequest): IPointerRayResult;
}

export interface ScriptPluginsFacade {
  group(id: string): IScriptPluginGroupView | null;
  has(id: string): boolean;
  list(): IScriptPluginDeclarationView[];
}

export interface ScriptRandomFacade {
  bool(probability?: number): boolean;
  float(): number;
  int(min: number, max: number): number;
  pick<T>(values: readonly T[]): T | undefined;
  range(min: number, max: number): number;
}

export interface ScriptResourcesFacade {
  get<T = unknown>(name: string): T;
  get<T extends Record<string, unknown>>(name: string, defaults: T): T;
  patch(name: string, value: Record<string, unknown>): void;
  set(name: string, value: unknown): void;
}

export interface ScriptScenesFacade {
  change(scene: string, options?: Record<string, unknown>): IScriptSceneServiceResult<"change">;
  current(): string | null;
  loadAdditive(scene: string, options?: Record<string, unknown>): IScriptSceneServiceResult<"loadAdditive">;
  pop(options?: Record<string, unknown>): { accepted: true; operation: "pop" };
  push(scene: string, options?: Record<string, unknown>): IScriptSceneServiceResult<"push">;
  unload(scene: string, options?: Record<string, unknown>): IScriptSceneServiceResult<"unload">;
}

export interface ScriptScheduleFacade {
  afterTicks(options: IScriptScheduleAfterTicksOptions): IScriptScheduleAfterTicksResult;
}

export interface ScriptSequencesFacade {
  play(sequence: string, options?: Record<string, unknown>): IScriptSequenceServiceResult<"play">;
  query(sequence?: string): IScriptSequenceQueryResult;
  stop(sequence: string): IScriptSequenceServiceResult<"stop">;
}

export interface ScriptSettingsFacade {
  export(): Record<string, ScriptSettingValue>;
  get(key: string): ScriptSettingValue | undefined;
  import(values: Record<string, unknown>): Record<string, ScriptSettingValue>;
  set(key: string, value: ScriptSettingValue): boolean;
}

export interface ScriptStatesFacade {
  get(id: string): string | null;
}

export interface ScriptTasksFacade {
  channel(id: string): string | null;
  has(id: string): boolean;
  list(): IScriptTaskDeclarationView[];
}

export interface ScriptTimersFacade {
  done(start: number, duration: number): boolean;
  elapsed(start: number): number;
  progress(start: number, duration: number): number;
  ready(lastRun: number, cooldown: number): boolean;
  remaining(start: number, duration: number): number;
}

export interface ScriptTimeFacade {
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

export interface ScriptUiFacade {
  activate(nodeId: string): IScriptUiActivateResult;
  actions(): IScriptUiActionEvent[];
  focus(nodeId: string): IScriptUiFocusResult;
  read(nodeId: string): IScriptUiReadResult;
  setDisabled(nodeId: string, disabled: boolean): IScriptUiDisabledResult;
  setValue(nodeId: string, value: ScriptSettingValue): IScriptUiValueResult;
}

export interface ScriptPresentationContextFacades {
  animation: ScriptAnimationFacade;
  assets: ScriptAssetsFacade;
  audio: ScriptAudioFacade;
  cameras: ScriptCamerasFacade;
  effects: ScriptEffectsFacade;
  particles: ScriptParticlesFacade;
  picking: ScriptPickingFacade;
  ui: ScriptUiFacade;
}

export interface ScriptWorldContextFacades {
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
}

export interface ScriptDataContextFacades {
  persistence: ScriptPersistenceFacade;
  resources: ScriptResourcesFacade;
  settings: ScriptSettingsFacade;
}

export interface ScriptCoreContextFacades {
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
}

export interface ScriptContext
  extends ScriptCoreContextFacades,
    ScriptDataContextFacades,
    ScriptPresentationContextFacades,
    ScriptWorldContextFacades {}
