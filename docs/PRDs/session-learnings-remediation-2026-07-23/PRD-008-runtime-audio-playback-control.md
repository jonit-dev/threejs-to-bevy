# PRD-008: Runtime Audio Playback Control

`Complexity: 7 -> HIGH mode` (`+3` 10+ files, `+2` complex playback state,
`+2` multi-package)

## 1. Context

**Problem:** Scripts can choose pitch and volume only when starting playback;
they cannot modulate an active sound, forcing vehicle RPM audio into discrete
bands and project-local workarounds.

**Files analyzed:** `packages/script-stdlib/src/script-context.ts`,
`packages/sdk/src/audio.ts`, `packages/runtime-web-three/src/audio.ts`,
`runtime-bevy/crates/threenative_runtime/src/audio.rs`,
`docs/status/capabilities/audio-platform.md`.

**Current behavior:**

- Portable script audio exposes play, query, and stop.
- Web pitch-at-play maps to playback rate; the prior silent ignore is fixed.
- Gesture unlock and queued web playback are fixed and excluded.
- No update/set operation exists for active playback volume or pitch.

## 2. Solution

- Extend the existing portable audio service with one bounded playback update
  DTO rather than a parallel facade.
- Address logical playback IDs only; backend nodes/sinks remain private.
- Define clamping, smoothing, stopped/missing ID behavior, and observation
  semantics once in IR/service descriptors.
- Keep pure rising-edge/rate-limit helpers in PRD-003; this PRD owns live
  cross-runtime mutation.

## 3. Integration points

- [x] Entry: `ctx.audio.update(playbackId, options)` and typed query.
- [x] Callers: SDK/script context contract, compiler service validation, web
  AudioBuffer source/gain state, native sink state, effect-log observations.
- [x] User-facing: script API and diagnostics; no UI.

**Flow:** Script starts declared cue -> receives logical playback ID -> updates
volume/pitch with optional smoothing -> both adapters apply and report current
logical values -> query/trace proves causal change.

## 4. Execution phases

### Phase 1: Versioned service contract

**Files (max 5):**

- `packages/ir/src/scriptServices.ts` - update request/result DTO.
- `packages/ir/src/scriptServices.test.ts` - validation/bounds.
- `packages/script-stdlib/src/script-context.ts` - typed facade.
- `packages/compiler/src/scripts/diagnostics.ts` - declaration checks.
- `packages/compiler/src/scripts/diagnostics.test.ts` - diagnostics.

**Implementation:**

- [ ] Support optional finite `volume`, `pitch`, and bounded `rampSeconds`.
- [ ] Define pitch/volume ranges and whether values are absolute.
- [ ] Require at least one mutable field.
- [ ] Missing/stopped IDs return stable non-success results and diagnostics.
- [ ] Updates never create playback or expose platform handles.

### Phase 2: Web runtime execution

**Files (max 5):**

- `packages/runtime-web-three/src/audio.ts` - gain/playback-rate ramps.
- `packages/runtime-web-three/src/audio.test.ts` - causal updates.
- `packages/runtime-web-three/src/systems/context.ts` - service dispatch.
- `packages/runtime-web-three/src/systems/context.test.ts` - facade/effect log.
- `packages/runtime-web-three/src/browser/main.ts` - lifecycle wiring if needed.

**Implementation:**

- [ ] Apply immediate or scheduled bounded ramps against current audio time.
- [ ] Cancel/replace prior automation deterministically.
- [ ] Query returns logical target/current state as defined by the contract.
- [ ] Stop clears mutable state; late updates fail visibly.

### Phase 3: Native runtime execution

**Files (max 5):**

- `runtime-bevy/crates/threenative_runtime/src/audio.rs` - sink control.
- `runtime-bevy/crates/threenative_runtime/src/systems_context.rs` - DTO bridge.
- `runtime-bevy/crates/threenative_runtime/src/systems_effects.rs` - dispatch.
- `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs` - service tests.
- `runtime-bevy/crates/threenative_runtime/tests/audio.rs` - ramp/stop cases.

**Implementation:**

- [ ] Match web bounds, replacement, missing-ID, and stop semantics.
- [ ] If native smoothing cannot be sample-equivalent, define fixed-update
  logical ramp observations and document the backend boundary.
- [ ] No silent no-op.

### Phase 4: Conformance and vehicle forcing function

**Files (max 5):**

- `packages/ir/fixtures/conformance/audio-playback-control/game.bundle` - fixture.
- `tools/verify/src/audioPlaybackControlParity.ts` - paired trace.
- `tools/verify/src/audioPlaybackControlParity.test.ts` - mutation controls.
- `examples/aerodynamics-flight-course/src/scripts/flight.ts` - real consumer.
- `docs/cookbook/vehicle-audio-modulation.md` - reusable pattern.

**Implementation:**

- [ ] Sweep throttle through at least three target pitch/volume values.
- [ ] Compare ordered play/update/query/stop observations.
- [ ] Negative controls cover undeclared cue, missing ID, invalid values, and
  update after stop.

### Phase 5: Status closure

**Files (max 5):**

- `docs/status/capabilities/audio-platform.md` - bounded claim/evidence.
- `docs/status/capabilities/scripting.md` - facade.
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` - architecture note if needed.
- `docs/STATUS.md` - one-line updates.
- `docs/cookbook/sound-cue.md` - link live-control recipe.

## 5. Checkpoints and acceptance

Automated reviewer after every phase; manual listen is additional after Phase 4.

- [ ] Scripts update active playback without restarting the cue.
- [ ] Web/native logical observations and error semantics match.
- [ ] Invalid/stopped IDs never silently succeed.
- [ ] Vehicle forcing function audibly and observably follows throttle.
- [ ] Conformance, focused web/native tests, cookbook, and docs checks pass.

## Verification evidence

Append trace, test, and manual-listen evidence during execution.
