---
name: threenative-performance-debugging
description: Root-cause ThreeNative performance issues in this repo. Use for native or web playtest FPS investigations, Bevy proof-harness frame timing, browser/headless FPS confusion, texture or material runtime performance, runtime-trace analysis, and script-vs-render isolation.
---

# ThreeNative Performance Debugging

## Workflow

1. Establish the target, project, and scenario before changing code.
   - Target: web, native/Bevy, or both.
   - Project/example path and scenario name or exact `tn playtest` command.
   - Claimed symptom: low FPS, frame spikes, warmup delay, texture/material cost, script cost, or mismatch between browser and native measurements.

2. Build or rebuild only the relevant runtime path.
   - Native/Bevy proof-harness work usually needs the runtime rebuilt before retesting.
   - Web/headless work should distinguish browser timing limits, CI/headless throttling, and actual adapter/render cost.

3. Collect fresh playtest artifacts with a stable output location.
   - Prefer `tn playtest --project <path> --scenario <file-or-name> --target <target> --stable-artifacts --json`.
   - Preserve `summary.json`, screenshots when present, `native-frame-samples.json`, `runtime-trace.json`, diagnostics, and the reproduction command.

4. Inspect frame evidence before editing.
   - Summarize `native-frame-samples.json` across all frames, `dropFirst`, startup-only, after tick 10, and after tick 20.
   - Inspect `runtime-trace.json` for asset load, script tick, material/texture, render, and adapter events. Treat trace field names as repo artifacts, not a fixed external schema.
   - Separate startup/warmup from steady-state. Do not report an all-frames average as gameplay FPS when early asset loading dominates it.

5. Isolate with controlled bundle variants.
   - Baseline current bundle first.
   - No systems/scripts variant: disable gameplay systems while keeping scene/render inputs stable to estimate script cost.
   - No textures/material-heavy variant: remove or replace texture references through durable source or controlled generated test fixtures to estimate upload/sampling/material cost.
   - Keep camera, authored transforms, object counts, lighting intent, and target runtime stable enough for comparison.

6. Respect ThreeNative boundaries.
   - Do not tune colors, materials, lights, or art direction just to improve screenshots or FPS.
   - Do not fix bugs by editing `dist/**`, emitted bundle JSON, `scripts.bundle.js`, or other generated artifacts unless a repo command explicitly marks them source-persistable.
   - Repair durable source, scripts, adapter mapping, runtime code, or verification harnesses according to the owner of the measured problem.

7. Verify narrowly, then broaden only when needed.
   - Rerun the smallest playtest proving the performance claim.
   - For shared runtime contracts or adapter behavior, include the relevant conformance or release gate after the focused proof.
   - Report exact commands, artifact paths, sample windows, FPS/frame-ms summaries, and remaining uncertainty.

## Helper

Use `scripts/summarize-native-frame-samples.mjs <native-frame-samples.json>` to print frame timing summaries. It is a diagnostic helper only; conclusions still require reading traces and comparing controlled runs.
