# Lumen-lite Parity Guide: Cross-Platform Divergence + God-Ray Visibility

Date: 2026-07-10
Scope: why the lumen-lite showcase reads completely differently on web vs
native, why god rays are barely visible even on web, and the ordered work
needed to reach parity and the reference look.

References used:

- UE5 Lumen cave shot (`lumen-unreal-engine-5-image26-1600x845-*.webp`):
  strong volumetric sunbeam, warm bounce light filling shadowed rock, soft AO.
- Metro/Stalker-style interior (`image.png`): blown-out windows with bloom
  halos, thick diagonal shafts crossing the room, dust motes, warm grade.
  This is the closer target for `hero-interior`.
- Current gate captures:
  `tools/verify/artifacts/lighting-showcase/screenshots/lumen-lite-showcase.web.png`
  and `lumen-lite-showcase.native.png`.

## 1. What the captures actually show

Web capture: faint-but-present god rays from both windows, warm height-fog
haze near the floor, AO/SSGI shading gradients on walls and ceiling, grounded
props. Direction is right; everything is too subtle.

Native capture: **no volumetrics render at all.** No shafts, no haze, no fog
gradient. Surfaces are flat albedo with hard direct/ambient split, the floor
is much darker, window glow is more saturated yellow (different
emissive/bloom response), and props read pasted-on. This is not a "tuning
delta" — the native volumetric path is either not being inserted on the
showcase camera or is calibrated so weak it is invisible.

The `verify:lighting-showcase` gate passes on both targets, which means the
gate's region metrics are too loose to catch a total volumetrics no-show on
native. Fixing the gate is part of the work, not an afterthought.

### Measured deltas (1280x720 captures, linear-luma region means)

| Region (px crop) | Web | Native | Ratio | Reading |
|------------------|-----|--------|-------|---------|
| Shaft wedge below windows (64,324 256x110) | 0.214 | 0.125 | 1.7x | God-ray lift web-only |
| Floor fog haze (26,540 290x120) | 0.094 | 0.023 | 4.2x | Height fog missing natively |
| Low air, left (64,580 190x100) | 0.078 | 0.016 | 4.8x | Same — no vertical fog gradient |
| Neighbor air (590,345 180x90) | 0.051 | 0.038 | 1.3x | Baseline offset only |
| Window hot core (256,200 128x90) | 0.868 | 0.876 | 1.0x | Cores match; halos do not |
| Ceiling (384,14 384x72) | 0.017 | 0.016 | 1.0x | Dark regions match |

Whole-frame: MAE 0.060, SSIM 0.17 — structurally different images. A
difference heatmap shows the divergence is concentrated in exactly the
shaft wedge, the floor haze, window-frame bloom halos, and the reflective
crate materials; geometry and dark regions align. Also notable: the native
blue channel clips to 0.0 in nearly every mid/dark region (web retains
0.02-0.10 blue), which is what makes native read as an over-saturated
orange poster — points at the contrast x1.3 / saturation x1.08 native
grading scales plus tonemap-chain drift (section 2.5).

## 2. Root causes of the divergence

Ordered by visual impact.

### 2.1 Native god rays / fog do not appear (bug-level, not calibration)

- Web: adapter-owned raymarched pass, shadow-map-aware
  (`packages/runtime-web-three/src/rendering/godrays/GodRaysPass.ts`) plus a
  separate analytic height-fog pass (`heightFogPass.ts`).
- Native: one shared `VolumetricFogSettings` + `VolumetricLight`
  (`runtime-bevy/crates/threenative_runtime/src/rendering.rs:386-427`), gated
  on `god_rays.enabled && sun.castsShadow && shadows.enabled`.
- Suspects to check first, in order:
  1. Is `VolumetricFogSettings` actually inserted on the **capture camera**
     entity used by the showcase harness (vs the gameplay camera)? Bevy 0.14
     volumetric fog requires the component on the rendering camera plus
     `VolumetricLight` on the sun; a camera spawned/swapped by the capture
     path may miss `apply_atmosphere_to_world`.
  2. Bevy 0.14 `VolumetricFog` requires depth prepass +
     `Msaa`-compatible settings; check the showcase camera has the required
     prepass components and that HDR is on.
  3. Density scale: applied density is
     `heightFog.density * 0.1 + godRays.density * 0.025` = `0.08*0.1 +
     0.9*0.025` = `0.0305`. With `absorption 0.116`/`scattering 0.465` over a
     ~10 m room, that may be visible-but-faint — the capture shows *zero*
     haze, which points at (1)/(2) rather than (3). Verify with an exaggerated
     density smoke test (density 1.0) on the native capture.
- The conformance report claims `applied: true` for volumetrics while the
  pixels show nothing. Add a rendered-pixel assertion (see 4.1) so "applied"
  cannot mean "component inserted but never rendered".

### 2.2 God rays and height fog are coupled on native

On web they are two independent passes with independent knobs. On Bevy they
are summed into one homogeneous `VolumetricFogSettings` (density, absorption,
scattering all derived from both features). Consequences:

- You cannot brighten shafts without thickening room haze on native.
- `heightFog.baseHeight`/`falloffHeight` are parsed but ignored
  (`bevy-0.14-no-height-density-field`), so native haze has no vertical
  gradient — the web floor-hugging warm fog cannot be reproduced.

Fix options (pick one):

- **A (recommended for parity): port the web shaders to wgsl** as
  adapter-private post passes in Bevy (god-ray raymarch sampling the
  directional cascade, analytic height-fog integration). Same math both
  sides, one calibration story, no Bevy version risk. This mirrors what was
  already done for contact shadows.
- **B: upgrade Bevy to 0.16** (`FogVolume`, density textures, improved
  shadowed volumetric fog). Bigger lever, but reopens the pinned-version
  freeze and touches everything.

Option A is the honest continuation of the milestone's own pattern.

### 2.3 God rays are too weak everywhere (web included)

Web numbers, from `GodRaysPass.ts` / `webGodRaysSettings()`:

- Authored `intensity 1.8` is halved to 0.9 in the shader; authored
  `density 0.9` becomes `0.0225` optical-depth per unit. Over the ~6-8 m a
  shaft crosses the frame, accumulated shaft term is roughly
  `(1 - exp(-0.15)) * 0.9 ≈ 0.12` — a 12% lift. The references are 3-10x
  that in the shaft core.
- **No forward-scattering phase function.** The fragment shader accumulates
  isotropically. Real media (and Bevy, via `scattering_asymmetry 0.8`) boost
  shafts massively when looking toward the light (Henyey-Greenstein g≈0.7).
  This is the single biggest visibility fix on web: multiply the per-step
  contribution by HG(g, dot(viewDir, sunDir)). It also makes web and native
  physically comparable, since native already has asymmetry 0.8.
- **Shaft radiance ignores sun color/intensity coupling with bloom.** The
  references get their punch from shaft cores exceeding 1.0 and feeding the
  bloom pass. Web bloom strength is `intensity * 0.2` with default authored
  intensity ~0.15 → pass strength 0.03, essentially off. Pass ordering is
  correct (god rays → fog → bloom), so raising bloom to a real value
  (authored 0.6-0.9 → strength 0.12-0.18, threshold ~0.7) gives the window
  blowout and shaft halo for free.
- **Dust motes.** Both references sell the shafts with particles. A cheap
  portable win: a small quad-particle emitter component scoped to the shaft
  volume (both runtimes can render alpha quads); author it in the showcase
  scene. Optional but high perceptual value.

Concrete web changes:

1. Add HG phase to `godRaysFragmentShader` (g authored or fixed 0.75).
2. Multiply shaft radiance by sun color and a calibrated fraction of sun
   intensity instead of a flat 0.5 factor; keep the 0..2 authored intensity
   range as an artistic multiplier on top.
3. Raise showcase bloom (`renderer.bloom`) and window-glow emissive so shaft
   sources are genuinely blown out.
4. Re-tune authored `godRays.density`/`intensity` after 1-2 (they will need
   to come *down*, which is the right direction — headroom instead of
   ceiling).

### 2.4 Indirect light: web bounces, native lifts

- Web SSGI is a real screen-space bounce (hemisphere raymarch + temporal),
  giving walls directional warm gradients. Native maps SSGI to SSAO plus a
  flat ambient multiplier `1 + intensity*0.18` — it *darkens* creases and
  *uniformly lifts* everything, with no directionality and no color bleed.
- Baked GI: web applies full SH2 (directional irradiance); native collapses
  to SH-L0 flat ambient (`sh_l0 * 0.282095 * 4.0`).
- Combined effect: native walls are flat posters; web walls have gradient.
  Visible in the captures as the "unlit" look of the native shot.

Fixes, in increasing cost:

1. **Bind SH2 into a Bevy 0.14 `IrradianceVolume`** (it exists in 0.14!).
   Voxelize the probe's bounds into a small 3D texture evaluated from the 27
   coefficients. This upgrades native from flat ambient to directional
   irradiance without a version bump, and directly attacks the biggest flat
   term. Replace the `global-ambient-sh-l0-approximation` report with
   `irradiance-volume-sh2`.
2. Port the web SSGI spatial pass to wgsl (same shader family as 2.2-A).
   Defensible scope: the spatial pass without temporal resolve at "medium",
   reusing Bevy's depth/normal prepass.
3. Leave SSAO in place either way; it composes.

### 2.5 Tonemap/exposure/bloom calibration drift

Both sides claim ACES-fitted, but the chains differ:

- Web: custom output pass, `exposure * 1.2` ACES input scale, fitted RRT/ODT,
  then saturation/contrast, then sRGB.
- Native: `Tonemapping::AcesFitted` + `Exposure{ev100: -log2(exposure*1.7)}`
  + `ColorGrading` scales (saturation ×1.08, contrast ×1.3).
- Bloom units are not comparable at all: web `UnrealBloomPass` strength
  `intensity*0.2` vs Bevy `BloomSettings.intensity` used directly (a 0..1 mix
  factor). The saturated-yellow native windows vs whiter web windows come
  from this plus emissive scale differences.

Fix: define one shared bloom anchor (authored intensity 1.0 = a specified
halo luminance/width on a reference emissive quad fixture) and calibrate both
adapters against it with a focused verify gate, exactly like the baked-GI
lift calibration in PRD-006. Do the same for one grey-ramp fixture through
the full tonemap chain (the "pre-existing whole-pipeline color rendition
drift" already noted in PRD-004 is this).

## 3. Recommended work order

| Phase | Work | Why this order |
|-------|------|----------------|
| 0 | Tighten `verify:lighting-showcase`: add shaft-contrast, haze-gradient, and bloom-halo region metrics that FAIL on today's native capture | Locks the bug in as red before touching code |
| 1 | Native volumetrics no-show root cause (2.1) — camera/prepass insertion first | Restores the feature natively at all |
| 2 | Web god-ray visibility (2.3): HG phase, sun-coupled radiance, real bloom, re-tune showcase values | Quick win, defines the target look for native |
| 3 | Native god-ray + height-fog parity via wgsl ports (2.2-A), decoupled knobs, calibrated to phase-2 metrics | True parity of the hero features |
| 4 | SH2 irradiance volume on native (2.4-1) | Kills the flat-poster look |
| 5 | Bloom + tonemap chain calibration fixtures (2.5) | Converges the remaining color/highlight drift |
| 6 | Optional: dust-mote particle component; wgsl SSGI spatial port (2.4-2) | Reference-level polish |

Each phase should follow the milestone's existing pattern: portable IR knobs
unchanged where possible, adapter-private implementation, honest
`appliedMode` reporting, calibration constants in `rendering.rs` (never
per-target scene forks), and a focused `tools/verify` gate per phase.

## 4. Gate improvements (Phase 0 detail)

1. **Rendered-pixel volumetrics assertion**: sample a shaft region (between
   window and floor, away from geometry) vs an adjacent shadowed region on
   BOTH captures; require `shaftLuma / neighborLuma >= 1.15` (tune after
   Phase 2). Today native would fail — that is the point.
2. **Haze gradient**: floor-adjacent vs ceiling-adjacent air luminance ratio
   band, both targets, to catch missing height falloff.
3. **Bloom halo**: luminance falloff width around the window hot region
   within a shared band across targets.
4. **Cross-target delta**: per-region mean-luma and chroma deltas between web
   and native captures with a hard ceiling (the current native-lift `<= 4x
   web-lift` style bands are too loose to mean "looks the same").

## 5. Known constraints to respect

- Bevy pinned `=0.14.2`; Option 2.2-B (upgrade) is a strategic decision, not
  a lighting task — everything above works within 0.14.
- Web must stay WebGL (no TSL/WebGPU nodes).
- God rays remain directional-sun-only on both adapters (documented v1
  scope).
- New knobs (e.g. `godRays.anisotropy`, dust emitter) go through
  `packages/ir` validators + capability enrollment + conformance reporting,
  no hand-maintained adapter lists.
