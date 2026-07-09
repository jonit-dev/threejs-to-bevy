# Audio And Platform Status

Portable audio uses bundle-local assets and structured audio IR. Window and
host behavior is constrained by target profiles and the single-primary-window
runtime contract.

Current support:

- Web and native traces cover loop/one-shot commands, pause, resume, seek,
  stop, query state, mixer buses, gain effects, ducking, listener movement,
  spatial attenuation, generated-tone command metadata, and soundtrack
  transitions.
- `pnpm verify:focused verify:feature-parity-audio-platform` refreshes the
  production-hardening web/native reports and requires normalized command,
  mixer, support, device-routing, and platform-policy parity.
- Default-output selection is reportable. Native audio handles, arbitrary
  device routing, custom executable decoders, and streaming/network audio
  remain diagnostic-only boundaries.
- Window resize and scale-factor observations are promoted for the primary
  window. Custom cursor images, host power/background policy, runtime clear
  color mutation, and multi-window declarations are derived from the shared
  residual policy registry and remain diagnostic-only.
- Generated tones are promoted as portable command/support metadata. This does
  not claim a synthesized native waveform backend beyond the traced command.

Verification:

- `pnpm verify:focused verify:feature-parity-audio-platform`
- `pnpm verify:focused verify:production-hardening`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
