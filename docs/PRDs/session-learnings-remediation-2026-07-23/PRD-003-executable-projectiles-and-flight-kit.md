# PRD-003: Executable Projectiles and Reusable Flight Kit

`Complexity: 9 -> HIGH mode` (`+3` 10+ files, `+2` new reusable modules,
`+2` complex lifecycle/state, `+2` multi-package)

## 1. Context

**Problem:** `tn add projectile` advertises a mechanic but emits only dormant
state, while reusable flight, effects, propeller, cue, and reticle behavior
remains example-local.

**Files analyzed:** `packages/cli/src/mechanicBlocks/descriptors.ts`,
`packages/cli/src/mechanicBlocks/registry.ts`,
`packages/script-stdlib/src/rigs.ts`,
`packages/script-stdlib/src/script-context.ts`,
`examples/battle-of-pacific/src/scripts/flight.ts`,
`examples/battle-of-pacific/overlay/flight-deck/src/styles.css`.

**Current behavior:**

- The block writes a prefab and `ProjectileLauncher`; its generated script only
  calls `context.state`, and proof only checks a static speed value.
- Portable runtime spawn/instantiate/despawn now exists, so the old
  pre-authored-pool constraint is obsolete.
- `CharacterRig`/`CameraRig` exist; no `FlightRig`.
- `TimerEx`/`TriggerEx` exist; audio edge/repeat helpers do not.
- The reticle uses a hardcoded CSS vertical offset even though the typed overlay
  event bridge already exists.

## 2. Solution

- Make the descriptor-owned projectile block emit a complete portable lifecycle
  using existing spawn/instantiate services.
- Promote flight behavior only after two consumers/fixtures prove the API is
  general; leave tuning in projects.
- Add a bounded effect pool only if measurements show dynamic spawn is
  unsuitable and two consumers share the lifecycle.
- Add pure audio-edge and boresight-projection helpers; live audio modulation is
  owned separately by PRD-008.

## 3. Integration points

- [x] Entry: `tn add projectile`, imports from `@threenative/script-stdlib`,
  plan mechanic selection, overlay event payloads.
- [x] Callers: mechanic descriptor registry, generated script metadata,
  compiler, web/native script services, planner proof templates.
- [x] User-facing: CLI-generated gameplay and overlay reticle; no editor UI.

**Flow:** Add block -> descriptor emits source and proof -> input spawns a
declared projectile -> runtime observes travel/impact/despawn -> generated
scenario proves lifecycle. Flight authors import one rig and project a reticle
from camera data rather than copying the Pacific script.

## 4. Execution phases

### Phase 1: Real projectile lifecycle

**Files (max 5):**

- `packages/cli/src/mechanicBlocks/descriptors.ts` - owned responsibilities.
- `packages/cli/src/mechanicBlocks/registry.ts` - generated lifecycle.
- `packages/cli/src/mechanicBlocks/registry.test.ts` - source/output tests.
- `packages/cli/src/commands/add.test.ts` - CLI positive/negative proof.
- `docs/cookbook/projectile-mechanic.md` - executable use/customization.

**Implementation:**

- [ ] On configured input edge and expired cooldown, resolve launcher pose and
  instantiate the declared prefab.
- [ ] Apply direction, velocity, stable ID, and bounded lifetime; despawn on
  expiry and support declared impact behavior.
- [ ] Fail actionably for missing launcher, prefab, Transform, or physics
  declaration.
- [ ] Generate transition proof for fire/travel/impact/despawn plus cooldown
  negative control. Static resource assertions are insufficient.
- [ ] Ensure remove reverses every owned source mutation.

### Phase 2: Cross-adapter projectile proof

**Files (max 5):**

- `packages/ir/fixtures/conformance/projectile-mechanic/world.ir.json` - fixture.
- `packages/ir/fixtures/conformance/projectile-mechanic/scripts.bundle.js` - generated fixture output.
- `tools/verify/src/projectileMechanicParity.ts` - paired runner/comparison.
- `packages/runtime-web-three/src/systems/context.test.ts` - service edge cases.
- `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs` - native edge cases.

**Implementation:**

- [ ] Compare causal spawn, velocity, impact, and despawn observations.
- [ ] Use one registry-owned tolerance/rounding policy.
- [ ] Negative controls must fail if input, cooldown, or collision is removed.

### Phase 3: FlightRig core

**Files (max 5):**

- `packages/script-stdlib/src/flight.ts` - reusable state/update API.
- `packages/script-stdlib/src/flight.test.ts` - physical/control tests.
- `packages/script-stdlib/src/index.ts` - export.
- `packages/script-stdlib/scripts/build-bundle.mjs` - source enrollment if needed.
- `examples/aerodynamics-flight-course/src/scripts/flight.ts` - first consumer.

**Implementation:**

- [ ] Own throttle integration, elevator sign convention, coordinated bank/yaw,
  velocity rotation, stall/ditch/retry state, and telemetry shape.
- [ ] Accept tuning constants and declared entity/action IDs; no example IDs.
- [ ] Assert control directions and restoring behavior independently of adapter
  parity.
- [ ] Do not promote until the course and Pacific game both consume it without
  branching the API around either project.

### Phase 4: Effects, propeller, and cue helpers

**Files (max 5):**

- `packages/script-stdlib/src/effects.ts` - optional measured pool/lifecycle.
- `packages/script-stdlib/src/effects.test.ts` - reuse/reset/orientation.
- `packages/script-stdlib/src/audioHelpers.ts` - rising/repeating edges.
- `packages/script-stdlib/src/audioHelpers.test.ts` - cadence/reset.
- `packages/script-stdlib/src/index.ts` - exports.

**Implementation:**

- [ ] Prefer ordinary spawn unless profiling proves pooling necessary.
- [ ] If promoted, pool owns acquire/advance/orient/park/reset with bounded IDs.
- [ ] Add rising-edge and rate-limited cue decisions as pure deterministic
  helpers; they return intent and do not hide `ctx.audio`.
- [ ] Add prop/rotor throttle-to-clip/visibility convention without requiring
  model sub-node handles.

### Phase 5: Boresight projection and second consumer

**Files (max 5):**

- `packages/script-stdlib/src/camera.ts` - pure boresight projection.
- `packages/script-stdlib/src/camera.test.ts` - FOV/aspect/pitch cases.
- `examples/battle-of-pacific/src/scripts/flight.ts` - consume kit.
- `examples/battle-of-pacific/overlay/flight-deck/src/App.tsx` - payload use.
- `examples/battle-of-pacific/overlay/flight-deck/src/styles.css` - remove hardcode.

**Implementation:**

- [ ] Project boresight from camera vertical FOV, aspect, pitch, and aim vector.
- [ ] Send normalized coordinates over the existing typed bridge.
- [ ] Remove copied Pacific lifecycle logic only when behavior/evidence matches.

### Phase 6: Planner, cookbook, status, and release proof

**Files (max 5):**

- `packages/cli/src/game/intentContract.ts` - flight/projectile responsibilities.
- `packages/cli/src/commands/playtestScaffold.ts` - registry-owned proof binding.
- `docs/cookbook/flight-rig.md` - two-consumer pattern.
- `docs/status/capabilities/scripting.md` - promoted surface/evidence.
- `docs/STATUS.md` - one-line entry.

## 5. Checkpoints and acceptance

Automated review follows every phase; manual playtest is additional for Phases
3 and 5.

- [ ] `tn add projectile` produces observable firing, travel, impact, and cleanup.
- [ ] Cooldown and invalid-source negative controls fail correctly.
- [ ] Web/native projectile observations match.
- [ ] FlightRig has two real consumers and independent direction tests.
- [ ] No helper exposes renderer/native handles or duplicates descriptor truth.
- [ ] Reticle follows camera projection rather than a CSS constant.
- [ ] Focused tests, conformance, cookbook, docs, and both game playtests pass.

## Verification evidence

Append commands and artifacts per phase.
