# V1-09 Canonical Example

Complexity: 5 -> MEDIUM mode

## Context

**Problem:** V1 needs one canonical example that exercises the whole path and
stays small enough to debug quickly.

**Files Analyzed:** `docs/ROADMAP.md`, `docs/ai-workflows.md`,
`docs/developer-workflow.md`, `docs/sdk.md`.

**Current Behavior:**

- Docs require one V1 demo with scene, camera, light, primitive meshes, material,
  optional movement, same source and bundle for web and Bevy.
- No examples exist.

## Solution

**Approach:**

- Add `examples/v1-canonical`.
- Use only V1 SDK subset.
- Include one player-like box, floor plane, secondary primitive, camera, and
  directional light.
- Include optional compile-time animation marker or runtime built-in rotation
  hook only if supported by web/native PRDs.
- Document exact commands.

**Data Changes:** Example source and generated test fixtures only.

## Integration Points

**How will this feature be reached?**

- Entry point identified: `tn build --project examples/v1-canonical`.
- Caller file identified: CLI build/dev/verify commands.
- Registration/wiring needed: root examples list or docs link.

**Is this user-facing?** Yes.

**Full user flow:**

1. User opens `examples/v1-canonical/README.md`.
2. User runs validate/build/web/native commands.
3. Example produces one bundle.
4. Web and native adapters render that bundle.

## Execution Phases

#### Phase 1: Example Source - Canonical scene builds through SDK

**Files (max 5):**

- `examples/v1-canonical/package.json` - example scripts.
- `examples/v1-canonical/threenative.config.json` - example config.
- `examples/v1-canonical/src/game.ts` - canonical scene.
- `examples/v1-canonical/README.md` - commands and expected output.
- `examples/v1-canonical/.gitignore` - generated outputs.

**Implementation:**

- [ ] Add one scene root.
- [ ] Add player-like object using `BoxGeometry`.
- [ ] Add floor using `PlaneGeometry`.
- [ ] Add camera and light.
- [ ] Use one `MeshStandardMaterial` per visible object.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/compiler/src/examples.test.ts` | `should build canonical v1 example` | Example emits valid bundle. |

**User Verification:**

- Action: Run `tn build --project examples/v1-canonical`.
- Expected: Bundle emits and validates.

#### Phase 2: Runtime Smoke - Example runs on web and native

**Files (max 5):**

- `packages/runtime-web-three/src/examples.test.ts` - web fixture smoke.
- `runtime-bevy/crates/threenative_runtime/tests/example_bundle.rs` - native smoke.
- `examples/v1-canonical/README.md` - update observed commands.

**Implementation:**

- [ ] Add example to web runtime smoke tests.
- [ ] Add example bundle to Bevy loader/mapping tests.
- [ ] Confirm README commands match actual CLI.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/runtime-web-three/src/examples.test.ts` | `should load canonical example bundle` | Web runtime creates scene objects. |
| `runtime-bevy/crates/threenative_runtime/tests/example_bundle.rs` | `should map canonical example bundle` | Bevy mapping succeeds. |

**User Verification:**

- Action: Run `tn dev --target web` and `tn dev --target desktop`.
- Expected: Both targets render the same scene.

## Verification Strategy

- `pnpm tn -- validate --project examples/v1-canonical`
- `pnpm tn -- build --project examples/v1-canonical`
- `pnpm tn -- dev --target web --project examples/v1-canonical`
- `pnpm tn -- dev --target desktop --project examples/v1-canonical`

## Acceptance Criteria

- [ ] Canonical example uses only V1-supported APIs.
- [ ] Example rebuilds from source.
- [ ] Example validates before runtime.
- [ ] Example is used by web, native, and verification tickets.
