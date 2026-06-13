import type { IAudioIr } from "@threenative/ir";
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
