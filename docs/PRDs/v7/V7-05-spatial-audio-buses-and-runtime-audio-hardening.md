# V7-05 Spatial Audio Buses and Runtime Audio Hardening

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 playback covers local sounds, but richer games need spatial
emitters/listeners, routing, lifecycle-safe loops, and stronger runtime evidence.

## Integration Points

- Entry point: SDK audio declarations and portable audio service calls.
- Caller files: web audio adapter, Bevy audio adapter, event logs, conformance
  reports.
- User-facing: game state can drive spatial and routed audio without platform
  APIs.

## Solution

Add spatial audio emitters/listeners, bus or mixer groups, volume routing,
loop lifecycle rules, and deterministic observations.

## Execution Phases

#### Phase 1: Audio Graph Contract - Spatial/routed audio validates.

**Files (max 5):**

- `packages/sdk/src/audio/*` - spatial/bus helpers.
- `packages/ir/src/audio*` - schemas and validation.
- `packages/compiler/src/*` - capture/emit.
- `packages/ir/fixtures/conformance/*` - audio fixtures.
- `docs/scripting-api.md` - audio service docs.

**Implementation:**

- [ ] Add listener, emitter, bus/group, routing, volume, loop, and lifecycle
  metadata.
- [ ] Reject streaming, network, platform handles, and unsupported codecs.

#### Phase 2: Runtime Evidence - Audio observations prove behavior.

**Files (max 5):**

- `packages/runtime-web-three/src/audio/*` - web audio mapping.
- `runtime-bevy/crates/threenative_runtime/src/audio*` - native mapping.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native tests.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `examples/v7-functional/*` - scene proof.

**Implementation:**

- [ ] Record deterministic play/stop/spatial/routing events.
- [ ] Verify loop lifecycle and cleanup in fixed traces.
- [ ] Expose target drift with stable diagnostics.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] Spatial/routed audio is either portable or explicitly rejected.
- [ ] Runtime evidence covers lifecycle, not just asset validation.
