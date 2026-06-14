# V6-05 Animation Playback Contracts

Complexity: 8 -> HIGH mode

## Context

**Problem:** V4 has a narrow `animation.play` service facade, but V6 needs
validated animation clip references, playback state, and runtime observations
for model-backed entities.

## Integration Points

- Entry point: SDK model/animation declarations and system service calls.
- Caller files: asset manifest validation, runtime model loaders, animation
  service facades, conformance reports.
- User-facing: systems can play, stop, loop, and observe named clips.

## Solution

Promote clip selection, playback commands, loop/speed metadata, and playback
observations while deferring graph/state-machine blending to V7.

## Execution Phases

#### Phase 1: Clip Contract - Animation refs validate against model assets.

**Files (max 5):**

- `packages/sdk/src/assets.ts` - animation metadata helpers.
- `packages/ir/src/validate.ts` - clip reference checks.
- `packages/compiler/src/emit/assets.test.ts` - emission tests.
- `packages/ir/fixtures/conformance/*` - animation fixtures.
- `docs/scripting-api.md` - animation service docs.

**Implementation:**

- [ ] Validate clip IDs, model asset refs, loop mode, speed, and missing clips.
- [ ] Preserve deterministic clip metadata in emitted bundles.
- [ ] Reject animation graphs, blends, IK, retargeting, and particles for V6.

#### Phase 2: Playback Evidence - Web and Bevy expose playback state.

**Files (max 5):**

- `packages/runtime-web-three/src/assets.ts` - clip loading/lookup.
- `packages/runtime-web-three/src/*` - playback service.
- `runtime-bevy/crates/threenative_runtime/src/*` - native playback mapping or
  observation.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native evidence.
- `packages/ir/fixtures/conformance/*` - observation expectations.

**Implementation:**

- [ ] Implement play/stop/loop/speed behavior where runtime support exists.
- [ ] Emit stable downgrade diagnostics when native visual playback is not yet
  claimed.
- [ ] Record playback observations for conformance.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] Animation clip refs are validated and observable.
- [ ] V6 supports named clip playback but explicitly defers graph/state-machine
  behavior to V7.
