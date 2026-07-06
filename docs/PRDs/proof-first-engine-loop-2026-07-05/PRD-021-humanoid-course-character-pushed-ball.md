# PRD: Humanoid Course Character-Pushed Ball

`Planning Mode: Principal Architect`
`Complexity: 6 -> MEDIUM mode`

## 1. Context

**Problem:** The humanoid course has dynamic pushable crates, but it does not
prove the game-feel case where the character body hits a sphere and the sphere
moves.

**Files Analyzed:**

- `content/scenes/arena.scene.json` - player collider/controller and existing
  dynamic pushable crates.
- `content/meshes/arena.meshes.json` - primitive mesh catalog.
- `content/materials/arena.materials.json` - reusable course materials.
- `src/scripts/player.ts` - movement delegates to `CharacterRig.update`.
- `packages/script-stdlib/src/rigs.ts` - `CharacterRig.update` hides the
  `character.move` trace today.
- `packages/runtime-web-three/src/character.ts` - push trace support behind
  `CharacterController.pushPolicy`.
- `packages/ir/src/physicsValidation.ts` - validates controller push policy.

**Current Behavior:**

- The player collider mask already includes `pushable`.
- Existing crates are dynamic rigid bodies on the `pushable` layer.
- The player `CharacterController` does not set `pushPolicy`.
- `CharacterRig.update` applies the resolved player pose but does not expose or
  apply `trace.pushed` to dynamic objects.
- Relying on incidental backend collision alone is not a portable contract.

## 2. Solution

**Approach:**

- Add a course ball as a dynamic sphere on the `pushable` layer with readable
  scale/material.
- Enable player `CharacterController.pushPolicy` for `pushable` objects with a
  bounded max mass and impulse scale.
- Extend the shared script/runtime path so `CharacterRig.update` can apply or
  expose push trace effects without duplicating movement logic in the example.
- Add a committed playtest where pressing into the ball moves the ball by a
  measurable distance on web and desktop.

**Integration Points:**

- Entry point: `src/scripts/player.ts` continues to own player behavior through
  `CharacterRig.update`.
- Caller files: script stdlib rig helper, web/native character traces, scene
  source, committed playtest scenario.
- User-facing: yes. The player hits a ball and it rolls/slides away.

**Data Changes:** Scene source adds one dynamic sphere entity and push policy on
the player controller. Optional shared runtime/stdlib API returns or applies
push traces.

## 3. Execution Phases

#### Phase 1: Shared Push Contract - Character push traces affect dynamic bodies portably.

**Files (max 5):**

- `packages/script-stdlib/src/rigs.ts`
- `packages/script-stdlib/src/rigs.test.ts`
- `packages/runtime-web-three/src/character.test.ts`
- `runtime-bevy/crates/threenative_runtime/tests/character.rs`

**Implementation:**

- [ ] Extend `CharacterRig.update` with a minimal option or return value that
      preserves the existing API while making `trace.pushed` usable.
- [ ] Apply push updates through portable component patches or document why the
      example must consume the trace itself.
- [ ] Test light object push and too-heavy object rejection.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/script-stdlib/src/rigs.test.ts` | character rig exposes/applies push trace | Pushable target receives a deterministic movement/velocity patch. |
| `packages/runtime-web-three/src/character.test.ts` | push policy reports pushed body | Web trace includes pushed dynamic body when mass is allowed. |
| `runtime-bevy/crates/threenative_runtime/tests/character.rs` | push policy reports pushed body | Native trace matches web semantics. |

**User Verification:**

- Action: Run focused stdlib/runtime tests.
- Expected: Push behavior is proven without example-specific movement
  reimplementation.

#### Phase 2: Authored Ball In Course - The obstacle course contains a readable dynamic ball.

**Files (max 5):**

- `examples/humanoid-physics-course/content/scenes/arena.scene.json`
- `examples/humanoid-physics-course/content/meshes/arena.meshes.json`
- `examples/humanoid-physics-course/content/materials/arena.materials.json`
- `examples/humanoid-physics-course/src/scripts/player.ts` - only if a new
  rig option or return value must be wired.

**Implementation:**

- [ ] Add `ball.push.01` with `MeshRenderer`, `Collider.kind: "sphere"`,
      `RigidBody.kind: "dynamic"`, `layer: "pushable"`, and a believable mass.
- [ ] Add player `CharacterController.pushPolicy` with `enabled: true`,
      `allowedLayers: ["pushable"]`, and an explicit `maxPushMass`.
- [ ] Place the ball where the player can hit it without blocking the main
      checkpoint route.
- [ ] Keep the durable source in `content/**/*.json` and
      `src/scripts/**/*.ts`; do not edit emitted `dist/**`.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `content/scenes/arena.scene.json` validated by authoring/build | ball source emits | Bundle contains dynamic sphere and push policy. |

**User Verification:**

- Action: Run the example and walk into the ball.
- Expected: Ball visibly moves while the player remains controllable.

#### Phase 3: Ball Push Playtest - Web and desktop prove the same interaction.

**Files (max 5):**

- `examples/humanoid-physics-course/playtests/humanoid-course-ball-push.playtest.json`
- `packages/cli/src/commands/playtestScenario.ts` - only if needed for
  non-subject movement assertions.
- `packages/cli/src/commands/playtestAssertions.ts` - only if needed.

**Implementation:**

- [ ] Add a scenario that positions/moves the player into `ball.push.01`.
- [ ] Assert the ball moves at least `0.15m` along the intended axis.
- [ ] Capture stable artifacts for web and desktop.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `examples/humanoid-physics-course/playtests/humanoid-course-ball-push.playtest.json` | ball push scenario | `ball.push.01` moves after player contact. |
| `packages/cli/src/commands/playtest*.test.ts` | non-subject movement assertion | Scenario can assert movement for the ball entity. |

**User Verification:**

- Action: Run the ball push playtest and inspect screenshots/effect log.
- Expected: The player contacts the ball and the ball moves a measurable
  distance on both targets.

## 4. Verification

```bash
cd examples/humanoid-physics-course
pnpm run validate:authoring
pnpm run build
tn scene validate arena --json
tn scene inspect arena --json
tn playtest --project . --scenario playtests/humanoid-course-ball-push.playtest.json --stable-artifacts --json
tn playtest --project . --scenario playtests/humanoid-course-ball-push.playtest.json --target desktop --stable-artifacts --json
```

For shared runtime or stdlib changes:

```bash
pnpm --filter @threenative/runtime-web-three test -- character
pnpm --filter @threenative/script-stdlib test -- rigs
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime character
pnpm verify:conformance
```

## 5. Acceptance Criteria

- [ ] Ball is authored as a dynamic sphere on `pushable` with readable
      scale/material.
- [ ] Player `CharacterController.pushPolicy.enabled` is true and allows
      `pushable`.
- [ ] Pressing movement into the ball moves it at least `0.15m`.
- [ ] Heavy/blocked behavior remains deterministic in focused tests.
- [ ] Web and desktop playtests pass for the same committed scenario.
- [ ] No raw Three.js/Bevy gameplay code or emitted bundle edits are used.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| `CharacterRig.update` hides `character.move` traces. | High | Extend the stdlib API once instead of duplicating movement logic in the example. |
| Native and web push application differ. | High | Keep push semantics in shared trace tests and run desktop playtest proof. |
| Playtest assertions only track the player. | Medium | Add non-subject movement assertion support for `ball.push.01`. |
| Capability claim triggers docs gates. | Medium | If this is promoted beyond an example follow-up, update `docs/STATUS.md` and `docs/bevy-feature-parity.md`. |
