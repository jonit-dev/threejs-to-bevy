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

## V9 Visual Matrix

`pnpm verify:v9` runs the compact V9 visual matrix after sample scenes build.
Evidence is written under `artifacts/v9/visual-matrix/` per scene:

- `web.png`, `bevy.png`, `diff.png`, and `contact-sheet.png` for smoke/region scenes
- motion screenshots and contact sheets for skeletal animation
- `verification-report.json` aggregate with `TN_V9_VISUAL_BLANK` and
  `TN_V9_VISUAL_REGION_MISSING` diagnostics

Use focused `pnpm verify:v9:rendering-lights` when adjusting region thresholds for
the skybox-environment fixture. Use the visual matrix for latest-merge smoke and
nonblank/framing coverage across animation, particles, physics, assets, and
rendering sample/fixture scenes.
