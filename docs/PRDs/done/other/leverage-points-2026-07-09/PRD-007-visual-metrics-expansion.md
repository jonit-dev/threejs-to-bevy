# PRD-007: Visual Metrics Expansion

## Status

Implemented

## Context

Rendering, materials, UI fit, and game quality are visually sensitive. Existing
render-look, photoreal, shader material, and visual parity gates already use
screenshots, reports, and region metrics. The next leverage is to add compact,
named visual metrics only where they back promoted claims or release-quality
game evidence.

## Goal

Expand fixture-backed visual metrics for rendering and game quality without
creating broad screenshot dumps or subjective manual-only review.

## Non-Goals

- Do not require pixel-perfect parity.
- Do not add visual metrics for unpromoted features unless they are
  diagnostics-only.
- Do not store large artifact sets when contact sheets and metrics are enough.

## Requirements

1. Define metric bundles for material/lighting probes, camera framing, UI fit,
   nonblank/contrast, visual-quality diversity, and effect-specific regions.
2. Attach each metric bundle to a fixture or generated-game proof need.
3. Emit compact metrics JSON and contact sheets.
4. Keep thresholds feature-specific and explain report-only versus enforced
   status.

## Execution Phases

### Phase 1: Metric Inventory

- [x] Inventory existing region metrics and visual-quality scoring.
- [x] Identify duplicate screenshot checks that can become named metric
      bundles.
- [x] Pick one rendering fixture and one generated-game proof for the first
      expansion.

### Phase 2: Metric Bundles

- [x] Add reusable metric helpers for named regions, luminance/contrast,
      color-bucket diversity, edge/framing, and UI bounds.
- [x] Add stable diagnostic codes for threshold misses.
- [x] Produce compact contact sheets and metrics JSON.

### Phase 3: Gate Wiring

- [x] Wire the rendering fixture metric into the relevant focused gate.
- [x] Wire the game-quality metric into generated-game proof or QA scoring.
- [x] Document enforced, calibrating, and report-only thresholds.

## Files Likely Touched

- `tools/verify/src/*visual*`
- `tools/verify/src/renderLook*.ts`
- `tools/verify/src/renderingPhotoreal*.ts`
- `packages/cli/src/verify/renderingQuality.ts`
- `tools/verify/src/gameProductionGateProofs.ts`
- `tools/verify/artifacts/*`
- `docs/status/capabilities/rendering.md`
- `docs/status/capabilities/game-production.md`

## Verification

- `pnpm verify:render-look`
- `pnpm verify:rendering-photoreal`
- `pnpm verify:generated-games` when game-quality proof changes.
- Focused unit tests for metric helpers.

## Acceptance Criteria

- [x] At least one rendering fixture and one generated-game proof use reusable
      metric bundles.
- [x] Reports include compact metrics JSON and contact-sheet paths.
- [x] Threshold diagnostics identify the metric, region, expected range, and
      artifact path.
- [x] Status docs link only metrics that support changed claims.

## Implementation Notes

- Rendering parity checks now use reusable named-region metric bundles for the
  rendering-quality and rendering-lights fixtures while preserving existing
  focused gate reports, metrics, diffs, and contact sheets.
- `tn game qa --run-proof` writes a compact `game-quality` metric bundle into
  `artifacts/game-production/visual-quality.json`; the generated-game aggregate
  gate requires that bundle, validates it passed, and rejects stale bundle
  values that no longer match the top-level screenshot metrics.
- Enforced generated-game visual-quality metrics remain screenshot nonblank,
  projected bounds, color-bucket diversity, local contrast, PNG existence, PNG
  dimensions, and the reusable `game-quality` bundle. Rendering fixture region
  thresholds are fixture-specific visual parity gates, not broad pixel-perfect
  parity claims.

Verification:

- `pnpm --filter @threenative/cli test -- --run "rendering quality|visual metric bundle"`
- `pnpm --filter @threenative/verify-tools test -- --run "visual-quality proof|visual metric|generated-game visual"`
