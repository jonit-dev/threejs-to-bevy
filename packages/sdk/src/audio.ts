import { SdkError } from "./errors.js";
import type { IAssetReference } from "./assets.js";

export type AudioAssetReference = string | IAssetReference;
export type AudioAttenuationCurveKind = "exponential" | "inverse" | "linear";
export type AudioListenerBindingKind = "activeCamera" | "entity";
export type AudioToneWaveform = "noise" | "sine" | "square";
export type AudioMusicTransitionKind = "crossfade" | "intro" | "loop" | "stinger";

export interface IAudioAttenuationDeclaration {
  curve: AudioAttenuationCurveKind;
  maxDistance: number;
  minDistance: number;
  rolloffFactor: number;
}

export interface IAudioListenerBindingDeclaration {
  entity?: string;
  kind: AudioListenerBindingKind;
}

export interface IAudioDuckingRuleDeclaration {
  attack: number;
  gain: number;
  id: string;
  release: number;
  sourceBus: string;
  targetBus: string;
}

export interface IAudioToneDeclaration {
  bus?: string;
  duration: number;
  frequency?: number;
  id: string;
  pitch?: number;
  volume?: number;
  waveform: AudioToneWaveform;
}

export interface IAudioMusicTransitionDeclaration {
  duration?: number;
  from?: string;
  id: string;
  kind: AudioMusicTransitionKind;
  playbackId: string;
  state: string;
  to: string;
}

export interface IAudioOneShotDeclaration {
  asset: string;
  assetRef?: IAssetReference;
  bus?: string;
  emitter?: string;
  event: string;
  id: string;
  pitch?: number;
  volume?: number;
}

export interface IAudioMusicDeclaration {
  asset: string;
  assetRef?: IAssetReference;
  autoplay?: boolean;
  bus?: string;
  id: string;
  loop: boolean;
  pitch?: number;
  volume?: number;
}

export interface IAudioBusDeclaration {
  gain?: number;
  id: string;
  mute?: boolean;
  parent?: string;
  solo?: boolean;
  volume?: number;
}

export interface IAudioListenerDeclaration {
  binding?: IAudioListenerBindingDeclaration;
  id: string;
  position: [number, number, number];
}

export interface IAudioEmitterDeclaration {
  attenuation?: IAudioAttenuationDeclaration;
  id: string;
  position: [number, number, number];
  radius?: number;
}

export type AudioPlaybackControlKind = "pause" | "query" | "resume" | "seek" | "stop";

export interface IAudioPlaybackControlDeclaration {
  at?: number;
  id: string;
  kind: AudioPlaybackControlKind;
  target: string;
}

export interface IAudioDeclaration {
  buses: IAudioBusDeclaration[];
  controls: IAudioPlaybackControlDeclaration[];
  duckingRules: IAudioDuckingRuleDeclaration[];
  emitters: IAudioEmitterDeclaration[];
  kind: "Audio";
  listeners: IAudioListenerDeclaration[];
  music: IAudioMusicDeclaration[];
  musicTransitions: IAudioMusicTransitionDeclaration[];
  oneShots: IAudioOneShotDeclaration[];
  tones: IAudioToneDeclaration[];
}

export function oneShotSound(
  id: string,
  options: { asset: AudioAssetReference; bus?: string; emitter?: string; event: string; pitch?: number; volume?: number },
): IAudioOneShotDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_ID_EMPTY", "Audio one-shot ID must not be empty.");
  const asset = normalizeAsset(options.asset);
  assertNonEmpty(asset.id, "TN_SDK_AUDIO_ASSET_EMPTY", "Audio one-shot asset must not be empty.");
  assertNonEmpty(options.event, "TN_SDK_AUDIO_EVENT_EMPTY", "Audio one-shot event must not be empty.");
  assertOptionalId(options.bus, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  assertOptionalId(options.emitter, "TN_SDK_AUDIO_EMITTER_EMPTY", "Audio emitter ID must not be empty.");
  assertPitch(options.pitch);
  assertVolume(options.volume);
  return { asset: asset.id, ...(asset.ref === undefined ? {} : { assetRef: asset.ref }), ...(options.bus === undefined ? {} : { bus: options.bus }), ...(options.emitter === undefined ? {} : { emitter: options.emitter }), event: options.event, id, ...(options.pitch === undefined ? {} : { pitch: options.pitch }), ...(options.volume === undefined ? {} : { volume: options.volume }) };
}

export function loopingMusic(
  id: string,
  options: { asset: AudioAssetReference; autoplay?: boolean; bus?: string; pitch?: number; volume?: number },
): IAudioMusicDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_ID_EMPTY", "Audio music ID must not be empty.");
  const asset = normalizeAsset(options.asset);
  assertNonEmpty(asset.id, "TN_SDK_AUDIO_ASSET_EMPTY", "Audio music asset must not be empty.");
  assertOptionalId(options.bus, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  assertPitch(options.pitch);
  assertVolume(options.volume);
  return { asset: asset.id, ...(asset.ref === undefined ? {} : { assetRef: asset.ref }), autoplay: options.autoplay ?? true, ...(options.bus === undefined ? {} : { bus: options.bus }), id, loop: true, ...(options.pitch === undefined ? {} : { pitch: options.pitch }), ...(options.volume === undefined ? {} : { volume: options.volume }) };
}

export function audioBus(id: string, options: { gain?: number; mute?: boolean; parent?: string; solo?: boolean; volume?: number } = {}): IAudioBusDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  assertGain(options.gain, "TN_SDK_AUDIO_BUS_GAIN_INVALID");
  assertOptionalId(options.parent, "TN_SDK_AUDIO_BUS_PARENT_EMPTY", "Audio parent bus ID must not be empty.");
  assertVolume(options.volume);
  return { ...(options.gain === undefined ? {} : { gain: options.gain }), id, ...(options.mute === undefined ? {} : { mute: options.mute }), ...(options.parent === undefined ? {} : { parent: options.parent }), ...(options.solo === undefined ? {} : { solo: options.solo }), ...(options.volume === undefined ? {} : { volume: options.volume }) };
}

export function audioListener(id: string, options: { binding?: IAudioListenerBindingDeclaration; position: [number, number, number] }): IAudioListenerDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_LISTENER_EMPTY", "Audio listener ID must not be empty.");
  assertVec3(options.position, "TN_SDK_AUDIO_LISTENER_POSITION_INVALID", "Audio listener position");
  if (options.binding !== undefined) {
    assertListenerBinding(options.binding);
  }
  return { ...(options.binding === undefined ? {} : { binding: options.binding }), id, position: options.position };
}

export function spatialAudioEmitter(id: string, options: { attenuation?: IAudioAttenuationDeclaration; position: [number, number, number]; radius?: number }): IAudioEmitterDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_EMITTER_EMPTY", "Audio emitter ID must not be empty.");
  assertVec3(options.position, "TN_SDK_AUDIO_EMITTER_POSITION_INVALID", "Audio emitter position");
  if (options.radius !== undefined && (!Number.isFinite(options.radius) || options.radius <= 0)) {
    throw new SdkError("TN_SDK_AUDIO_EMITTER_RADIUS_INVALID", "Audio emitter radius must be a positive finite number.");
  }
  if (options.attenuation !== undefined) {
    assertAttenuation(options.attenuation);
  }
  return { ...(options.attenuation === undefined ? {} : { attenuation: options.attenuation }), id, position: options.position, ...(options.radius === undefined ? {} : { radius: options.radius }) };
}

export function audioPlaybackControl(id: string, options: { at?: number; kind: AudioPlaybackControlKind; target: string }): IAudioPlaybackControlDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_CONTROL_EMPTY", "Audio playback control ID must not be empty.");
  assertNonEmpty(options.target, "TN_SDK_AUDIO_CONTROL_TARGET_EMPTY", "Audio playback control target must not be empty.");
  if (!["pause", "query", "resume", "seek", "stop"].includes(options.kind)) {
    throw new SdkError("TN_SDK_AUDIO_CONTROL_KIND_INVALID", `Audio playback control '${id}' uses unsupported kind '${String(options.kind)}'.`);
  }
  if (options.at !== undefined && (!Number.isFinite(options.at) || options.at < 0)) {
    throw new SdkError("TN_SDK_AUDIO_CONTROL_SEEK_INVALID", "Audio seek position must be a finite number greater than or equal to 0.");
  }
  return { id, kind: options.kind, target: options.target, ...(options.at === undefined ? {} : { at: options.at }) };
}

export function defineAudio(options: {
  buses?: IAudioBusDeclaration[];
  controls?: IAudioPlaybackControlDeclaration[];
  duckingRules?: IAudioDuckingRuleDeclaration[];
  emitters?: IAudioEmitterDeclaration[];
  listeners?: IAudioListenerDeclaration[];
  music?: IAudioMusicDeclaration[];
  musicTransitions?: IAudioMusicTransitionDeclaration[];
  oneShots?: IAudioOneShotDeclaration[];
  tones?: IAudioToneDeclaration[];
}): IAudioDeclaration {
  assertUnique(options.buses ?? [], "TN_SDK_AUDIO_BUS_DUPLICATE", "Audio bus");
  assertUnique(options.controls ?? [], "TN_SDK_AUDIO_CONTROL_DUPLICATE", "Audio playback control");
  assertUnique(options.duckingRules ?? [], "TN_SDK_AUDIO_DUCKING_DUPLICATE", "Audio ducking rule");
  assertUnique(options.emitters ?? [], "TN_SDK_AUDIO_EMITTER_DUPLICATE", "Audio emitter");
  assertUnique(options.listeners ?? [], "TN_SDK_AUDIO_LISTENER_DUPLICATE", "Audio listener");
  assertUnique(options.musicTransitions ?? [], "TN_SDK_AUDIO_TRANSITION_DUPLICATE", "Audio music transition");
  assertUnique(options.tones ?? [], "TN_SDK_AUDIO_TONE_DUPLICATE", "Audio tone");
  assertRoutes(options);
  assertControls(options);
  assertTransitions(options);
  return {
    buses: [...(options.buses ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    controls: [...(options.controls ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    duckingRules: [...(options.duckingRules ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    emitters: [...(options.emitters ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    kind: "Audio",
    listeners: [...(options.listeners ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    music: options.music ?? [],
    musicTransitions: [...(options.musicTransitions ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    oneShots: options.oneShots ?? [],
    tones: [...(options.tones ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function audioDuckingRule(id: string, options: { attack: number; gain: number; release: number; sourceBus: string; targetBus: string }): IAudioDuckingRuleDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_DUCKING_EMPTY", "Audio ducking rule ID must not be empty.");
  assertNonEmpty(options.sourceBus, "TN_SDK_AUDIO_DUCKING_BUS_EMPTY", "Audio ducking source bus ID must not be empty.");
  assertNonEmpty(options.targetBus, "TN_SDK_AUDIO_DUCKING_BUS_EMPTY", "Audio ducking target bus ID must not be empty.");
  assertGain(options.gain, "TN_SDK_AUDIO_DUCKING_GAIN_INVALID");
  assertDuration(options.attack, "TN_SDK_AUDIO_DUCKING_TIME_INVALID", "Audio ducking attack");
  assertDuration(options.release, "TN_SDK_AUDIO_DUCKING_TIME_INVALID", "Audio ducking release");
  return { attack: options.attack, gain: options.gain, id, release: options.release, sourceBus: options.sourceBus, targetBus: options.targetBus };
}

export function generatedTone(id: string, options: { bus?: string; duration: number; frequency?: number; pitch?: number; volume?: number; waveform: AudioToneWaveform }): IAudioToneDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_TONE_EMPTY", "Audio tone ID must not be empty.");
  assertOptionalId(options.bus, "TN_SDK_AUDIO_BUS_EMPTY", "Audio bus ID must not be empty.");
  if (!["noise", "sine", "square"].includes(options.waveform)) {
    throw new SdkError("TN_SDK_AUDIO_TONE_WAVEFORM_INVALID", `Audio tone '${id}' uses unsupported waveform '${String(options.waveform)}'.`);
  }
  assertDuration(options.duration, "TN_SDK_AUDIO_TONE_DURATION_INVALID", "Audio tone duration");
  if (options.frequency !== undefined && (!Number.isFinite(options.frequency) || options.frequency <= 0 || options.frequency > 24_000)) {
    throw new SdkError("TN_SDK_AUDIO_TONE_FREQUENCY_INVALID", "Audio tone frequency must be a positive finite number up to 24000 Hz.");
  }
  assertPitch(options.pitch);
  assertVolume(options.volume);
  return { ...(options.bus === undefined ? {} : { bus: options.bus }), duration: options.duration, ...(options.frequency === undefined ? {} : { frequency: options.frequency }), id, ...(options.pitch === undefined ? {} : { pitch: options.pitch }), ...(options.volume === undefined ? {} : { volume: options.volume }), waveform: options.waveform };
}

export function musicTransition(id: string, options: { duration?: number; from?: string; kind: AudioMusicTransitionKind; playbackId: string; state: string; to: string }): IAudioMusicTransitionDeclaration {
  assertNonEmpty(id, "TN_SDK_AUDIO_TRANSITION_EMPTY", "Audio music transition ID must not be empty.");
  assertNonEmpty(options.playbackId, "TN_SDK_AUDIO_TRANSITION_PLAYBACK_EMPTY", "Audio music transition playback ID must not be empty.");
  assertNonEmpty(options.state, "TN_SDK_AUDIO_TRANSITION_STATE_EMPTY", "Audio music transition state must not be empty.");
  assertNonEmpty(options.to, "TN_SDK_AUDIO_TRANSITION_TARGET_EMPTY", "Audio music transition target must not be empty.");
  assertOptionalId(options.from, "TN_SDK_AUDIO_TRANSITION_SOURCE_EMPTY", "Audio music transition source must not be empty.");
  if (!["crossfade", "intro", "loop", "stinger"].includes(options.kind)) {
    throw new SdkError("TN_SDK_AUDIO_TRANSITION_KIND_INVALID", `Audio music transition '${id}' uses unsupported kind '${String(options.kind)}'.`);
  }
  if (options.duration !== undefined) {
    assertDuration(options.duration, "TN_SDK_AUDIO_TRANSITION_DURATION_INVALID", "Audio music transition duration");
  }
  return { ...(options.duration === undefined ? {} : { duration: options.duration }), ...(options.from === undefined ? {} : { from: options.from }), id, kind: options.kind, playbackId: options.playbackId, state: options.state, to: options.to };
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

function assertPitch(value: number | undefined): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 4)) {
    throw new SdkError("TN_SDK_AUDIO_PITCH_INVALID", "Audio pitch must be a positive finite number up to 4.");
  }
}

function assertGain(value: number | undefined, code: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new SdkError(code, "Audio gain must be a finite number between 0 and 1.");
  }
}

function assertDuration(value: number, code: string, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 60) {
    throw new SdkError(code, `${label} must be a finite number between 0 and 60 seconds.`);
  }
}

function assertAttenuation(value: IAudioAttenuationDeclaration): void {
  if (!["exponential", "inverse", "linear"].includes(value.curve)) {
    throw new SdkError("TN_SDK_AUDIO_ATTENUATION_CURVE_INVALID", `Audio attenuation uses unsupported curve '${String(value.curve)}'.`);
  }
  if (!Number.isFinite(value.minDistance) || value.minDistance <= 0) {
    throw new SdkError("TN_SDK_AUDIO_ATTENUATION_DISTANCE_INVALID", "Audio attenuation minDistance must be a positive finite number.");
  }
  if (!Number.isFinite(value.maxDistance) || value.maxDistance <= value.minDistance) {
    throw new SdkError("TN_SDK_AUDIO_ATTENUATION_DISTANCE_INVALID", "Audio attenuation maxDistance must be greater than minDistance.");
  }
  if (!Number.isFinite(value.rolloffFactor) || value.rolloffFactor < 0 || value.rolloffFactor > 10) {
    throw new SdkError("TN_SDK_AUDIO_ATTENUATION_ROLLOFF_INVALID", "Audio attenuation rolloffFactor must be a finite number between 0 and 10.");
  }
}

function assertListenerBinding(value: IAudioListenerBindingDeclaration): void {
  if (!["activeCamera", "entity"].includes(value.kind)) {
    throw new SdkError("TN_SDK_AUDIO_LISTENER_BINDING_INVALID", `Audio listener binding uses unsupported kind '${String(value.kind)}'.`);
  }
  if (value.kind === "entity") {
    assertNonEmpty(value.entity ?? "", "TN_SDK_AUDIO_LISTENER_BINDING_ENTITY_EMPTY", "Audio listener entity binding must include an entity ID.");
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
  duckingRules?: readonly IAudioDuckingRuleDeclaration[];
  emitters?: readonly IAudioEmitterDeclaration[];
  music?: readonly IAudioMusicDeclaration[];
  oneShots?: readonly IAudioOneShotDeclaration[];
  tones?: readonly IAudioToneDeclaration[];
}): void {
  const buses = new Set((options.buses ?? []).map((bus) => bus.id));
  const emitters = new Set((options.emitters ?? []).map((emitter) => emitter.id));
  for (const bus of options.buses ?? []) {
    if (bus.parent !== undefined && !buses.has(bus.parent)) {
      throw new SdkError("TN_SDK_AUDIO_BUS_MISSING", `Audio bus '${bus.id}' references unknown parent bus '${bus.parent}'.`);
    }
  }
  for (const ducking of options.duckingRules ?? []) {
    if (!buses.has(ducking.sourceBus) || !buses.has(ducking.targetBus)) {
      throw new SdkError("TN_SDK_AUDIO_BUS_MISSING", `Audio ducking rule '${ducking.id}' references an unknown bus.`);
    }
  }
  for (const item of [...(options.music ?? []), ...(options.oneShots ?? []), ...(options.tones ?? [])]) {
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

function assertTransitions(options: {
  music?: readonly IAudioMusicDeclaration[];
  musicTransitions?: readonly IAudioMusicTransitionDeclaration[];
}): void {
  const musicIds = new Set((options.music ?? []).map((item) => item.id));
  for (const transition of options.musicTransitions ?? []) {
    if (transition.from !== undefined && !musicIds.has(transition.from)) {
      throw new SdkError("TN_SDK_AUDIO_TRANSITION_TARGET_MISSING", `Audio music transition '${transition.id}' references unknown source music '${transition.from}'.`);
    }
    if (!musicIds.has(transition.to)) {
      throw new SdkError("TN_SDK_AUDIO_TRANSITION_TARGET_MISSING", `Audio music transition '${transition.id}' references unknown target music '${transition.to}'.`);
    }
  }
}

function assertControls(options: {
  controls?: readonly IAudioPlaybackControlDeclaration[];
  music?: readonly IAudioMusicDeclaration[];
  oneShots?: readonly IAudioOneShotDeclaration[];
}): void {
  const playbackIds = new Set([...(options.music ?? []), ...(options.oneShots ?? [])].map((item) => item.id));
  for (const control of options.controls ?? []) {
    assertNonEmpty(control.id, "TN_SDK_AUDIO_CONTROL_EMPTY", "Audio playback control ID must not be empty.");
    if (!playbackIds.has(control.target)) {
      throw new SdkError("TN_SDK_AUDIO_CONTROL_TARGET_MISSING", `Audio playback control '${control.id}' references unknown playback '${control.target}'.`);
    }
    if (control.kind !== "seek" && control.at !== undefined) {
      throw new SdkError("TN_SDK_AUDIO_CONTROL_SEEK_INVALID", `Audio playback control '${control.id}' may only set at for seek controls.`);
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
