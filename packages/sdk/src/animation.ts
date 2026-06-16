import { SdkError } from "./errors.js";

export type TransformAnimationChannel = "position" | "rotation" | "scale";
export type TransformAnimationEasing = "linear" | "step";
export type TransformAnimationLoop = "none" | "repeat";

export interface ITransformAnimationKeyframe {
  timeSeconds: number;
  value: readonly number[];
}

export interface ITransformAnimationTrack {
  channel: TransformAnimationChannel;
  easing?: TransformAnimationEasing;
  keyframes: readonly ITransformAnimationKeyframe[];
  target: string;
}

export interface ITransformAnimationClipDeclaration {
  id: string;
  loop?: TransformAnimationLoop;
  tracks: readonly ITransformAnimationTrack[];
}

export interface IAnimationsDeclaration {
  transformClips: readonly ITransformAnimationClipDeclaration[];
}

export function transformAnimationClip(
  id: string,
  options: Omit<ITransformAnimationClipDeclaration, "id">,
): ITransformAnimationClipDeclaration {
  validateClip({ id, ...options });
  return {
    id,
    ...(options.loop === undefined ? {} : { loop: options.loop }),
    tracks: [...options.tracks].map((track) => ({
      channel: track.channel,
      ...(track.easing === undefined ? {} : { easing: track.easing }),
      keyframes: [...track.keyframes].map((keyframe) => ({ timeSeconds: keyframe.timeSeconds, value: [...keyframe.value] })),
      target: track.target,
    })).sort((left, right) => left.target.localeCompare(right.target) || left.channel.localeCompare(right.channel)),
  };
}

export function defineAnimations(options: IAnimationsDeclaration): IAnimationsDeclaration {
  const seen = new Set<string>();
  for (const clip of options.transformClips) {
    validateClip(clip);
    if (seen.has(clip.id)) {
      throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_CLIP_DUPLICATE", `Transform animation clip '${clip.id}' is duplicated.`);
    }
    seen.add(clip.id);
  }
  return { transformClips: [...options.transformClips].sort((left, right) => left.id.localeCompare(right.id)) };
}

function validateClip(clip: ITransformAnimationClipDeclaration): void {
  if (clip.id.trim() === "") {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_CLIP_ID_EMPTY", "Transform animation clip ID must not be empty.");
  }
  if (clip.loop !== undefined && clip.loop !== "none" && clip.loop !== "repeat") {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_LOOP_UNSUPPORTED", "Transform animation loop must be 'none' or 'repeat'.");
  }
  if (clip.tracks.length === 0) {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_TRACKS_EMPTY", "Transform animation clips must declare at least one track.");
  }
  for (const track of clip.tracks) {
    validateTrack(track);
  }
}

function validateTrack(track: ITransformAnimationTrack): void {
  if (track.target.trim() === "") {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_TARGET_EMPTY", "Transform animation track target must not be empty.");
  }
  if (!["position", "rotation", "scale"].includes(track.channel)) {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_CHANNEL_UNSUPPORTED", "Transform animation channel must be position, rotation, or scale.");
  }
  if (track.easing !== undefined && track.easing !== "linear" && track.easing !== "step") {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_EASING_UNSUPPORTED", "Transform animation easing must be linear or step.");
  }
  if (track.keyframes.length < 2) {
    throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_KEYFRAMES_TOO_FEW", "Transform animation tracks require at least two keyframes.");
  }
  let previous = -Infinity;
  for (const [index, keyframe] of track.keyframes.entries()) {
    if (!Number.isFinite(keyframe.timeSeconds) || keyframe.timeSeconds < 0) {
      throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_TIME_INVALID", "Transform animation keyframe time must be a non-negative finite number.");
    }
    if (keyframe.timeSeconds <= previous) {
      throw new SdkError("TN_SDK_TRANSFORM_ANIMATION_TIME_NON_MONOTONIC", "Transform animation keyframe times must be strictly increasing.");
    }
    previous = keyframe.timeSeconds;
    const expectedLength = track.channel === "rotation" ? 4 : 3;
    if (keyframe.value.length !== expectedLength || keyframe.value.some((item) => !Number.isFinite(item))) {
      throw new SdkError(
        "TN_SDK_TRANSFORM_ANIMATION_VALUE_INVALID",
        `Transform animation ${track.channel} keyframe ${index} must be a finite ${expectedLength}-component value.`,
      );
    }
  }
}
