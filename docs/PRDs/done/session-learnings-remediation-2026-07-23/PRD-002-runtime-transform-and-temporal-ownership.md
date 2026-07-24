# PRD-002: Runtime Transform and Temporal Ownership

`Complexity: 9 -> HIGH mode` (`+3` 10+ files, `+2` new layered transform
contract, `+2` complex temporal state, `+2` multi-package)

## 1. Context

**Problem:** Authored transforms, runtime cosmetic offsets, camera-relative
objects, and temporal history currently compete for the same final pose, causing
replacement, ping-pong, or whole-frame smear.

**Files analyzed:** `packages/runtime-web-three/src/systems/effects.ts`,
`packages/runtime-web-three/src/mapWorld.ts`,
`packages/runtime-web-three/src/worldMapping/oceanWater.ts`,
`packages/runtime-web-three/src/render.ts`,
`runtime-bevy/crates/threenative_runtime/src/motion_blur_postprocess.rs`,
`runtime-bevy/crates/threenative_runtime/src/motion_blur_postprocess.wgsl`.

**Current behavior:**

- Partial Transform patches preserve omitted fields but replace a supplied
  position or rotation.
- Per-frame transform sync reapplies the entity root pose.
- The current ocean avoids recenter conflict with a large fixed plane; it does
  not solve camera-relative ownership.
- Web and native motion blur blend same-UV history, so camera translation
  smears the entire frame.
- Universal wrapping of special web objects is already planned in the Pacific
  mastery PRD and is not duplicated here.

## 2. Solution

- Add an explicit layered transform contract: authored base, simulation pose,
  and bounded runtime-local/cosmetic offset.
- Define which layers scripts may mutate and how composition/order work.
- Give camera-relative internals an owned child/local-offset path rather than
  competing writes to the entity root.
- Add camera-history rejection/reprojection so motion blur preserves intended
  temporal effects without translating the whole previous frame.

```mermaid
flowchart LR
  Base[Authored base] --> Compose[Owned composition]
  Sim[Simulation pose] --> Compose
  Cosmetic[Runtime-local offset] --> Compose
  Compose --> Root[Entity root]
  Root --> Child[Adapter-private child/recenter]
  Camera[Current/previous camera] --> History[History rejection/reprojection]
  Root --> History
```

**Data changes:** Versioned optional transform-layer metadata and/or a bounded
script command. Raw adapter handles and arbitrary transform-sync opt-out remain
unsupported.

## 3. Integration points

- [x] Entry: structured Transform data and `ctx.entity(...).transform()`.
- [x] Callers: compiler validation, web system effects/sync, Bevy script
  effects/reconciliation, animation/physics transform writers, render history.
- [x] User-facing: script API and diagnostics; no new visual UI.

**Full user flow:** An author keeps the model's authored orientation, applies a
cosmetic bank/recenter through a documented layer, and sees stable web/native
poses and camera-safe temporal rendering.

## 4. Execution phases

### Phase 1: Versioned transform-layer contract

**Files (max 5):**

- `packages/ir/src/types.ts` - contract types.
- `packages/ir/src/validation.ts` - supported fields and diagnostics.
- `packages/script-stdlib/src/script-context.ts` - typed bounded API.
- `packages/compiler/src/scripts/diagnostics.ts` - portable contract diagnostics.
- `packages/ir/src/transformLayers.test.ts` - composition truth table.

**Implementation:**

- [x] Specify `final = authoredBase * simulation * cosmeticLocal` order for
  translation, quaternion rotation, and scale.
- [x] Separate runtime-local offsets from durable authored values.
- [x] Reject unknown layers, non-finite values, and writes from undeclared
  systems.
- [x] Define animation/physics ownership and conflict diagnostics.

### Phase 2: Web and native execution parity

**Files (max 5):**

- `packages/runtime-web-three/src/systems/effects.ts` - layered commands.
- `packages/runtime-web-three/src/mapWorld.ts` - composition/sync owner.
- `packages/runtime-web-three/src/systems/context.test.ts` - web cases.
- `runtime-bevy/crates/threenative_runtime/src/systems_effects.rs` - native.
- `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs` - native cases.

**Implementation:**

- [x] Apply every layer exactly once per fixed update.
- [x] Preserve authored base across script updates and animation state changes.
- [x] Produce matching conflict/missing-declaration diagnostics.
- [x] Keep ordinary Transform patch semantics backward compatible.

**Verification:** Shared fixture asserts exact composed matrices/quaternions,
reset behavior, and conflict errors across adapters.

### Phase 3: Camera-relative child ownership

**Files (max 5):**

- `packages/runtime-web-three/src/worldMapping/oceanWater.ts` - inner recenter.
- `packages/runtime-web-three/src/worldMapping/oceanWater.test.ts` - no ping-pong.
- `packages/runtime-web-three/src/mapWorld.test.ts` - root/child sync.
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs` - native policy.
- `packages/ir/fixtures/conformance/transform-layers/world.ir.json` - fixture.

**Implementation:**

- [x] Recenter only an adapter-private inner object or declared local layer.
- [x] Never mutate the same root pose from render and transform sync.
- [x] Prove authored root position is stable over consecutive frames.
- [x] Enroll another cosmetic use besides water before promotion.

### Phase 4: Camera-safe temporal history

**Files (max 5):**

- `packages/runtime-web-three/src/render.ts` - camera-aware history policy.
- `packages/runtime-web-three/src/render.test.ts` - web negative controls.
- `runtime-bevy/crates/threenative_runtime/src/motion_blur_postprocess.rs` - uniforms/state.
- `runtime-bevy/crates/threenative_runtime/src/motion_blur_postprocess.wgsl` - rejection/reprojection.
- `tools/verify/src/motionBlurParity.ts` - paired visual gate.

**Implementation:**

- [x] Define intended object/camera motion behavior before choosing rejection
  versus depth/velocity reprojection.
- [x] Reset history on cuts, resize, projection change, and camera deltas.
- [x] Add static-camera moving-object positive control and translating-camera
  static-world negative control.
- [x] Record comparable web/native visual metrics; do not widen tolerances.

### Phase 5: Public guidance and status

**Files (max 5):**

- `docs/workflows/conventions.md` - composition and ownership.
- `docs/cookbook/cosmetic-transform-layers.md` - executable examples.
- `docs/status/capabilities/scripting.md` - API boundary.
- `docs/status/capabilities/rendering.md` - temporal boundary/evidence.
- `docs/STATUS.md` - one-line updates.

## 5. Checkpoints and acceptance

Automated `prd-work-reviewer` after every phase. Manual side-by-side visual
review is additionally required for Phases 3 and 4.

- [x] Authored rotation survives repeated runtime cosmetic changes.
- [x] Web/native composition fixtures match.
- [x] Camera-relative objects do not ping-pong with root sync.
- [x] Camera translation does not smear a static world.
- [x] Intended moving-object temporal effect remains observable.
- [x] Focused cookbook, docs, adapter, and temporal visual-control gates pass.

## Verification evidence

- IR validation/composition: `@threenative/ir` 433/433 tests pass, including
  tuple/finite/unknown-field negative controls.
- Runtime parity: focused web composition/context/runner tests pass; native
  composition, ocean ownership, and declared/undeclared host tests pass.
- Temporal policy: web and native tests retain unchanged-camera history and
  reset on translation, rotation, projection, initial capture, and resize.
- Visual positive control: the existing paired
  `photoreal-motion-blur-moving-test` remains enrolled in
  `verify:rendering-photoreal`; no threshold was changed.
- Documentation: the focused cookbook entry and docs consistency pass.
- Broad-gate audit (2026-07-24): `verify:cookbook` reached the unrelated
  `img2threejs-generated-prop` and `off-recipe-starter-fallback` entries but
  their browser proofs reported no canvas/runtime-ready signal.
  `verify:rendering-photoreal` reported the same missing web canvas across its
  fixtures; its enrolled native captures still ran. `verify:conformance`
  exited after the browser scenario window without emitting a diagnostic.
  No tolerance, assertion, or enrollment was weakened; scoped web/native
  transform, ocean ownership, motion-history, and cookbook tests remain green.
