import type { IAnimationsIr, IAssetsManifest } from "@threenative/ir";

type ModelAsset = Extract<IAssetsManifest["assets"][number], { kind: "model" }>;
type AnimationGraph = NonNullable<ModelAsset["animationGraph"]>;
type GraphModelAsset = ModelAsset & { animationGraph: AnimationGraph };
type AnimationState = AnimationGraph["states"][number];
type AnimationTransition = NonNullable<AnimationGraph["transitions"]>[number];
type ParticleEmitter = NonNullable<ModelAsset["particleEmitters"]>[number];

export interface IAnimationTraceInput {
  fixedDelta?: number;
  parameters?: Readonly<Record<string, boolean | number>>;
}

export interface IAnimationTraceObservation {
  activeState: string;
  asset: string;
  clip: string;
  events: Array<{ atSeconds: number; event: string; state: string }>;
  initialState: string;
  parameters: Record<string, boolean | number>;
  particles: Array<{
    id: string;
    lifetimeSeconds: number;
    maxParticles: number;
    shape: string;
    spawned: number;
  }>;
  queuedEvents: Array<{
    event: string;
    payload: {
      asset: string;
      atSeconds: number;
      clip: string;
      state: string;
    };
  }>;
  transition?: {
    blendSeconds?: number;
    from: string;
    to: string;
  };
}

export interface IAnimationPlaybackState {
  activeState?: string;
  asset: string;
  clip: string;
  loop: boolean;
  sourceClip: string;
  speed: number;
  timeSeconds: number;
}

export interface IAnimationRuntimeState {
  active: boolean;
  activeState: string;
  blend?: IAnimationRuntimeBlendState;
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

export interface IAnimationRuntimeBlendState {
  complete: boolean;
  durationSeconds: number;
  elapsedSeconds: number;
  fromClip: string;
  fromWeight: number;
  toClip: string;
  toWeight: number;
}

export interface IAnimationRuntimePlayOptions {
  activeState?: unknown;
  blendElapsedSeconds?: unknown;
  blendSeconds?: unknown;
  durationSeconds?: unknown;
  loop?: unknown;
  sourceClip?: unknown;
  speed?: unknown;
}

export type ParticleRuntimeCommand = "burst" | "clear" | "emit" | "play" | "reset" | "start" | "stop";

export interface IParticleRuntimeCommandOptions {
  count?: number;
  seed?: number | string;
}

export interface IParticleRuntimeCommandResult {
  accepted: boolean;
  active: boolean;
  asset: string;
  command: ParticleRuntimeCommand;
  count: number;
  emitter: string;
  maxParticles: number;
  seed: number;
  status: "burst" | "cleared" | "emitted" | "missing-emitter" | "played" | "reset" | "started" | "stopped";
}

export interface ITransformAnimationSample {
  channel: "position" | "rotation" | "scale";
  clip: string;
  target: string;
  timeSeconds: number;
  value: number[];
}

export function traceAnimationGraphs(assets: IAssetsManifest, input: IAnimationTraceInput = {}): IAnimationTraceObservation[] {
  const fixedDelta = input.fixedDelta ?? 1;
  return assets.assets
    .filter((asset): asset is GraphModelAsset => asset.kind === "model" && asset.animationGraph !== undefined)
    .map((asset) => traceAssetAnimation(asset, input.parameters ?? {}, fixedDelta))
    .sort((left, right) => left.asset.localeCompare(right.asset));
}

export function animationPlaybackState(asset: ModelAsset, input: IAnimationTraceInput = {}): IAnimationPlaybackState | undefined {
  if (asset.animations === undefined || asset.animations.length === 0) {
    return undefined;
  }
  const graph = asset.animationGraph;
  const parameters = graph === undefined ? {} : parameterValues(graph, input.parameters ?? {});
  const transition = graph?.transitions?.find((candidate) => candidate.from === graph.initialState && conditionMatches(candidate, parameters));
  const activeState = graph === undefined ? undefined : transition?.to ?? graph.initialState;
  const clipId = graph?.states.find((candidate) => candidate.id === activeState)?.clip ?? asset.animations[0]?.id;
  const clip = asset.animations.find((candidate) => candidate.id === clipId) ?? asset.animations[0];
  if (clip === undefined) {
    return undefined;
  }
  return {
    ...(activeState === undefined ? {} : { activeState }),
    asset: asset.id,
    clip: clip.id,
    loop: clip.loop ?? true,
    sourceClip: clip.sourceClip ?? clip.id,
    speed: clip.speed ?? 1,
    timeSeconds: (input.fixedDelta ?? 0) * (clip.speed ?? 1),
  };
}

export function advanceAnimationPlaybackState(playback: IAnimationPlaybackState, fixedDelta: number): IAnimationPlaybackState {
  return {
    ...playback,
    timeSeconds: playback.timeSeconds + fixedDelta * playback.speed,
  };
}

export class AnimationRuntimeController {
  readonly #states = new Map<string, AnimationRuntimeStateRecord>();

  play(entity: string, clip: string, options: IAnimationRuntimePlayOptions = {}): IAnimationRuntimeState {
    const durationSeconds = positiveNumber(options.durationSeconds, 1);
    const previous = this.#states.get(entity);
    const blendSeconds = positiveNumber(options.blendSeconds, 0);
    const blendElapsedSeconds = nonNegativeNumber(options.blendElapsedSeconds, 0);
    const blend = previous !== undefined && previous.active && previous.clip !== clip && blendSeconds > 0
      ? createBlendState(previous.clip, clip, blendSeconds, blendElapsedSeconds)
      : undefined;
    const state: AnimationRuntimeStateRecord = {
      active: true,
      activeState: typeof options.activeState === "string" ? options.activeState : clip,
      ...(blend === undefined ? {} : { blend }),
      clip,
      durationSeconds,
      entity,
      loop: typeof options.loop === "boolean" ? options.loop : true,
      sourceClip: typeof options.sourceClip === "string" ? options.sourceClip : clip,
      speed: positiveNumber(options.speed, 1),
      stopped: false,
      timeSeconds: 0,
    };
    this.#states.set(entity, state);
    return serializeAnimationRuntimeState(state);
  }

  query(entity: string, clip?: string): IAnimationRuntimeState {
    const state = this.#states.get(entity);
    if (state === undefined || (clip !== undefined && state.clip !== clip)) {
      return stoppedAnimationRuntimeState(entity, clip);
    }
    return serializeAnimationRuntimeState(state);
  }

  stop(entity: string, clip?: string): IAnimationRuntimeState {
    const state = this.#states.get(entity);
    if (state === undefined || (clip !== undefined && state.clip !== clip)) {
      const stopped = stoppedAnimationRuntimeState(entity, clip);
      this.#states.set(entity, { ...stopped, durationSeconds: 1, stopReason: "requested" });
      return { ...stopped, stopReason: "requested" };
    }
    const stopped: AnimationRuntimeStateRecord = {
      ...state,
      active: false,
      blend: undefined,
      stopped: true,
      stopReason: "requested",
    };
    this.#states.set(entity, stopped);
    return serializeAnimationRuntimeState(stopped);
  }

  advance(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    for (const [entity, state] of this.#states) {
      if (!state.active) {
        continue;
      }
      this.#states.set(entity, {
        ...state,
        blend: advanceBlend(state.blend, deltaSeconds),
        timeSeconds: state.timeSeconds + deltaSeconds * state.speed,
      });
    }
  }
}

export class ParticleRuntimeController {
  readonly #active = new Map<string, ParticleRuntimeStateRecord>();
  readonly #emitters = new Map<string, ParticleRuntimeEmitterRecord>();

  constructor(assets: IAssetsManifest | undefined) {
    for (const asset of assets?.assets ?? []) {
      if (asset.kind !== "model") {
        continue;
      }
      for (const emitter of asset.particleEmitters ?? []) {
        this.#emitters.set(`${asset.id}/${emitter.id}`, {
          lifetimeSeconds: emitter.lifetimeSeconds,
          maxParticles: emitter.maxParticles,
          ratePerSecond: emitter.ratePerSecond,
        });
      }
    }
  }

  execute(command: ParticleRuntimeCommand, assetId: string, emitterId: string, options: IParticleRuntimeCommandOptions = {}): IParticleRuntimeCommandResult {
    const key = `${assetId}/${emitterId}`;
    const emitter = this.#emitters.get(key);
    const seed = stableParticleSeed(options.seed ?? `${key}/${command}`);
    if (emitter === undefined) {
      return {
        accepted: false,
        active: false,
        asset: assetId,
        command,
        count: 0,
        emitter: emitterId,
        maxParticles: 0,
        seed,
        status: "missing-emitter",
      };
    }
    const requestedCount = particleCommandClears(command)
      ? 0
      : options.count ?? Math.max(1, Math.floor(emitter.ratePerSecond * emitter.lifetimeSeconds));
    const count = Math.min(emitter.maxParticles, Math.max(0, Math.floor(Number.isFinite(requestedCount) ? requestedCount : 0)));
    const result: IParticleRuntimeCommandResult = {
      accepted: true,
      active: particleCommandActivates(command),
      asset: assetId,
      command,
      count,
      emitter: emitterId,
      maxParticles: emitter.maxParticles,
      seed,
      status: particleCommandStatus(command),
    };
    if (particleCommandClears(command)) {
      this.#active.delete(key);
    } else {
      this.#active.set(key, {
        ageSeconds: 0,
        emitter,
        expires: command === "burst" || command === "emit",
        result,
      });
    }
    return cloneParticleResult(result);
  }

  advanceFixedTicks(ticks: number, fixedDelta: number): IParticleRuntimeCommandResult[] {
    if (!Number.isInteger(ticks) || ticks <= 0 || !Number.isFinite(fixedDelta) || fixedDelta <= 0) {
      return this.snapshot();
    }
    for (const [key, state] of this.#active) {
      const ageSeconds = state.ageSeconds + ticks * fixedDelta;
      if (state.expires && ageSeconds >= state.emitter.lifetimeSeconds) {
        this.#active.set(key, {
          ...state,
          ageSeconds,
          result: {
            ...state.result,
            active: false,
            count: 0,
          },
        });
      } else {
        this.#active.set(key, { ...state, ageSeconds });
      }
    }
    return this.snapshot();
  }

  snapshot(): IParticleRuntimeCommandResult[] {
    return [...this.#active.values()]
      .map((state) => cloneParticleResult(state.result))
      .sort((left, right) => left.asset.localeCompare(right.asset) || left.emitter.localeCompare(right.emitter) || left.command.localeCompare(right.command));
  }
}

export function sampleTransformAnimations(
  animations: IAnimationsIr | undefined,
  input: { timeSeconds?: number } = {},
): ITransformAnimationSample[] {
  if (animations === undefined) {
    return [];
  }
  const requestedTime = input.timeSeconds ?? 0;
  return animations.transformClips
    .flatMap((clip) => clip.tracks.map((track) => {
      const lastTime = track.keyframes.at(-1)?.timeSeconds ?? 0;
      const timeSeconds = clip.loop === "repeat" && lastTime > 0 ? requestedTime % lastTime : Math.min(requestedTime, lastTime);
      return {
        channel: track.channel,
        clip: clip.id,
        target: track.target,
        timeSeconds: round(timeSeconds),
        value: sampleTrack(track.keyframes, timeSeconds, track.easing ?? "linear"),
      };
    }))
    .sort((left, right) => left.clip.localeCompare(right.clip) || left.target.localeCompare(right.target) || left.channel.localeCompare(right.channel));
}

function sampleTrack(
  keyframes: readonly { timeSeconds: number; value: readonly number[] }[],
  timeSeconds: number,
  easing: "linear" | "step",
): number[] {
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (first === undefined || last === undefined || timeSeconds <= first.timeSeconds) {
    return [...(first?.value ?? [])].map(round);
  }
  if (timeSeconds >= last.timeSeconds) {
    return [...last.value].map(round);
  }
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.timeSeconds >= timeSeconds);
  const next = keyframes[nextIndex] ?? last;
  const previous = keyframes[nextIndex - 1] ?? first;
  if (easing === "step" || next.timeSeconds === previous.timeSeconds) {
    return [...previous.value].map(round);
  }
  const alpha = (timeSeconds - previous.timeSeconds) / (next.timeSeconds - previous.timeSeconds);
  return previous.value.map((value, index) => round(value + ((next.value[index] ?? value) - value) * alpha));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

type AnimationRuntimeStateRecord = Omit<IAnimationRuntimeState, "normalizedTime"> & { durationSeconds: number };

interface ParticleRuntimeEmitterRecord {
  lifetimeSeconds: number;
  maxParticles: number;
  ratePerSecond: number;
}

interface ParticleRuntimeStateRecord {
  ageSeconds: number;
  emitter: ParticleRuntimeEmitterRecord;
  expires: boolean;
  result: IParticleRuntimeCommandResult;
}

function serializeAnimationRuntimeState(state: AnimationRuntimeStateRecord): IAnimationRuntimeState {
  return {
    active: state.active,
    activeState: state.activeState,
    ...(state.blend === undefined ? {} : { blend: state.blend }),
    clip: state.clip,
    entity: state.entity,
    loop: state.loop,
    normalizedTime: normalizedAnimationTime(state.timeSeconds, state.durationSeconds, state.loop),
    sourceClip: state.sourceClip,
    speed: round(state.speed),
    stopped: state.stopped,
    ...(state.stopReason === undefined ? {} : { stopReason: state.stopReason }),
    timeSeconds: round(state.timeSeconds),
  };
}

function particleCommandActivates(command: ParticleRuntimeCommand): boolean {
  return command === "start" || command === "play" || command === "burst" || command === "emit";
}

function particleCommandClears(command: ParticleRuntimeCommand): boolean {
  return command === "stop" || command === "reset" || command === "clear";
}

function particleCommandStatus(command: ParticleRuntimeCommand): IParticleRuntimeCommandResult["status"] {
  switch (command) {
    case "burst":
      return "burst";
    case "clear":
      return "cleared";
    case "emit":
      return "emitted";
    case "play":
      return "played";
    case "reset":
      return "reset";
    case "start":
      return "started";
    case "stop":
      return "stopped";
  }
}

function stableParticleSeed(value: number | string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(Math.floor(value)) >>> 0;
  }
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cloneParticleResult(result: IParticleRuntimeCommandResult): IParticleRuntimeCommandResult {
  return { ...result };
}

function createBlendState(fromClip: string, toClip: string, durationSeconds: number, elapsedSeconds: number): IAnimationRuntimeBlendState {
  const elapsed = Math.min(durationSeconds, Math.max(0, elapsedSeconds));
  const alpha = durationSeconds <= 0 ? 1 : elapsed / durationSeconds;
  return {
    complete: elapsed >= durationSeconds,
    durationSeconds: round(durationSeconds),
    elapsedSeconds: round(elapsed),
    fromClip,
    fromWeight: round(1 - alpha),
    toClip,
    toWeight: round(alpha),
  };
}

function advanceBlend(blend: IAnimationRuntimeBlendState | undefined, deltaSeconds: number): IAnimationRuntimeBlendState | undefined {
  if (blend === undefined) {
    return undefined;
  }
  return createBlendState(blend.fromClip, blend.toClip, blend.durationSeconds, blend.elapsedSeconds + deltaSeconds);
}

function stoppedAnimationRuntimeState(entity: string, clip?: string): IAnimationRuntimeState {
  const resolvedClip = clip ?? "";
  return {
    active: false,
    activeState: resolvedClip,
    clip: resolvedClip,
    entity,
    loop: false,
    normalizedTime: 0,
    sourceClip: resolvedClip,
    speed: 0,
    stopped: true,
    stopReason: "not-found",
    timeSeconds: 0,
  };
}

function normalizedAnimationTime(timeSeconds: number, durationSeconds: number, loop: boolean): number {
  if (durationSeconds <= 0) {
    return 0;
  }
  const normalized = timeSeconds / durationSeconds;
  return round(loop ? normalized % 1 : Math.min(1, normalized));
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function traceAssetAnimation(
  asset: GraphModelAsset,
  overrides: Readonly<Record<string, boolean | number>>,
  fixedDelta: number,
): IAnimationTraceObservation {
  const graph = asset.animationGraph;
  const parameters = parameterValues(graph, overrides);
  const transition = (graph.transitions ?? []).find((candidate) => candidate.from === graph.initialState && conditionMatches(candidate, parameters));
  const activeStateId = transition?.to ?? graph.initialState;
  const state = graph.states.find((candidate) => candidate.id === activeStateId) ?? graph.states[0];
  if (state === undefined) {
    throw new Error(`Animation graph for '${asset.id}' does not declare any states.`);
  }
  const events = activeEvents(state, fixedDelta);

  return {
    activeState: state.id,
    asset: asset.id,
    clip: state.clip,
    events,
    initialState: graph.initialState,
    parameters,
    particles: (asset.particleEmitters ?? []).map((emitter) => traceParticleEmitter(emitter, fixedDelta)).sort((left, right) => left.id.localeCompare(right.id)),
    queuedEvents: events.map((event) => ({
      event: event.event,
      payload: {
        asset: asset.id,
        atSeconds: event.atSeconds,
        clip: state.clip,
        state: event.state,
      },
    })),
    ...(transition === undefined
      ? {}
      : {
          transition: {
            ...(transition.blendSeconds === undefined ? {} : { blendSeconds: transition.blendSeconds }),
            from: transition.from,
            to: transition.to,
          },
        }),
  };
}

function parameterValues(graph: AnimationGraph, overrides: Readonly<Record<string, boolean | number>>): Record<string, boolean | number> {
  return Object.fromEntries(
    (graph.parameters ?? [])
      .map((parameter) => [parameter.id, overrides[parameter.id] ?? parameter.default ?? defaultParameterValue(parameter.kind)] as const)
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function defaultParameterValue(kind: string): boolean | number {
  return kind === "number" ? 0 : false;
}

function conditionMatches(transition: AnimationTransition, parameters: Readonly<Record<string, boolean | number>>): boolean {
  const value = parameters[transition.when.parameter];
  if (transition.when.equals !== undefined && value !== transition.when.equals) {
    return false;
  }
  if (transition.when.greaterThan !== undefined && (typeof value !== "number" || value <= transition.when.greaterThan)) {
    return false;
  }
  if (transition.when.lessThan !== undefined && (typeof value !== "number" || value >= transition.when.lessThan)) {
    return false;
  }
  return true;
}

function activeEvents(state: AnimationState, fixedDelta: number): IAnimationTraceObservation["events"] {
  return (state.events ?? [])
    .filter((event) => event.atSeconds <= fixedDelta)
    .map((event) => ({ atSeconds: event.atSeconds, event: event.event, state: state.id }))
    .sort((left, right) => left.atSeconds - right.atSeconds || left.event.localeCompare(right.event));
}

function traceParticleEmitter(emitter: ParticleEmitter, fixedDelta: number): IAnimationTraceObservation["particles"][number] {
  return {
    id: emitter.id,
    lifetimeSeconds: emitter.lifetimeSeconds,
    maxParticles: emitter.maxParticles,
    shape: emitter.shape,
    spawned: Math.min(emitter.maxParticles, Math.floor(emitter.ratePerSecond * fixedDelta)),
  };
}
