# Metro Surfer Heist Friction Report

## Summary

Metro Surfer Heist is locally release-ready and passes the generated-game gate,
but it is not externally hosted from this workspace. The release evidence is
strong enough to validate the game-production loop; the remaining blocker is a
deploy target and credentials.

## Raw Evidence

- Production plan: `artifacts/game-production/plan.json`.
- QA report: `artifacts/game-production/qa-report.json`.
- Release report: `artifacts/game-production/release-report.json`.
- Screenshot: `artifacts/game-production/screenshot.png`.
- Motion proof: `artifacts/game-production/motion.webm`.
- Visual quality: `artifacts/game-production/visual-quality.json`.
- Aggregate generated-game report:
  `tools/verify/artifacts/game-production/verification-report.json`.

## Friction Items

| Item | Evidence | Follow-up |
| --- | --- | --- |
| External public hosting is not configured in this repo. | No pages/deploy workflow or public URL exists for `examples/metro-surfer-heist`. | Add a deploy PRD or workflow for static example publishing. |
| Example-local `pnpm run build` can fail in a checkout without example-local `node_modules/.bin/tn`. | In this workspace `pnpm run build` and `pnpm run playtest` from `examples/metro-surfer-heist` failed with `tn: command not found`; repo-root `node packages/cli/dist/index.js ...` commands passed. | Make generated example scripts resolve the workspace CLI or document repo-root commands as the supported no-install fallback. |
| Asset catalog lookup was unavailable during production. | `threenative.config.json` records `TN_ASSET_SOURCE_CATALOG_FAILED` for runner and urban searches. | Make the asset-source SQLite catalog available to generated examples or improve the diagnostic with repair steps. |
| Local custom assets lack third-party provenance URLs. | `CREDITS.md` can only classify them as local project assets. | Require generated/local asset manifests to record creation tool, date, and license posture. |
| Existing production proof is strong but not a five-minute human playtest transcript. | QA/release artifacts prove build, motion, visual quality, budgets, and release blockers, but no human session note exists. | Add a manual playtest note template for shipped-game releases. |

## Non-Goals

- Do not add raw Three.js, DOM, Bevy/Rust gameplay, filesystem, timer, or
  network APIs to improve this one game.
- Do not claim embedded Tauri/Wry packaging from the desktop-web local-server
  package path.
