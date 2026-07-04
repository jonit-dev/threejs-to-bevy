# Visual Parity Policy

V3 does not require pixel-perfect parity between Three.js and Bevy.

## V3 Requires

- same bundle data loads
- same camera bookmarks are meaningful
- same major asset classes are visible
- screenshots are nonblank
- scale and orientation are plausible and documented
- lighting and atmosphere drift is known
- screenshots are useful for review and debugging
- side-by-side artifacts are produced for bookmarked views

## V3 Does Not Require

- identical fog
- identical shadow maps
- identical material response
- identical tone mapping or color grading
- identical frame composition at pixel level
- production-quality native first-person interaction

## Current Objective Tools

Use generic screenshot comparison for measured deltas:

```bash
pnpm tn -- compare-images <threejs.png> <bevy.png> --json
```

Metrics currently include changed-pixel ratio, average brightness delta, and
average RGB deltas.

## Reporting Rule

If visual parity is inspected manually, say so. Do not report it as an asserted
gate unless a verifier wrote a pass/fail result.

## Render Look Profiles

Render look profiles separate strict comparison output from game-quality
defaults:

- `parity` is required for conformance, migration, regression, and visual
  calibration fixtures that need neutral deterministic output.
- `balanced` is the maintained-starter default for new playable projects and is
  allowed to apply supported tone mapping, exposure, bloom, antialiasing,
  shadow, and environment-intensity semantics.
- Missing `renderer.renderLook` remains equivalent to `parity`, so existing
  projects do not silently inherit richer output.

Do not tune adapter colors, lights, or materials to force `balanced` to match
`parity`, and do not tune `parity` fixtures to look more polished. `balanced`
quality proof is metric and artifact based; it must show a visibly richer
result without creating pixel-perfect web/Bevy expectations.

Use `pnpm verify:render-look` for the focused render-look threshold check. The
gate captures parity and balanced web plus Bevy screenshots by default and
compares screenshot-derived web metrics. A passing report uses
`evidenceMode: "captured-screenshots"` and writes the screenshot paths under
`tools/verify/artifacts/render-look/screenshots/`. This remains a focused
quality gate until promoted into the release profile.

## V9 Visual Matrix

`pnpm verify:v9` runs the compact V9 visual matrix after sample scenes build.
Evidence is written under `tools/verify/artifacts/visual-matrix/` per scene:

- `web.png`, `bevy.png`, `diff.png`, and `contact-sheet.png` for smoke/region scenes
- motion screenshots and contact sheets for skeletal animation
- `verification-report.json` aggregate with `TN_V9_VISUAL_BLANK` and
  `TN_V9_VISUAL_REGION_MISSING` diagnostics

Use focused `pnpm verify:v9:rendering-lights` when adjusting region thresholds for
the skybox-environment fixture. Use the visual matrix for latest-merge smoke and
nonblank/framing coverage across animation, particles, physics, assets, and
rendering sample/fixture scenes.

## V10 Visual Calibration

`pnpm verify:v10:visual-calibration` is the cross-runtime calibration gate for
V10 advanced rendering promotion. It uses a versioned manifest under
`scripts/visual-calibration/manifest.mjs` to define isolated factor fixtures and
a combined scene with explicit sample regions, thresholds, and failure hints.

Calibration policy:

- promoted factors fail the gate when drift exceeds their declared thresholds
- report-only factors (for example advanced post or atmospheric probes) write
  diagnostics but do not fail the promoted gate by themselves
- threshold changes require artifact evidence and PRD/status notes; do not loosen
  thresholds without updating the manifest version and recording why
- unlit/color factors use strict thresholds; lit PBR, atmosphere, and combined
  scene factors use calibrated tolerances documented in the manifest

Useful commands:

```bash
pnpm verify:v10:visual-calibration -- --list
pnpm verify:v10:visual-calibration -- --group color,materials
pnpm verify:v10:visual-calibration -- --manifest-only
```

Evidence is written under `tools/verify/artifacts/visual-calibration/`, including
`manifest-report.json` and the aggregate `verification-report.json`. Calibration
failures emit `TN_VERIFY_VISUAL_CALIBRATION_*` diagnostics with fixture, factor,
region, metric, threshold, observed value, and artifact paths when available.
