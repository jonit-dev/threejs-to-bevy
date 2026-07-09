# Audio Platform Runtime Polish

Complexity: 10 -> HIGH mode

## Complexity Assessment

- +3 touches 10+ implementation/test/docs files during implementation
- +2 spans SDK/IR/compiler, web runtime, Bevy runtime, examples, and docs
- +2 includes runtime platform/device capability behavior
- +2 covers cross-adapter audio playback and diagnostics
- +1 affects release/capability documentation

## Context

**Problem:** Audio and window/platform parity are mostly promoted, but the gap
side still calls out both-adapter polish for audio and shared platform policy
for resize/scale, cursor, power/background, clear-color, and single-window
diagnostics.

**Files Analyzed:**

- `docs/bevy-feature-parity.md`
- `docs/PRDs/done/other/post-v10-production-audio-diagnostics-packaging.md`
- `docs/PRDs/done/other/target-profile-contract-hardening.md`
- `/home/joao/.agents/skills/prd-creator/SKILL.md`

**Current Behavior:**

- Local audio assets, playback commands, spatial/listener metadata, mixer/effect
  reports, music transitions, persistence, target profiles, and resize/scale
  observations are present.
- Device routing, platform handles, custom decoders, streaming/network audio,
  custom cursors, power/background policy, clear-color updates, and multi-window
  remain policy or diagnostic rows.
- The useful polish layer is capability-aware reporting plus proof that promoted
  audio behavior remains aligned across web and Bevy.

## Impact

**Planned files touched:** audio/window SDK declarations, IR validation,
compiler emit, web audio/platform adapters, Bevy audio/platform adapters,
target-profile validation, verify tooling, capability docs, `docs/STATUS.md`,
and `docs/bevy-feature-parity.md`.

**Features affected:** audio device diagnostics, mixer/effect reports, routing
policy, soundtrack transitions, generated tones, resize/scale reports, cursor
policy, power/background policy, clear color, and multi-window diagnostics.

**Main risks:**

- Platform audio devices differ enough that pass/fail must be capability-aware.
- Custom decoder or streaming work can accidentally imply arbitrary network or
  filesystem access.
- Window/platform policy can drift between target profiles, runtime adapters,
  and docs.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: SDK audio/window declarations, target profiles,
  `tn build`, web/native previews, and production-hardening gates.
- [x] Caller file identified: compiler audio/window emitters, web audio host,
  Bevy audio host, target-profile validators, and verification tooling.
- [x] Registration/wiring needed: device reports, platform policy diagnostics,
  fixtures, package scripts, docs, and status updates.

**Is this user-facing?**

- [x] YES. Authors and players experience playback, mixing, music transitions,
  device capability messaging, resize behavior, and platform diagnostics.
- [ ] NO -> Internal/background feature.

**Full user flow:**

1. User authors audio, mixer, listener, target-profile, and window declarations.
2. `tn build` validates portable behavior and rejects platform-only escape
   hatches.
3. Web and Bevy runtimes execute playback/platform scenarios and write
   capability reports.
4. Verification compares promoted audio traces and checks diagnostics for
   deferred platform features.

## Solution

**Approach:**

- Strengthen cross-adapter audio proof for playback, spatial/listener, mixer,
  effect-chain, generated tones, and music transitions.
- Add capability-aware device routing diagnostics without exposing native
  platform handles.
- Centralize window/platform policy for cursor, power/background, clear color,
  and multi-window declarations.
- Keep custom decoders, streaming, network audio, and arbitrary platform APIs
  diagnostic-only.

```mermaid
flowchart LR
    Source[Audio/window source] --> Compiler[Validated IR]
    Compiler --> Web[Web runtime]
    Compiler --> Bevy[Bevy runtime]
    Web --> Reports[Audio + platform reports]
    Bevy --> Reports
    Reports --> Gate[pnpm verify:feature-parity-audio-platform]
```

**Key Decisions:**

- [x] Library/framework choices: reuse existing audio command traces,
  target-profile validation, production-hardening reports, and platform
  diagnostics.
- [x] Error-handling strategy: unsupported device routing, custom decoder,
  streaming, cursor, power, clear-color, and multi-window requests emit stable
  target-aware diagnostics.
- [x] Reused utilities: audio report serializers, target-profile fixtures,
  diagnostic catalog, and docs guards.

**Data Changes:** Audio/platform report additions only. No database migrations.

## Execution Phases

#### Phase 1: Audio Proof Refresh - Promoted playback behavior stays aligned.

**Files (max 5):**

- `packages/ir/src/*` - audio report validation
- `packages/runtime-web-three/src/*` - web audio trace/report output
- `runtime-bevy/src/*` - native audio trace/report output
- `tools/verify/src/*` - audio platform gate
- `examples/*/artifacts/feature-parity-audio-platform/*` - evidence

**Implementation:**

- [ ] Add focused reports for playback, pause/resume/seek/stop/query, mixer
  routing, ducking, effects, spatial/listener movement, generated tones, and
  music transitions.
- [ ] Compare deterministic command traces across web and Bevy.
- [ ] Keep platform-native handles internal-only.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/ir/src/audio-report.test.ts` | `should require stable playback ids in audio trace fixtures` | Missing id fails validation. |
| `tools/verify/src/audio-platform.test.ts` | `should compare web and native music transition reports` | Transition state sequence matches. |
| `runtime-bevy/tests/audio_report.rs` | `should report mixer bus and listener state` | Native report includes bus/listener fields. |

**User Verification:**

- Action: Run `pnpm verify:feature-parity-audio-platform`.
- Expected: Audio command and mixer reports match across adapters.

#### Phase 2: Device And Platform Policy Diagnostics - Platform-only requests fail clearly.

**Files (max 5):**

- `packages/ir/src/*` - device/window policy validation
- `packages/compiler/src/*` - diagnostics and lowering
- `packages/runtime-web-three/src/*` - web capability reports
- `runtime-bevy/src/*` - native capability reports
- `docs/status/capabilities/*.md` - capability docs

**Implementation:**

- [ ] Add capability-aware diagnostics for device routing, custom decoders,
  streaming, and network audio.
- [ ] Add shared policy diagnostics for custom cursors, power/background,
  clear-color updates, and multi-window declarations.
- [ ] Preserve resize/scale observations and target-profile repair hints.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/ir/src/platform-policy.test.ts` | `should reject multi-window declaration for portable single-window target` | Diagnostic names single-window policy. |
| `packages/compiler/src/audio-policy.test.ts` | `should reject network audio source with stable diagnostic` | Diagnostic includes local asset alternative. |
| `tools/verify/src/platform-policy.test.ts` | `should fail when target profile and docs disagree on cursor support` | Drift is reported. |

**User Verification:**

- Action: Validate rejected audio/platform fixtures with `--json`.
- Expected: Diagnostics include code, path, message, target capability, and fix.

## Verification Strategy

- Run `pnpm verify:feature-parity-audio-platform`.
- Run `pnpm verify:production-hardening` for touched audio/platform reports.
- Run `pnpm verify:conformance` for report/schema changes.
- Run `pnpm check:docs` after status updates.

## Acceptance Criteria

- [ ] Promoted audio behavior has refreshed web/native trace evidence.
- [ ] Device routing and platform audio gaps are capability-aware diagnostics.
- [ ] Window/platform policies are centralized and drift-tested.
- [ ] Custom decoders, streaming/network audio, platform handles, and arbitrary
  platform APIs remain explicit boundaries.
- [ ] Parity and capability docs cite focused evidence.
