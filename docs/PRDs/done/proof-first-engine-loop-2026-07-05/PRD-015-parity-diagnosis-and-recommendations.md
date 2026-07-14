# PRD-015 Parity: Diagnosis and Recommendations (2026-07-08)

Status: historical diagnosis. The implemented rendering contract and current
residuals live in the rendering capability status and focused gates.

Audience: the agent implementing
`PRD-015-portable-photoreal-rendering-and-postprocessing.md`. This is a
diagnosis of why web/Bevy parity is currently failing and exactly what to do,
in order. Evidence comes from the latest
`tools/verify/artifacts/rendering-photoreal/` run (2026-07-08 22:10) and a
code sweep of both adapters.

## TL;DR

The gate says pass (`TN_VERIFY_RENDERING_PHOTOREAL_OK`, zero diagnostics) but
the screenshots visibly diverge. The reporting layer claims parity the pixels
do not have. Fix base lighting/tonemapping parity first, then bloom mapping,
then the reporting honesty bugs, then tighten the gate so it can actually
fail. Do not start SSR/motion-blur/HDRI work until those are done.

## Diagnosis (what the artifacts show)

### D1. Base lighting does not match — suspect the Bevy light-unit conversion

`photoreal-ao-corner-test`: web average luminance 0.320 vs Bevy 0.441. Web
walls/floor render near-black; Bevy renders mid-gray.

Hard evidence in `photoreal-ao-corner-test.bevy.report.json`: the key light
is authored `intensity: 1.4` (directional) but the runtime block reports
`intensity: 0.0007`. Bevy 0.14 directional lights take illuminance in lux
(daylight ~10k-100k); 0.0007 lux is effectively off, meaning the Bevy scene
is currently lit almost entirely by the ambient conversion, and the two
runtimes are lit by different light paths entirely. Any AO/bloom tuning done
on top of this is tuning against noise.

### D2. Tonemapping/color-space mismatch on the clear color

Same fixture: the background is saturated blue (~#0d7fe8) on web and teal
(~#00a5d1) on Bevy, while both reports claim identical
`colorGrading: { toneMapping: "aces", exposure: 1.0 }`. A hue shift on a
flat authored color means one adapter is tonemapping/grading the clear color
and the other is not, or one is converting sRGB->linear twice/not at all.
Note Three.js `ACESFilmicToneMapping` and Bevy `Tonemapping::AcesFitted` are
not guaranteed to be the same curve either.

### D3. Bevy bloom mapping is wrong (prefilter/threshold not applied)

`photoreal-bloom-emissive-test`: web shows tight halos around the emissive
bars; Bevy shows a diffuse glow flooding half the frame, and the bars are
washed-out pastels instead of saturated neon.

Cause: Three's `UnrealBloomPass(threshold, strength, radius)` is a
thresholded additive bloom. Bevy's `BloomSettings` defaults to
energy-conserving composite with the prefilter (threshold) disabled — so the
IR `threshold: 0.45` is silently ignored and the whole frame blooms. Passing
the IR `intensity: 0.85` straight into Bevy's `intensity` is also out of
range for that parameter (Bevy's usable range is ~0.1-0.3).

Also: the blue ground band visible at the bottom of the web capture is
completely absent from the Bevy capture — a floor entity, camera framing, or
clear-color region is not being reproduced. Diagnose before tuning bloom.

### D4. Reporting honesty bugs (silent drift, the thing the PRD forbids)

- Bevy `depthOfField`: config is accepted and listed in
  `postProcessing.applied`, but no DOF component is ever attached to the
  camera (`runtime-bevy/crates/threenative_runtime/src/map_world.rs` has no
  DOF wiring). The report claims a feature that does not render.
- `screenSpaceGlobalIllumination` when disabled reports `status: "baseline"`
  on web (`packages/runtime-web-three/src/conformance.test.ts:402-404`)
  while SSR/motion-blur report `rollout-gap`. Disabled-and-unimplemented
  must not read as baseline.
- AO fixture reports disagree on bloom state (Bevy: `enabled: true,
  intensity: 0`; web: `enabled: false`). Cosmetic, but the reports are
  supposed to be comparable machine evidence — normalize them.

### D5. The gate cannot fail on any of the above

`verify:rendering-photoreal` only checks non-blank area, whole-frame
luminance stats, and that feature reports say "applied". All four
divergences above pass it. The gate is proof theater until it compares
bounded regions across runtimes.

### D6. Contract gap

`environmentLighting`/HDRI (PRD Phase 2) was never added to the IR schema
(`packages/ir/src/runtimeConfig.ts`, `runtime-config.schema.json`) — no
validation, no adapter code, no diagnostic. It is currently unauthorable,
which is at least honest; keep it that way until the steps below are done.

## Recommendations (do exactly this, in this order)

### R1. Fix base lighting parity first (blocks everything else)

1. Add a minimal probe fixture (`photoreal-lighting-units-probe`): gray
   boxes, one directional light, one ambient light, AO/bloom/grading all
   off or neutral. No effect tuning is trustworthy until this fixture
   matches within tolerance.
2. Audit the authored-intensity -> Bevy conversion in
   `runtime-bevy/crates/threenative_runtime/src/map_world.rs`:
   directional = lux, point/spot = lumens in Bevy 0.14. Authored `1.4`
   must map to a lux value that visually matches the web adapter's
   `DirectionalLight(intensity 1.4)`, not `0.0007`.
3. Resolve the clear-color path: decide whether background/clear color is
   tonemapped+graded or passed through, and make both adapters do the same
   thing. Add the decision as a comment-free contract note in the IR docs.
4. If ACES curves still differ visibly after that, render a grayscale ramp
   in both runtimes and either switch Bevy to the curve that matches
   Three's ACESFilmic or apply a compensation in the web grading pass.

### R2. Fix the Bevy bloom mapping

In the Bevy bloom setup (`map_world.rs:771-805`):

- Set `BloomCompositeMode::Additive` and enable
  `BloomPrefilterSettings { threshold: ir.threshold, threshold_softness: ~0.2 }`
  so the IR threshold actually does something.
- Do not pass IR intensity through raw. Map it into Bevy's usable range
  (start with `bevy_intensity = ir_intensity * 0.2` and calibrate against
  the web capture on the emissive fixture).
- Find why the blue ground band is missing in the Bevy capture (entity
  mapping, camera far plane, or material) and fix it — it is a scene
  reproduction bug, not a bloom bug.

### R3. Fix report honesty before adding any feature

- Bevy DOF: either wire `bevy::core_pipeline::dof::DepthOfFieldSettings`
  onto the camera (it exists in 0.14; see R5) or report
  `rollout-gap` + `TN_RENDER_FEATURE_FALLBACK`. Never list it in
  `postProcessing.applied` while nothing renders.
- Make disabled-and-unimplemented features report consistently (pick one:
  `baseline` with `appliedMode: "disabled"` only when the implementation
  exists; `rollout-gap` otherwise) and apply it to SSGI on both runtimes.
- Normalize the bloom-state shape between the two reports so a diff of
  `runtimeConfig.renderer` across runtimes is meaningful.

### R4. Make the gate able to fail

Extend `tools/verify/src/renderingPhotoreal.ts` with the sample-region
pattern already used by `verify:portable-shader-material`
(`packages/ir/fixtures/conformance/portable-shader-material/sample-regions.json`):

- Per fixture, define 3-6 bounded regions (background, lit wall, AO corner,
  emissive bar core, halo ring, floor band).
- Compare per-region mean color (hue delta) and luminance delta across
  runtimes with explicit tolerances; fail the gate on breach.
- Regions D1-D3 above would all be caught by: a background-hue region, a
  wall-luminance region, and a "must be black" region outside the halo.
- Keep tolerances loose (this is intent parity, not pixel parity, per PRD
  Section 6) — but they must be tight enough that today's captures fail.

Re-run `pnpm verify:rendering-photoreal` after R1/R2 and only then commit
the tightened tolerances.

### R5. Then, and only then, the remaining lanes

Bevy 0.14.2 (pinned in `runtime-bevy/.../Cargo.toml`) already ships native
paths for all three deferred lanes — no engine upgrade needed:

- DOF: `bevy::core_pipeline::dof::DepthOfFieldSettings` on the camera.
- Motion blur: `bevy::core_pipeline::motion_blur::MotionBlur` (+ motion
  vector prepass).
- SSR: `bevy::pbr::ScreenSpaceReflectionsSettings` — experimental, requires
  the deferred rendering path; verify it composes with the current camera
  setup before claiming it, otherwise keep the rollout-gap diagnostic.

Order: Bevy DOF (web already renders DOF, so this closes an existing
half-claim) -> motion blur both runtimes -> SSR both runtimes. Each lane
needs its fixture + sample regions before its docs/parity-table claim.

### R6. HDRI/environment lighting (Phase 2) last

Add `environmentLighting` to IR schema + validation first, with
`TN_RENDER_FEATURE_ASSET_MISSING` diagnostics, then web PMREM path, then
Bevy `EnvironmentMapLight` (needs KTX2 prefiltered maps — budget time for
the asset conversion step in the fixture import, since Poly Haven ships
HDR/EXR, not KTX2). Do not start this while D1/D2 are open: environment
lighting parity is unverifiable if base tonemapping does not match.

## Anti-goals (repeating the traps this work keeps near)

- Do not hand-tune either adapter to match screenshots; fix mapping,
  units, and color space (see `docs/status/capabilities/rendering.md`
  header rule).
- Do not let `docs/bevy-feature-parity.md` or the PRD feature table claim a
  lane whose Bevy side only exists in the report JSON.
- Per repo drift rules, the feature-status truth should live in one
  registry (IR/compiler capability descriptors) that reports and parity
  docs derive from — do not grow a second hand-maintained table while
  fixing this.

## Verification for this remediation slice

```bash
pnpm --filter @threenative/ir test
pnpm --filter @threenative/runtime-web-three test
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime
pnpm verify:rendering-photoreal
pnpm verify:render-look
```
