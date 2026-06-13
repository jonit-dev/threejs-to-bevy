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
