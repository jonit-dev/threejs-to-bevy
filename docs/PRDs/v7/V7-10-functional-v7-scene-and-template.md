# V7-10 Functional V7 Scene and Template

Complexity: 8 -> HIGH mode

## Context

**Problem:** V7 needs one maintained proof under `examples/` plus artifacts
under `artifacts/v7` showing that deeper parity features work together in a
real user-facing scene and project template.

## Integration Points

- Entry point: `examples/v7-functional` and a versioned template if promoted.
- Caller files: compiler example smoke, CLI create command, web/native
  verification, packaging and performance reports.
- User-facing: users can create or run a V7 project that demonstrates promoted
  features.

## Solution

Create a self-contained V7 scene/template that combines promoted advanced
physics, animation, UI/audio, dense content, scripting lifecycle, packaging, and
performance evidence. Follow existing `examples/*`, `templates/*`, and
`artifacts/*` folder conventions. For visible features, produce real rendered
artifacts from the web runtime and Bevy rendered artifacts or documented native
visual drift where native support is claimed.

## Execution Phases

#### Phase 1: Scene and Template - V7 features are reachable from CLI flows.

**Files (max 5):**

- `examples/v7-functional/*` - maintained scene.
- `templates/v7-functional/*` - template if promoted.
- `packages/cli/src/commands/create.ts` - template allowlist if promoted.
- `packages/cli/src/commands/create.test.ts` - template tests.
- `packages/compiler/src/examples.test.ts` - build smoke.

**Implementation:**

- [ ] Keep assets local to the example/template or emitted bundle.
- [ ] Reuse the existing examples and templates folder structure and scripts
  where practical.
- [ ] Demonstrate promoted V7 features together.
- [ ] Add template scripts for validate, build, verify, and package where
  practical.

#### Phase 2: Evidence Artifacts - Scene proof is part of the release gate.

**Files (max 5):**

- `scripts/verify-v7*.mjs` - scene/template/package/perf steps.
- `docs/verify-v7.md` - artifact docs.
- `docs/STATUS.md` - V7 scene status.
- `docs/bevy-feature-parity.md` - evidence notes.
- `artifacts/v7/*` - generated outputs.

**Implementation:**

- [ ] Capture web visual/playable artifacts and fixed traces.
- [ ] Capture Bevy observations, Rust tests, screenshots, or packaged run
  artifacts where practical.
- [ ] Write all V7 proof outputs under `artifacts/v7` using the existing
  artifact layout style.
- [ ] Capture screenshots, image diffs, side-by-side renders, or equivalent
  real-world rendering artifacts for visible promoted features where practical.
- [ ] Link performance and diagnostic artifacts in the V7 report.

## Verification Strategy

- `pnpm --filter @threenative/cli test`
- `pnpm --filter @threenative/compiler test`
- `pnpm verify:v7`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] The V7 scene/template demonstrates promoted features together.
- [ ] The scene/template is self-contained and release-gated.
- [ ] Artifacts under `artifacts/v7` prove the example/template is working.
- [ ] Visible features are supported by rendered artifacts, not only logs or
  build success.
