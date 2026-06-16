# V8-08 Animation Controls, Transform Animation, and Particles

Complexity: 10 -> HIGH mode

## Context

**Problem:** Animation currently has clip metadata, fixed graph traces, and
skeletal playback evidence, but authors still lack portable transform
animation, runtime stop/query APIs, bounded blending, and rendered particles.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v6/V6-05-animation-playback-contracts.md`,
`docs/PRDs/v7/V7-03-animation-graphs-state-machines-events-and-particles.md`,
`docs/PRDs/v8/README.md`, and `docs/PRDs/v8/V8-07-material-texture-shader-parity.md`.

**Current Behavior:**

- Model clip metadata validates and can be played by declared services.
- Web and Bevy can advance active model playback, with skeletal deformation
  evidence tracked separately in status.
- Animation graphs, event markers, and particle emitters are mostly fixed-trace
  contracts rather than broad rendered runtime behavior.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: SDK animation declarations, script service calls,
  emitted bundle IR, web runtime, Bevy runtime, conformance, and focused visual
  verification.
- [x] Caller file identified: SDK animation APIs, compiler emit, IR validation,
  web animation runner, Bevy animation host, conformance reporters, and V8 verify
  scripts.
- [x] Registration/wiring needed: public SDK exports, service permissions,
  manifest capabilities, runtime adapters, fixtures, docs, and gates.

**Is this user-facing?** Yes. Authors should be able to animate transforms,
stop/query active animations, use simple blends, and render bounded particles
without raw Three.js or Bevy APIs.

**Full user flow:**

1. User declares transform tracks, starts and stops a clip, queries animation
   state, and adds a bounded particle emitter.
2. Compiler emits animation tracks, controls, capabilities, and diagnostics.
3. Web and Bevy run the same contract and expose matching observations.
4. Verification compares state traces and rendered evidence.

## Solution

**Approach:**

- Promote deterministic transform animation tracks for translation, rotation,
  scale, easing, looping, and target refs.
- Add `animation.stop`, `animation.query`, and state reads with explicit service
  permissions.
- Promote simple crossfade/blend weights before masks, IK, retargeting, or
  morph targets.
- Render bounded CPU particle emitters using portable simple mesh or billboard
  representations with material constraints from V8-07.

**Data Changes:** Add transform animation track IR, runtime animation state
observations, particle rendering fields, and unsupported diagnostics for masks,
IK, retargeting, morph targets, and unbounded emitters.

## Execution Phases

#### Phase 1: Transform Animation Contract - Authors can emit deterministic transform tracks

**Files (max 5):**

- `packages/sdk` animation APIs and tests.
- `packages/ir` animation types/schema/validation.
- `packages/compiler` animation emit and capability tests.

**Implementation:**

- [ ] Add translation, rotation, scale tracks with easing and loop policy.
- [ ] Validate target refs, finite keyframes, monotonic times, and supported
  interpolation modes.
- [ ] Emit manifest capabilities for transform animation.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/ir/src/animation.test.ts` | `should accept transform tracks when targets exist` | Validator accepts deterministic tracks. |
| `packages/ir/src/animation.test.ts` | `should reject non-monotonic keyframes` | Stable diagnostic path points to the bad keyframe. |

**Verification Plan:** Run focused SDK/IR/compiler tests and update
conformance fixtures.

#### Phase 2: Runtime Stop and Query Controls - Scripts can observe and control animation state

**Implementation:**

- [ ] Add service permissions for stop/query/pause/resume where promoted.
- [ ] Return stable active/paused/stopped/time/clip state in web and Bevy.
- [ ] Preserve existing `animation.play` behavior.

**Verification Plan:** Run script service tests, web runtime tests, Bevy
QuickJS/runtime tests, and conformance trace comparison.

#### Phase 3: Bounded Blending Runtime - Simple crossfades are observable

**Implementation:**

- [ ] Promote crossfade duration and blend weights for active clips.
- [ ] Diagnose masks, IK, retargeting, and morph targets as unsupported.
- [ ] Compare web/native active source clips, weights, and event timing.

**Verification Plan:** Add a shared conformance fixture and focused runtime
tests.

#### Phase 4: Rendered Particles - Bounded emitters render in web and Bevy

**Implementation:**

- [ ] Map bounded emitters to portable simple meshes or billboard-like
  particles.
- [ ] Enforce spawn budget, lifetime, material, and deterministic seed limits.
- [ ] Add screenshot evidence and blank-frame checks.

**Verification Plan:** Add `pnpm verify:v8:animation-particles` or equivalent,
with web/native artifacts and `pnpm verify:conformance`.

## Acceptance Criteria

- [ ] Transform animation, stop/query controls, bounded blending, and rendered
  particles have SDK/IR/compiler/runtime/conformance coverage.
- [ ] Unsupported advanced animation features fail with stable diagnostics.
- [ ] Focused V8 verification writes inspectable artifacts.
