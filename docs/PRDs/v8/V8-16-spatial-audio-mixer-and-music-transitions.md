# V8-16 Spatial Audio, Mixer, and Music Transitions

Complexity: 8 -> HIGH mode

## Context

**Problem:** Audio supports local OGG/WAV assets, playback commands, buses,
listener/spatial metadata, and fixed lifecycle traces, but not real 3D spatial
attenuation, listener movement, routed mixer behavior, ducking/effects
diagnostics, or music transitions.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v6/V6-07-audio-playback-runtime.md`, and
`docs/PRDs/v7/V7-05-spatial-audio-buses-and-runtime-audio-hardening.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: SDK audio declarations, runtime audio services,
  web audio graph, Bevy audio mapping, state resources, conformance, and focused
  verification.
- [x] Caller file identified: SDK audio APIs, compiler emit, IR validation, web
  audio sink, Bevy audio runtime, and verify scripts.
- [x] Registration/wiring needed: listener binding, bus/effect capabilities,
  music transition rules, fixtures, docs, and gates.

**Is this user-facing?** Yes. Games need positional sound and music behavior
that is more than metadata.

## Solution

**Approach:**

- Add real listener/emitter spatial attenuation with bounded curves.
- Promote narrow mixer bus behavior: gain, mute, solo, and simple ducking.
- Add state-driven music transitions with playlists, crossfades, and stingers.
- Diagnose effects that cannot be matched portably.

**Data Changes:** Spatial attenuation fields, listener bindings, bus routing
state, ducking/effect diagnostics, music transition rules, and playback
observations.

## Execution Phases

#### Phase 1: Real Spatial Audio Contract - Position affects audible output

**Implementation:**

- [x] Add deterministic listener/emitter attenuation trace evidence using the
  existing listener position, emitter position, and emitter radius IR fields.
- [ ] Add listener transform binding and attenuation curves.
- [ ] Validate min/max distance and nonportable panning fields.

**Verification Plan:** SDK/IR tests and deterministic audio observations.

#### Phase 2: Runtime Listener and Emitter Parity - Web and Bevy map spatial audio

**Implementation:**

- [x] Compare web and Bevy spatial attenuation observations with
  `pnpm verify:v8:audio`, writing web/native/diff artifacts under
  `artifacts/v8/audio`.
- [ ] Map web audio graph and Bevy spatial audio.
- [ ] Record listener/emitter observations and movement traces.

**Verification Plan:** Web/Bevy runtime tests and conformance.

**Current proven slice:** The V8-16 parity slice reuses the V7
`v7-spatial-audio-buses` fixture and proves one event-triggered spatial
one-shot trace. Web and Bevy compute the same listener/emitter distance,
radius-based linear attenuation, bus gain, source volume, and effective volume.
This is trace evidence only; it does not claim actual backend panning,
listener movement, mixer effects, ducking, or music transitions.

#### Phase 3: Mixer Buses, Effects, and Ducking - Routing behavior is narrow

**Implementation:**

- [ ] Promote gain, mute, solo, and ducking.
- [ ] Diagnose unsupported effects explicitly.

**Verification Plan:** Bus routing tests and diagnostic assertions.

#### Phase 4: Music Transitions - State changes can drive soundtrack behavior

**Implementation:**

- [ ] Add playlists, crossfades, and stinger rules.
- [ ] Bind transitions to declared app states.
- [ ] Add example scene and `verify:v8:audio` artifact report.

**Verification Plan:** Playback-id lifecycle tests and focused verify script.

## Acceptance Criteria

- [ ] Spatial audio, mixer routing, and music transitions have cross-runtime
  traces and any nonportable effects fail with stable diagnostics.
