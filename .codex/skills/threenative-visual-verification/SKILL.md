---
name: threenative-visual-verification
description: Use this skill in the threejs-to-benvy repo when verifying V1 web rendering, comparing screenshots, inspecting visual artifacts, or iterating on blank canvas, framing, lighting, color, or frame-change issues.
---

# ThreeNative Visual Verification

Use the repo CLI as the source of truth. Do not replace it with ad hoc browser checks unless the CLI is broken and you are debugging the CLI itself.

## Fast Loop

1. Build once when source changed:
   ```bash
   pnpm tn -- build --project examples/v1-canonical
   ```
2. Start or reuse a web preview when repeatedly iterating:
   ```bash
   pnpm tn -- dev --target web --project examples/v1-canonical --json
   ```
3. Reuse that URL for quick verification:
   ```bash
   pnpm tn -- verify --project examples/v1-canonical --url <preview-url> --frames 2 --json
   ```

   After `pnpm --filter @threenative/cli build`, the fastest inner loop is:
   ```bash
   node packages/cli/dist/index.js verify --project examples/v1-canonical --url <preview-url> --frames 2 --json
   ```

When no preview is running, use the full command:

```bash
pnpm tn -- verify --project examples/v1-canonical --frames 2 --json
```

## Artifacts To Inspect

The verifier writes:

- `examples/v1-canonical/artifacts/verify/frame-01.png`
- `examples/v1-canonical/artifacts/verify/frame-02.png`
- `examples/v1-canonical/artifacts/verify/verification-report.json`

Always inspect the JSON report before deciding the scene is visually correct. It includes:

- `status`
- `diagnostics`
- `previewUrl`
- screenshot paths
- canvas size
- nonblank ratio
- frame diff ratio
- average brightness delta
- average RGB deltas
- browser console logs, page errors, request failures, and runtime readiness data

## Screenshot Comparison

Use this when comparing two saved PNGs, including subtle lighting/color changes:

```bash
pnpm tn -- compare-images <first.png> <second.png> --json
```

Look at:

- `changedPixelRatio` for structural/image changes
- `averageBrightnessDelta` for lightening/darkening
- `averageColorDelta.red|green|blue` for color shifts

## Iteration Rules

- If the canvas is missing or zero-sized, inspect runtime-web and browser errors first.
- If the screenshot is blank, inspect camera/framing, transforms, lights, material colors, and runtime diagnostics.
- If the frame diff is zero but motion was expected, rerun with `--expect-motion` and inspect animation/runtime code.
- Keep generated screenshots and reports only when they are deliberate evidence for a PRD or debugging handoff.
