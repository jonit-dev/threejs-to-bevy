import type { IrTweenEasing, IrTweenProperty } from "./systems.js";
import type { IAssetsManifest, IWorldIr, Vec3 } from "./types.js";

export type ScriptVec3 = readonly [number, number, number];
export type ScriptSettingValue = boolean | number | string;

export interface IScriptSystemQuery {
  changed?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "id";
  with?: string[];
  without?: string[];
}

export interface IScriptInstantiateResult {
  accepted: boolean;
  entities: string[];
  prefab: string;
  root: string | null;
  status: "enqueued" | "missing";
}

export interface IScriptTweenCommandOptions {
  duration: number;
  easing?: IrTweenEasing;
  loops?: number;
  property: IrTweenProperty;
  to: number | readonly number[];
  yoyo?: boolean;
}

export interface IScriptTweenCommandResult {
  accepted: boolean;
  id: string;
  status: "enqueued" | "rejected";
}

export interface IScriptWorldTextCommandOptions {
  billboard?: boolean;
  color?: string | readonly number[];
  fade?: boolean;
  floatDistance?: number;
  lifetime?: number;
  offset?: ScriptVec3;
  size?: number;
  target?: string;
  text: string;
}

export interface IScriptWorldTextCommandResult {
  accepted: boolean;
  entity: string;
  status: "enqueued" | "rejected";
}

export interface IScriptAnimationRuntimeBlendState {
  complete: boolean;
  durationSeconds: number;
  elapsedSeconds: number;
  fromClip: string;
  fromWeight: number;
  toClip: string;
  toWeight: number;
}

export interface IScriptAnimationRuntimeState {
  active: boolean;
  activeState: string;
  blend?: IScriptAnimationRuntimeBlendState;
  clip: string;
  entity: string;
  loop: boolean;
  normalizedTime: number;
  sourceClip: string;
  speed: number;
  stopped: boolean;
  stopReason?: string;
  timeSeconds: number;
}

export type IScriptAnimationPlayResult = IScriptAnimationRuntimeState & { accepted: true };
export type IScriptAnimationQueryResult = IScriptAnimationRuntimeState;
export type IScriptAnimationStopResult = IScriptAnimationRuntimeState & { accepted: true };

export type ScriptAudioPlaybackKind = "loop" | "oneShot" | "tone";
export type ScriptAudioPlaybackStatus = "playing" | "rejected" | "stopped";

export interface IScriptAudioPlayOptions {
  entity?: string;
  loop?: boolean;
  pitch?: number;
  volume?: number;
}

export const SCRIPT_AUDIO_PLAYBACK_LIMITS = Object.freeze({
  pitch: Object.freeze({ min: 0.25, max: 4 }),
  rampSeconds: Object.freeze({ min: 0, max: 10 }),
  volume: Object.freeze({ min: 0, max: 4 }),
});

export interface IScriptAudioUpdateOptions {
  pitch?: number;
  rampSeconds?: number;
  volume?: number;
}

export type ScriptAudioUpdateValidation =
  | { accepted: true; options: IScriptAudioUpdateOptions }
  | { accepted: false; reason: "empty-update" | "invalid-pitch" | "invalid-ramp-seconds" | "invalid-volume" | "unsupported-option" };

export function validateScriptAudioUpdateOptions(value: unknown): ScriptAudioUpdateValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { accepted: false, reason: "empty-update" };
  }
  const options = value as Record<string, unknown>;
  if (Object.keys(options).some((key) => !["pitch", "rampSeconds", "volume"].includes(key))) {
    return { accepted: false, reason: "unsupported-option" };
  }
  const volume = options.volume;
  const pitch = options.pitch;
  const rampSeconds = options.rampSeconds;
  if (volume === undefined && pitch === undefined) {
    return { accepted: false, reason: "empty-update" };
  }
  if (!isFiniteInRange(volume, SCRIPT_AUDIO_PLAYBACK_LIMITS.volume)) {
    return { accepted: false, reason: "invalid-volume" };
  }
  if (!isFiniteInRange(pitch, SCRIPT_AUDIO_PLAYBACK_LIMITS.pitch)) {
    return { accepted: false, reason: "invalid-pitch" };
  }
  if (rampSeconds !== undefined && !isFiniteInRange(rampSeconds, SCRIPT_AUDIO_PLAYBACK_LIMITS.rampSeconds)) {
    return { accepted: false, reason: "invalid-ramp-seconds" };
  }
  return {
    accepted: true,
    options: {
      ...(typeof pitch === "number" ? { pitch } : {}),
      ...(typeof rampSeconds === "number" ? { rampSeconds } : {}),
      ...(typeof volume === "number" ? { volume } : {}),
    },
  };
}

function isFiniteInRange(value: unknown, range: { min: number; max: number }): boolean {
  return value === undefined
    || (typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max);
}

export interface IScriptAudioRuntimeState {
  accepted: boolean;
  entity?: string;
  kind?: ScriptAudioPlaybackKind;
  loop?: boolean;
  pitch?: number;
  playbackId: string;
  rampSeconds?: number;
  reason?: string;
  soundId: string;
  status: ScriptAudioPlaybackStatus;
  volume?: number;
}

export type IScriptAudioPlayResult = IScriptAudioRuntimeState;
export type IScriptAudioQueryResult = IScriptAudioRuntimeState;
export type IScriptAudioStopResult = IScriptAudioRuntimeState & { accepted: true };
export type IScriptAudioUpdateResult = IScriptAudioRuntimeState;

export interface IScriptCameraShakeOptions {
  amplitude?: number;
  camera?: string;
  duration?: number;
  frequency?: number;
  seed?: number | string;
}

export interface IScriptCameraShakeResult {
  accepted: boolean;
  id: string;
  status: "enqueued" | "rejected";
}

export interface IScriptCharacterMoveRequest {
  axes?: Record<string, number>;
  direction?: [number, number];
  fixedDelta?: number;
  speed?: number;
}

export interface IScriptCharacterContactObservation {
  material?: string;
  normal?: Vec3;
  other: string;
  phase: "begin" | "end" | "stay";
  point?: Vec3;
  pointIndex: number;
  self: string;
}

export interface IScriptCharacterSlopeObservation {
  angle: number;
  axis: "x" | "z";
  direction: -1 | 1;
  entity: string;
  rise: number;
  run: number;
  walkable: boolean;
}

export interface IScriptCharacterMoveResult {
  blockedBy?: string;
  contacts?: IScriptCharacterContactObservation[];
  desired: Vec3;
  entity: string;
  groundEntity?: string;
  grounded: boolean;
  platformDelta?: Vec3;
  pushed?: { entity: string; impulse: Vec3; position: Vec3 };
  pushes?: Array<{ entity: string; impulse: Vec3; position: Vec3 }>;
  resolved: Vec3;
  slope?: IScriptCharacterSlopeObservation;
  start: Vec3;
  tooHeavy?: string;
}

export interface IScriptFeedbackPlayOptions {
  camera?: string;
  entity?: string;
  seed?: number | string;
}

export interface IScriptFeedbackPlayResult {
  accepted: boolean;
  preset: string;
  status: "enqueued" | "missing";
}

export interface IScriptNavigationPathRequest {
  goal: Vec3;
  id?: string;
  start: Vec3;
}

export interface IScriptNavigationPathResult {
  failureReason?: "goal-outside" | "no-route" | "start-outside";
  path: Vec3[];
  query: string;
  status: "failed" | "success";
  totalCost: number;
  visitedRegions: string[];
}

export interface IScriptParticleCommandOptions {
  count?: number;
  seed?: number | string;
}

export interface IScriptParticleCommandResult {
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

export interface IScriptPersistenceSaveRecord {
  appVersion: string;
  components: Record<string, Record<string, unknown>>;
  resources: Record<string, unknown>;
  schema: "threenative.persistence-record";
  schemaVersion: number;
  settings: Record<string, ScriptSettingValue>;
  slot: string;
  version: "0.1.0";
}

export interface IScriptPersistenceSaveResult {
  accepted: boolean;
  record?: IScriptPersistenceSaveRecord;
  slot: string;
  status: "missing-slot" | "record-too-large" | "saved" | "storage-failed";
}

export interface IScriptPersistenceLoadResult {
  accepted: boolean;
  record?: IScriptPersistenceSaveRecord;
  slot: string;
  status: "loaded" | "missing-save" | "missing-slot";
  world: IWorldIr;
}

export interface IScriptPhysicsFilterRequest {
  ignore?: string[];
  layer?: string;
  layers?: string[];
  mask?: string[];
}

export type ScriptPhysicsQueryShape =
  | { halfExtents: [number, number, number]; kind: "box" }
  | { kind: "sphere"; radius: number };

export interface IScriptPhysicsOverlapRequest extends IScriptPhysicsFilterRequest {
  position: [number, number, number];
  shape: ScriptPhysicsQueryShape;
}

export interface IScriptPhysicsOverlapResult {
  entities: string[];
}

export interface IScriptPhysicsRaycastRequest extends IScriptPhysicsFilterRequest {
  direction: [number, number, number];
  maxDistance: number;
  origin: [number, number, number];
}

export interface IScriptPhysicsShapeCastRequest extends IScriptPhysicsFilterRequest {
  direction: [number, number, number];
  maxDistance: number;
  origin: [number, number, number];
  shape: ScriptPhysicsQueryShape;
}

export type IScriptPhysicsRaycastResult =
  | { hit: false }
  | { child?: string; distance: number; entity: string; hit: true; normal: [number, number, number]; point: [number, number, number] };

export type IScriptPhysicsShapeCastResult = IScriptPhysicsRaycastResult;

export interface IScriptPhysicsBodyCommandResult {
  accepted: boolean;
  entity: string;
  status: "applied" | "invalid-body" | "invalid-vector" | "missing";
}

export interface IScriptVehicleSetInputsResult {
  accepted: boolean;
  entity: string;
  status: "applied" | "invalid-controller" | "invalid-input" | "missing";
}

export interface IScriptAerodynamicsSetInputsResult {
  accepted: boolean;
  entity: string;
  status: "applied" | "invalid-aerodynamics" | "invalid-input" | "missing";
}

export interface IScriptAerodynamicsInputs {
  surfaces?: Readonly<Record<string, number>>;
  thrusters?: Readonly<Record<string, number>>;
}

export interface IScriptPhysicsSensorRequest {
  phases?: Array<"enter" | "exit" | "stay">;
  sensor?: string;
}

export interface IScriptPhysicsSensorEvent {
  filteredOut: string[];
  interactionKind?: string;
  occupants: string[];
  phase: "enter" | "exit" | "stay";
  sensor: string;
  step: number;
}

export interface IScriptPhysicsSensorResult {
  events: IScriptPhysicsSensorEvent[];
}

export interface IScriptSceneServiceResult<TOperation extends "change" | "loadAdditive" | "push" | "unload"> {
  accepted: true;
  operation: TOperation;
  scene: string;
}

export interface IScriptSequenceServiceResult<TOperation extends string> {
  accepted: boolean;
  operation: TOperation;
  sequence: string;
}

export interface IScriptSequenceQueryResult {
  active: boolean;
  sequence: string | null;
}

export interface IScriptUiActionEvent {
  action: string;
  node: string;
  value?: number | string;
}

export interface IScriptUiFocusResult {
  accepted: boolean;
  current: string | null;
  previous: string | null;
  status: "focused" | "missing" | "not-focusable";
}

export interface IScriptUiActivateResult {
  accepted: boolean;
  action?: string;
  node: string;
  status: "activated" | "disabled" | "missing" | "no-action";
}

export interface IScriptUiDisabledResult {
  accepted: boolean;
  disabled: boolean;
  node: string;
  status: "missing" | "updated";
}

export interface IScriptUiValueResult {
  accepted: boolean;
  node: string;
  status: "missing" | "updated";
  value: ScriptSettingValue;
}

export interface IScriptUiReadResult {
  action?: string;
  disabled: boolean;
  focusable: boolean;
  focused: boolean;
  kind?: string;
  node: string;
  status: "found" | "missing";
  value?: ScriptSettingValue;
}

export interface IScriptAssetLoadResult {
  accepted: boolean;
  asset: IAssetsManifest["assets"][number] | null;
  id: string;
  status: "missing" | "ready";
}

export interface IScriptScheduleAfterTicksOptions {
  delayTicks: number;
  id: string;
}

export interface IScriptScheduleAfterTicksResult {
  accepted: boolean;
  delayTicks: number;
  id: string;
  status: "enqueued" | "rejected";
}

export interface IScriptObserverPropagationStep {
  entity: string;
  phase: "bubble" | "target";
}

export interface IScriptComponentHookObservation {
  component: string;
  entity: string;
  hook: "onAdd" | "onInsert";
}

export interface IScriptTaskDeclarationView {
  channel?: string;
  id: string;
  mode: "fixed-trace";
  schedule: "fixedUpdate" | "postUpdate" | "startup" | "update";
}

export interface IScriptPluginDeclarationView {
  id: string;
  systems: string[];
}

export interface IScriptPluginGroupView {
  id: string;
  plugins: string[];
}
