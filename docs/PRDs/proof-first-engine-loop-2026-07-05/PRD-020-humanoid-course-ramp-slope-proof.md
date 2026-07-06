# PRD: Humanoid Course Ramp Slope Proof

`Planning Mode: Principal Architect`
`Complexity: 5 -> MEDIUM mode`

## 1. Context

**Problem:** The humanoid course contains a visual ramp, but the authored
collider is a rotated box without portable `Collider.slope` metadata, so the
example does not prove ramp/slope support.

**Files Analyzed:**

- `content/scenes/arena.scene.json` - `ramp.main` visual/collider data and
  player `CharacterController`.
- `content/meshes/arena.meshes.json` - `mesh.ramp` is a box primitive.
- `src/scripts/player.ts` - movement uses `CharacterRig.update`.
- `packages/runtime-web-three/src/character.ts` - web slope handling.
- `runtime-bevy/crates/threenative_runtime/src/character.rs` - native slope
  handling.
- `packages/runtime-web-three/src/character.test.ts` and
  `runtime-bevy/crates/threenative_runtime/tests/character.rs` - existing slope
  tests.

**Current Behavior:**

- The shared runtime supports promoted slope metadata on box colliders and
  `CharacterController.slopeLimit`.
- `ramp.main` is rendered as a rotated box but lacks `Collider.slope`.
- The player controller has `stepOffset` but no explicit `slopeLimit`.
- Runtime character tracing should not infer portable ramp semantics from
  transform rotation alone.

## 2. Solution

**Approach:**

- Author the course ramp using explicit `Collider.slope` metadata aligned with
  the visible ramp.
- Add an explicit player `slopeLimit` that accepts this ramp angle.
- Add a focused playtest that proves the player traverses the ramp and gains
  height on web and desktop.
- If needed, add playtest assertion support for resolved Y or
  `groundEntity: "ramp.main"`.

**Integration Points:**

- Entry point: `tn build` emits the updated scene; `tn playtest` proves the
  authored ramp.
- Caller files: scene source document, playtest scenario, optional CLI
  assertions.
- User-facing: yes. The course ramp should be visibly walkable.

**Data Changes:** Source scene component data adds `Collider.slope` and an
explicit `CharacterController.slopeLimit`.

## 3. Execution Phases

#### Phase 1: Author Portable Ramp Metadata - The visible ramp has matching collision semantics.

**Files (max 5):**

- `examples/humanoid-physics-course/content/scenes/arena.scene.json`

**Implementation:**

- [ ] Add `slopeLimit` to `player.CharacterController`.
- [ ] Add `Collider.slope` to `ramp.main`; choose `axis` and `direction` to
      match the course route and the current visual X-rotated ramp.
- [ ] Confirm ramp rise/run matches the visible mesh and platform height.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `content/scenes/arena.scene.json` validated by authoring/build | ramp metadata emits | Bundle contains `ramp.main` slope metadata and player slope limit. |

**User Verification:**

- Action: Inspect the scene and build output.
- Expected: `ramp.main` has explicit slope data; no diagnostics report an
  unsupported collider shape or controller field.

#### Phase 2: Course Ramp Scenario - Ramp traversal is proven on web and native.

**Files (max 5):**

- `examples/humanoid-physics-course/playtests/humanoid-course-ramp-traverse.playtest.json`
- `packages/cli/src/commands/playtestScenario.ts` - only if needed.
- `packages/cli/src/commands/playtestAssertions.ts` - only if needed.

**Implementation:**

- [ ] Add a scenario that moves the player onto and across `ramp.main`.
- [ ] Assert positive Y movement and/or `groundEntity: "ramp.main"`.
- [ ] Run with stable artifacts for web and desktop targets.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `examples/humanoid-physics-course/playtests/humanoid-course-ramp-traverse.playtest.json` | ramp traversal scenario | Player crosses ramp and gains expected height. |
| `packages/cli/src/commands/playtest*.test.ts` | ramp assertion support | Scenario fails when ramp grounding/Y proof is absent. |

**User Verification:**

- Action: Play the scenario or inspect artifacts.
- Expected: Player walks up the ramp smoothly, reaches the ramp checkpoint, and
  no bespoke script height correction is present.

#### Phase 3: Shared Slope Regression - Existing runtime slope semantics stay closed.

**Files (max 5):**

- `packages/runtime-web-three/src/character.test.ts`
- `runtime-bevy/crates/threenative_runtime/tests/character.rs`

**Implementation:**

- [ ] Preserve shallow-ramp acceptance and steep-ramp rejection tests.
- [ ] Add a regression that mirrors the humanoid course ramp dimensions if the
      existing fixtures do not cover them.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/runtime-web-three/src/character.test.ts` | course ramp dimensions are walkable | Web trace grounds on the ramp. |
| `runtime-bevy/crates/threenative_runtime/tests/character.rs` | course ramp dimensions are walkable | Native trace matches web behavior. |

**User Verification:**

- Action: Run focused runtime tests plus the playtest scenario.
- Expected: Web/native runtime tests and scenario evidence agree.

## 4. Verification

```bash
pnpm run validate:authoring
pnpm --filter @threenative/runtime-web-three test -- character
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime character_trace_should_apply_slope_limits
pnpm --filter @threenative/example-humanoid-physics-course build
tn playtest --project examples/humanoid-physics-course --scenario playtests/humanoid-course-ramp-traverse.playtest.json --stable-artifacts --json
tn playtest --project examples/humanoid-physics-course --scenario playtests/humanoid-course-ramp-traverse.playtest.json --target desktop --stable-artifacts --json
pnpm verify:conformance
```

## 5. Acceptance Criteria

- [ ] `ramp.main` uses explicit portable `Collider.slope` metadata.
- [ ] Player controller has an explicit `slopeLimit` that accepts the ramp.
- [ ] Web and desktop playtests prove traversal of the actual course ramp.
- [ ] Runtime tests still reject too-steep slopes.
- [ ] No custom game-script Y correction or backend-specific physics code is
      added.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| The slope axis/direction does not match the rendered ramp. | Medium | Confirm with scene inspection, screenshot, and trace artifacts before claiming done. |
| Visual rotation and collider slope metadata diverge. | Medium | Align rise/run, platform height, and transform in the source scene. |
| Playtest cannot assert ramp-specific grounding. | Medium | Extend assertion support narrowly for trace/Y evidence. |
