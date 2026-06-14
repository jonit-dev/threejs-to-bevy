import type { IAssetsManifest, IAudioIr, IRuntimeDiagnostic } from "@threenative/ir";
import { resolveWebAssets } from "./assets.js";
import type { IQueuedEvent } from "./systems/context.js";

export interface IWebAudioCommand {
  asset: string;
  event?: string;
  id: string;
  kind: "loop" | "oneShot";
}

export interface IWebAudioSink {
  queue(command: IWebAudioCommand): void;
}

export interface IWebAudioElement {
  loop: boolean;
  src: string;
  currentTime: number;
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
          queue({ asset: oneShot.asset, event: event.event, id: oneShot.id, kind: "oneShot" });
        }
      }
    },
    start() {
      for (const music of audio.music.filter((item) => item.loop && item.autoplay !== false)) {
        queue({ asset: music.asset, id: music.id, kind: "loop" });
      }
    },
  };
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
