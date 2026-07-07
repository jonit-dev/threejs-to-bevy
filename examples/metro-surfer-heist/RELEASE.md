# Metro Surfer Heist Release Notes

## Status

Local release-ready, externally unhosted.

The game passes its local production evidence and the aggregate generated-game
gate. A public URL is not recorded because this workspace has no configured
external static hosting target or credentials.

## Evidence

- `artifacts/game-production/qa-report.json`: `ok: true`, zero blockers, zero
  diagnostics, zero release risks, all proof steps passing.
- `artifacts/game-production/release-report.json`: `ok: true`, zero blockers,
  zero diagnostics, zero release risks.
- `artifacts/playtest/progression/latest/summary.json`: `TN_PLAYTEST_OK`
  proof for movement, distance/HUD state changes, speed, and playable phase.
- `artifacts/playtest/fail-gate/latest/summary.json`: `TN_PLAYTEST_OK`
  proof that the low-gate failure is recorded and the game recovers to play.
- `artifacts/playtest/fail-retry/latest/summary.json`: `TN_PLAYTEST_OK`
  proof that fail/retry returns to a clean playable state while preserving
  `lastFailReason` evidence.
- `artifacts/game-production/visual-quality.json`: `status: "pass"`,
  nonblank screenshot proof, visible projected bounds, color variety, and local
  contrast metrics.
- `artifacts/game-production/performance.json`: `status: "pass"`.
- `artifacts/game-production/asset-budget.json`: `status: "pass"`.
- `artifacts/game-production/ui-fit.json`: `status: "pass"`.
- `artifacts/game-production/screenshot.png`: desktop screenshot proof.
- `artifacts/game-production/mobile-viewport.png`: mobile viewport proof.
- `artifacts/game-production/motion.webm`: visible motion proof.

## Run Locally

From the repo root:

```bash
node packages/cli/dist/index.js build --project examples/metro-surfer-heist --json
node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/progression.playtest.json --stable-artifacts --json
node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/fail-retry.playtest.json --stable-artifacts --json
node packages/cli/dist/index.js game qa --project examples/metro-surfer-heist --run-proof --entity runner --press KeyD --expect-axis x --json
node packages/cli/dist/index.js game release --project examples/metro-surfer-heist --json
```

For interactive web play:

```bash
cd examples/metro-surfer-heist
pnpm run dev:web
```

## Ship Blocker

External hosting remains the only PRD-012 acceptance blocker. The next step is
to add a static hosting workflow or deploy target for this example and record
the public URL here.
