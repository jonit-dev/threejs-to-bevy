# Contact Shadows Cross-Runtime Calibration — Diagnosis and Fix Instructions

Date: 2026-07-10
Scope: `verify:contact-shadows` parity failure (`TN_VERIFY_CONTACT_SHADOW_VISUAL_PARITY_MISMATCH`)
Evidence: `tools/verify/artifacts/contact-shadows/screenshots/contact-shadows-grounding.{web,native}.png`
(canonical, captured at `THREE_COMPAT_CAMERA_EXPOSURE_SCALE = 1.0`)

## TL;DR

The shadows are already at parity. Measured **normalized** pool contrast
(contrast / ground luminance) differs by only 0.015 (low pool) and 0.027
(high pool) — both inside the 0.04 envelope. The gate fails because it
compares **absolute** contrast, which scales with ground brightness, and the
native ground is ~27% darker in encoded output (~2.0x darker in linear light).

That 2.0x is not an arbitrary drift. It is the product of two documented
tone-mapping/exposure conventions:

1. **three.js ACESFilmic pre-scale**: three multiplies scene color by
   `toneMappingExposure / 0.6` before the ACES fit (a x1.667 boost).
2. **Bevy photometric exposure calibration**: `Exposure::exposure()` returns
   `1.0 / (2^ev100 * 1.2)`, so `ev100 = 0` multiplies light by 0.833, not 1.0.

Combined: `(1 / 0.6) * 1.2 = 2.0` exactly. Measured linear-light ground ratio
from the canonical screenshots: **1.975**. The fixture authors
`colorManagement: { toneMapping: "aces", exposure: 1 }`, so both effects are
active. The experimental `1.15` scale was a step in the right direction but
can never close a 2.0x gap.

## Measured evidence (gate's own metric code, canonical screenshots)

| Metric (gate regions)          | web    | native | note |
|--------------------------------|--------|--------|------|
| centerGroundLuminance          | 0.6138 | 0.4487 | native 27% darker encoded |
| lowOpacityPoolContrast (abs)   | 0.1663 | 0.1150 | delta 0.0513 > 0.04 → FAIL |
| highOpacityPoolContrast (abs)  | 0.2132 | 0.1678 | delta 0.0454 > 0.04 → FAIL |
| lowContrast / centerGround     | 0.271  | 0.256  | delta 0.015 → passes |
| highContrast / centerGround    | 0.347  | 0.374  | delta 0.027 → passes |
| highOpacityPoolMeanGradient    | 0.0048 | 0.0043 | delta 0.0005 < 0.03 → passes |

Inverting the transfer curve (approximate, sRGB EOTF) on the unshadowed ground:
web linear ≈ 0.335, native linear ≈ 0.170 → ratio **1.975 ≈ 2.0 predicted**.
Native absolute contrast also matches the prediction: `0.1663 * (0.4487 /
0.6138) = 0.1216 ≈ 0.115 observed` — i.e. the shadow term is correct and the
entire failure is the global brightness term.

## Root causes

### A. Exposure convention mismatch (dominant, native side)

- `packages/runtime-web-three/src/render.ts:1953-1954` — web sets
  `THREE.ACESFilmicToneMapping` + `toneMappingExposure = 1`. Three's ACES
  shader computes `color * exposure / 0.6` before the fit
  (`ACESFilmicToneMapping` in three's `tonemapping_pars_fragment`).
- `runtime-bevy/crates/threenative_runtime/src/map_world/rendering.rs:48-67`
  (`exposure_for_profile`) — native sets `ev100 = -log2(exposure * SCALE)`.
  Bevy converts ev100 to a multiplier as `1 / (2^ev100 * 1.2)` (the standard
  photometric calibration constant; verify with
  `grep -n "fn exposure" $(cargo metadata --format-version 1 | jq -r ...)` or
  just grep `1.2` in `bevy_render/src/camera/camera.rs` for the pinned Bevy).
- Net: native renders every lit surface at exactly half the web linear
  intensity when the profile is ACES with exposure 1.

### B. Gate metric does not match its own contract (gate side)

`tools/verify/src/contactShadowsGate.ts:94-100` — the diagnostic message says
"normalized pool contrast" but the compared values
(`highOpacityPoolContrast` etc., built at lines 233/236) are **absolute**
luminance differences. Absolute contrast is exposure-dependent, so this gate
silently re-tests global scene brightness — which belongs to the
atmosphere/rendering-look calibration, not the contact-shadow feature.

## Fix instructions

### Step 1 — Replace the ad-hoc 1.15 with the principled exposure mapping

File: `runtime-bevy/crates/threenative_runtime/src/map_world/rendering.rs`
(`exposure_for_profile`) and the constant in
`runtime-bevy/crates/threenative_runtime/src/map_world.rs:87`.

Target multiplier so Bevy matches three for authored exposure `e`:

- toneMapping `"aces"`:  bevy factor must equal `e / 0.6`
  → `ev100 = -log2(e * 2.0)`  (2.0 = 1.2 / 0.6)
- toneMapping `"none"` / absent: bevy factor must equal `e`
  → `ev100 = -log2(e * 1.2)`

Concretely: make the scale tone-mapping-aware instead of one constant, e.g.
`THREE_COMPAT_ACES_EXPOSURE_SCALE: f32 = 2.0` and
`THREE_COMPAT_LINEAR_EXPOSURE_SCALE: f32 = 1.2`, selected by the same
profile/tone-mapping resolution used in `tonemapping_for_profile`
(rendering.rs:69-82). Revert the experimental `1.15`.

Also re-derive `THREE_COMPAT_DEFAULT_CAMERA_EV100` (currently `-0.45`,
map_world.rs:82) from the same rule for the no-colorManagement path:
`-log2(1.2) ≈ -0.263` for linear output. If `-0.45` was tuned against other
fixtures, re-check those fixtures after this change — it may have been
compensating for the same 1.2 constant plus something else.

Caveat: three's `ACESFilmicToneMapping` (Hill fit) and Bevy's
`Tonemapping::AcesFitted` are near but not identical fits; expect a small
residual (<~5%) after the exposure fix, not zero.

### Step 2 — Make the gate compare what it claims: normalized contrast

File: `tools/verify/src/contactShadowsGate.ts`.

1. In `analyzeScreenshot` (or in the comparison at lines 94-100), compare
   `contrast / centerGroundLuminance` across runtimes instead of raw
   contrast. With today's screenshots the deltas become 0.015 / 0.027 —
   passing on merit, and the metric stops double-testing exposure.
   Normalize `highOpacityPoolMeanGradient` by `centerGroundLuminance` too for
   the same reason.
2. Keep brightness honest with an explicit, separately-coded check:
   `|web.centerGroundLuminance - native.centerGroundLuminance| < 0.05`
   emitting its own diagnostic (e.g.
   `TN_VERIFY_CONTACT_SHADOW_GROUND_LUMINANCE_DRIFT`) so global calibration
   drift is still caught but named for what it is. After Step 1 this should
   pass; today it would fail at 0.165, which is correct — it is the real bug.
3. Update `tools/verify/src/cli/run.test.ts` fixtures for the new
   metric/diagnostic shape.

Do Step 2 even if Step 1 lands first — it makes the gate stable under future
small calibration drift and truthful about what it measures.

### Step 3 — Regenerate canonical evidence and run regressions

```bash
pnpm build                      # gate imports from dist/
cargo build -p threenative_runtime --manifest-path runtime-bevy/Cargo.toml
node tools/verify/dist/contactShadowsGate.js   # or the pnpm verify entry that wraps runContactShadowGate
```

Expected after Step 1: native `centerGroundLuminance` ≈ 0.60-0.62,
absolute contrasts within 0.02 of web. Then:

```bash
pnpm test
pnpm verify:conformance
pnpm verify:smoke
```

Watch specifically the atmosphere / lumen-lite / cascaded-shadow visual
gates: the exposure change brightens every ACES-profile native capture by
2.0/1.15 ≈ 1.74x linear, so any gate calibrated against the old darkness
(including anything tuned while `-0.45` / `1.15` were in place) will move.
That is the "broader regression verification" the checkpoint called for —
budget for re-baselining those artifacts, not just re-running them.

### Step 4 — Only then calibrate residual shadow contrast

After exposure parity, re-measure normalized contrasts. Current residuals are
low pool -0.015 (native slightly lighter) and high pool +0.027 (native
slightly darker). If any residual still exceeds the envelope, tune the native
pool alpha/falloff in
`runtime-bevy/crates/threenative_runtime/src/rendering/contact_shadows.rs`
(the capture pipeline already renders with `Tonemapping::None` at line 1064,
so pool texture values are exposure-independent — correct place for a pure
contrast knob). Do NOT touch this before Step 1; today's residuals are inside
the envelope once normalization is fixed.

### Step 5 — Docs (required by repo rules)

- Update `docs/status/capabilities/rendering.md` (exposure mapping now
  tone-mapping-aware; contact-shadow gate normalization) and the one-line
  index entry in `docs/STATUS.md`.
- Update `docs/bevy-feature-parity.md` if it cites the brightness drift or
  the old exposure constants.
- This file: move to `docs/PRDs/done/` when complete.

## What NOT to do

- Do not keep nudging `THREE_COMPAT_CAMERA_EXPOSURE_SCALE` by eye (1.15,
  1.3, ...). The required factor is derivable (2.0 for ACES profiles) and any
  eyeballed value will silently re-break when a fixture switches tone
  mapping.
- Do not calibrate shadow opacity/softness against the current screenshots —
  they are measured under a 2x exposure error; any tuning done now bakes the
  error in and must be undone after Step 1.
- Do not compare `/tmp` experiment captures against canonical artifacts; the
  gate only reads `tools/verify/artifacts/contact-shadows/`.
