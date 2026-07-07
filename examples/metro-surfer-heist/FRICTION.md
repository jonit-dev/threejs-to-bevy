# Metro Surfer Heist Friction Report

## Summary

Metro Surfer Heist is locally release-ready, passes the generated-game gate,
and now passes a local Pages-style static web verification. It is not
externally hosted from this workspace. The release evidence is strong enough
to validate the game-production loop; the remaining blockers are a deploy
target/credentials and a human five-minute playtest note.

## Raw Evidence

- Production plan: `artifacts/game-production/plan.json`.
- QA report: `artifacts/game-production/qa-report.json`.
- Release report: `artifacts/game-production/release-report.json`.
- Progression playtest: `artifacts/playtest/progression/latest/summary.json`.
- Fail-gate playtest: `artifacts/playtest/fail-gate/latest/summary.json`.
- Fail-retry playtest: `artifacts/playtest/fail-retry/latest/summary.json`.
- Screenshot: `artifacts/game-production/screenshot.png`.
- Motion proof: `artifacts/game-production/motion.webm`.
- Visual quality: `artifacts/game-production/visual-quality.json`.
- Local static web verification: `artifacts/verify/verification-report.json`.
- Aggregate generated-game report:
  `tools/verify/artifacts/game-production/verification-report.json`.

## Friction Items

| Item | Evidence | Follow-up |
| --- | --- | --- |
| External public hosting is not configured in this repo. | No pages/deploy workflow or public URL exists for `examples/metro-surfer-heist`. | Add a deploy PRD or workflow for static example publishing. |
| Runtime web preview originally pulled Node-only loaders into the static browser bundle. | Initial local Pages-style verification failed on `node:fs/promises` and then `node:path`. The runtime now has browser-safe bundle/system loaders and passes `tn verify --url http://127.0.0.1:4177/threejs-to-bevy/?bundle=./bundle --frames 3 --expect-motion --json`; raw pass is `artifacts/verify/verification-report.json`. | Keep browser entries isolated from modules that contain Node dynamic imports; add this static Pages shape to release automation. |
| Example-local `pnpm run build` can fail in a checkout without example-local `node_modules/.bin/tn`. | In this workspace `pnpm run build` and `pnpm run playtest` from `examples/metro-surfer-heist` failed with `tn: command not found`; repo-root `node packages/cli/dist/index.js ...` commands passed. | Make generated example scripts resolve the workspace CLI or document repo-root commands as the supported no-install fallback. |
| Failed-state key retry was hard to prove deterministically in headless browser playtests. | `KeyR`, `Enter`, and held-key variants did not produce a reset in the failed-state branch under the harness. | Keep manual retry support, but also expose deterministic retry recovery state (`retryTimer`, `restartGrace`, `lastFailReason`) so fail/retry can be proved. |
| Asset catalog lookup was unavailable during production. | `threenative.config.json` records `TN_ASSET_SOURCE_CATALOG_FAILED` for runner and urban searches. | Make the asset-source SQLite catalog available to generated examples or improve the diagnostic with repair steps. |
| Local custom assets lack third-party provenance URLs. | `CREDITS.md` can only classify them as local project assets. | Require generated/local asset manifests to record creation tool, date, and license posture. |
| Existing production proof is strong but not a five-minute human playtest transcript. | QA/release artifacts prove build, motion, visual quality, budgets, and release blockers, but no human session note exists. | Add a manual playtest note template for shipped-game releases. |

## Non-Goals

- Do not add raw Three.js, DOM, Bevy/Rust gameplay, filesystem, timer, or
  network APIs to improve this one game.
- Do not claim embedded Tauri/Wry packaging from the desktop-web local-server
  package path.
