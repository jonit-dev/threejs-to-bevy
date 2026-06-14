# V6-07 Audio Playback Runtime

Complexity: 8 -> HIGH mode

## Context

**Problem:** Audio IR and asset validation exist, but runtime playback is not
implemented.

## Integration Points

- Entry point: SDK audio asset declarations and portable system/UI service
  calls.
- Caller files: asset manifest validation, web audio runtime, Bevy audio
  runtime, conformance reports.
- User-facing: systems/UI can play bundle-local sound effects or ambience.

## Solution

Implement V6 audio playback for local assets with play/stop/loop/volume
metadata, deterministic observations, and stable diagnostics. Defer spatial
audio, buses, and richer lifecycle hardening to V7.

## Execution Phases

#### Phase 1: Audio Asset Contract - Audio refs validate before runtime.

**Files (max 5):**

- `packages/sdk/src/assets.ts` - audio metadata helpers.
- `packages/ir/src/validate.ts` - audio format/ref validation.
- `packages/compiler/src/emit/assets.test.ts` - bundle tests.
- `packages/ir/fixtures/conformance/*` - audio fixtures.
- `docs/scripting-api.md` - audio service docs.

**Implementation:**

- [ ] Validate supported formats, missing files, duplicate IDs, and unsupported
  streaming/network sources.
- [ ] Emit audio asset metadata deterministically.
- [ ] Add stable `TN_ASSET_*` diagnostics with bundle-relative paths.

#### Phase 2: Playback Runtime - Systems and UI can trigger audio.

**Files (max 5):**

- `packages/runtime-web-three/src/audio/*` - web playback.
- `runtime-bevy/crates/threenative_runtime/src/audio*` - Bevy playback or
  observation.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native evidence.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `examples/v6-functional/*` - scene audio proof.

**Implementation:**

- [ ] Implement play/stop/loop/volume for bundle-local assets.
- [ ] Log playback events in deterministic runtime observations.
- [ ] Surface target limitations with stable diagnostics.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] V6 can play bundle-local audio from gameplay or UI events.
- [ ] Spatial audio and bus/mixer routing are explicitly deferred to V7.
