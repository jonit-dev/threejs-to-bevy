import { audioAsset, defineAudio, defineAudioModule, loopingMusic, oneShotSound } from "@threenative/sdk";

export const arenaAudio = defineAudioModule({
  audio: defineAudio({
    music: [loopingMusic("music.v7.loop", { asset: audioAsset("arena.music", "assets/arena.ogg") })],
    oneShots: [oneShotSound("sound.hit", { asset: audioAsset("hit.sound", "assets/hit.wav"), event: "DamageEvent" })],
  }),
  id: "audio.arena",
  source: { sourcePath: "src/audio/arena.audio.ts" },
});
