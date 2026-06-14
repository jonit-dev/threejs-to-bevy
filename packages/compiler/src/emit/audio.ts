import type { IAudioIr } from "@threenative/ir";
import type { IAudioDeclaration } from "@threenative/sdk";

export function emitAudio(audio: IAudioDeclaration): IAudioIr {
  return {
    schema: "threenative.audio",
    version: "0.1.0",
    ...(audio.buses.length === 0 ? {} : { buses: audio.buses.map((bus) => ({ id: bus.id, ...(bus.volume === undefined ? {} : { volume: bus.volume }) })) }),
    ...(audio.controls.length === 0 ? {} : { controls: audio.controls.map((control) => ({ id: control.id, kind: control.kind, target: control.target, ...(control.at === undefined ? {} : { at: control.at }) })) }),
    ...(audio.emitters.length === 0 ? {} : { emitters: audio.emitters.map((emitter) => ({ id: emitter.id, position: emitter.position, ...(emitter.radius === undefined ? {} : { radius: emitter.radius }) })) }),
    ...(audio.listeners.length === 0 ? {} : { listeners: audio.listeners.map((listener) => ({ id: listener.id, position: listener.position })) }),
    music: audio.music.map((music) => ({
      asset: music.asset,
      autoplay: music.autoplay,
      ...(music.bus === undefined ? {} : { bus: music.bus }),
      id: music.id,
      loop: music.loop,
      ...(music.volume === undefined ? {} : { volume: music.volume }),
    })),
    oneShots: audio.oneShots.map((oneShot) => ({
      asset: oneShot.asset,
      ...(oneShot.bus === undefined ? {} : { bus: oneShot.bus }),
      ...(oneShot.emitter === undefined ? {} : { emitter: oneShot.emitter }),
      event: oneShot.event,
      id: oneShot.id,
      ...(oneShot.volume === undefined ? {} : { volume: oneShot.volume }),
    })),
  };
}
