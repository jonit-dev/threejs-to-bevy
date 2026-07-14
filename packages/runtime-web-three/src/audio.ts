import type { IAssetsManifest, IAudioIr, IRuntimeDiagnostic } from "@threenative/ir";
import { resolveWebAssets } from "./assets.js";
import type { IQueuedEvent, IQueuedServiceCall } from "./systems/context.js";

export interface IWebAudioCommand {
  asset: string;
  bus?: string;
  emitter?: string;
  event?: string;
  id: string;
  kind: "loop" | "oneShot" | "tone";
  pitch?: number;
  tone?: { duration: number; frequency?: number; waveform: "noise" | "sine" | "square" };
  volume?: number;
}

export interface IWebAudioSink {
  queue(command: IWebAudioCommand): void;
}

export interface IWebAudioElement {
  loop: boolean;
  src: string;
  currentTime: number;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
}

export interface IWebAudioElementSink extends IWebAudioSink {
  diagnostics: IRuntimeDiagnostic[];
  dispose(): void;
  handleServices(services: readonly IQueuedServiceCall[], audio: IAudioIr): void;
  pauseLoops(): void;
  resumeLoops(): void;
}

export interface IWebAudioRuntime {
  commands: IWebAudioCommand[];
  handleEvents(events: ReadonlyArray<IQueuedEvent>): void;
  start(): void;
}

export interface IWebAudioLifecycleTrace {
  activeLoops: string[];
  commands: IWebAudioCommand[];
  lifecycle: Array<{ at?: number; id: string; kind: "pause" | "query" | "resume" | "seek" | "start" | "stop"; state?: "paused" | "playing" | "stopped" }>;
  pausedLoops: string[];
}

export interface IWebAudioSupportTrace {
  attenuation: Array<{ emitter: string; gain: number; listener: string; listenerPosition: readonly [number, number, number] }>;
  ducking: Array<{ gain: number; id: string; sourceBus: string; targetBus: string }>;
  listenerBindings: Array<{ entity?: string; id: string; kind: "activeCamera" | "entity" | "fixed" }>;
  musicTransitions: Array<{ duration?: number; from?: string; id: string; kind: string; playbackId: string; state: string; to: string }>;
  tones: Array<{ bus?: string; duration: number; frequency?: number; id: string; pitch?: number; volume?: number; waveform: string }>;
}

export function createWebAudioRuntime(audio: IAudioIr, sink?: IWebAudioSink): IWebAudioRuntime {
  const commands: IWebAudioCommand[] = [];
  const queue = (command: IWebAudioCommand) => {
    commands.push(command);
    sink?.queue(command);
  };
  return {
    commands,
    handleEvents(events) {
      for (const event of events) {
        for (const oneShot of audio.oneShots.filter((item) => item.event === event.event)) {
          queue({ asset: oneShot.asset, ...(oneShot.bus === undefined ? {} : { bus: oneShot.bus }), ...(oneShot.emitter === undefined ? {} : { emitter: oneShot.emitter }), event: event.event, id: oneShot.id, kind: "oneShot", ...(oneShot.pitch === undefined ? {} : { pitch: oneShot.pitch }), ...(oneShot.volume === undefined ? {} : { volume: oneShot.volume }) });
        }
      }
    },
    start() {
      for (const music of audio.music.filter((item) => item.loop && item.autoplay !== false)) {
        queue({ asset: music.asset, ...(music.bus === undefined ? {} : { bus: music.bus }), id: music.id, kind: "loop", ...(music.pitch === undefined ? {} : { pitch: music.pitch }), ...(music.volume === undefined ? {} : { volume: music.volume }) });
      }
      for (const tone of audio.tones ?? []) {
        queue({ asset: `generated:${tone.id}`, ...(tone.bus === undefined ? {} : { bus: tone.bus }), id: tone.id, kind: "tone", ...(tone.pitch === undefined ? {} : { pitch: tone.pitch }), tone: { duration: tone.duration, ...(tone.frequency === undefined ? {} : { frequency: tone.frequency }), waveform: tone.waveform }, ...(tone.volume === undefined ? {} : { volume: tone.volume }) });
      }
    },
  };
}

export function traceWebAudioLifecycle(
  audio: IAudioIr,
  events: ReadonlyArray<IQueuedEvent>,
  stopLoops: readonly string[] = [],
): IWebAudioLifecycleTrace {
  const runtime = createWebAudioRuntime(audio);
  const activeLoops = new Set<string>();
  const pausedLoops = new Set<string>();
  const lifecycle: IWebAudioLifecycleTrace["lifecycle"] = [];

  runtime.start();
  for (const command of runtime.commands.filter((command) => command.kind === "loop")) {
    activeLoops.add(command.id);
    lifecycle.push({ id: command.id, kind: "start" });
  }
  runtime.handleEvents(events);
  for (const id of stopLoops) {
    if (activeLoops.delete(id)) {
      lifecycle.push({ id, kind: "stop" });
    }
  }
  for (const control of audio.controls ?? []) {
    if (control.kind === "pause" && activeLoops.delete(control.target)) {
      pausedLoops.add(control.target);
      lifecycle.push({ id: control.target, kind: "pause" });
      continue;
    }
    if (control.kind === "resume" && pausedLoops.delete(control.target)) {
      activeLoops.add(control.target);
      lifecycle.push({ id: control.target, kind: "resume" });
      continue;
    }
    if (control.kind === "stop") {
      const wasActive = activeLoops.delete(control.target);
      const wasPaused = pausedLoops.delete(control.target);
      if (wasActive || wasPaused) {
        lifecycle.push({ id: control.target, kind: "stop" });
      }
      continue;
    }
    if (control.kind === "seek") {
      lifecycle.push({ at: control.at ?? 0, id: control.target, kind: "seek" });
      continue;
    }
    if (control.kind === "query") {
      lifecycle.push({
        id: control.target,
        kind: "query",
        state: activeLoops.has(control.target) ? "playing" : pausedLoops.has(control.target) ? "paused" : "stopped",
      });
    }
  }

  return {
    activeLoops: [...activeLoops].sort(),
    commands: [...runtime.commands].sort((left, right) => left.id.localeCompare(right.id)),
    lifecycle,
    pausedLoops: [...pausedLoops].sort(),
  };
}

export function traceWebAudioSupport(audio: IAudioIr, listenerPositions?: Record<string, Array<readonly [number, number, number]>>): IWebAudioSupportTrace {
  const attenuation: IWebAudioSupportTrace["attenuation"] = [];
  for (const listener of audio.listeners ?? []) {
    const positions = listenerPositions?.[listener.id] ?? [listener.position];
    for (const position of positions) {
      for (const emitter of audio.emitters ?? []) {
        attenuation.push({
          emitter: emitter.id,
          gain: attenuationGain(distance(position, emitter.position), emitter.attenuation ?? (emitter.radius === undefined ? undefined : { curve: "linear", minDistance: 1, maxDistance: emitter.radius, rolloffFactor: 1 })),
          listener: listener.id,
          listenerPosition: position,
        });
      }
    }
  }
  return {
    attenuation,
    ducking: (audio.duckingRules ?? []).map((rule) => ({ gain: rule.gain, id: rule.id, sourceBus: rule.sourceBus, targetBus: rule.targetBus })),
    listenerBindings: (audio.listeners ?? []).map((listener) => ({ id: listener.id, kind: listener.binding?.kind ?? "fixed", ...(listener.binding?.entity === undefined ? {} : { entity: listener.binding.entity }) })),
    musicTransitions: (audio.musicTransitions ?? []).map((transition) => ({ ...(transition.duration === undefined ? {} : { duration: transition.duration }), ...(transition.from === undefined ? {} : { from: transition.from }), id: transition.id, kind: transition.kind, playbackId: transition.playbackId, state: transition.state, to: transition.to })),
    tones: (audio.tones ?? []).map((tone) => ({ ...(tone.bus === undefined ? {} : { bus: tone.bus }), duration: tone.duration, ...(tone.frequency === undefined ? {} : { frequency: tone.frequency }), id: tone.id, ...(tone.pitch === undefined ? {} : { pitch: tone.pitch }), ...(tone.volume === undefined ? {} : { volume: tone.volume }), waveform: tone.waveform })),
  };
}

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function attenuationGain(distanceValue: number, attenuation: { curve: "exponential" | "inverse" | "linear"; maxDistance: number; minDistance: number; rolloffFactor: number } | undefined): number {
  if (attenuation === undefined || distanceValue <= attenuation.minDistance) {
    return 1;
  }
  if (distanceValue >= attenuation.maxDistance) {
    return 0;
  }
  const normalized = (distanceValue - attenuation.minDistance) / (attenuation.maxDistance - attenuation.minDistance);
  if (attenuation.curve === "linear") {
    return clamp01(1 - normalized * attenuation.rolloffFactor);
  }
  if (attenuation.curve === "exponential") {
    return clamp01((distanceValue / attenuation.minDistance) ** -attenuation.rolloffFactor);
  }
  return clamp01(attenuation.minDistance / (attenuation.minDistance + attenuation.rolloffFactor * (distanceValue - attenuation.minDistance)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(6))));
}

export function createWebAudioElementSink(
  source: string,
  assets: IAssetsManifest,
  createElement: () => IWebAudioElement = defaultAudioElement,
): IWebAudioElementSink {
  const resolvedAssets = resolveWebAssets(source, assets);
  const diagnostics: IRuntimeDiagnostic[] = [];
  const loops = new Map<string, IWebAudioElement>();
  const pausedLoops = new Set<string>();
  const playbacks = new Map<string, IWebAudioElement>();
  const elements = new Set<IWebAudioElement>();

  const playElement = (element: IWebAudioElement, id: string) => {
    const result = element.play();
    if (isPromiseLike(result)) {
      void result.catch((error: unknown) => {
        diagnostics.push({
          code: "TN_AUDIO_PLAYBACK_REJECTED",
          message: `Audio command '${id}' could not start playback: ${error instanceof Error ? error.message : String(error)}`,
          path: `audio/${id}`,
          severity: "warning",
        });
      });
    }
  };

  const queue = (command: IWebAudioCommand) => {
    const asset = resolvedAssets.get(command.asset);
    if (asset?.asset.kind !== "audio") {
      diagnostics.push({
        code: "TN_AUDIO_ASSET_MISSING",
        message: `Audio command '${command.id}' references missing or non-audio asset '${command.asset}'.`,
        path: `audio/${command.id}/asset`,
        severity: "error",
      });
      return;
    }

    const element = command.kind === "loop" ? loops.get(command.id) ?? createElement() : createElement();
    elements.add(element);
    playbacks.set(command.id, element);
    element.src = asset.url;
    element.loop = command.kind === "loop";
    element.currentTime = 0;
    element.volume = command.volume ?? 1;
    if (command.kind === "loop") {
      loops.set(command.id, element);
    }
    playElement(element, command.id);
  };

  return {
    diagnostics,
    dispose() {
      for (const element of elements) {
        element.pause();
        element.currentTime = 0;
      }
      elements.clear();
      loops.clear();
      pausedLoops.clear();
      playbacks.clear();
    },
    handleServices(services, audio) {
      for (const service of services) {
        if (!isRecord(service.payload) || !isRecord(service.payload.result)) continue;
        const result = service.payload.result;
        const playbackId = readString(result.playbackId);
        if (playbackId === undefined) continue;
        if (service.service === "audio.stop") {
          const element = playbacks.get(playbackId);
          if (element !== undefined) {
            element.pause();
            element.currentTime = 0;
            elements.delete(element);
            playbacks.delete(playbackId);
            loops.delete(playbackId);
            pausedLoops.delete(playbackId);
          }
          continue;
        }
        if (service.service !== "audio.play" || result.accepted !== true || result.status !== "playing") continue;
        const soundId = readString(result.soundId);
        const asset = soundId === undefined ? undefined : scriptAudioAsset(audio, soundId);
        if (soundId === undefined || asset === undefined) {
          diagnostics.push({
            code: "TN_AUDIO_ASSET_MISSING",
            message: `Script audio playback '${playbackId}' references undeclared or non-file sound '${soundId ?? ""}'.`,
            path: `audio/${playbackId}/soundId`,
            severity: "error",
          });
          continue;
        }
        queue({
          asset,
          id: playbackId,
          kind: result.loop === true ? "loop" : "oneShot",
          ...(typeof result.pitch === "number" ? { pitch: result.pitch } : {}),
          ...(typeof result.volume === "number" ? { volume: result.volume } : {}),
        });
      }
    },
    pauseLoops() {
      for (const [id, element] of loops) {
        element.pause();
        pausedLoops.add(id);
      }
    },
    queue,
    resumeLoops() {
      for (const id of [...pausedLoops]) {
        const element = loops.get(id);
        if (element !== undefined) playElement(element, id);
        pausedLoops.delete(id);
      }
    },
  };
}

function scriptAudioAsset(audio: IAudioIr, soundId: string): string | undefined {
  return audio.music.find((item) => item.id === soundId)?.asset
    ?? audio.oneShots.find((item) => item.id === soundId)?.asset;
}

function defaultAudioElement(): IWebAudioElement {
  return new Audio();
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return typeof value === "object" && value !== null && "catch" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export type ScriptAudioPlaybackKind = "loop" | "oneShot" | "tone";
export type ScriptAudioPlaybackStatus = "playing" | "rejected" | "stopped";

export interface IScriptAudioPlayOptions {
  entity?: string;
  loop?: boolean;
  pitch?: number;
  volume?: number;
}

export interface IScriptAudioRuntimeState {
  accepted: boolean;
  entity?: string;
  kind?: ScriptAudioPlaybackKind;
  loop?: boolean;
  pitch?: number;
  playbackId: string;
  reason?: string;
  soundId: string;
  status: ScriptAudioPlaybackStatus;
  volume?: number;
}

interface IScriptAudioCatalogEntry {
  kind: ScriptAudioPlaybackKind;
  volume?: number;
}

interface IScriptAudioPlaybackRecord extends IScriptAudioRuntimeState {
  accepted: true;
}

const SCRIPT_AUDIO_EXTERNAL_OPTION_KEYS = new Set([
  "codec",
  "decoderPlugin",
  "device",
  "deviceId",
  "nativeHandle",
  "networkStream",
  "networkUrl",
  "platformHandle",
  "src",
  "stream",
  "streaming",
  "streamingUrl",
  "url",
]);

export class ScriptAudioRuntimeController {
  readonly #catalog: Map<string, IScriptAudioCatalogEntry>;
  readonly #playbacks = new Map<string, IScriptAudioPlaybackRecord>();
  #sequence = 0;

  constructor(audio?: IAudioIr) {
    this.#catalog = buildScriptAudioCatalog(audio);
  }

  play(soundId: string, options: IScriptAudioPlayOptions = {}): IScriptAudioRuntimeState {
    const unsupported = findUnsupportedScriptAudioOption(options as Record<string, unknown>);
    if (unsupported !== undefined) {
      return rejectScriptAudioPlay(soundId, "unsupported-option");
    }
    const declared = this.#catalog.get(soundId);
    if (declared === undefined) {
      return rejectScriptAudioPlay(soundId, "undeclared-sound");
    }
    this.#sequence += 1;
    const playbackId = `${soundId}#${this.#sequence}`;
    const volume = typeof options.volume === "number" && Number.isFinite(options.volume) ? options.volume : declared.volume;
    const loop = typeof options.loop === "boolean" ? options.loop : declared.kind === "loop";
    const record: IScriptAudioPlaybackRecord = {
      accepted: true,
      ...(typeof options.entity === "string" ? { entity: options.entity } : {}),
      kind: declared.kind,
      loop,
      ...(typeof options.pitch === "number" && Number.isFinite(options.pitch) ? { pitch: options.pitch } : {}),
      playbackId,
      soundId,
      status: "playing",
      ...(volume === undefined ? {} : { volume }),
    };
    this.#playbacks.set(playbackId, record);
    return serializeScriptAudioPlayback(record);
  }

  query(playbackId: string): IScriptAudioRuntimeState {
    const record = this.#playbacks.get(playbackId);
    if (record === undefined) {
      return {
        accepted: false,
        playbackId,
        reason: "not-found",
        soundId: "",
        status: "stopped",
      };
    }
    return serializeScriptAudioPlayback(record);
  }

  stop(playbackId: string): IScriptAudioRuntimeState {
    const record = this.#playbacks.get(playbackId);
    if (record === undefined) {
      return {
        accepted: true,
        playbackId,
        reason: "not-found",
        soundId: "",
        status: "stopped",
      };
    }
    const stopped: IScriptAudioPlaybackRecord = {
      ...record,
      status: "stopped",
    };
    this.#playbacks.set(playbackId, stopped);
    return serializeScriptAudioPlayback(stopped);
  }
}

function buildScriptAudioCatalog(audio: IAudioIr | undefined): Map<string, IScriptAudioCatalogEntry> {
  const catalog = new Map<string, IScriptAudioCatalogEntry>();
  if (audio === undefined) {
    return catalog;
  }
  for (const music of audio.music) {
    catalog.set(music.id, { kind: "loop", ...(music.volume === undefined ? {} : { volume: music.volume }) });
  }
  for (const oneShot of audio.oneShots) {
    catalog.set(oneShot.id, { kind: "oneShot", ...(oneShot.volume === undefined ? {} : { volume: oneShot.volume }) });
  }
  for (const tone of audio.tones ?? []) {
    catalog.set(tone.id, { kind: "tone", ...(tone.volume === undefined ? {} : { volume: tone.volume }) });
  }
  return catalog;
}

function findUnsupportedScriptAudioOption(options: Record<string, unknown>): string | undefined {
  return Object.keys(options).find((key) => SCRIPT_AUDIO_EXTERNAL_OPTION_KEYS.has(key));
}

function rejectScriptAudioPlay(soundId: string, reason: string): IScriptAudioRuntimeState {
  return {
    accepted: false,
    playbackId: "",
    reason,
    soundId,
    status: "rejected",
  };
}

function serializeScriptAudioPlayback(record: IScriptAudioPlaybackRecord): IScriptAudioRuntimeState {
  return {
    accepted: record.accepted,
    ...(record.entity === undefined ? {} : { entity: record.entity }),
    ...(record.kind === undefined ? {} : { kind: record.kind }),
    ...(record.loop === undefined ? {} : { loop: record.loop }),
    ...(record.pitch === undefined ? {} : { pitch: record.pitch }),
    playbackId: record.playbackId,
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    soundId: record.soundId,
    status: record.status,
    ...(record.volume === undefined ? {} : { volume: record.volume }),
  };
}
