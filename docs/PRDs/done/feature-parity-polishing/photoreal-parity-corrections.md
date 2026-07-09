# Photoreal Parity Corrections: wet-floor, motion blur, DoF, bloom, AO sweep

Source of truth for observations: screenshot pairs in
`tools/verify/artifacts/rendering-photoreal/screenshots/` (captured via
`pnpm verify:rendering-photoreal`, fixtures defined in
`tools/verify/src/renderingPhotoreal.ts:23-93`).

Baseline sanity: `photoreal-lighting-units-probe` and `photoreal-ao-corner-test`
pairs match near-pixel-perfect, so base lighting/exposure calibration is good.
The remaining gaps below are effect-specific, not a global exposure problem.
Related prior diagnosis: `docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-015-parity-diagnosis-and-recommendations.md`
(items D2 clear-color tonemapping and D5 gate regions are still relevant here).

---

## 1. photoreal-reflective-wet-floor - largest gap

**Observed:** Bevy renders a bright grey floor, a lit grey cube, and strong
neon-bar reflections. Web renders the floor near-black, the cube dark, and the
reflections dim and desaturated. This is a gross scene-luminance divergence,
not just an SSR-strength difference.

**Likely root cause:** this is the only fixture that enables SSR, and enabling
SSR on Bevy flips the *entire* renderer into the deferred path via
`world.insert_resource(DefaultOpaqueRendererMethod::deferred())`
(`runtime-bevy/crates/threenative_runtime/src/map_world.rs:736`). Bevy's
deferred path shades ambient/indirect light differently from the forward path
that all the well-matched fixtures use. The web side keeps its normal lit
pipeline and only swaps the render pass for `SSRPass`
(`packages/runtime-web-three/src/render.ts:1360-1408`).

**Corrections:**

1. Isolate the cause: capture the wet-floor bundle on Bevy once with SSR
   disabled (forward path) and diff against the current Bevy capture. If the
   floor/cube brightness shifts, the deferred path is the culprit, not SSR
   strength.
2. Stop flipping the global default renderer method. Scope deferred rendering
   to the SSR camera only (insert `DeferredPrepass` + deferred method on the
   camera entity in `insert_camera_screen_space_reflections`,
   `map_world/entities.rs:750-781`) so unrelated shading stays on the
   calibrated forward path, or calibrate deferred-path ambient/exposure to
   match the forward baseline before enabling SSR fixtures.
3. Once luminance matches, align reflection strength: web `SSRPass` uses
   quality-dependent `opacity` 0.35-0.85 and `maxDistance: 10`
   (`render.ts:1389-1396`); Bevy uses `perceptual_roughness_threshold` plus
   linear step counts (`entities.rs:765-781`). Calibrate web `opacity` and
   Bevy defaults against each other using the reflected-bar sample regions.
4. Add/verify sample regions on (a) the floor reflection of the cyan bar,
   (b) the cube front face, (c) bare floor away from reflections, and make the
   gate compare them (PRD-015 D5) so this regression cannot pass silently.

---

## 2. photoreal-motion-blur-moving-test - Bevy shows no blur

**Observed:** Web shows a clear directional smear trailing the striped block
(temporal accumulation). Bevy renders the block perfectly sharp with no trail.
Secondary: the Bevy back wall is noticeably brighter than web in this fixture.

**Relevant code:**
- Bevy: `MotionBlurBundle` with `shutter_angle` passed through and adaptive
  samples - only 2 samples when `shutter_angle < 0.35`
  (`map_world/entities.rs:718-748`).
- Web: `TemporalMotionBlurPass`, blend = `clamp(shutterAngle * 0.3, 0, 0.25)`
  (`render.ts:1349-1357, 1428-1510`).
- Both captures target frame 120 with a deterministic capture clock.

**Corrections:**

1. Confirm Bevy motion vectors are actually nonzero at the capture frame.
   The block oscillates; at oscillation extremes velocity is zero, and the
   capture binary (`threenative_capture`, frame arg 120) may land on a
   different animation phase than the web capture (web trails, Bevy doesn't -
   phase mismatch is the prime suspect). Log the entity's per-frame transform
   delta around frame 120 in the capture harness and compare with the web
   deterministic clock.
2. Verify the scripted transform update path produces motion vectors: the
   previous-frame transform must be recorded by the motion-vector prepass. If
   the script teleports/writes transforms in a schedule stage after the
   prepass snapshot, Bevy sees zero velocity. Move the write or flush order so
   `PreviousGlobalTransform` is populated.
3. If blur exists but is too subtle: raise the minimum sample count (2 samples
   at low shutter angles produces near-invisible blur; use >= 4) and check the
   fixture's `shutterAngle` lands in the intended bucket
   (`entities.rs:740-747`).
4. Investigate the wall brightness delta in this fixture separately - the
   lighting probe matches, so check this bundle's light type/falloff mapping
   (likely a spot/point attenuation difference) rather than global exposure.
5. Add a sample region over the trail area (just behind the block's direction
   of travel) so "no trail" fails the gate.

**Resolution after implementation investigation:** Bevy 0.14's stock
velocity-buffer motion blur intentionally reconstructs color only inside the
current object silhouette; even valid motion vectors cannot create the exterior
trail that defines this fixture's target. Steps 1-3 above were therefore used as
diagnostic hypotheses, not retained as acceptance requirements. The shipped
correction replaces the stock native bundle with the same bounded temporal
accumulation model used by web. The native path intentionally has no
`MotionVectorPrepass` or engine `PreviousGlobalTransform` dependency. Instead,
durable capture-harness traces prove aligned rendered transforms at frames
118-120 and nonzero positive displacement at frame 120, while paired exterior
trailing/leading regions make the sharp no-history result fail. This explicitly
supersedes motion-vector sample-count proof for this correction PRD; future
animated/deforming-mesh velocity blur remains separate renderer work.

---

## 3. photoreal-dof-depth-test - tiny foreground-sphere mismatch

**Observed:** Near parity. Differences: the Bevy red sphere keeps a slightly
sharper edge and a visible specular highlight; the web sphere is a touch more
blurred and its highlight is washed out. Background bars and midground cube
match well.

**Relevant code:**
- Web: `BokehPass` with direct `aperture/focus/maxblur` (`render.ts:1341-1347`).
- Bevy: `DepthOfFieldMode::Gaussian`, `aperture_f_stops = 1/(aperture*250)`
  clamped `[0.08, 16]`, `max_circle_of_confusion = max_blur * 2560` clamped
  `[1, 64]` (`map_world/entities.rs:687-716`).

**Corrections:**

1. Prefer switching Bevy to `DepthOfFieldMode::Bokeh` (available in the Bevy
   version in use) - Gaussian blur preserves the specular highlight energy
   differently from a bokeh disk, which is exactly the artifact seen. Re-run
   the capture; this alone likely closes the visible gap.
2. If staying on Gaussian, nudge the near-field blur up: increase the
   `max_blur * 2560` scale or relax the f-stop clamp so the foreground
   circle-of-confusion matches web's `maxblur` at this fixture's settings.
3. Add a small sample region centered on the red sphere's highlight so the
   gate tracks this specific detail.

---

## 4. photoreal-bloom-emissive-test - web missing light spill

**Observed:** Bevy's emissive bars produce a natural wide glow: the pedestal
top reads as lit and the back wall shows a soft gradient falloff. Web bloom is
a tight halo hugging each bar; surrounding geometry stays pitch black. Per
user judgment the Bevy image is the target look - correct the web side.

**Relevant code:**
- Web: `new UnrealBloomPass(Vector2(1,1), intensity * 0.2, /*radius*/ 0, threshold)`
  (`render.ts:1260, 1337-1339`). The radius argument is hard-coded to `0`,
  which kills the wide mip-scatter entirely.
- Bevy: `BloomSettings` additive composite, `intensity * 0.2`, prefilter
  threshold with `threshold_softness: 0.2` (`map_world.rs:848-901`). Bevy's
  bloom is a physically-inspired mip-chain scatter, inherently wide.

**Corrections:**

1. Raise the web `UnrealBloomPass` radius from `0` to a calibrated value
   (start around `0.4-0.6`; the pass caps useful range near 1.0). Expose it in
   `IWebBloomSettings` rather than hard-coding, and calibrate against the Bevy
   wall-gradient sample region.
2. Match threshold response: web uses a hard threshold while Bevy applies
   `threshold_softness: 0.2`. Emulate the soft knee on web (UnrealBloomPass
   has no knee parameter - either pre-scale the threshold slightly below the
   IR value or patch the pass's luminosity high-pass) so faint surfaces near
   the bars enter bloom the same way.
3. Note the wall/pedestal illumination in Bevy is bloom scatter over dark
   geometry, not real light transport. If after radius/knee calibration the
   web pedestal still reads darker than the gate allows, add an explicit
   emissive-proxy light (weak point light per strong emissive surface) behind
   a runtime flag - but try steps 1-2 first; they are cheaper and likely
   sufficient.
4. Add sample regions on (a) the pedestal top and (b) the wall gradient
   midpoint, mirroring what the eye catches.

---

## 5. ao-sweep - no parity at all

**Observed:** `ao-sweep-disabled.bevy.png` vs `.web.png` disagree on overall
exposure (Bevy much brighter) *and* background hue (Bevy teal vs web blue).
`ao-sweep-r01-i01` and `ao-sweep-r075-i05` exist only as `.web.png` - there is
no Bevy counterpart to compare at all.

**Root causes:**

1. These are legacy diagnostic artifacts, not enrolled fixtures: no `ao-sweep`
   entry exists in the fixtures array (`tools/verify/src/renderingPhotoreal.ts:23-93`)
   and no conformance bundle exists, so no Bevy captures are ever produced and
   the stale files predate the current calibration (hence the exposure and
   teal-vs-blue clear-color mismatch - the latter is PRD-015 D2, clear color
   passing through ACES asymmetrically).
2. Even with a proper fixture, the sweep cannot converge today because the
   AO knobs are not mapped comparably:
   - Web GTAO blend intensity is clamped to `min(0.05, intensity * 0.008)`
     (`render.ts:1424-1425`) - at IR intensity 0.5 that is 0.004 blend, i.e.
     AO is effectively invisible on web regardless of the sweep value.
   - Bevy SSAO maps only `quality` and ignores IR `intensity` and `radius`
     entirely (`map_world/entities.rs:822-846`).

**Corrections:**

1. Delete the four stale `ao-sweep-*.png` / `ao-*.web.png` diagnostic files
   (or move them out of the gate's screenshots directory) so they stop reading
   as parity failures.
2. Enroll a real sweep: add an `photoreal-ao-sweep` conformance bundle under
   `packages/ir/fixtures/conformance/` (reuse the ao-corner-test scene) with
   two or three radius/intensity variants, register them in the fixtures array
   so both `.web.png` and `.bevy.png` are captured by the same pipeline.
3. Make the knobs real on both sides before sweeping:
   - Web: rework `webAmbientOcclusionStrength` - the 0.05 clamp makes the
     whole GTAO pass a no-op. Calibrate a scale where IR intensity 1.0 gives
     clearly visible corner darkening (GTAO `blendIntensity` is 0-1; something
     in the 0.3-1.0 region), using the matched ao-corner-test regions as the
     anchor so the currently-passing fixture stays passing.
   - Bevy: SSAO exposes no direct intensity/radius, so document the mapping
     limit and approximate: map IR intensity buckets onto quality levels
     and/or post-scale AO via the material/ambient term if exact matching is
     required. If the approximation cannot track the sweep, gate the sweep on
     monotonicity (darker corners as intensity rises) per adapter rather than
     cross-adapter pixel deltas, and record that in
     `docs/status/capabilities/rendering.md`.
4. Fix the clear-color tonemapping asymmetry (PRD-015 D2) so backgrounds agree
   before re-capturing - otherwise every sweep frame fails on background hue
   alone.

---

## Execution order and verification

Work order (each step re-runs the gate before the next):

1. AO sweep cleanup + web AO strength fix (small, unblocks AO work) - item 5.
2. Wet-floor deferred-path scoping/calibration - item 1 (biggest visual gap).
3. Motion blur phase/velocity fix on Bevy - item 2.
4. Web bloom radius + soft threshold - item 4.
5. Bevy DoF bokeh mode / near-field tuning - item 3 (smallest gap).

After each change:

```bash
pnpm verify:rendering-photoreal
```

and inspect `tools/verify/artifacts/rendering-photoreal/contact-sheet.svg`
plus `region-metrics.json`. Extend sample regions as listed per item so each
fixed detail is gated, not just eyeballed. Update
`docs/status/capabilities/rendering.md` and the `docs/STATUS.md` index line
when effect status changes, per repo rules.
