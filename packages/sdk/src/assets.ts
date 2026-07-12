import { SdkError } from "./errors.js";

export type AssetKind = "audio" | "buffer" | "model" | "render-target" | "texture";
export type AssetFormat = "bin" | "depth24plus" | "glb" | "gltf" | "jpeg" | "mp3" | "ogg" | "png" | "rgba16f" | "rgba8" | "wav" | "webp";
export type AssetSourceMode = "bundle" | "embedded" | "network";
export type AssetCachePolicy = "immutable" | "no-store" | "revalidate";
export const ASSET_FORMATS_BY_KIND = {
  audio: ["mp3", "ogg", "wav"],
  buffer: ["bin"],
  model: ["glb", "gltf"],
  "render-target": ["depth24plus", "rgba16f", "rgba8"],
  texture: ["jpeg", "png", "webp"],
} as const satisfies Record<AssetKind, readonly AssetFormat[]>;
export type TextureWrapMode = "clampToEdge" | "mirroredRepeat" | "repeat";
export type TextureMinFilter =
  | "linear"
  | "linearMipmapLinear"
  | "linearMipmapNearest"
  | "nearest"
  | "nearestMipmapLinear"
  | "nearestMipmapNearest";
export type TextureMagFilter = "linear" | "nearest";

export interface ITextureAssetOptions {
  center?: readonly [number, number];
  magFilter?: TextureMagFilter;
  minFilter?: TextureMinFilter;
  offset?: readonly [number, number];
  repeat?: readonly [number, number];
  rotation?: number;
  wrapS?: TextureWrapMode;
  wrapT?: TextureWrapMode;
}

export interface IAnimationClipReference {
  id: string;
  loop?: boolean;
  mask?: string;
  sourceClip?: string;
  speed?: number;
}

export interface IAnimationGraphParameter {
  default?: boolean | number;
  id: string;
  kind: "boolean" | "number" | "trigger";
}

export interface IAnimationEventMarker {
  atSeconds: number;
  event: string;
}

export interface IAnimationGraphState {
  clip: string;
  events?: IAnimationEventMarker[];
  id: string;
}

export interface IAnimationGraphTransition {
  blendSeconds?: number;
  from: string;
  to: string;
  when: {
    equals?: boolean | number;
    greaterThan?: number;
    lessThan?: number;
    parameter: string;
  };
}

export interface IAnimationGraphDeclaration {
  initialState: string;
  parameters?: IAnimationGraphParameter[];
  states: IAnimationGraphState[];
  transitions?: IAnimationGraphTransition[];
}

export interface IBoundedParticleEmitter {
  id: string;
  lifetimeSeconds: number;
  maxParticles: number;
  radius?: number;
  ratePerSecond: number;
  shape: "point" | "sphere";
}

export interface IAnimationMaskReference {
  id: string;
  joints: string[];
}

export interface IMorphTargetReference {
  defaultWeight?: number;
  id: string;
}

export interface IMorphClipReference {
  id: string;
  keyframes: Array<{ timeSeconds: number; weight: number }>;
  target: string;
}

export interface IUnsupportedAnimationAssetOptions {
  blendGraph?: boolean;
  engineController?: boolean;
  ik?: boolean;
  particles?: boolean;
  retargeting?: boolean;
  stateMachine?: boolean;
}

export interface IEmbeddedAssetSource {
  byteLength: number;
  data: string;
  encoding: "base64";
  hash?: string;
  mediaType: string;
}

export interface INetworkAssetSource {
  cachePolicy?: AssetCachePolicy;
  integrity?: string;
  url: string;
}

export interface IAssetReference {
  embedded?: IEmbeddedAssetSource;
  format: AssetFormat;
  id: string;
  kind: AssetKind;
  network?: INetworkAssetSource;
  path?: string;
  sampleCount?: number;
  sourceMode?: AssetSourceMode;
  usage?: "color" | "depth";
  height?: number;
  width?: number;
  animationGraph?: IAnimationGraphDeclaration;
  animations?: IAnimationClipReference[];
  center?: readonly [number, number];
  magFilter?: TextureMagFilter;
  masks?: IAnimationMaskReference[];
  minFilter?: TextureMinFilter;
  morphClips?: IMorphClipReference[];
  morphTargets?: IMorphTargetReference[];
  offset?: readonly [number, number];
  particleEmitters?: IBoundedParticleEmitter[];
  repeat?: readonly [number, number];
  rotation?: number;
  wrapS?: TextureWrapMode;
  wrapT?: TextureWrapMode;
  skeleton?: { joints: string[] };
}

export type AssetGroupFailurePolicy = "fail" | "warn";

export interface IAssetGroupDeclaration {
  failurePolicy?: AssetGroupFailurePolicy;
  id: string;
  optional?: string[];
  required: string[];
  timeoutMs?: number;
}

export interface IAssetGroupOptions {
  failurePolicy?: AssetGroupFailurePolicy;
  optional?: readonly (IAssetReference | string)[];
  required: readonly (IAssetReference | string)[];
  timeoutMs?: number;
}

export function animationClip(id: string, options: Omit<IAnimationClipReference, "id"> = {}): IAnimationClipReference {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_ANIMATION_CLIP_ID_EMPTY", "Animation clip ID must not be empty.");
  }
  if (options.loop !== undefined && typeof options.loop !== "boolean") {
    throw new SdkError("TN_SDK_ANIMATION_LOOP_INVALID", "Animation clip loop must be boolean.");
  }
  if (options.sourceClip !== undefined && options.sourceClip.trim() === "") {
    throw new SdkError("TN_SDK_ANIMATION_SOURCE_CLIP_EMPTY", "Animation source clip must not be empty.");
  }
  if (options.mask !== undefined && options.mask.trim() === "") {
    throw new SdkError("TN_SDK_ANIMATION_MASK_EMPTY", "Animation clip mask must not be empty.");
  }
  if (options.speed !== undefined && (!Number.isFinite(options.speed) || options.speed <= 0)) {
    throw new SdkError("TN_SDK_ANIMATION_SPEED_INVALID", "Animation clip speed must be a positive finite number.");
  }
  return {
    id,
    ...(options.loop === undefined ? {} : { loop: options.loop }),
    ...(options.mask === undefined ? {} : { mask: options.mask }),
    ...(options.sourceClip === undefined ? {} : { sourceClip: options.sourceClip }),
    ...(options.speed === undefined ? {} : { speed: options.speed }),
  };
}

export function modelAsset(
  id: string,
  path: string,
  options: {
    animationGraph?: IAnimationGraphDeclaration;
    animations?: readonly IAnimationClipReference[];
    masks?: readonly IAnimationMaskReference[];
    morphClips?: readonly IMorphClipReference[];
    morphTargets?: readonly IMorphTargetReference[];
    particleEmitters?: readonly IBoundedParticleEmitter[];
    skeleton?: { joints: readonly string[] };
    unsupported?: IUnsupportedAnimationAssetOptions;
  } = {},
): IAssetReference {
  assertSupportedAnimationOptions(options.unsupported);
  assertUniqueAnimationClipIds(options.animations ?? []);
  validateAnimationGraph(options.animationGraph, new Set((options.animations ?? []).map((clip) => clip.id)));
  validateParticleEmitters(options.particleEmitters ?? []);
  const ref = assetRef("model", id, path);
  return {
    ...ref,
    ...(options.animationGraph === undefined ? {} : { animationGraph: normalizeAnimationGraph(options.animationGraph) }),
    ...(options.animations === undefined ? {} : { animations: [...options.animations].sort((left, right) => left.id.localeCompare(right.id)) }),
    ...(options.masks === undefined ? {} : { masks: [...options.masks].map((mask) => ({ id: mask.id, joints: [...mask.joints] })).sort((left, right) => left.id.localeCompare(right.id)) }),
    ...(options.morphClips === undefined ? {} : { morphClips: [...options.morphClips].map((clip) => ({ id: clip.id, keyframes: clip.keyframes.map((keyframe) => ({ timeSeconds: keyframe.timeSeconds, weight: keyframe.weight })), target: clip.target })).sort((left, right) => left.id.localeCompare(right.id)) }),
    ...(options.morphTargets === undefined ? {} : { morphTargets: [...options.morphTargets].sort((left, right) => left.id.localeCompare(right.id)) }),
    ...(options.particleEmitters === undefined ? {} : { particleEmitters: [...options.particleEmitters].sort((left, right) => left.id.localeCompare(right.id)) }),
    ...(options.skeleton === undefined ? {} : { skeleton: { joints: [...options.skeleton.joints].sort() } }),
  };
}

export function animationEvent(event: string, atSeconds: number): IAnimationEventMarker {
  if (event.trim() === "") {
    throw new SdkError("TN_SDK_ANIMATION_EVENT_ID_EMPTY", "Animation event ID must not be empty.");
  }
  assertNonNegativeFinite(atSeconds, "TN_SDK_ANIMATION_EVENT_TIME_INVALID", "Animation event time");
  return { atSeconds, event };
}

export function animationGraph(options: IAnimationGraphDeclaration): IAnimationGraphDeclaration {
  validateAnimationGraph(options, undefined);
  return normalizeAnimationGraph(options);
}

export function boundedParticleEmitter(id: string, options: Omit<IBoundedParticleEmitter, "id">): IBoundedParticleEmitter {
  const emitter = { id, ...options };
  validateParticleEmitters([emitter]);
  return emitter;
}

export function embeddedAsset(
  id: string,
  options: {
    data: string | Uint8Array;
    format?: "bin";
    hash?: string;
    kind?: "buffer";
    mediaType: string;
  },
): IAssetReference {
  assertAssetId(id);
  if (options.mediaType.trim() === "") {
    throw new SdkError("TN_SDK_ASSET_MEDIA_TYPE_INVALID", "Embedded asset mediaType must not be empty.");
  }
  const bytes = typeof options.data === "string" ? new TextEncoder().encode(options.data) : options.data;
  if (bytes.byteLength === 0) {
    throw new SdkError("TN_SDK_ASSET_EMBEDDED_EMPTY", "Embedded asset data must not be empty.");
  }
  return {
    embedded: {
      byteLength: bytes.byteLength,
      data: base64(bytes),
      encoding: "base64",
      ...(options.hash === undefined ? {} : { hash: options.hash }),
      mediaType: options.mediaType,
    },
    format: options.format ?? "bin",
    id,
    kind: options.kind ?? "buffer",
    sourceMode: "embedded",
  };
}

export function networkAsset(
  id: string,
  url: string,
  options: {
    cachePolicy?: AssetCachePolicy;
    format: "glb" | "gltf" | "jpeg" | "mp3" | "ogg" | "png" | "wav";
    integrity?: string;
    kind: "audio" | "model" | "texture";
  },
): IAssetReference {
  assertAssetId(id);
  validateNetworkUrl(url);
  return {
    format: options.format,
    id,
    kind: options.kind,
    network: {
      ...(options.cachePolicy === undefined ? {} : { cachePolicy: options.cachePolicy }),
      ...(options.integrity === undefined ? {} : { integrity: options.integrity }),
      url,
    },
    sourceMode: "network",
  };
}

export function assetGroup(id: string, options: IAssetGroupOptions): IAssetGroupDeclaration {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_ASSET_GROUP_ID_EMPTY", "Asset group ID must not be empty.");
  }
  if (options.required.length === 0) {
    throw new SdkError("TN_SDK_ASSET_GROUP_REQUIRED_EMPTY", "Asset groups must declare at least one required asset.");
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new SdkError("TN_SDK_ASSET_GROUP_TIMEOUT_INVALID", "Asset group timeoutMs must be a positive finite number.");
  }
  return {
    id,
    ...(options.failurePolicy === undefined ? {} : { failurePolicy: options.failurePolicy }),
    ...(options.optional === undefined ? {} : { optional: normalizeAssetIds(options.optional) }),
    required: normalizeAssetIds(options.required),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
}

function assertUniqueAnimationClipIds(clips: readonly IAnimationClipReference[]): void {
  const seen = new Set<string>();
  for (const clip of clips) {
    if (seen.has(clip.id)) {
      throw new SdkError("TN_SDK_ANIMATION_CLIP_DUPLICATE", `Animation clip '${clip.id}' is duplicated.`);
    }
    seen.add(clip.id);
  }
}

function validateAnimationGraph(graph: IAnimationGraphDeclaration | undefined, clipIds: ReadonlySet<string> | undefined): void {
  if (graph === undefined) {
    return;
  }
  if (graph.initialState.trim() === "") {
    throw new SdkError("TN_SDK_ANIMATION_GRAPH_INITIAL_STATE_EMPTY", "Animation graph initial state must not be empty.");
  }
  if (graph.states.length === 0) {
    throw new SdkError("TN_SDK_ANIMATION_GRAPH_STATES_EMPTY", "Animation graph must declare at least one state.");
  }
  const stateIds = new Set<string>();
  for (const state of graph.states) {
    if (state.id.trim() === "") {
      throw new SdkError("TN_SDK_ANIMATION_GRAPH_STATE_ID_EMPTY", "Animation graph state ID must not be empty.");
    }
    if (stateIds.has(state.id)) {
      throw new SdkError("TN_SDK_ANIMATION_GRAPH_STATE_DUPLICATE", `Animation graph state '${state.id}' is duplicated.`);
    }
    stateIds.add(state.id);
    if (state.clip.trim() === "") {
      throw new SdkError("TN_SDK_ANIMATION_GRAPH_CLIP_EMPTY", "Animation graph state clip must not be empty.");
    }
    if (clipIds !== undefined && !clipIds.has(state.clip)) {
      throw new SdkError("TN_SDK_ANIMATION_GRAPH_CLIP_MISSING", `Animation graph state '${state.id}' references unknown clip '${state.clip}'.`);
    }
    for (const event of state.events ?? []) {
      if (event.event.trim() === "") {
        throw new SdkError("TN_SDK_ANIMATION_EVENT_ID_EMPTY", "Animation event ID must not be empty.");
      }
      assertNonNegativeFinite(event.atSeconds, "TN_SDK_ANIMATION_EVENT_TIME_INVALID", "Animation event time");
    }
  }
  if (!stateIds.has(graph.initialState)) {
    throw new SdkError("TN_SDK_ANIMATION_GRAPH_INITIAL_STATE_MISSING", `Animation graph initial state '${graph.initialState}' is not declared.`);
  }
  const parameterIds = new Set<string>();
  for (const parameter of graph.parameters ?? []) {
    if (parameter.id.trim() === "") {
      throw new SdkError("TN_SDK_ANIMATION_PARAMETER_ID_EMPTY", "Animation graph parameter ID must not be empty.");
    }
    if (parameterIds.has(parameter.id)) {
      throw new SdkError("TN_SDK_ANIMATION_PARAMETER_DUPLICATE", `Animation graph parameter '${parameter.id}' is duplicated.`);
    }
    parameterIds.add(parameter.id);
  }
  for (const transition of graph.transitions ?? []) {
    if (!stateIds.has(transition.from) || !stateIds.has(transition.to)) {
      throw new SdkError("TN_SDK_ANIMATION_TRANSITION_STATE_MISSING", "Animation graph transitions must reference declared states.");
    }
    if (!parameterIds.has(transition.when.parameter)) {
      throw new SdkError("TN_SDK_ANIMATION_TRANSITION_PARAMETER_MISSING", `Animation graph transition references unknown parameter '${transition.when.parameter}'.`);
    }
    if (transition.blendSeconds !== undefined) {
      assertNonNegativeFinite(transition.blendSeconds, "TN_SDK_ANIMATION_BLEND_INVALID", "Animation transition blend duration");
    }
  }
}

function normalizeAnimationGraph(graph: IAnimationGraphDeclaration): IAnimationGraphDeclaration {
  return {
    initialState: graph.initialState,
    ...(graph.parameters === undefined ? {} : { parameters: [...graph.parameters].sort((left, right) => left.id.localeCompare(right.id)) }),
    states: [...graph.states].sort((left, right) => left.id.localeCompare(right.id)).map((state) => ({
      ...state,
      ...(state.events === undefined ? {} : { events: [...state.events].sort((left, right) => left.atSeconds - right.atSeconds || left.event.localeCompare(right.event)) }),
    })),
    ...(graph.transitions === undefined ? {} : { transitions: [...graph.transitions].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)) }),
  };
}

function validateParticleEmitters(emitters: readonly IBoundedParticleEmitter[]): void {
  const seen = new Set<string>();
  for (const emitter of emitters) {
    if (emitter.id.trim() === "") {
      throw new SdkError("TN_SDK_PARTICLE_EMITTER_ID_EMPTY", "Particle emitter ID must not be empty.");
    }
    if (seen.has(emitter.id)) {
      throw new SdkError("TN_SDK_PARTICLE_EMITTER_DUPLICATE", `Particle emitter '${emitter.id}' is duplicated.`);
    }
    seen.add(emitter.id);
    assertPositiveFinite(emitter.maxParticles, "TN_SDK_PARTICLE_MAX_INVALID", "Particle emitter maxParticles");
    assertNonNegativeFinite(emitter.ratePerSecond, "TN_SDK_PARTICLE_RATE_INVALID", "Particle emitter ratePerSecond");
    assertPositiveFinite(emitter.lifetimeSeconds, "TN_SDK_PARTICLE_LIFETIME_INVALID", "Particle emitter lifetimeSeconds");
    if (!["point", "sphere"].includes(emitter.shape)) {
      throw new SdkError("TN_SDK_PARTICLE_SHAPE_UNSUPPORTED", "Particle emitter shape must be 'point' or 'sphere'.");
    }
    if (emitter.radius !== undefined) {
      assertPositiveFinite(emitter.radius, "TN_SDK_PARTICLE_RADIUS_INVALID", "Particle emitter radius");
    }
  }
}

function assertPositiveFinite(value: number, code: string, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SdkError(code, `${label} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, code: string, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new SdkError(code, `${label} must be a non-negative finite number.`);
  }
}

export function textureAsset(id: string, path: string, options: ITextureAssetOptions = {}): IAssetReference {
  validateTextureOptions(options);
  return {
    ...assetRef("texture", id, path),
    ...(options.center === undefined ? {} : { center: options.center }),
    ...(options.magFilter === undefined ? {} : { magFilter: options.magFilter }),
    ...(options.minFilter === undefined ? {} : { minFilter: options.minFilter }),
    ...(options.offset === undefined ? {} : { offset: options.offset }),
    ...(options.repeat === undefined ? {} : { repeat: options.repeat }),
    ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
    ...(options.wrapS === undefined ? {} : { wrapS: options.wrapS }),
    ...(options.wrapT === undefined ? {} : { wrapT: options.wrapT }),
  };
}

export function renderTargetAsset(
  id: string,
  options: { format?: "rgba8"; height: number; usage: "color" | "depth"; width: number },
): IAssetReference {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_ASSET_ID_EMPTY", "Asset ID must not be empty.");
  }
  return {
    format: options.format ?? "rgba8",
    height: options.height,
    id,
    kind: "render-target",
    usage: options.usage,
    width: options.width,
  };
}

export function audioAsset(id: string, path: string): IAssetReference {
  return assetRef("audio", id, path);
}

function assetRef(kind: AssetKind, id: string, path: string): IAssetReference {
  assertAssetId(id);
  if (path.trim() === "" || path.startsWith("/") || path.includes("..")) {
    throw new SdkError("TN_SDK_ASSET_PATH_INVALID", "Asset path must be bundle-relative and must not traverse parent directories.");
  }
  const format = path.split(".").pop()?.toLowerCase() as AssetFormat | undefined;
  if (format === undefined || !(ASSET_FORMATS_BY_KIND[kind] as readonly AssetFormat[]).includes(format)) {
    throw new SdkError("TN_SDK_ASSET_FORMAT_UNSUPPORTED", `Unsupported ${kind} asset format for '${path}'.`);
  }
  return { format, id, kind, path, sourceMode: "bundle" };
}

function assertAssetId(id: string): void {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_ASSET_ID_EMPTY", "Asset ID must not be empty.");
  }
}

function base64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[triplet & 63] : "=";
  }
  return output;
}

function normalizeAssetIds(values: readonly (IAssetReference | string)[]): string[] {
  const ids = values.map((value) => typeof value === "string" ? value : value.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.trim() === "") {
      throw new SdkError("TN_SDK_ASSET_GROUP_ASSET_ID_EMPTY", "Asset group asset IDs must not be empty.");
    }
    if (seen.has(id)) {
      throw new SdkError("TN_SDK_ASSET_GROUP_ASSET_DUPLICATE", `Asset group references asset '${id}' more than once.`);
    }
    seen.add(id);
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function validateNetworkUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SdkError("TN_SDK_ASSET_NETWORK_URL_INVALID", "Network asset URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new SdkError("TN_SDK_ASSET_NETWORK_URL_INVALID", "Network asset URL must use HTTPS.");
  }
}

function validateTextureOptions(options: ITextureAssetOptions): void {
  for (const [field, value] of Object.entries({
    center: options.center,
    offset: options.offset,
    repeat: options.repeat,
  })) {
    if (value !== undefined && (!Array.isArray(value) || value.length !== 2 || !value.every((item) => Number.isFinite(item)))) {
      throw new SdkError("TN_SDK_TEXTURE_VECTOR_INVALID", `Texture ${field} must be a pair of finite numbers.`);
    }
  }
  if (options.rotation !== undefined && !Number.isFinite(options.rotation)) {
    throw new SdkError("TN_SDK_TEXTURE_ROTATION_INVALID", "Texture rotation must be a finite number.");
  }
}

function assertSupportedAnimationOptions(options: IUnsupportedAnimationAssetOptions | undefined): void {
  if (options?.blendGraph === true) {
    throw new SdkError("TN_SDK_ANIMATION_BLEND_GRAPH_UNSUPPORTED", "Use the constrained V7 animationGraph helper instead of backend blend graphs.");
  }
  if (options?.stateMachine === true) {
    throw new SdkError("TN_SDK_ANIMATION_STATE_MACHINE_UNSUPPORTED", "Use the constrained V7 animationGraph helper instead of backend state machines.");
  }
  if (options?.engineController === true) {
    throw new SdkError("TN_SDK_ANIMATION_ENGINE_CONTROLLER_UNSUPPORTED", "Engine animation controllers are adapter-private.");
  }
  if (options?.ik === true) {
    throw new SdkError("TN_SDK_ANIMATION_IK_UNSUPPORTED", "Animation IK is deferred to V7.");
  }
  if (options?.retargeting === true) {
    throw new SdkError("TN_SDK_ANIMATION_RETARGETING_UNSUPPORTED", "Animation retargeting is deferred to V7.");
  }
  if (options?.particles === true) {
    throw new SdkError("TN_SDK_ANIMATION_PARTICLES_UNSUPPORTED", "Use boundedParticleEmitter for the constrained V7 particle contract.");
  }
}
