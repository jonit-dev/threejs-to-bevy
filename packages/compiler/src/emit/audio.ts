import type { IAudioIr } from "@threenative/ir";
import type { IAudioDeclaration } from "@threenative/sdk";

export function emitAudio(audio: IAudioDeclaration): IAudioIr {
  return {
    schema: "threenative.audio",
    version: "0.1.0",
    music: audio.music.map((music) => ({
      asset: music.asset,
      autoplay: music.autoplay,
      id: music.id,
      loop: music.loop,
      ...(music.volume === undefined ? {} : { volume: music.volume }),
    })),
    oneShots: audio.oneShots.map((oneShot) => ({
      asset: oneShot.asset,
      event: oneShot.event,
      id: oneShot.id,
      ...(oneShot.volume === undefined ? {} : { volume: oneShot.volume }),
    })),
  };
}
