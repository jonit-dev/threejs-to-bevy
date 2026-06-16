import type { IAssetsManifest, IAudioIr, IRuntimeDiagnostic } from "@threenative/ir";
import { resolveWebAssets } from "./assets.js";
import type { IQueuedEvent } from "./systems/context.js";

export interface IWebAudioCommand {
  asset: string;
  bus?: string;
  emitter?: string;
  event?: string;
  id: string;
  kind: "loop" | "oneShot";
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
}

export interface IWebAudioElementSink extends IWebAudioSink {
  diagnostics: IRuntimeDiagnostic[];
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

export interface IWebAudioSpatialObservation {
  attenuation: number;
  bus?: string;
  busGain: number;
  distance: number;
  effectiveVolume: number;
  emitter: string;
  emitterPosition: readonly [number, number, number];
  event: string;
  id: string;
  listener: string;
  listenerPosition: readonly [number, number, number];
  radius: number;
  sourceVolume: number;
}

export interface IWebAudioSpatialTrace {
  observations: IWebAudioSpatialObservation[];
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
          queue({ asset: oneShot.asset, ...(oneShot.bus === undefined ? {} : { bus: oneShot.bus }), ...(oneShot.emitter === undefined ? {} : { emitter: oneShot.emitter }), event: event.event, id: oneShot.id, kind: "oneShot", ...(oneShot.volume === undefined ? {} : { volume: oneShot.volume }) });
        }
      }
    },
    start() {
      for (const music of audio.music.filter((item) => item.loop && item.autoplay !== false)) {
        queue({ asset: music.asset, ...(music.bus === undefined ? {} : { bus: music.bus }), id: music.id, kind: "loop", ...(music.volume === undefined ? {} : { volume: music.volume }) });
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

export function traceWebAudioSpatialAttenuation(audio: IAudioIr, events: ReadonlyArray<IQueuedEvent>): IWebAudioSpatialTrace {
  const listener = [...(audio.listeners ?? [])].sort((left, right) => left.id.localeCompare(right.id))[0];
  if (listener === undefined) {
    return { observations: [] };
  }

  const emitters = new Map((audio.emitters ?? []).map((emitter) => [emitter.id, emitter]));
  const busGains = new Map((audio.buses ?? []).map((bus) => [bus.id, bus.volume ?? 1]));
  const observations: IWebAudioSpatialObservation[] = [];
  for (const event of events) {
    for (const oneShot of audio.oneShots.filter((item) => item.event === event.event && item.emitter !== undefined)) {
      const emitter = emitters.get(oneShot.emitter ?? "");
      if (emitter === undefined) {
        continue;
      }
      const distance = vec3Distance(listener.position, emitter.position);
      const radius = emitter.radius ?? 1;
      const attenuation = Math.max(0, Math.min(1, 1 - distance / radius));
      const sourceVolume = oneShot.volume ?? 1;
      const busGain = oneShot.bus === undefined ? 1 : (busGains.get(oneShot.bus) ?? 1);
      observations.push({
        attenuation,
        ...(oneShot.bus === undefined ? {} : { bus: oneShot.bus }),
        busGain,
        distance,
        effectiveVolume: sourceVolume * busGain * attenuation,
        emitter: emitter.id,
        emitterPosition: emitter.position,
        event: event.event,
        id: oneShot.id,
        listener: listener.id,
        listenerPosition: listener.position,
        radius,
        sourceVolume,
      });
    }
  }
  observations.sort((left, right) => left.id.localeCompare(right.id));
  return { observations };
}

export function createWebAudioElementSink(
  source: string,
  assets: IAssetsManifest,
  createElement: () => IWebAudioElement = defaultAudioElement,
): IWebAudioElementSink {
  const resolvedAssets = resolveWebAssets(source, assets);
  const diagnostics: IRuntimeDiagnostic[] = [];
  const loops = new Map<string, IWebAudioElement>();

  return {
    diagnostics,
    queue(command) {
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
      element.src = asset.url;
      element.loop = command.kind === "loop";
      element.currentTime = 0;
      element.volume = command.volume ?? 1;
      if (command.kind === "loop") {
        loops.set(command.id, element);
      }
      const result = element.play();
      if (isPromiseLike(result)) {
        void result.catch((error: unknown) => {
          diagnostics.push({
            code: "TN_AUDIO_PLAYBACK_REJECTED",
            message: `Audio command '${command.id}' could not start playback: ${error instanceof Error ? error.message : String(error)}`,
            path: `audio/${command.id}`,
            severity: "warning",
          });
        });
      }
    },
  };
}

function defaultAudioElement(): IWebAudioElement {
  return new Audio();
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return typeof value === "object" && value !== null && "catch" in value;
}

function vec3Distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
