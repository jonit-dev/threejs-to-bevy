# PRD: Humanoid Course Stair Traversal Proof

`Planning Mode: Principal Architect`
`Complexity: 5 -> MEDIUM mode`

## 1. Context

**Problem:** The humanoid course contains stairs, but the example does not have
a committed proof that the player can climb the actual course stairs on web and
native.

**Files Analyzed:**

- `content/scenes/arena.scene.json` - player `CharacterController.stepOffset`
  and three `stairs.step.*` static box colliders.
- `src/scripts/player.ts` - movement delegates to `CharacterRig.update`.
- `packages/script-stdlib/src/rigs.ts` - `CharacterRig.update` calls
  `context.character.move` and applies the resolved pose.
- `packages/runtime-web-three/src/character.ts` - web step-offset resolver.
- `runtime-bevy/crates/threenative_runtime/src/character.rs` - native
  step-offset resolver.
- `playtests/*.playtest.json` - existing movement scenarios do not prove
  vertical stair traversal.

**Current Behavior:**

- The player has `CharacterController.stepOffset: 0.36`.
- The authored stair tops are approximately `0.22`, `0.44`, and `0.66`, so each
  riser should be climbable as a sequence.
- Web and Bevy have step-offset logic, but the humanoid course only proves
  flat movement/camera behavior today.
- Existing playtest assertions may need stronger support for Y movement or
  character trace ground-entity evidence.

## 2. Solution

**Approach:**

- Add a focused humanoid-course stair scenario that reaches the stair lane and
  climbs the risers.
- If assertion coverage is too weak, add narrow playtest assertion support for
  final Y delta and/or `character.move` trace `groundEntity`.
- Add or tighten shared web and Bevy character tests for multi-step traversal,
  not only a single low obstacle.
- Fix shared resolver behavior if the real course scenario fails; do not patch
  the generated bundle or add custom stair height logic to the game script.

**Integration Points:**

- Entry point: `tn playtest --project examples/humanoid-physics-course`.
- Caller files: committed scenario under `playtests/`; optional playtest
  assertion support under `packages/cli/src/commands`.
- User-facing: yes. The player should visibly climb the stairs in the course.

**Data Changes:** None expected unless scenario assertion schema expands.

## 3. Execution Phases

#### Phase 1: Scenario Proof - The course has a reproducible stair traversal proof.

**Files (max 5):**

- `examples/humanoid-physics-course/playtests/humanoid-course-stairs.playtest.json`
- `examples/humanoid-physics-course/content/scenes/arena.scene.json` - only if
  route placement or step metadata needs a small correction.

**Implementation:**

- [ ] Create a scenario that steers from the start lane to the stair lane and
      advances up `stairs.step.01` through `stairs.step.03`.
- [ ] Assert meaningful positive Y movement, not only X/Z displacement.
- [ ] Capture stable artifacts for web and desktop runs.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `examples/humanoid-physics-course/playtests/humanoid-course-stairs.playtest.json` | stair traversal scenario | Player ends higher than start and remains controllable. |

**User Verification:**

- Action: Run the stair scenario and inspect the stable screenshot/effect log.
- Expected: Player is on or past the upper stair/platform, with no collision
  jitter or blocked movement diagnostic.

#### Phase 2: Assertion And Runtime Parity - The proof cannot pass for the wrong reason.

**Files (max 5):**

- `packages/cli/src/commands/playtestScenario.ts` - only if scenario schema
  cannot express Y or trace assertions.
- `packages/cli/src/commands/playtestAssertions.ts` - optional assertion
  implementation.
- `packages/runtime-web-three/src/character.test.ts`
- `runtime-bevy/crates/threenative_runtime/tests/character.rs`

**Implementation:**

- [ ] Add the narrowest assertion needed to prove Y delta or `groundEntity`.
- [ ] Add web/native tests for sequential risers within `stepOffset`.
- [ ] Preserve rejection for a riser above `stepOffset`.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/runtime-web-three/src/character.test.ts` | climbs sequential risers within step offset | Character trace resolves onto successive stair tops. |
| `runtime-bevy/crates/threenative_runtime/tests/character.rs` | character trace climbs sequential risers | Native trace matches web semantics. |
| `packages/cli/src/commands/playtest*.test.ts` | asserts vertical movement or ground entity | Scenario assertion fails when Y/ground proof is absent. |

**User Verification:**

- Action: Run web and desktop stair playtests.
- Expected: Both targets pass and artifacts show stair-specific proof.

## 4. Verification

```bash
pnpm --filter @threenative/runtime-web-three test -- character
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime character
tn playtest --project examples/humanoid-physics-course --scenario playtests/humanoid-course-stairs.playtest.json --stable-artifacts --json
tn playtest --project examples/humanoid-physics-course --scenario playtests/humanoid-course-stairs.playtest.json --target desktop --stable-artifacts --json
pnpm verify:conformance
```

## 5. Acceptance Criteria

- [ ] A committed humanoid-course stair scenario proves the actual course
      geometry.
- [ ] Web and desktop playtests pass with stable artifacts.
- [ ] Final player transform has meaningful positive Y movement.
- [ ] Evidence identifies stair grounding, or an equivalent explicit vertical
      traversal assertion.
- [ ] Web and Bevy tests cover sequential climbable risers and an over-limit
      rejection.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing playtest assertions cannot inspect ground entity. | Medium | Add a narrow trace/Y assertion rather than relying on screenshots. |
| High movement speed skips individual risers. | Medium | Use scenario timing/speed that exercises the production controller and add resolver tests for sequential risers. |
| Web/native traces diverge on AABB edge cases. | High | Keep fixes in shared character semantics and prove both runtimes. |
