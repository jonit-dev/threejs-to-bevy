# PRD-007: Visual Metrics Expansion

## Status

Proposed

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

- [ ] Inventory existing region metrics and visual-quality scoring.
- [ ] Identify duplicate screenshot checks that can become named metric
      bundles.
- [ ] Pick one rendering fixture and one generated-game proof for the first
      expansion.

### Phase 2: Metric Bundles

- [ ] Add reusable metric helpers for named regions, luminance/contrast,
      color-bucket diversity, edge/framing, and UI bounds.
- [ ] Add stable diagnostic codes for threshold misses.
- [ ] Produce compact contact sheets and metrics JSON.

### Phase 3: Gate Wiring

- [ ] Wire the rendering fixture metric into the relevant focused gate.
- [ ] Wire the game-quality metric into generated-game proof or QA scoring.
- [ ] Document enforced, calibrating, and report-only thresholds.

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

- [ ] At least one rendering fixture and one generated-game proof use reusable
      metric bundles.
- [ ] Reports include compact metrics JSON and contact-sheet paths.
- [ ] Threshold diagnostics identify the metric, region, expected range, and
      artifact path.
- [ ] Status docs link only metrics that support changed claims.
