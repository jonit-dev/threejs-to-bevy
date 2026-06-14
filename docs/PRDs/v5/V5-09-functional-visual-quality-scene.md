# V5-09 Functional Visual Quality Scene

Complexity: 8 -> HIGH mode

## Context

**Problem:** V5 requires a maintained functional 3D scene that demonstrates
promoted visual features. Existing scenes are V3 or V4-specific and should not
be overloaded with new V5 release claims.

## Solution

Add a V5 scene that uses `assets-source/environment` where practical and ties
nonvisual hardening work to shared fixtures, runtime observations, diagnostics,
and artifacts.

## Execution Phases

#### Phase 1: Contract Scene Skeleton

**Files:**

- `examples/v5-visual-quality/*`
- optional `templates/v5-visual-quality/*`
- example/template tests

**Implementation:**

- [ ] Build a self-contained portable bundle.
- [ ] Use only promoted V5 contracts or explicitly documented prior contracts.
- [ ] Include environment assets that show textures, lighting, atmosphere,
  instancing, LOD, budgets, movement, animation, or particles only when those
  features have landed.

#### Phase 2: Web and Bevy Evidence

**Files:**

- `scripts/verify-v5.mjs`
- `packages/cli/src/verify/*`
- `runtime-bevy/crates/threenative_runtime/tests/*`
- `docs/verify-v5.md`

**Implementation:**

- [ ] Capture web screenshots, visual observations, budget reports, and
  diagnostics.
- [ ] Capture Bevy observed summaries and screenshots where practical.
- [ ] Link artifacts from the V5 aggregate report.
- [ ] Avoid claiming editor, online, networking, or plugin support.

## Verification Strategy

- `pnpm tn -- build --project examples/v5-visual-quality`
- `pnpm verify:v5`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] The V5 scene visibly exercises most promoted visual features.
- [ ] Scene artifacts are deterministic enough for AI/local verification.
- [ ] Web and Bevy evidence exists for every scene-visible feature that claims
  cross-runtime support.
- [ ] Unsupported visual ambitions remain future scope, not accidental V5
  claims.

