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
