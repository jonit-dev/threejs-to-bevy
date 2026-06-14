# V6-09 Functional V6 Game Scene

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 needs one maintained playable proof under `examples/` plus
artifacts under `artifacts/v6` that promoted engine features work together, not
just isolated fixtures.

## Integration Points

- Entry point: `examples/v6-functional` and future `tn create` template if
  promoted.
- Caller files: compiler example smoke, web visual/playable verifier, Bevy
  observations, `verify:v6`.
- User-facing: a developer or AI can run one scene and see character, physics,
  animation, UI, audio, and gameplay systems working together.

## Solution

Create a self-contained V6 functional game scene using promoted features:
resource/event-driven gameplay, character movement, collision/interaction,
animation playback, retained UI, audio feedback, and diagnostics evidence.
Follow existing `examples/*` folder patterns and write proof artifacts under
`artifacts/v6`. For visible features, produce real rendered artifacts from the
web runtime and Bevy rendered artifacts or documented native visual drift where
native support is claimed.

## Execution Phases

#### Phase 1: Scene Build and Validation - The V6 example emits a valid bundle.

**Files (max 5):**

- `examples/v6-functional/*` - maintained scene.
- `packages/compiler/src/examples.test.ts` - build smoke.
- `scripts/verify-v6*.mjs` - scene build step.
- `docs/verify-v6.md` - artifact contract.
- `docs/STATUS.md` - scene status.

**Implementation:**

- [ ] Keep all required runtime assets inside the example or emitted bundle.
- [ ] Reuse the existing examples folder structure and scripts where practical.
- [ ] Exercise all promoted V6 feature contracts where practical.
- [ ] Add deterministic fixture or trace data for gameplay checks.

#### Phase 2: Playable Evidence - Web and Bevy artifacts prove behavior.

**Files (max 5):**

- `scripts/verify-v6*.mjs` - playable trace and artifact steps.
- `packages/runtime-web-three/src/*` - visual/playable observations if needed.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native scene evidence.
- `docs/bevy-feature-parity.md` - scene evidence notes.
- `artifacts/v6/*` - generated report outputs.

**Implementation:**

- [ ] Capture web screenshots and fixed-input gameplay traces.
- [ ] Capture native observations, Rust test evidence, or screenshots where
  practical.
- [ ] Write all V6 proof outputs under `artifacts/v6` using the existing
  artifact layout style.
- [ ] Capture screenshots, image diffs, side-by-side renders, or equivalent
  real-world rendering artifacts for visible promoted features where practical.
- [ ] Record first failing diagnostic and artifact links in `verify:v6`.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm verify:v6`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] The V6 scene is playable and demonstrates promoted features together.
- [ ] Scene proof is part of the V6 release gate.
- [ ] Artifacts under `artifacts/v6` prove the example is working.
- [ ] Visible features are supported by rendered artifacts, not only logs or
  build success.
