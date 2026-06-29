import type { IAssetsManifest, IAudioControlIr, IAudioIr, IAudioMusicIr, IAudioOneShotIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { isRecord, validateFiniteVec3, validatePositiveFinite } from "./validationPrimitives.js";

export function validateAudio(
  audio: IAudioIr,
  assets: IAssetsManifest | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = audio as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["buses", "controls", "duckingRules", "emitters", "listeners", "music", "musicTransitions", "oneShots", "schema", "tones", "version"].includes(key)) {
      pushUnsupportedAudioField(diagnostics, key, `${path}/${key}`, "Audio IR");
    }
  }
  if (audio.schema !== "threenative.audio" || audio.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_AUDIO_VERSION_UNSUPPORTED",
      message: "Audio IR must use threenative.audio version 0.1.0.",
      path,
    });
  }
  const audioAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "audio").map((asset) => asset.id));
  const busIds = validateAudioBuses(audio.buses, `${path}/buses`, diagnostics);
  const emitterIds = validateAudioEmitters(audio.emitters, `${path}/emitters`, diagnostics);
  validateAudioListeners(audio.listeners, `${path}/listeners`, diagnostics);
  validateAudioDuckingRules(audio.duckingRules, busIds, `${path}/duckingRules`, diagnostics);
  validateAudioTones(audio.tones, busIds, `${path}/tones`, diagnostics);
  audio.oneShots.forEach((oneShot, index) => validateAudioOneShot(oneShot, audioAssets, busIds, emitterIds, `${path}/oneShots/${index}`, diagnostics));
  audio.music.forEach((music, index) => validateAudioMusic(music, audioAssets, busIds, `${path}/music/${index}`, diagnostics));
  validateAudioMusicTransitions(audio.musicTransitions, audio, `${path}/musicTransitions`, diagnostics);
  validateAudioControls(audio.controls, audio, `${path}/controls`, diagnostics);
}
function validateAudioOneShot(
  oneShot: IAudioOneShotIr,
  audioAssets: Set<string>,
  busIds: Set<string>,
  emitterIds: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = oneShot as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["asset", "bus", "emitter", "event", "id", "pitch", "volume"].includes(key)) {
      diagnostics.push({
        ...unsupportedAudioField(key, `${path}/${key}`, `Audio one-shot '${oneShot.id}'`),
      });
    }
  }
  validateAudioVolume(oneShot.volume, `${path}/volume`, diagnostics);
  validateAudioPitch(oneShot.pitch, `${path}/pitch`, diagnostics);
  validateAudioAssetRef(oneShot.asset, audioAssets, `${path}/asset`, diagnostics);
  validateAudioRouteRef(oneShot.bus, busIds, `${path}/bus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
  validateAudioRouteRef(oneShot.emitter, emitterIds, `${path}/emitter`, "TN_IR_AUDIO_EMITTER_MISSING", "emitter", diagnostics);
}

function validateAudioMusic(
  music: IAudioMusicIr,
  audioAssets: Set<string>,
  busIds: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = music as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["asset", "autoplay", "bus", "id", "loop", "pitch", "volume"].includes(key)) {
      diagnostics.push({
        ...unsupportedAudioField(key, `${path}/${key}`, `Audio music '${music.id}'`),
      });
    }
  }
  if (music.loop !== true) {
    diagnostics.push({
      code: "TN_IR_AUDIO_MUSIC_LOOP_REQUIRED",
      message: `Audio music '${music.id}' must be looped in V2.`,
      path: `${path}/loop`,
    });
  }
  validateAudioVolume(music.volume, `${path}/volume`, diagnostics);
  validateAudioPitch(music.pitch, `${path}/pitch`, diagnostics);
  validateAudioAssetRef(music.asset, audioAssets, `${path}/asset`, diagnostics);
  validateAudioRouteRef(music.bus, busIds, `${path}/bus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
}

function validateAudioControls(
  controls: IAudioControlIr[] | undefined,
  audio: IAudioIr,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (controls === undefined) {
    return;
  }
  if (!Array.isArray(controls)) {
    diagnostics.push({ code: "TN_IR_AUDIO_CONTROLS_INVALID", message: "Audio controls must be an array.", path });
    return;
  }
  const playbackIds = new Set([...audio.music, ...audio.oneShots].map((item) => item.id));
  const ids = new Set<string>();
  controls.forEach((control, index) => {
    const controlPath = `${path}/${index}`;
    const raw = control as unknown as Record<string, unknown>;
    for (const key of Object.keys(raw)) {
      if (!["at", "id", "kind", "target"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio control '${control.id}' uses unsupported field '${key}'.`, path: `${controlPath}/${key}` });
      }
    }
    if (ids.has(control.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_DUPLICATE", message: `Audio control '${control.id}' is duplicated.`, path: `${controlPath}/id` });
    }
    ids.add(control.id);
    if (!["pause", "query", "resume", "seek", "stop"].includes(control.kind)) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_KIND_INVALID", message: `Audio control '${control.id}' uses unsupported kind '${String(control.kind)}'.`, path: `${controlPath}/kind` });
    }
    if (!playbackIds.has(control.target)) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_TARGET_MISSING", message: `Audio control '${control.id}' references unknown playback '${control.target}'.`, path: `${controlPath}/target` });
    }
    if (control.at !== undefined && (!Number.isFinite(control.at) || control.at < 0 || control.kind !== "seek")) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_SEEK_INVALID", message: `Audio control '${control.id}' has an invalid seek position.`, path: `${controlPath}/at` });
    }
  });
}

function validateAudioBuses(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  if (value === undefined) {
    return ids;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_BUSES_INVALID", message: "Audio buses must be an array.", path });
    return ids;
  }
  value.forEach((bus, index) => {
    const busPath = `${path}/${index}`;
    if (!isRecord(bus)) {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_INVALID", message: "Audio bus must be an object.", path: busPath });
      return;
    }
    for (const key of Object.keys(bus)) {
      if (!["gain", "id", "mute", "parent", "solo", "volume"].includes(key)) {
        pushUnsupportedAudioField(diagnostics, key, `${busPath}/${key}`, "Audio bus");
      }
    }
    if (typeof bus.id !== "string" || bus.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_ID_INVALID", message: "Audio bus ID must be a non-empty string.", path: `${busPath}/id` });
    } else if (ids.has(bus.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_DUPLICATE", message: `Audio bus '${bus.id}' is duplicated.`, path: `${busPath}/id` });
    } else {
      ids.add(bus.id);
    }
    validateAudioGain(bus.gain, `${busPath}/gain`, diagnostics);
    validateAudioRouteRef(bus.parent, ids, `${busPath}/parent`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
    if (bus.mute !== undefined && typeof bus.mute !== "boolean") {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_FLAG_INVALID", message: "Audio bus mute must be boolean.", path: `${busPath}/mute` });
    }
    if (bus.solo !== undefined && typeof bus.solo !== "boolean") {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_FLAG_INVALID", message: "Audio bus solo must be boolean.", path: `${busPath}/solo` });
    }
    validateAudioVolume(bus.volume, `${busPath}/volume`, diagnostics);
  });
  return ids;
}

function validateAudioListeners(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  if (value === undefined) {
    return ids;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_LISTENERS_INVALID", message: "Audio listeners must be an array.", path });
    return ids;
  }
  value.forEach((listener, index) => {
    const listenerPath = `${path}/${index}`;
    if (!isRecord(listener)) {
      diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_INVALID", message: "Audio listener must be an object.", path: listenerPath });
      return;
    }
    for (const key of Object.keys(listener)) {
      if (!["binding", "id", "position"].includes(key)) {
        pushUnsupportedAudioField(diagnostics, key, `${listenerPath}/${key}`, "Audio listener");
      }
    }
    if (typeof listener.id !== "string" || listener.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_ID_INVALID", message: "Audio listener ID must be a non-empty string.", path: `${listenerPath}/id` });
    } else if (ids.has(listener.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_DUPLICATE", message: `Audio listener '${listener.id}' is duplicated.`, path: `${listenerPath}/id` });
    } else {
      ids.add(listener.id);
    }
    validateAudioListenerBinding(listener.binding, `${listenerPath}/binding`, diagnostics);
    validateFiniteVec3(listener.position, `${listenerPath}/position`, "TN_IR_AUDIO_LISTENER_POSITION_INVALID", diagnostics);
  });
  return ids;
}

function validateAudioEmitters(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  if (value === undefined) {
    return ids;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_EMITTERS_INVALID", message: "Audio emitters must be an array.", path });
    return ids;
  }
  value.forEach((emitter, index) => {
    const emitterPath = `${path}/${index}`;
    if (!isRecord(emitter)) {
      diagnostics.push({ code: "TN_IR_AUDIO_EMITTER_INVALID", message: "Audio emitter must be an object.", path: emitterPath });
      return;
    }
    for (const key of Object.keys(emitter)) {
      if (!["attenuation", "id", "position", "radius"].includes(key)) {
        pushUnsupportedAudioField(diagnostics, key, `${emitterPath}/${key}`, "Audio emitter");
      }
    }
    if (typeof emitter.id !== "string" || emitter.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_EMITTER_ID_INVALID", message: "Audio emitter ID must be a non-empty string.", path: `${emitterPath}/id` });
    } else if (ids.has(emitter.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_EMITTER_DUPLICATE", message: `Audio emitter '${emitter.id}' is duplicated.`, path: `${emitterPath}/id` });
    } else {
      ids.add(emitter.id);
    }
    validateFiniteVec3(emitter.position, `${emitterPath}/position`, "TN_IR_AUDIO_EMITTER_POSITION_INVALID", diagnostics);
    validateAudioAttenuation(emitter.attenuation, `${emitterPath}/attenuation`, diagnostics);
    if (emitter.radius !== undefined) {
      validatePositiveFinite(emitter.radius, `${emitterPath}/radius`, "TN_IR_AUDIO_EMITTER_RADIUS_INVALID", diagnostics);
    }
  });
  return ids;
}

function validateAudioDuckingRules(value: unknown, busIds: Set<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_DUCKING_INVALID", message: "Audio ducking rules must be an array.", path });
    return;
  }
  const ids = new Set<string>();
  value.forEach((rule, index) => {
    const rulePath = `${path}/${index}`;
    if (!isRecord(rule)) {
      diagnostics.push({ code: "TN_IR_AUDIO_DUCKING_INVALID", message: "Audio ducking rule must be an object.", path: rulePath });
      return;
    }
    for (const key of Object.keys(rule)) {
      if (!["attack", "gain", "id", "release", "sourceBus", "targetBus"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio ducking rule uses unsupported field '${key}'.`, path: `${rulePath}/${key}` });
      }
    }
    if (typeof rule.id !== "string" || rule.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_DUCKING_ID_INVALID", message: "Audio ducking rule ID must be a non-empty string.", path: `${rulePath}/id` });
    } else if (ids.has(rule.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_DUCKING_DUPLICATE", message: `Audio ducking rule '${rule.id}' is duplicated.`, path: `${rulePath}/id` });
    } else {
      ids.add(rule.id);
    }
    validateAudioRouteRef(rule.sourceBus, busIds, `${rulePath}/sourceBus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
    validateAudioRouteRef(rule.targetBus, busIds, `${rulePath}/targetBus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
    validateAudioGain(rule.gain, `${rulePath}/gain`, diagnostics);
    validateAudioDuration(rule.attack, `${rulePath}/attack`, "TN_IR_AUDIO_DUCKING_TIME_INVALID", diagnostics);
    validateAudioDuration(rule.release, `${rulePath}/release`, "TN_IR_AUDIO_DUCKING_TIME_INVALID", diagnostics);
  });
}

function validateAudioTones(value: unknown, busIds: Set<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_TONES_INVALID", message: "Audio tones must be an array.", path });
    return;
  }
  const ids = new Set<string>();
  value.forEach((tone, index) => {
    const tonePath = `${path}/${index}`;
    if (!isRecord(tone)) {
      diagnostics.push({ code: "TN_IR_AUDIO_TONE_INVALID", message: "Audio tone must be an object.", path: tonePath });
      return;
    }
    for (const key of Object.keys(tone)) {
      if (!["bus", "duration", "frequency", "id", "pitch", "volume", "waveform"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio tone uses unsupported field '${key}'.`, path: `${tonePath}/${key}` });
      }
    }
    if (typeof tone.id !== "string" || tone.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_TONE_ID_INVALID", message: "Audio tone ID must be a non-empty string.", path: `${tonePath}/id` });
    } else if (ids.has(tone.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_TONE_DUPLICATE", message: `Audio tone '${tone.id}' is duplicated.`, path: `${tonePath}/id` });
    } else {
      ids.add(tone.id);
    }
    if (!["noise", "sine", "square"].includes(String(tone.waveform))) {
      diagnostics.push({ code: "TN_IR_AUDIO_TONE_WAVEFORM_INVALID", message: `Audio tone '${String(tone.id)}' uses unsupported waveform '${String(tone.waveform)}'.`, path: `${tonePath}/waveform` });
    }
    validateAudioRouteRef(tone.bus, busIds, `${tonePath}/bus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
    validateAudioDuration(tone.duration, `${tonePath}/duration`, "TN_IR_AUDIO_TONE_DURATION_INVALID", diagnostics);
    validateAudioFrequency(tone.frequency, `${tonePath}/frequency`, diagnostics);
    validateAudioPitch(tone.pitch, `${tonePath}/pitch`, diagnostics);
    validateAudioVolume(tone.volume, `${tonePath}/volume`, diagnostics);
  });
}

function validateAudioMusicTransitions(value: unknown, audio: IAudioIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_TRANSITIONS_INVALID", message: "Audio music transitions must be an array.", path });
    return;
  }
  const ids = new Set<string>();
  const musicIds = new Set(audio.music.map((music) => music.id));
  value.forEach((transition, index) => {
    const transitionPath = `${path}/${index}`;
    if (!isRecord(transition)) {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_INVALID", message: "Audio music transition must be an object.", path: transitionPath });
      return;
    }
    for (const key of Object.keys(transition)) {
      if (!["duration", "from", "id", "kind", "playbackId", "state", "to"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio music transition uses unsupported field '${key}'.`, path: `${transitionPath}/${key}` });
      }
    }
    if (typeof transition.id !== "string" || transition.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_ID_INVALID", message: "Audio music transition ID must be a non-empty string.", path: `${transitionPath}/id` });
    } else if (ids.has(transition.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_DUPLICATE", message: `Audio music transition '${transition.id}' is duplicated.`, path: `${transitionPath}/id` });
    } else {
      ids.add(transition.id);
    }
    if (!["crossfade", "intro", "loop", "stinger"].includes(String(transition.kind))) {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_KIND_INVALID", message: `Audio music transition '${String(transition.id)}' uses unsupported kind '${String(transition.kind)}'.`, path: `${transitionPath}/kind` });
    }
    if (typeof transition.playbackId !== "string" || transition.playbackId.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_PLAYBACK_INVALID", message: "Audio music transition playbackId must be a non-empty string.", path: `${transitionPath}/playbackId` });
    }
    if (typeof transition.state !== "string" || transition.state.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_STATE_INVALID", message: "Audio music transition state must be a non-empty string.", path: `${transitionPath}/state` });
    }
    if (transition.from !== undefined && (typeof transition.from !== "string" || !musicIds.has(transition.from))) {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_TARGET_MISSING", message: `Audio music transition references unknown source music '${String(transition.from)}'.`, path: `${transitionPath}/from` });
    }
    if (typeof transition.to !== "string" || !musicIds.has(transition.to)) {
      diagnostics.push({ code: "TN_IR_AUDIO_TRANSITION_TARGET_MISSING", message: `Audio music transition references unknown target music '${String(transition.to)}'.`, path: `${transitionPath}/to` });
    }
    if (transition.duration !== undefined) {
      validateAudioDuration(transition.duration, `${transitionPath}/duration`, "TN_IR_AUDIO_TRANSITION_DURATION_INVALID", diagnostics);
    }
  });
}

function validateAudioAttenuation(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_ATTENUATION_INVALID", message: "Audio attenuation must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["curve", "maxDistance", "minDistance", "rolloffFactor"].includes(key)) {
      diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio attenuation uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (!["exponential", "inverse", "linear"].includes(String(value.curve))) {
    diagnostics.push({ code: "TN_IR_AUDIO_ATTENUATION_CURVE_INVALID", message: `Audio attenuation uses unsupported curve '${String(value.curve)}'.`, path: `${path}/curve` });
  }
  if (typeof value.minDistance !== "number" || !Number.isFinite(value.minDistance) || value.minDistance <= 0 || typeof value.maxDistance !== "number" || !Number.isFinite(value.maxDistance) || value.maxDistance <= value.minDistance) {
    diagnostics.push({ code: "TN_IR_AUDIO_ATTENUATION_DISTANCE_INVALID", message: "Audio attenuation distances must be finite and maxDistance must be greater than minDistance.", path });
  }
  if (typeof value.rolloffFactor !== "number" || !Number.isFinite(value.rolloffFactor) || value.rolloffFactor < 0 || value.rolloffFactor > 10) {
    diagnostics.push({ code: "TN_IR_AUDIO_ATTENUATION_ROLLOFF_INVALID", message: "Audio attenuation rolloffFactor must be a finite number between 0 and 10.", path: `${path}/rolloffFactor` });
  }
}

function validateAudioListenerBinding(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_BINDING_INVALID", message: "Audio listener binding must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["entity", "kind"].includes(key)) {
      diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio listener binding uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (!["activeCamera", "entity"].includes(String(value.kind))) {
    diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_BINDING_INVALID", message: `Audio listener binding uses unsupported kind '${String(value.kind)}'.`, path: `${path}/kind` });
  }
  if (value.kind === "entity" && (typeof value.entity !== "string" || value.entity.trim() === "")) {
    diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_BINDING_ENTITY_INVALID", message: "Audio listener entity binding must include an entity ID.", path: `${path}/entity` });
  }
}

function validateAudioRouteRef(
  value: unknown,
  ids: Set<string>,
  path: string,
  code: string,
  label: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "" || !ids.has(value)) {
    diagnostics.push({
      code,
      message: `Audio playback references unknown ${label} '${String(value)}'.`,
      path,
    });
  }
}

function validateAudioVolume(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    diagnostics.push({
      code: "TN_IR_AUDIO_VOLUME_INVALID",
      message: "Audio volume must be a finite number greater than or equal to 0.",
      path,
    });
  }
}

function validateAudioGain(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    diagnostics.push({ code: "TN_IR_AUDIO_GAIN_INVALID", message: "Audio gain must be a finite number between 0 and 1.", path });
  }
}

function validateAudioPitch(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 4) {
    diagnostics.push({ code: "TN_IR_AUDIO_PITCH_INVALID", message: "Audio pitch must be a positive finite number up to 4.", path });
  }
}

function validateAudioDuration(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 60) {
    diagnostics.push({ code, message: "Audio duration must be a finite number between 0 and 60 seconds.", path });
  }
}

function validateAudioFrequency(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 24_000) {
    diagnostics.push({ code: "TN_IR_AUDIO_TONE_FREQUENCY_INVALID", message: "Audio tone frequency must be a positive finite number up to 24000 Hz.", path });
  }
}

function validateAudioAssetRef(
  asset: string,
  audioAssets: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!audioAssets.has(asset)) {
    diagnostics.push({
      code: "TN_IR_AUDIO_ASSET_MISSING",
      message: `Audio playback references unknown audio asset '${asset}'.`,
      path,
    });
  }
}

function pushUnsupportedAudioField(diagnostics: IIrDiagnostic[], key: string, path: string, label: string): void {
  diagnostics.push(unsupportedAudioField(key, path, label));
}

function unsupportedAudioField(key: string, path: string, label: string): IIrDiagnostic {
  if (["stream", "streaming", "streamingUrl"].includes(key)) {
    return {
      code: "TN_IR_AUDIO_STREAMING_UNSUPPORTED",
      message: `${label} uses unsupported streaming audio field '${key}'. Audio sources must be bundle-local OGG or WAV assets.`,
      path,
    };
  }
  if (["networkUrl", "networkStream"].includes(key)) {
    return {
      code: "TN_IR_AUDIO_NETWORK_UNSUPPORTED",
      message: `${label} uses unsupported network audio field '${key}'. Audio sources must be bundle-local.`,
      path,
    };
  }
  if (["nativeHandle", "platformHandle"].includes(key)) {
    return {
      code: "TN_IR_AUDIO_PLATFORM_HANDLE_UNSUPPORTED",
      message: `${label} uses unsupported platform-native audio handle field '${key}'.`,
      path,
    };
  }
  if (["codec", "decoderPlugin"].includes(key)) {
    return {
      code: "TN_IR_AUDIO_DECODER_PLUGIN_UNSUPPORTED",
      message: `${label} uses unsupported decoder/plugin field '${key}'.`,
      path,
    };
  }
  if (["effect", "effectChain", "effects", "mixer"].includes(key)) {
    return {
      code: "TN_IR_AUDIO_EFFECT_CHAIN_UNSUPPORTED",
      message: `${label} uses unsupported audio effect chain field '${key}'.`,
      path,
    };
  }
  return {
    code: "TN_IR_AUDIO_FIELD_UNSUPPORTED",
    message: `${label} uses unsupported field '${key}'.`,
    path,
  };
}
