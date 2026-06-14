import { SdkError } from "./errors.js";
import type { IAssetReference } from "./assets.js";

export type AudioAssetReference = string | IAssetReference;

export interface IAudioOneShotDeclaration {
  asset: string;
  assetRef?: IAssetReference;
  bus?: string;
  emitter?: string;
  event: string;
  id: string;
  volume?: number;
}

export interface IAudioMusicDeclaration {
  asset: string;
  assetRef?: IAssetReference;
  autoplay?: boolean;
  bus?: string;
  id: string;
  loop: boolean;
  volume?: number;
}

export interface IAudioBusDeclaration {
  id: string;
  volume?: number;
}

export interface IAudioListenerDeclaration {
  id: string;
  position: [number, number, number];
}

export interface IAudioEmitterDeclaration {
  id: string;
  position: [number, number, number];
  radius?: number;
}

export interface IAudioDeclaration {
  buses: IAudioBusDeclaration[];
  emitters: IAudioEmitterDeclaration[];
  kind: "Audio";
  listeners: IAudioListenerDeclaration[];
  music: IAudioMusicDeclaration[];
  oneShots: IAudioOneShotDeclaration[];
}

export function oneShotSound(
  id: string,
  options: { asset: AudioAssetReference; bus?: string; emitter?: string; event: string; volume?: number },
): IAudioOneShotDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_ID_EMPTY", "Audio one-shot ID must not be empty.");
  const asset = normalizeAsset(options.asset);
  assertNonEmpty(asset.id, "TN_SDK_AUDIO_ASSET_EMPTY", "Audio one-shot asset must not be empty.");
  assertNonEmpty(options.event, "TN_SDK_AUDIO_EVENT_EMPTY", "Audio one-shot event must not be empty.");
  assertOptionalId(options.bus, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  assertOptionalId(options.emitter, "TN_SDK_AUDIO_EMITTER_EMPTY", "Audio emitter ID must not be empty.");
  assertVolume(options.volume);
  return { asset: asset.id, ...(asset.ref === undefined ? {} : { assetRef: asset.ref }), ...(options.bus === undefined ? {} : { bus: options.bus }), ...(options.emitter === undefined ? {} : { emitter: options.emitter }), event: options.event, id, ...(options.volume === undefined ? {} : { volume: options.volume }) };
}

export function loopingMusic(
  id: string,
  options: { asset: AudioAssetReference; autoplay?: boolean; bus?: string; volume?: number },
): IAudioMusicDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_ID_EMPTY", "Audio music ID must not be empty.");
  const asset = normalizeAsset(options.asset);
  assertNonEmpty(asset.id, "TN_SDK_AUDIO_ASSET_EMPTY", "Audio music asset must not be empty.");
  assertOptionalId(options.bus, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  assertVolume(options.volume);
  return { asset: asset.id, ...(asset.ref === undefined ? {} : { assetRef: asset.ref }), autoplay: options.autoplay ?? true, ...(options.bus === undefined ? {} : { bus: options.bus }), id, loop: true, ...(options.volume === undefined ? {} : { volume: options.volume }) };
}

export function audioBus(id: string, options: { volume?: number } = {}): IAudioBusDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  assertVolume(options.volume);
  return { id, ...(options.volume === undefined ? {} : { volume: options.volume }) };
}

export function audioListener(id: string, options: { position: [number, number, number] }): IAudioListenerDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_LISTENER_EMPTY", "Audio listener ID must not be empty.");
  assertVec3(options.position, "TN_SDK_AUDIO_LISTENER_POSITION_INVALID", "Audio listener position");
  return { id, position: options.position };
}

export function spatialAudioEmitter(id: string, options: { position: [number, number, number]; radius?: number }): IAudioEmitterDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_EMITTER_EMPTY", "Audio emitter ID must not be empty.");
  assertVec3(options.position, "TN_SDK_AUDIO_EMITTER_POSITION_INVALID", "Audio emitter position");
  if (options.radius !== undefined && (!Number.isFinite(options.radius) || options.radius <= 0)) {
    throw new SdkError("TN_SDK_AUDIO_EMITTER_RADIUS_INVALID", "Audio emitter radius must be a positive finite number.");
  }
  return { id, position: options.position, ...(options.radius === undefined ? {} : { radius: options.radius }) };
}

export function defineAudio(options: {
  buses?: IAudioBusDeclaration[];
  emitters?: IAudioEmitterDeclaration[];
  listeners?: IAudioListenerDeclaration[];
  music?: IAudioMusicDeclaration[];
  oneShots?: IAudioOneShotDeclaration[];
}): IAudioDeclaration {
  assertUnique(options.buses ?? [], "TN_SDK_AUDIO_BUS_DUPLICATE", "Audio bus");
  assertUnique(options.emitters ?? [], "TN_SDK_AUDIO_EMITTER_DUPLICATE", "Audio emitter");
  assertUnique(options.listeners ?? [], "TN_SDK_AUDIO_LISTENER_DUPLICATE", "Audio listener");
  assertRoutes(options);
  return {
    buses: [...(options.buses ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    emitters: [...(options.emitters ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    kind: "Audio",
    listeners: [...(options.listeners ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    music: options.music ?? [],
    oneShots: options.oneShots ?? [],
  };
}

function assertNonEmpty(value: string, code: string, message: string): void {
  if (value.trim() === "") {
    throw new SdkError(code, message);
  }
}

function assertOptionalId(value: string | undefined, code: string, message: string): void {
  if (value !== undefined) {
    assertNonEmpty(value, code, message);
  }
}

function assertVolume(value: number | undefined): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new SdkError("TN_SDK_AUDIO_VOLUME_INVALID", "Audio volume must be a finite number greater than or equal to 0.");
  }
}

function assertVec3(value: [number, number, number], code: string, label: string): void {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new SdkError(code, `${label} must be a three-component finite vector.`);
  }
}

function assertUnique(values: readonly { id: string }[], code: string, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      throw new SdkError(code, `${label} '${value.id}' is duplicated.`);
    }
    seen.add(value.id);
  }
}

function assertRoutes(options: {
  buses?: readonly IAudioBusDeclaration[];
  emitters?: readonly IAudioEmitterDeclaration[];
  music?: readonly IAudioMusicDeclaration[];
  oneShots?: readonly IAudioOneShotDeclaration[];
}): void {
  const buses = new Set((options.buses ?? []).map((bus) => bus.id));
  const emitters = new Set((options.emitters ?? []).map((emitter) => emitter.id));
  for (const item of [...(options.music ?? []), ...(options.oneShots ?? [])]) {
    if (item.bus !== undefined && !buses.has(item.bus)) {
      throw new SdkError("TN_SDK_AUDIO_BUS_MISSING", `Audio playback references unknown bus '${item.bus}'.`);
    }
  }
  for (const oneShot of options.oneShots ?? []) {
    if (oneShot.emitter !== undefined && !emitters.has(oneShot.emitter)) {
      throw new SdkError("TN_SDK_AUDIO_EMITTER_MISSING", `Audio one-shot references unknown emitter '${oneShot.emitter}'.`);
    }
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
