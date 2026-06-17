import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  audioAsset,
  audioBus,
  audioDuckingRule,
  audioListener,
  defineAudio,
  defineGame,
  definePersistence,
  generatedTone,
  loopingMusic,
  musicTransition,
  oneShotSound,
  persistResource,
  persistSetting,
  persistenceMigration,
  saveSlot,
  spatialAudioEmitter,
} from "@threenative/sdk";

const scene = new Scene({ id: "v9-support" });

for (let index = 0; index < 16; index += 1) {
  scene.add(
    new Mesh({
      geometry: new BoxGeometry({ size: [1, 1, 1] }),
      id: `cube.${index}`,
      material: new MeshStandardMaterial({ color: index % 2 === 0 ? "#66aaff" : "#ffaa66" }),
      position: [index % 4, 0, Math.floor(index / 4)],
    }),
  );
}

const audio = defineAudio({
  buses: [
    audioBus("bus.master", { gain: 1 }),
    audioBus("bus.music", { gain: 0.8, parent: "bus.master" }),
    audioBus("bus.sfx", { volume: 0.9 }),
  ],
  duckingRules: [audioDuckingRule("duck.music", { attack: 0.05, gain: 0.35, release: 0.2, sourceBus: "bus.sfx", targetBus: "bus.music" })],
  emitters: [spatialAudioEmitter("emitter.alarm", { attenuation: { curve: "inverse", maxDistance: 24, minDistance: 1, rolloffFactor: 1 }, position: [2, 0, 2] })],
  listeners: [audioListener("listener.main", { binding: { kind: "activeCamera" }, position: [0, 1.5, 6] })],
  music: [loopingMusic("music.loop", { asset: audioAsset("audio.loop", "assets/loop.ogg"), bus: "bus.music", volume: 0.45 })],
  musicTransitions: [musicTransition("transition.combat", { duration: 1.5, kind: "crossfade", playbackId: "music.state", state: "combat", to: "music.loop" })],
  oneShots: [oneShotSound("sound.alarm", { asset: audioAsset("audio.alarm", "assets/alarm.wav"), bus: "bus.sfx", emitter: "emitter.alarm", event: "AlarmEvent", pitch: 1.1 })],
  tones: [generatedTone("tone.confirm", { bus: "bus.sfx", duration: 0.2, frequency: 880, volume: 0.25, waveform: "sine" })],
});

const persistence = definePersistence({
  migration: persistenceMigration({ currentVersion: 2, migrators: [1] }),
  resources: [persistResource("SupportProgress", { fields: { checkpoint: { kind: "string" }, score: { kind: "integer" } } })],
  saveSlots: [saveSlot("slot.main", { appVersion: "0.1.0", schemaVersion: 2 })],
  settings: [persistSetting("audio.master", { defaultValue: 0.8, group: "audio", kind: "number", max: 1, min: 0 })],
});

export default defineGame({ audio, persistence, scene });
