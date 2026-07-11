# Gap Analysis: lumen-lite-showcase web vs native (2026-07-11)

Compared captures (fresh, taken 2026-07-11 01:36, current code):

- Web:    `tools/verify/artifacts/lighting-showcase/screenshots/lumen-lite-showcase.web.png`
- Native: `tools/verify/artifacts/lighting-showcase/screenshots/lumen-lite-showcase.native.png`

Scene: `examples/lumen-lite-showcase/content/scenes/hero-interior.scene.json`
Runtime config: `examples/lumen-lite-showcase/content/runtime/default.runtime.json`

Web is the quality reference (GI on ceiling, texture response, broad
volumetric haze, crisp reflections). Native is flatter and differently
exposed. There is also one unexplained rendering bug (Section A). Sections
B1-B7 are confirmed root causes with exact fixes. Section A is a debugging
methodology only — do NOT guess-fix it; run the steps until the cause is
proven.

---

## A. UNRESOLVED BUG: giant glossy blue box(es) at the puddle position

**Symptom:** Both captures show a ~1 m tall, ~2 m wide glossy box standing on
the floor at center frame — deep navy with a mirror top on web (TWO adjacent
boxes), pale blue-white with a bloomed window reflection on native (ONE box).
The screen position matches the authored puddles.

**What is already verified — do not re-check these:**

- Authored data is correct: `mesh.puddle` is `{"primitive": "box", "size":
  [2.4, 0.015, 1.25]}` (`content/meshes/arena.meshes.json`), entities
  `puddle.foreground` / `puddle.window` have scale `[0.24,1,0.2]` /
  `[0.3,1,0.24]` → final ~0.58 x 0.015 x 0.25 m thin patches.
- The compiler preserves `size` (`packages/compiler/src/emit/structured-documents.ts:293-296`)
  and the built bundle at
  `examples/lumen-lite-showcase/dist/lumen-lite-showcase.bundle/` contains the
  correct mesh size, both puddle entities, correct scales, and
  `mat.puddle = {color:"#292b28", roughness:0.28, metalness:0.12}`.
- Web applies size: `packages/runtime-web-three/src/mapWorld.ts:854-856`
  (`new THREE.BoxGeometry(x, y, z)` from `asset.size`) and applies transform
  scale at `mapWorld.ts:1371-1372`.
- Native applies size: `runtime-bevy/crates/threenative_runtime/src/map_world/rendering.rs:237-256`
  (`three_box_mesh` with half-extents at 436-439) and applies scale in
  `map_transform` at `rendering.rs:1099-1113`.
- No blue material exists anywhere in the authored content or compiled
  bundle. No player/pawn/debug entity exists in the bundle (75 entities, all
  accounted for).

So the data and the obvious code paths are clean, yet the render is wrong on
BOTH backends (differently). Something between world-mapping and the final
frame is substituting or inflating this geometry/material.

### A.1 Suspects, ranked (hypothesis → how to confirm → fix if confirmed)

**H1 — runtime loads a different bundle than `dist/` (stale cache / wrong
asset resolution).** The on-disk bundle is provably correct, but nobody has
verified what the renderer actually parsed at capture time. Confirm: log the
mesh record for `mesh.puddle` at load time on both backends (methodology
steps 2-3); on web also check the network tab of the playtest artifacts for
which `assets.manifest.json` was fetched. Fix: correct the resolution/cache
path and add a load-time assertion that the manifest hash matches `dist`.

**H2 — material resolution falls back to a default/debug material.**
`#292b28` (near-black green-grey) cannot shade to saturated navy (web) or
pale blue-white (native). Bevy's default `StandardMaterial` is white — under
the warm key light plus the blue-grey ambient (`#687077`) and SSGI ambient
(web default `#20242a` is dark blue: `ssgiPass.ts:29` `ambientSource ...
?? "#20242a"`), a white fallback plausibly reads pale-blue on native and a
dark-blue on web. Confirm: methodology step 2/3 — print the resolved material
color for the puddle entities. Fix: repair the material lookup (likely id
mismatch or ordering between material registration and entity spawn:
web `mapWorld.ts` material map; native
`map_world/entities.rs:483-533` + `NativeMaterialHandles`), and make missing
materials a loud diagnostic (magenta + console error), never a silent white.

**H3 — geometry substituted, not the authored box.** Something else renders
at that spot: web's contact-shadow proxy meshes
(`contactShadows.ts:78-161`), the emissive-mask camera path
(`map_world/entities.rs:352`), or a probe/irradiance-volume debug visual
(`rendering.rs:897-962` spawns `IrradianceVolume` entities — if a debug
gizmo/visualization renders their bounds, it would be a large box). Confirm:
ablation (methodology step 1) — remove `contact.crates`, then the light
probe, instead of the puddles. Fix: put internal proxies on a non-rendered
layer (web: capture-only layer; native: `RenderLayers`), or gate debug
visualizations behind an env flag.

**H4 — SSR/SSGI pass mis-renders its selected surfaces.** `mat.puddle`
roughness 0.28 is under the SSR `roughnessLimit 0.62`, so puddles are
SSR-selected on web; a bug in the pass could composite an inflated/displaced
reflection volume that reads as a box. Weak for native (no SSR there at
all). Confirm: methodology step 4 (recapture with SSR off, then SSGI off —
`ssgi-disabled` reference capture already exists). Fix: whatever the diff
isolates in `render.ts:1690-1728` pass setup (resolution scale, thickness,
selection list).

**H5 — scale dropped only on some path.** Both `map_transform`
(`rendering.rs:1099-1113`) and web (`mapWorld.ts:1371`) apply scale, but a
later system may overwrite the transform (native physics sync — note the
repo's known kinematic/collider quirks — or an animation/behavior pass).
Confirm: log `Transform.scale` for the puddles one frame AFTER spawn, not at
spawn. Fix: stop the overwriting system from touching non-physics static
meshes.

**H6 — native's missing second box is frustum/AABB culling.** If the
computed AABB uses unscaled mesh extents while the visual uses another size,
`puddle.window` (farther, more oblique) could cull while `puddle.foreground`
survives. Confirm: same spawn/frame logging — if both entities exist with
correct transforms but one never draws, inspect `Aabb` components. Fix:
recompute/insert correct `Aabb` after mesh construction in
`map_world/rendering.rs`.

Note the coupling: whichever hypothesis explains the SIZE must also explain
the COLOR, or there are two stacked bugs (e.g. H1/H5 for size + H2 for
color). H2 is the only credible source of blue on both backends.

**Debugging methodology (in order, stop when the cause is proven):**

1. **Confirm identity by ablation.** Temporarily delete the two puddle
   entities from `hero-interior.scene.json`, rebuild, recapture both targets:

   ```bash
   tn iterate --project examples/lumen-lite-showcase --json
   tn playtest examples/lumen-lite-showcase/playtests/hero-interior.playtest.json --json
   tn playtest examples/lumen-lite-showcase/playtests/native-hero-interior.playtest.json --target desktop --json
   ```

   If the boxes disappear, the puddles are confirmed as the source; restore
   them and continue. If the boxes remain, ablate the next candidates one at
   a time: `contact.crates` (ContactShadows spawns proxy meshes on web —
   `packages/runtime-web-three/src/rendering/contactShadows.ts:78-161`), the
   light probe (`lightProbes` in the environment scene), and `debris.02/03`.

2. **Inspect the live web scene graph.** In the web runtime during a
   playtest, dump the actual THREE objects (devtools console or a temporary
   `console.log` in `mapWorld.ts` after object creation):

   ```js
   scene.traverse((o) => {
     if (o.name?.includes("puddle") || o.geometry?.type === "BoxGeometry") {
       console.log(o.name, o.geometry?.parameters, o.scale.toArray(),
                   o.material?.color?.getHexString(), o.material?.roughness);
     }
   });
   ```

   Three outcomes: (a) geometry parameters are wrong → the mesh record used
   at runtime differs from the bundle on disk (stale cache / different asset
   resolution path — diff what the loader actually fetched); (b) scale is
   wrong → transform application order bug; (c) geometry+scale are right but
   material color is not `#292b28` → material resolution picked a wrong or
   fallback material; find where. The saturated navy blue is a strong hint:
   `#292b28` cannot shade to navy, so if (c), grep the material resolution
   path for what produced blue.

3. **Same on native.** Add a temporary spawn log in
   `runtime-bevy/crates/threenative_runtime/src/map_world/entities.rs` (around
   line 137 where `add_mesh` is called):

   ```rust
   if entity.id.contains("puddle") {
       info!(id = entity.id, ?transform.scale, "spawn puddle");
   }
   ```

   Also log the mesh AABB after `three_box_mesh`. This simultaneously answers
   why native shows only ONE box: if both entities log with correct
   transforms, the second is lost later (visibility/culling); if only one
   logs, the loss is in bundle load → diff `dist` bundle vs what the native
   loader parsed.

4. **Isolate the post-processing stack.** Recapture web with SSR disabled,
   then SSGI disabled (an `ssgi-disabled` capture already exists in the
   artifacts dir for comparison). The SSR pass selects meshes by roughness
   (`roughnessLimit 0.62`; `mat.puddle` roughness 0.28 qualifies). If the box
   only looks wrong with SSR/SSGI on, the pass is mis-rendering the selected
   geometry; if the box is wrong in the raw render, it is geometry/material.

5. **Add the regression test once found.** Whatever the cause, encode it:
   a conformance assertion that a box primitive with size+scale renders with
   the expected screen-space footprint, or a unit test on the failing layer.
   Per repo rules, prefer extending
   `packages/ir/fixtures/conformance/fixture-catalog.json` coverage.

---

## B. CONFIRMED GAPS — exact fixes

### B1. Native has no SSR at all (hero reflection missing)

Web implements a full SSR pass — `packages/runtime-web-three/src/render.ts:1234-1243`
(settings, `roughnessLimit 0.62`) and `render.ts:1690-1728` (SSRPass, quality
→ resolutionScale, `thickness 0.25`). Native only reads the flag to disable
baked-probe irradiance volumes
(`runtime-bevy/crates/threenative_runtime/src/rendering.rs:986`):

```rust
.and_then(|renderer| renderer.screen_space_reflections.as_ref())
.is_some_and(|ssr| ssr.enabled)
```

**Fix:** wire Bevy's built-in SSR onto the camera when the config block is
enabled (requires depth/deferred prepass — check the Bevy version in
`runtime-bevy/Cargo.toml` for the exact component shape):

```rust
use bevy::pbr::ScreenSpaceReflections;

if let Some(ssr) = renderer.screen_space_reflections.as_ref().filter(|s| s.enabled) {
    camera_entity.insert(ScreenSpaceReflections {
        perceptual_roughness_threshold: ssr.roughness_limit.unwrap_or(0.45),
        ..Default::default()
    });
}
```

Keep the existing probe/SSR mutual exclusion. The window reflection in the
floor puddles is the hero feature of this shot — verify at grazing angles.

### B2. Native hardcodes bloom threshold to 0.85 and ignores the configured 0.68

`runtime-bevy/crates/threenative_runtime/src/conformance.rs:1542-1566` builds
the bloom report with `threshold: 0.85` hardcoded on the render-look path,
and the runtime side never feeds `bloom.threshold` into Bevy's `Bloom`
prefilter. Web uses the configured values via UnrealBloomPass
(`packages/runtime-web-three/src/render.ts:1204-1214, 1758-1771`).

**Fix:** map both knobs from the same config the web reads:

```rust
use bevy::core_pipeline::bloom::{Bloom, BloomPrefilter};

Bloom {
    intensity: bloom.intensity,                    // 0.58 from config
    prefilter: BloomPrefilter {
        threshold: bloom.threshold,                // 0.68 from config, not 0.85
        threshold_softness: 0.32,                  // calibrate vs web smoothWidth
    },
    ..Bloom::NATURAL
}
```

Also fix the conformance report to echo the actually-applied threshold so the
drift is test-visible.

### B3. Native reads exposure/tone-mapping from the WRONG source and drops contrast/saturation

Native (`runtime-bevy/crates/threenative_runtime/src/rendering.rs:265-266`):

```rust
tone_mapping: Some(profile.color_management.tone_mapping.clone()),
exposure: Some(profile.color_management.exposure),
```

That is the atmosphere profile — for this scene `exposure 0.92`
(`dist/.../environment.scene.json`). Web reads `renderer.colorGrading` —
`exposure 1.08, contrast 0.1, saturation 1.08, aces` — and applies all four in
a color-managed output pass (`packages/runtime-web-three/src/render.ts:1259-1271,
1897-1921, 2010-2021`). So the two backends literally run different exposures
(0.92 vs 1.08) plus native skips contrast/saturation entirely. This is a large
chunk of the overall brightness/tint mismatch.

**Fix:** prefer `renderer.colorGrading` when present (fall back to
atmosphere), and apply contrast/saturation via Bevy's `ColorGrading` camera
component:

```rust
use bevy::render::view::ColorGrading;

let grading = renderer.color_grading.as_ref();
let exposure = grading.and_then(|g| g.exposure)
    .unwrap_or(profile.color_management.exposure);          // 1.08 wins over 0.92
let mut color_grading = ColorGrading::default();
color_grading.global.exposure = exposure.log2();            // Bevy exposure is in stops
color_grading.global.post_saturation = grading.and_then(|g| g.saturation).unwrap_or(1.0);
// contrast: ColorGrading section contrast, applied to shadows/midtones/highlights
```

Verify the stops-vs-multiplier convention against web's
`renderer.toneMappingExposure` before landing.

### B4. SSGI intensity scale mismatch + flat ambient masking

Web SSGI: full temporal ray-marched pass, `intensity * 0.4`, ambient fed
through the SSGI shader at `ambient.intensity * 0.15`
(`packages/runtime-web-three/src/rendering/ssgi/ssgiPass.ts:25-44`).
Native SSGI: single post-process pass with `intensity * 0.2`
(`runtime-bevy/crates/threenative_runtime/src/ssgi_postprocess.rs:22-34`),
while separately injecting a flat global `AmbientLight` at `intensity * 0.45`
(`rendering.rs:341-345`, constant at `rendering.rs:38`), and
`native_ssgi_ambient_multiplier` (`rendering.rs:56-66`) is a no-op that
always returns `1.0`.

Net effect seen in the captures: native ceiling gets no bounce (near black)
while walls/crates are lifted by the flat ambient (brighter than web).

**Fix (calibrate, in this order):**

1. In `ssgi_postprocess.rs`, align the intensity scale with web:
   `intensity.max(0.0) * 0.4` (was `* 0.2`).
2. In `rendering.rs:341-345`, reduce the flat ambient when SSGI is enabled —
   implement `native_ssgi_ambient_multiplier` for real instead of the current
   `let _ = ssgi; 1.0`, e.g. return `0.33` when SSGI is enabled so ambient
   lands near web's effective 0.15 scale:

   ```rust
   // rendering.rs:56-66 — replace the no-op body
   else { return 1.0; };
   // SSGI supplies bounce; cut the flat ambient so it stops masking it.
   0.33
   ```

3. Recapture and A/B the ceiling gradient and crate brightness against web;
   tune the two constants only against captures, not by eye on one frame.

### B5. God rays: thin on native vs hazy on web

Web: `density * 0.025`, `intensity * 0.5`, 16-64 steps by quality
(`packages/runtime-web-three/src/rendering/godrays/GodRaysPass.ts:13-34`).
Native: Bevy `VolumetricLight` with constants at
`runtime-bevy/crates/threenative_runtime/src/rendering.rs:47-55`:

```rust
const NATIVE_VOLUMETRIC_SHAFT_DENSITY_SCALE: f32 = 0.025;
const NATIVE_VOLUMETRIC_SCATTERING_ASYMMETRY: f32 = 0.75;
const NATIVE_VOLUMETRIC_LIGHT_INTENSITY_SCALE: f32 = 5.2;
```

The asymmetry 0.75 makes scattering strongly forward-peaked → thin crisp
shafts; web's pass reads as broader haze.

**Fix:** lower `NATIVE_VOLUMETRIC_SCATTERING_ASYMMETRY` toward ~0.55-0.6 and
raise base scattering (`NATIVE_VOLUMETRIC_BASE_SCATTERING`, currently 0.15)
until the shaft width and room haze match web's capture. Follow
`PARITY-GUIDE-volumetrics-and-godrays.md` for the capture-based tuning loop.
Do this BEFORE judging bloom (B2) visually — the window halo is mostly haze.

### B6. Native drops material surface detail (flat walls/ceiling/floor)

Web applies roughness/normal detail maps with 8x8 repeat tiling
(`packages/runtime-web-three/src/worldMapping/stylizedNature.ts` ~120-180, and
`mapWorld.ts:973,1013` for roughness maps). Native collects texture names but
never binds detail textures into its portable shader
(`runtime-bevy/crates/threenative_runtime/src/map_world/entities.rs:483-533`).

**Fix (decision required, then mechanical):** either
- port the detail maps: load the same detail textures and set
  `StandardMaterial { normal_map_texture, metallic_roughness_texture, .. }`
  with `uv_transform` for the 8x8 repeat (Bevy `Affine2::from_scale(Vec2::splat(8.0))`), or
- de-scope the web-side procedural detail for this showcase so both are
  intentionally flat.

One side synthesizing detail the other cannot is an automatic parity-gate
failure; document the choice in `docs/bevy-feature-parity.md`.

### B7. Contact shadows — verify only

Both backends implement them (web:
`packages/runtime-web-three/src/rendering/contactShadows.ts:78-161`; native:
`runtime-bevy/crates/threenative_runtime/src/rendering/contact_shadows.rs`
with hardcoded Gaussian weights). Native's debris contact patches read
stronger only because web's haze washes over them. Re-compare after B5; only
touch this if the delta survives.

---

## Execution order

1. **A** — run the debugging methodology until the blue-box cause is proven,
   then fix + regression test. Do not start B-work by "fixing" A on a guess.
2. **B3** exposure source (biggest global mismatch, trivial fix).
3. **B4** SSGI/ambient calibration.
4. **B6** surface detail decision + implementation.
5. **B5** volumetrics haze → then re-judge **B2** bloom → then **B1** SSR.
6. **B7** re-compare contact shadows.

## Verification per step

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm verify:conformance
tn playtest examples/lumen-lite-showcase/playtests/hero-interior.playtest.json --json
tn playtest examples/lumen-lite-showcase/playtests/native-hero-interior.playtest.json --target desktop --json
```

Small change per gap; recapture both screenshots after each. Update
`docs/status/capabilities/rendering.md` + the `docs/STATUS.md` index line, and
`docs/bevy-feature-parity.md` whenever a parity claim changes (B1, B3, B6).
