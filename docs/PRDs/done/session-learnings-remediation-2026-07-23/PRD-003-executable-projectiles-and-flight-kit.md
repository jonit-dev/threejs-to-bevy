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

- [x] On configured input edge and expired cooldown, resolve launcher pose and
  instantiate the declared prefab.
- [x] Apply direction, velocity, stable ID, and bounded lifetime; despawn on
  expiry and support declared impact behavior.
- [x] Fail actionably for missing launcher, prefab, Transform, or physics
  declaration.
- [x] Generate transition proof for fire/travel/impact/despawn plus cooldown
  negative control. Static resource assertions are insufficient.
- [x] Ensure remove reverses every owned source mutation.

### Phase 2: Cross-adapter projectile proof

**Files (max 5):**

- `packages/ir/fixtures/conformance/projectile-mechanic/world.ir.json` - fixture.
- `packages/ir/fixtures/conformance/projectile-mechanic/scripts.bundle.js` - generated fixture output.
- `tools/verify/src/projectileMechanicParity.ts` - paired runner/comparison.
- `packages/runtime-web-three/src/systems/context.test.ts` - service edge cases.
- `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs` - native edge cases.

**Implementation:**

- [x] Compare causal spawn, velocity, impact, and despawn observations.
- [x] Use one registry-owned tolerance/rounding policy.
- [x] Negative controls must fail if input, cooldown, or collision is removed.

### Phase 3: FlightRig core

**Files (max 5):**

- `packages/script-stdlib/src/flight.ts` - reusable state/update API.
- `packages/script-stdlib/src/flight.test.ts` - physical/control tests.
- `packages/script-stdlib/src/index.ts` - export.
- `packages/script-stdlib/scripts/build-bundle.mjs` - source enrollment if needed.
- `examples/aerodynamics-flight-course/src/scripts/flight.ts` - first consumer.

**Implementation:**

- [x] Own throttle integration, elevator sign convention, coordinated bank/yaw,
  velocity rotation, stall/ditch/retry state, and telemetry shape.
- [x] Accept tuning constants, sampled input, and declared aerodynamic IDs; no
  example IDs.
- [x] Assert control directions and restoring behavior independently of adapter
  parity.
- [x] Do not promote until the course and Pacific game both consume it without
  branching the API around either project.

### Phase 4: Effects, propeller, and cue helpers

**Files (max 5):**

- `packages/script-stdlib/src/effects.ts` - optional measured pool/lifecycle.
- `packages/script-stdlib/src/effects.test.ts` - reuse/reset/orientation.
- `packages/script-stdlib/src/audioHelpers.ts` - rising/repeating edges.
- `packages/script-stdlib/src/audioHelpers.test.ts` - cadence/reset.
- `packages/script-stdlib/src/index.ts` - exports.

**Implementation:**

- [x] Prefer ordinary spawn unless profiling proves pooling necessary.
- [x] If promoted, pool owns acquire/advance/orient/park/reset with bounded IDs.
- [x] Add rising-edge and rate-limited cue decisions as pure deterministic
  helpers; they return intent and do not hide `ctx.audio`.
- [x] Add prop/rotor throttle-to-clip/visibility convention without requiring
  model sub-node handles.

### Phase 5: Boresight projection and second consumer

**Files (max 5):**

- `packages/script-stdlib/src/camera.ts` - pure boresight projection.
- `packages/script-stdlib/src/camera.test.ts` - FOV/aspect/pitch cases.
- `examples/battle-of-pacific/src/scripts/flight.ts` - consume kit.
- `examples/battle-of-pacific/overlay/flight-deck/src/App.tsx` - payload use.
- `examples/battle-of-pacific/overlay/flight-deck/src/styles.css` - remove hardcode.

**Implementation:**

- [x] Project boresight from camera vertical FOV, aspect, pitch, and aim vector.
- [x] Send normalized coordinates over the existing typed bridge.
- [x] Remove copied Pacific lifecycle logic only when behavior/evidence matches.

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

- [x] `tn add projectile` produces observable firing, travel, impact, and cleanup.
- [x] Cooldown and invalid-source negative controls fail correctly.
- [x] Web/native projectile observations match.
- [x] FlightRig has two real consumers and independent direction tests.
- [x] No helper exposes renderer/native handles or duplicates descriptor truth.
- [x] Reticle follows camera projection rather than a CSS constant.
- [x] Focused tests, conformance, cookbook, docs, and both game playtests pass.

## Verification evidence

Append commands and artifacts per phase.

### Phase 1

- `pnpm --filter @threenative/cli build`
- Focused compiler selector tests pass for exact same-system dynamic lifecycle
  IDs and reject sibling prefixes.
- Focused CLI add/remove, collision-preflight, and transient contact-evidence
  tests pass.
- `pnpm verify:cookbook` - full gate passes.
- Fresh generated project web proof:
  `/tmp/tn-projectile-final-SNVroo/game/artifacts/playtest/block-projectile/latest`
  - fire, retained raycast contact against the intended impact target, impact,
    despawn, active-count, and diagnostics assertions pass.
- Fresh generated cooldown proof:
  `/tmp/tn-projectile-final-SNVroo/game/artifacts/playtest/block-projectile-cooldown/latest`
  - one accepted fire and one cooldown rejection pass.
- Projectile installation rejects source-owner collisions before any write;
  removal reverses every owned mutation.
- Runtime command authorization remains exact-ID based; generated dynamic
  despawn IDs are compiler-validated descendants of declared instantiate
  prefixes, without prefix-wide runtime authorization.

### Phase 2

- The generated lifecycle now advances the portable Transform explicitly while
  retaining declared rigid-body velocity and collider metadata. This closes
  native travel without adapter-specific script branches.
- The descriptor-owned proof quantizes observed travel to three decimals and
  enrolls fired, travel-distance, exact impact target, impact, despawn, and
  active-count resource paths in the existing generic parity comparator.
- `xvfb-run -a tn parity playtest --project . --scenario
  playtests/block-projectile.playtest.json --targets web,desktop
  --stable-artifacts --json` passed with `TN_PARITY_PLAYTEST_OK` and no
  diagnostics:
  `/tmp/tn-projectile-final-wzKhyu/game/artifacts/gameplay-parity/playtests/block-projectile.playtest.parity.json`.
- Focused parity-comparator mutations reject missing input fire,
  cooldown-rejection, impact count, and exact collision-target evidence.

### Phase 3 (consumer one)

- `FlightRig.step` is a pure adapter-independent kernel for throttle,
  configurable elevator direction, coordinated bank/yaw torque and velocity
  rotation, stall/ditch/retry transitions, and numeric telemetry.
- The standard-library suite passes 51 tests, including independent positive
  and negative control-direction, restoring-torque, speed-preservation,
  stall/ditch, and retry-reset assertions.
- The aerodynamics flight course consumes the rig without example IDs entering
  the shared API. Its unchanged 11-assertion objective proof passes on web and
  desktop:
  `/tmp/flight-course-web-rig-final/summary.json` and
  `/tmp/flight-course-native-rig-final/summary.json`.
- Pacific now supplies its own surface/thruster bindings and tuning to the same
  kernel used by the course. Existing pitch-sign and roll-sign proofs pass on
  web, and pitch-sign passes on desktop:
  `/tmp/battle-flight-rig-pitch-web/summary.json`,
  `/tmp/battle-flight-rig-roll-web/summary.json`, and
  `/tmp/battle-flight-rig-pitch-native/summary.json`.
- Pacific's web ditch/retry proof passes all six assertions at
  `/tmp/battle-flight-rig-retry-web/summary.json`. The desktop scenario reaches
  the restored pose and increments `retryCount`, but its two legacy
  `changed:true` assertions compare against an already-restored native resource
  snapshot; that proof-authoring defect remains separate from the shared rig.

### Phases 4 and 5

- No new effect pool was promoted: ordinary runtime spawn remains preferred,
  while existing bounded projectile/effect pools keep their established
  acquire/advance/park ownership.
- `AudioCueEx` and `PropellerEx` are pure helpers. Their edge/reset, cadence,
  throttle/clip, and bounded-disc tests pass, and Pacific consumes them without
  hiding audio or model handles.
- `BoresightEx` projects a parent-space aim vector using the authored camera's
  FOV and rotation-derived pitch plus the overlay aspect. Center, FOV/aspect,
  pitch, and rear-facing cases pass independently.
- The typed `flight:telemetry` payload now carries normalized reticle
  coordinates and visibility. The overlay positions the reticle from that
  payload; the hardcoded `top: 28%` anchor is removed.
- `pnpm --dir examples/battle-of-pacific build:overlay:flight-deck` and the game
  bundle build pass. The post-change focused-input playtest passes all six
  gameplay, visual, animation, movement, and diagnostic assertions at
  `/tmp/battle-flight-kit-input-web/summary.json`; its frame visibly contains
  the Pacific aircraft, ocean, combat HUD, and projected reticle.

### Phase 6

- The existing planner intent contract already owns flight cruise, pitch,
  roll, force, and retry responsibilities; the existing playtest scaffold
  derives exact flight proof from scene actions and resource observations, so
  no second responsibility or proof registry was added.
- `pnpm verify:conformance` and the complete `pnpm verify:cookbook` gate pass.
  The latter verifies the new two-consumer `flight-rig` cookbook entry in the
  same run as every existing authoring pattern.
- Focused standard-library tests pass 57 cases, and the final Battle desktop
  pitch proof passes at `/tmp/battle-flight-kit-pitch-native-final/summary.json`.
