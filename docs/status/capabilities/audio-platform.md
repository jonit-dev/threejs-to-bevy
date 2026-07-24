# Audio And Platform Status

Portable audio uses bundle-local assets and structured audio IR. Window and
host behavior is constrained by target profiles and the single-primary-window
runtime contract.

Optional project-local ElevenLabs credentials may generate custom SFX during
authoring. Mock provider evidence exists; live-provider evidence does not.
This adds no runtime network or streaming-audio capability.

Current support:

- Web and native execute bundle-local startup music. Web consumes event-driven
  one-shots in its frame loop; native now queues each newly emitted event once
  and spawns auto-despawning Bevy audio entities with authored volume and pitch.
- Script `audio.update` applies bounded absolute volume (`0..4`) and pitch
  (`0.25..4`) targets to active logical playback IDs on web and native.
  `rampSeconds` (`0..10`) is retained in logical observations; the current
  HTML audio element and Bevy 0.14 sink backends apply the latest target
  immediately because neither exposes a shared sample-accurate ramp contract.
  Missing, stopped, empty, and invalid updates fail visibly.
- Native script `audio.play`, `audio.stop`, and feedback-preset audio effects
  spawn and stop playback-id-tagged Bevy audio entities.
- Authored native pause, resume, stop, and query controls operate on Bevy
  `AudioSink` state. The script-facing `context.audio.query()` remains logical
  until completed-sink feedback is added; it does not expose a public native
  handle. Seek remains an explicit `TN_AUDIO_NATIVE_SEEK_UNSUPPORTED`
  diagnostic because Bevy 0.14's sink has no seek operation.
- Web and native normalized traces cover loop/one-shot commands, the complete
  declared control sequence (including the native seek boundary), mixer buses,
  gain effects, ducking, listener movement, spatial attenuation,
  generated-tone command metadata, and soundtrack transitions. These traces
  are command/policy parity evidence, not proof of waveform output.
- `pnpm verify:focused verify:feature-parity-audio-platform` refreshes the
  production-hardening web/native reports, runs native event/script entity
  execution tests, and requires normalized command, mixer, support,
  device-routing, and platform-policy parity.
- `pnpm verify:audio-quality` derives the Battle of Pacific sound inventory
  from structured audio/asset documents, literal script playback calls, and
  generation provenance. It decodes source PCM with `ffmpeg`, fails quiet
  source or effective playback intensity, rejects unresolved cue IDs and loop
  intent drift, and checks loop duration, first/last-edge balance, and
  end-to-start seam continuity. Near-clipping sources remain explicit warnings
  in the report rather than silent passes.
- Default-output selection is reportable. Native audio handles, arbitrary
  device routing, custom executable decoders, and streaming/network audio
  remain diagnostic-only boundaries.
- Window resize and scale-factor observations are promoted for the primary
  window. Custom cursor images, host power/background policy, runtime clear
  color mutation, and multi-window declarations are derived from the shared
  residual policy registry and remain diagnostic-only.
- Generated tones are promoted as portable command/support metadata. This does
  not claim a synthesized native waveform backend beyond the traced command.

Native execution evidence is intentionally headless and asserts the scheduled
creation and volume/speed mutation of event/script Bevy audio entities plus
script stop dispatch. Actual
audible device output remains hardware-dependent and is not claimed by the
headless gate.

Verification:

- `pnpm verify:audio-quality`
- `pnpm verify:focused verify:feature-parity-audio-platform`
- `pnpm verify:focused verify:production-hardening`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
