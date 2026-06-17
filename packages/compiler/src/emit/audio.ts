import type { IAudioIr } from "@threenative/ir";
import type { IAudioDeclaration } from "@threenative/sdk";

export function emitAudio(audio: IAudioDeclaration): IAudioIr {
  return {
    schema: "threenative.audio",
    version: "0.1.0",
    ...(audio.buses.length === 0 ? {} : { buses: audio.buses.map((bus) => ({ ...(bus.gain === undefined ? {} : { gain: bus.gain }), id: bus.id, ...(bus.mute === undefined ? {} : { mute: bus.mute }), ...(bus.parent === undefined ? {} : { parent: bus.parent }), ...(bus.solo === undefined ? {} : { solo: bus.solo }), ...(bus.volume === undefined ? {} : { volume: bus.volume }) })) }),
    ...(audio.controls.length === 0 ? {} : { controls: audio.controls.map((control) => ({ id: control.id, kind: control.kind, target: control.target, ...(control.at === undefined ? {} : { at: control.at }) })) }),
    ...(audio.duckingRules.length === 0 ? {} : { duckingRules: audio.duckingRules.map((rule) => ({ attack: rule.attack, gain: rule.gain, id: rule.id, release: rule.release, sourceBus: rule.sourceBus, targetBus: rule.targetBus })) }),
    ...(audio.emitters.length === 0 ? {} : { emitters: audio.emitters.map((emitter) => ({ ...(emitter.attenuation === undefined ? {} : { attenuation: emitter.attenuation }), id: emitter.id, position: emitter.position, ...(emitter.radius === undefined ? {} : { radius: emitter.radius }) })) }),
    ...(audio.listeners.length === 0 ? {} : { listeners: audio.listeners.map((listener) => ({ ...(listener.binding === undefined ? {} : { binding: listener.binding }), id: listener.id, position: listener.position })) }),
    music: audio.music.map((music) => ({
      asset: music.asset,
      autoplay: music.autoplay,
      ...(music.bus === undefined ? {} : { bus: music.bus }),
      id: music.id,
      loop: music.loop,
      ...(music.pitch === undefined ? {} : { pitch: music.pitch }),
      ...(music.volume === undefined ? {} : { volume: music.volume }),
    })),
    ...(audio.musicTransitions.length === 0 ? {} : { musicTransitions: audio.musicTransitions.map((transition) => ({ ...(transition.duration === undefined ? {} : { duration: transition.duration }), ...(transition.from === undefined ? {} : { from: transition.from }), id: transition.id, kind: transition.kind, playbackId: transition.playbackId, state: transition.state, to: transition.to })) }),
    oneShots: audio.oneShots.map((oneShot) => ({
      asset: oneShot.asset,
      ...(oneShot.bus === undefined ? {} : { bus: oneShot.bus }),
      ...(oneShot.emitter === undefined ? {} : { emitter: oneShot.emitter }),
      event: oneShot.event,
      id: oneShot.id,
      ...(oneShot.pitch === undefined ? {} : { pitch: oneShot.pitch }),
      ...(oneShot.volume === undefined ? {} : { volume: oneShot.volume }),
    })),
    ...(audio.tones.length === 0 ? {} : { tones: audio.tones.map((tone) => ({ ...(tone.bus === undefined ? {} : { bus: tone.bus }), duration: tone.duration, ...(tone.frequency === undefined ? {} : { frequency: tone.frequency }), id: tone.id, ...(tone.pitch === undefined ? {} : { pitch: tone.pitch }), ...(tone.volume === undefined ? {} : { volume: tone.volume }), waveform: tone.waveform })) }),
  };
}
