# PRD: Hook Native (Bevy) Audio Playback Into the Game Loop

Status: completed
Date: 2026-07-12

## Problem

The sound system is fully hooked on web but only partially hooked on native.
Audio authoring, the audio IR, compiler emission, and bundle loading work on
both targets, and startup/autoplay music plays on native. But on native,
nothing that happens *after* startup produces sound:

| Stage | Web | Native |
|---|---|---|
| Authoring -> IR -> bundle | works | works |
| Startup/autoplay music | plays | plays |
| Event-triggered one-shots | plays every frame via `consumeAudioEvents()` | never executed |
| Script `context.audio.play()` | plays | bookkeeping only, no sound |
| Playback controls (pause/resume/seek/stop/query) | wired | trace/simulation only |

The chess example authors move/capture/check SFX and ambience
(`examples/chess/content/audio/`, `examples/chess/src/scripts/chess.ts`
calling `context.audio.play(...)`). On web these are audible; on a native
desktop run only the ambience loop would play.

## Evidence

- Web game-loop wiring: `packages/runtime-web-three/src/render.ts` creates
  the audio runtime/sink (~lines 415-430) and calls `consumeAudioEvents()`
  both at startup and every frame (~line 467). Element-based sink in
  `packages/runtime-web-three/src/audio.ts`.
- Native startup-only wiring:
  `runtime-bevy/crates/threenative_runtime/src/lib.rs:230` calls
  `audio::spawn_startup_audio` once. No `add_systems` registration for any
  audio system exists anywhere in `lib.rs`.
- `handle_audio_events()`
  (`runtime-bevy/crates/threenative_runtime/src/audio.rs:167`) correctly maps
  world events to one-shot commands, but its only callers are the trace/observe
  paths (`audio.rs:318`, `audio.rs:353`) used for parity reports — never a
  running Bevy schedule.
- Script audio on native is state-tracking only: the JS bridge implements
  `audioPlay`/`audioQuery`/`audioStop` as an in-memory playback map
  (`runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:738-777`,
  service surface at `:1456-1472`) and pushes `{ service: "audio.play", ... }`
  into `effects.services`. On the Rust side,
  `runtime-bevy/crates/threenative_runtime/src/systems_effects.rs` only
  validates the service was declared (`:718`) and records it into the
  observation ledger (`:905`). No handler ever spawns a Bevy audio entity.
  `ScriptAudioRuntimeController` (`audio.rs:565-637`) is likewise logical-only.
- Playback controls (pause/resume/seek/stop/query) exist as simulated
  lifecycle traces (`audio.rs` trace functions), not as systems that mutate
  `AudioSink` state.
- The parity gate (`pnpm verify:focused verify:feature-parity-audio-platform`)
  compares normalized *command traces*, so it passes while native playback
  never executes. `docs/status/capabilities/audio-platform.md` says "web and
  native traces cover ..." — accurate but easy to misread as playback parity;
  `docs/bevy-feature-parity.md` already marks Audio as partial.

## Root cause

A systems-architecture gap, not a data-model gap: the native runtime has the
types, loader, command generators, and asset resolution, but no recurring
Bevy system consumes world events or script service effects to spawn and
control actual audio entities.

## Proposed fixes

### F1. Event-driven one-shot playback system (highest value)

Add an `Update` system (registered next to the other runtime systems in
`lib.rs`) that mirrors web's `consumeAudioEvents()`:

- Keep per-event cursors (a `Resource`, e.g. `NativeAudioEventCursors`),
  matching web's `newAudioEvents(bundle.world.events, audioEventCursors)`
  semantics so each event fires once.
- Each tick, collect newly emitted event names from the world event store
  (the same store `systems_host` drains into via
  `bridge.drain_events_into(&mut runtime.bundle.world.events)`, `lib.rs:643`).
- Call the existing `handle_audio_events(audio, &events)` to get
  `NativeAudioCommand`s.
- For each command, resolve via the existing `resolve_audio_asset_path` and
  spawn an audio entity with `PlaybackSettings::DESPAWN` (one-shot,
  auto-cleanup), applying `volume` and mapping `pitch` to playback `speed`.
- Push failures through `NativeAudioDiagnostic` -> `warn!` like startup does.

Reuse everything already in `audio.rs`; the new code is ~one system plus a
cursor resource.

### F2. Execute script `audio.play` / `audio.stop` service effects

Bridge the gap between the JS service surface and Bevy playback:

- In the effects-application path (`systems_effects.rs`, where services are
  currently only ledgered at `:905`), add a dispatch step: for
  `service == "audio.play"`, spawn an audio entity tagged with the
  `playbackId` the bridge generated (`ThreeNativeId(playbackId)` or a
  dedicated `NativeAudioPlayback` component); for `audio.stop`, look up the
  tagged entity's `AudioSink` and stop/despawn it.
- Keep the JS-side playback map as the source of the `playbackId` and of
  `audio.query` responses, but feed real sink state back: a small system that
  marks playbacks finished when their `AudioSink` is empty/despawned, exposed
  to the bridge as input on the next tick (same pattern the bridge already
  uses for other host-observed state). Until that feedback exists, `query`
  can keep returning the logical state — but say so in the capability doc.
- `effects.play` presets that carry `preset.audio`
  (`systems_host_bridge.js:1482-1498`) route through the same `audioPlay`,
  so F2 fixes feedback-preset audio for free.

### F3. Real playback controls

Implement declared controls (`pause`, `resume`, `stop`, `query`; `seek` where
feasible) as operations on `AudioSink`:

- `pause`/`resume`/`stop`: direct `AudioSink` calls on the entity found by ID.
- `seek`: `bevy_audio`'s sink does not support seeking. Options:
  (a) document seek as a diagnostic-only boundary on native for now (smallest
  change, matches existing "residual policy" pattern), or
  (b) adopt `bevy_kira_audio` for the runtime, which supports seek/position.
  Recommendation: (a) now, evaluate (b) as its own PRD — swapping the audio
  backend is a larger decision than this hookup.

### F4. Honest verification (gate the gap so it cannot regress silently)

- Add a native headless test that builds an `App`, injects a bundle with an
  event-mapped one-shot, emits the event, ticks, and asserts an audio entity
  with the expected `ThreeNativeId` and `PlaybackSettings` was spawned
  (playback itself cannot be asserted headless; entity spawn is the proxy).
- Same shape for the script path: run a system whose script calls
  `context.audio.play`, assert the tagged audio entity exists after effects
  apply.
- Extend `verify:feature-parity-audio-platform` (or add a focused
  `verify:native-audio-execution`) to require this execution evidence, not
  just normalized command traces. Per repo rules, derive enrollment from the
  owning registry/config rather than adding a hand-maintained list.
- Rerun the chess playtest scenarios with `--target desktop` once F1/F2 land
  and record the artifacts.

### F5. Documentation truthing

- Update `docs/status/capabilities/audio-platform.md` to state explicitly
  which stages *execute* on native vs. which are trace-only, and update it
  again when F1-F3 land; keep the one-line index entry in `docs/STATUS.md`
  in sync.
- Update `docs/bevy-feature-parity.md` Audio row when execution parity is
  achieved (it currently, correctly, says partial).

## Sequencing

1. F1 (event one-shots) — unblocks the chess SFX on desktop, smallest change.
2. F2 (script service dispatch) — unblocks `context.audio.play`.
3. F4 tests alongside F1/F2, not after.
4. F3 controls, with seek deferred as a documented boundary.
5. F5 doc updates in the same PRs as the capability changes (required by
   repo rules).

## Non-goals

- Spatial audio DSP, device routing, custom decoders, streaming/network
  audio — existing documented boundaries, unchanged.
- Switching audio backends (kira) — separate decision, see F3.
