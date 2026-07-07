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
- Static deploy workflow:
  `.github/workflows/metro-surfer-heist-pages.yml`.
- Human playtest note template: `PLAYTEST-NOTE.md`.
- Aggregate generated-game report:
  `tools/verify/artifacts/game-production/verification-report.json`.

## Friction Items

| Item | Evidence | Follow-up |
| --- | --- | --- |
| External public hosting is not yet proved. | `.github/workflows/metro-surfer-heist-pages.yml` now builds, verifies, uploads, and deploys the static Metro release through GitHub Pages, but no successful external run or public URL is recorded in this workspace. | Run the workflow from `main`, record the Pages URL, and smoke-test the public URL. |
| Runtime web preview originally pulled Node-only loaders into the static browser bundle. | Initial local Pages-style verification failed on `node:fs/promises` and then `node:path`. The runtime now has browser-safe bundle/system loaders and passes `tn verify --url http://127.0.0.1:4177/threejs-to-bevy/?bundle=./bundle --frames 3 --expect-motion --json`; raw pass is `artifacts/verify/verification-report.json`. | Keep browser entries isolated from modules that contain Node dynamic imports; add this static Pages shape to release automation. |
| Example-local `pnpm run build` originally failed in a checkout without example-local `node_modules/.bin/tn`. | Fixed for Metro by routing package scripts through `pnpm run tn -- ...`, where `tn` resolves `node ../../packages/cli/dist/index.js`. | Generalize the same workspace CLI fallback into generated example templates if future shipped games need example-local scripts. |
| Failed-state key retry was hard to prove deterministically in headless browser playtests. | `KeyR`, `Enter`, and held-key variants did not produce a reset in the failed-state branch under the harness. | Keep manual retry support, but also expose deterministic retry recovery state (`retryTimer`, `restartGrace`, `lastFailReason`) so fail/retry can be proved. |
| Asset catalog lookup was unavailable during production. | `threenative.config.json` records `TN_ASSET_SOURCE_CATALOG_FAILED` for runner and urban searches. | Make the asset-source SQLite catalog available to generated examples or improve the diagnostic with repair steps. |
| Local custom assets lack third-party provenance URLs. | `CREDITS.md` can only classify them as local project assets. | Require generated/local asset manifests to record creation tool, date, and license posture. |
| Existing production proof is strong but not a five-minute human playtest transcript. | QA/release artifacts prove build, motion, visual quality, budgets, and release blockers, and `PLAYTEST-NOTE.md` now defines the note shape, but no completed human session note exists. | Fill the template after a human playtest against the published URL. |

## Non-Goals

- Do not add raw Three.js, DOM, Bevy/Rust gameplay, filesystem, timer, or
  network APIs to improve this one game.
- Do not claim embedded Tauri/Wry packaging from the desktop-web local-server
  package path.
