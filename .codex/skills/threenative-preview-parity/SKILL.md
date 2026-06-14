---
name: threenative-preview-parity
description: Regenerate and inspect the ThreeNative V3 Preview_2 target vs Three.js vs Bevy benchmark contact sheet. Use when the user asks for the Preview_2 comparison image, Three.js/Bevy visual benchmarking, side-by-side parity screenshots, target-vs-output sheets, or current V3 forest visual artifacts.
---

# ThreeNative Preview Parity

Use this skill in the `threejs-to-benvy` repo when the user wants the richer
V3 benchmark screenshot that shows the target image, Three.js output, and Bevy
GLTF output for each bookmark.

## Source Of Truth

Run the repo verifier. Do not manually stitch screenshots unless the verifier
is broken and the task is to debug the verifier.

```bash
pnpm verify:v3 -- --json
```

This regenerates the current-code artifact:

```txt
artifacts/v3/screenshots/preview2-target-vs-output.png
```

It also writes the simpler runtime-only sheet:

```txt
artifacts/v3/screenshots/threejs-bevy-side-by-side.png
```

## Required Checks

After running `verify:v3`, inspect:

```bash
jq '{status,artifacts,nativeSmoke}' artifacts/v3/v3-scene-report.json
```

Confirm:

- `status` is `pass`.
- `artifacts.targetVsOutputContactSheetPath` points to
  `artifacts/v3/screenshots/preview2-target-vs-output.png`.
- `nativeSmoke.status` is `pass`.
- `nativeSmoke.visualParity` is reported honestly. Current V3 captures are
  useful benchmark evidence, but objective pixel parity is not asserted.

Then visually inspect:

```txt
artifacts/v3/screenshots/preview2-target-vs-output.png
```

The expected layout has three rows for `bookmark.bend`, `bookmark.entry`, and
`bookmark.midPath`. Each row has:

- `Preview_2 target`
- `Three.js output`
- `Bevy GLTF output`

## Reporting

Report the exact command and artifact path:

```txt
Command: pnpm verify:v3 -- --json
Report: artifacts/v3/v3-scene-report.json
Benchmark sheet: artifacts/v3/screenshots/preview2-target-vs-output.png
Parity status: not-asserted unless the report says otherwise
```

If the verifier fails before screenshots, fix the failing gate narrowly only
when it is obvious docs/tooling drift. Otherwise report the failing step and do
not claim the screenshot was refreshed.
