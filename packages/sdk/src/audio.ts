import { SdkError } from "./errors.js";
import type { IAssetReference } from "./assets.js";

export type AudioAssetReference = string | IAssetReference;

export interface IAudioOneShotDeclaration {
  asset: string;
  assetRef?: IAssetReference;
  event: string;
  id: string;
}

export interface IAudioMusicDeclaration {
  asset: string;
  assetRef?: IAssetReference;
  autoplay?: boolean;
  id: string;
  loop: boolean;
}

export interface IAudioDeclaration {
  kind: "Audio";
  music: IAudioMusicDeclaration[];
  oneShots: IAudioOneShotDeclaration[];
}

export function oneShotSound(id: string, options: { asset: AudioAssetReference; event: string }): IAudioOneShotDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_ID_EMPTY", "Audio one-shot ID must not be empty.");
  const asset = normalizeAsset(options.asset);
  assertNonEmpty(asset.id, "TN_SDK_AUDIO_ASSET_EMPTY", "Audio one-shot asset must not be empty.");
  assertNonEmpty(options.event, "TN_SDK_AUDIO_EVENT_EMPTY", "Audio one-shot event must not be empty.");
  return { asset: asset.id, ...(asset.ref === undefined ? {} : { assetRef: asset.ref }), event: options.event, id };
}

export function loopingMusic(
  id: string,
  options: { asset: AudioAssetReference; autoplay?: boolean },
): IAudioMusicDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_ID_EMPTY", "Audio music ID must not be empty.");
  const asset = normalizeAsset(options.asset);
  assertNonEmpty(asset.id, "TN_SDK_AUDIO_ASSET_EMPTY", "Audio music asset must not be empty.");
  return { asset: asset.id, ...(asset.ref === undefined ? {} : { assetRef: asset.ref }), autoplay: options.autoplay ?? true, id, loop: true };
}

export function defineAudio(options: {
  music?: IAudioMusicDeclaration[];
  oneShots?: IAudioOneShotDeclaration[];
}): IAudioDeclaration {
  return {
    kind: "Audio",
    music: options.music ?? [],
    oneShots: options.oneShots ?? [],
  };
}

function assertNonEmpty(value: string, code: string, message: string): void {
  if (value.trim() === "") {
    throw new SdkError(code, message);
  }
}

function normalizeAsset(asset: AudioAssetReference): { id: string; ref?: IAssetReference } {
  if (typeof asset === "string") {
    return { id: asset };
  }
  if (asset.kind !== "audio") {
    throw new SdkError("TN_SDK_AUDIO_ASSET_KIND_INVALID", "Audio playback must reference an audio asset.");
  }
  return { id: asset.id, ref: asset };
}
