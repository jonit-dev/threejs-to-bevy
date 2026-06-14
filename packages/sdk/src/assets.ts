import { SdkError } from "./errors.js";

export type AssetKind = "audio" | "model" | "texture";
export type AssetFormat = "glb" | "gltf" | "jpeg" | "mp3" | "ogg" | "png" | "wav";

export interface IAnimationClipReference {
  id: string;
  loop?: boolean;
  sourceClip?: string;
  speed?: number;
}

export interface IUnsupportedAnimationAssetOptions {
  blendGraph?: boolean;
  ik?: boolean;
  particles?: boolean;
  retargeting?: boolean;
  stateMachine?: boolean;
}

export interface IAssetReference {
  format: AssetFormat;
  id: string;
  kind: AssetKind;
  path: string;
  animations?: IAnimationClipReference[];
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
  if (options.speed !== undefined && (!Number.isFinite(options.speed) || options.speed <= 0)) {
    throw new SdkError("TN_SDK_ANIMATION_SPEED_INVALID", "Animation clip speed must be a positive finite number.");
  }
  return {
    id,
    ...(options.loop === undefined ? {} : { loop: options.loop }),
    ...(options.sourceClip === undefined ? {} : { sourceClip: options.sourceClip }),
    ...(options.speed === undefined ? {} : { speed: options.speed }),
  };
}

export function modelAsset(
  id: string,
  path: string,
  options: { animations?: readonly IAnimationClipReference[]; unsupported?: IUnsupportedAnimationAssetOptions } = {},
): IAssetReference {
  assertSupportedAnimationOptions(options.unsupported);
  assertUniqueAnimationClipIds(options.animations ?? []);
  const ref = assetRef("model", id, path, ["glb", "gltf"]);
  return {
    ...ref,
    ...(options.animations === undefined ? {} : { animations: [...options.animations].sort((left, right) => left.id.localeCompare(right.id)) }),
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

export function textureAsset(id: string, path: string): IAssetReference {
  return assetRef("texture", id, path, ["jpeg", "png"]);
}

export function audioAsset(id: string, path: string): IAssetReference {
  return assetRef("audio", id, path, ["mp3", "ogg", "wav"]);
}

function assetRef(kind: AssetKind, id: string, path: string, formats: AssetFormat[]): IAssetReference {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_ASSET_ID_EMPTY", "Asset ID must not be empty.");
  }
  if (path.trim() === "" || path.startsWith("/") || path.includes("..")) {
    throw new SdkError("TN_SDK_ASSET_PATH_INVALID", "Asset path must be bundle-relative and must not traverse parent directories.");
  }
  const format = path.split(".").pop()?.toLowerCase() as AssetFormat | undefined;
  if (format === undefined || !formats.includes(format)) {
    throw new SdkError("TN_SDK_ASSET_FORMAT_UNSUPPORTED", `Unsupported ${kind} asset format for '${path}'.`);
  }
  return { format, id, kind, path };
}

function assertSupportedAnimationOptions(options: IUnsupportedAnimationAssetOptions | undefined): void {
  if (options?.blendGraph === true) {
    throw new SdkError("TN_SDK_ANIMATION_BLEND_GRAPH_UNSUPPORTED", "Animation blend graphs are deferred to V7.");
  }
  if (options?.stateMachine === true) {
    throw new SdkError("TN_SDK_ANIMATION_STATE_MACHINE_UNSUPPORTED", "Animation state machines are deferred to V7.");
  }
  if (options?.ik === true) {
    throw new SdkError("TN_SDK_ANIMATION_IK_UNSUPPORTED", "Animation IK is deferred to V7.");
  }
  if (options?.retargeting === true) {
    throw new SdkError("TN_SDK_ANIMATION_RETARGETING_UNSUPPORTED", "Animation retargeting is deferred to V7.");
  }
  if (options?.particles === true) {
    throw new SdkError("TN_SDK_ANIMATION_PARTICLES_UNSUPPORTED", "Particles are deferred to V7.");
  }
}
