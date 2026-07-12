---
name: lighting-parity-report
description: Compare web (Three.js) vs native (Bevy) lighting-showcase captures in the threejs-to-bevy repo, quantify the gap with the existing gate metrics, and produce a ranked next-steps parity report. Use when asked to check rendering parity, compare the lumen-lite-showcase screenshots, tune native lighting constants toward web, or write a web-vs-native gap/next-steps report.
---

# Lighting Parity Report (threejs-to-bevy)

Repo: `~/projects/threejs-to-bevy`. Web (Three.js) is the quality reference;
native (Bevy) is calibrated toward it. Never judge parity from stale
screenshots — always recapture first.

## Workflow

### 1. Recapture and gate

```bash
cd ~/projects/threejs-to-bevy
tn iterate --project examples/lumen-lite-showcase --json
pnpm verify:focused verify:lighting-showcase
```

This rebuilds the example bundle, captures deterministic 1280x720 frames on
both backends, and writes everything under
`tools/verify/artifacts/lighting-showcase/`:

- `screenshots/lumen-lite-showcase.{web,native}.png`
- `verification-report.json` — paired metrics + gate diagnostics
- `reports/lumen-lite-showcase.{web,native}.report.json` — per-adapter feature
  reports (applied vs approximation-reported features)
- `contact-sheet.svg` — side-by-side sheet

### 2. Read the metrics before the pixels

Parse `verification-report.json` → `.metrics.native` vs `.metrics.web`. Key
fields and what a mismatch means:

| Metric | Mismatch reads as | Primary knob (native) |
| --- | --- | --- |
| meanLuminance, shadowFraction | overall exposure / lifted shadows | flat-ambient multiplier `native_ssgi_ambient_multiplier` in `runtime-bevy/crates/threenative_runtime/src/rendering.rs` (NOT exposure — grading source is already `renderer.colorGrading` via `map_world.rs`) |
| hazeGradientRatio, floorHazeLuminance | room haze breadth / height falloff | `NATIVE_VOLUMETRIC_BASE_SCATTERING`, `NATIVE_VOLUMETRIC_SCATTERING_ASYMMETRY` in `rendering.rs` (see `PARITY-GUIDE-volumetrics-and-godrays.md`) |
| shaftRatio, shaftLuminance | god-ray crispness vs haze | same volumetric constants + `NATIVE_VOLUMETRIC_LIGHT_INTENSITY_SCALE` |
| bloomHaloLuminance, highlightFraction | window glow / clipping | `bloom_settings_for_runtime` in `map_world.rs` (threshold/softness from authored config) |
| surfaceDetailEnergy | texture/GI detail | showcase is intentionally flat portable PBR on both; if web is high, check whether it is SSGI temporal noise (recapture web with SSGI off) before blaming materials |
| warmChroma | color temperature / ambient tint | SSGI ambient color + flat ambient |
| SSGI intensity overall | bounce light | `ssgi_postprocess.rs` (`intensity * 0.4` must stay aligned with web `ssgiPass.ts` `* 0.4`) |

Gate bounds live in `tools/verify/src/lightingShowcaseGate.ts`
(`validateLightingShowcaseEvidence`). A passing gate does NOT mean parity —
report headroom to each bound (e.g. "detail ratio 0.38 vs floor 0.3").

### 3. Look at the images

Read both PNGs side by side (and the contact sheet). Optionally quantify:

```bash
cd tools/verify/artifacts/lighting-showcase/screenshots
magick lumen-lite-showcase.native.png -colorspace gray -format "native %[fx:mean] %[fx:standard_deviation]\n" info:
magick lumen-lite-showcase.web.png    -colorspace gray -format "web    %[fx:mean] %[fx:standard_deviation]\n" info:
magick compare -metric RMSE lumen-lite-showcase.native.png lumen-lite-showcase.web.png /tmp/parity-diff.png
```

Checklist per region: window panes (clipping/mullion detail), shaft width and
haze breadth, ceiling GI gradient, wall/floor tone, floor wet patches
(reflection vs pale fallback — native has no SSR, a documented Bevy 0.14
boundary), debris contact shadows, crate/shelf colors on the right.

### 4. Known context — do not re-litigate

- `GAP-ANALYSIS-web-vs-native-2026-07-11.md` and
  `NEXT-STEPS-parity-2026-07-11.md` in
  `docs/PRDs/done/lumen-lite-lighting-2026-07-09/` record resolved history:
  the giant-blue-box bug (stale bundle + web SSR thickness, now 0.02 via
  `webScreenSpaceReflectionThickness()`), bloom/grading source fixes, SSGI and
  volumetric calibration.
- Native SSR is a documented upstream boundary (Bevy 0.14 deferred irradiance
  defect) — treat as approximation-reported, not a bug.
- Web-only `StylizedNature` 8x8 detail tiling is outside the showcase claim.

### 5. Tune (only if asked to close gaps, not just report)

One constant per iteration → rerun step 1 → diff metrics. Judge by metric
deltas first, eyes second. Never change two coupled knobs (ambient + haze) in
one pass. Run the wider suite before claiming done:

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm verify:conformance
```

### 6. Write the report

Save as `docs/PRDs/done/lumen-lite-lighting-2026-07-09/NEXT-STEPS-parity-<date>.md`
(or update the existing one). Structure:

1. Status table of previously identified gaps (resolved / de-scoped / left).
2. Metrics table: native vs web vs gate bound vs headroom, flagging the
   bounds closest to failing.
3. Ranked remaining gaps — each with: what is visible in the captures, the
   metric evidence, the exact file/constant to change, and the target value or
   calibration procedure.
4. Gate-ratchet step: once gaps close, tighten the bounds in
   `lightingShowcaseGate.ts` (+ its test) so progress locks in.
5. Verification loop commands.

Repo doc rules: capability changes must update
`docs/status/capabilities/rendering.md` plus the one-line `docs/STATUS.md`
index entry; parity-claim changes must update `docs/bevy-feature-parity.md`.
