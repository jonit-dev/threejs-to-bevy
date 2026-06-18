# V5-09 Functional Visual Quality Scene

Complexity: 8 -> HIGH mode

## Context

**Problem:** V5 requires a maintained functional 3D scene that demonstrates
promoted visual features. Existing scenes are V3 or V4-specific and should not
be overloaded with new V5 release claims.

## Solution

Promote the maintained V5 functional scene that uses `assets-source/environment`
where practical and ties nonvisual hardening work to shared fixtures, runtime
observations, diagnostics, and artifacts.

## Execution Phases

#### Phase 1: Contract Scene Skeleton

**Files:**

- `examples/v5-functional/*`
- optional `templates/v5-visual-quality/*`
- example/template tests
- `scripts/verify-v5.mjs`
- `docs/verify-v5.md`

**Implementation:**

- [x] Build a self-contained portable bundle.
- [x] Use only promoted V5 contracts or explicitly documented prior contracts.
- [x] Include environment assets that show textures, lighting, atmosphere,
  instancing, LOD, budgets, movement, animation, or particles only when those
  features have landed.

#### Phase 2: Web and Bevy Evidence

**Files:**

- `scripts/verify-v5.mjs`
- `packages/cli/src/verify/*`
- `runtime-bevy/crates/threenative_runtime/tests/*`
- `docs/verify-v5.md`

**Implementation:**

- [x] Capture web screenshots, visual observations, budget reports, and
  diagnostics.
- [x] Capture Bevy observed summaries and screenshots where practical.
- [x] Link artifacts from the V5 visual-quality report.
- [x] Avoid claiming editor, online, networking, or plugin support.

## Verification Strategy

- `pnpm tn -- build --project examples/v5-functional`
- `pnpm verify:v5`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] The V5 scene visibly exercises most promoted visual features.
- [x] Scene artifacts are deterministic enough for AI/local verification.
- [x] Web and Bevy evidence exists for every scene-visible feature that claims
  cross-runtime support.
- [x] Unsupported visual ambitions remain future scope, not accidental V5
  claims.

## Implementation Evidence

- `examples/v5-functional` is the maintained V5 visual-quality scene and emits
  a self-contained portable bundle.
- `pnpm verify:v5` builds and validates the scene, captures web visual evidence,
  writes dense-content budget evidence, and records artifact links under
  `tools/verify/artifacts/milestones/v5/verification-report.json`.
- Existing shared conformance and Rust runtime tests provide Bevy observations
  for the promoted V5 contracts used by the scene, while native renderer-level
  instancing and runtime mesh LOD swapping remain documented drift.
- `docs/verify-v5.md` documents the current gate and explicitly excludes
  editor, online, networking, plugin, custom renderer, and unlanded visual
  ambitions.
