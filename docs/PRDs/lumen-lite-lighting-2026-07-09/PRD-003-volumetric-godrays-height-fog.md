# PRD: Shadowed God Rays And Height Fog

`Planning Mode: Principal Architect`
`Complexity: 7 -> HIGH mode`
Score basis: +2 (6-10 files) +2 (multi-package) +2 (new post pipeline on web)
+1 (shader vendoring with license obligations).

## 1. Context

**Problem:** Scenes have only classic distance fog. There is no volumetric
depth cue and no shadowed light-shaft ("god ray") response — the two effects
that most quickly read as "expensive renderer".

**Goal:** A portable `atmosphere.volumetrics` block with two bounded
sub-features — `heightFog` and `godRays` (directional-sun only) — mapped to:

- Web: vendored `three-good-godrays` (shadow-map-aware raymarched shafts) and
  a height-fog pass derived from `three-volumetric-pass`, both half-res with
  depth-aware compositing.
- Bevy 0.14: native `VolumetricFogSettings` (camera component) +
  `VolumetricLight` (marker on the sun directional light). This is a mapping
  job, not an implementation job — Bevy already ships exactly this feature.

**Non-goals:** Point/spot god rays on web v1 (the vendored shader supports
point lights; promote directional only so both adapters can honor it —
Bevy 0.14 `VolumetricLight` is directional-focused). Clouds/procedural 3D
noise volumes. Froxel-based unified volumetrics. Local fog volumes
(`FogVolume` is Bevy 0.15+).

**Files Analyzed:**

- `packages/ir/src/types.ts` - `IAtmosphereProfileIr.fog` (linear/exponential
  distance fog today).
- `packages/runtime-web-three/src/render.ts` + composer chain (ACES output
  pass; new passes must slot before tonemapping).
- `runtime-bevy/crates/threenative_runtime/src/rendering.rs` - atmosphere ->
  `FogSettings` mapping; where `VolumetricFogSettings` attaches to the
  camera.
- `Ameobea/three-good-godrays`: `src/godrays.frag`, `src/illumPass.ts`,
  `src/bilateralFilter.ts`, `src/compositorPass.ts`.
- `Ameobea/three-volumetric-pass`: density/height/raymarch controls,
  half-res target, blue-noise sampling.

**Current Behavior:**

- Distance fog only, both adapters, parity-calibrated.
- Web composer: bloom, GTAO, DoF, SSR, motion blur, fitted ACES output.
- Bevy: `FogSettings`; `VolumetricFogSettings`/`VolumetricLight` unused.

## 2. Solution

**Portable schema (atmosphere-level, not renderer-level, because these are
world lighting semantics):**

```ts
export interface IAtmosphereVolumetricsIr {
  heightFog?: {
    enabled: boolean;
    density: number;        // 0..1
    falloffHeight: number;  // world units; density halves per falloff above base
    baseHeight: number;     // world Y of full density
    color?: [number, number, number]; // defaults to fog color
  };
  godRays?: {
    enabled: boolean;
    intensity: number;      // 0..2, calibrated anchor at 1
    density: number;        // 0..1 raymarch density
    maxDistance: number;    // march clamp, world units
    quality: "low" | "medium" | "high"; // step counts, resolution scale
  };
}
```

**Web mapping (vendored, adapter-private):**

- God rays: vendor `godrays.frag` + illum/bilateral/compositor passes under
  `packages/runtime-web-three/src/rendering/godrays/` with the required
  license notice and an "altered from upstream" marker. Keep: world-position
  reconstruction from depth, shadow-map queries during the march, adaptive
  step size aligned to shadow texel size, per-pixel noise, early termination,
  distance attenuation. Wire to the sun light's existing shadow map (depends
  on PRD-001's controller exposing the cascade-0 map or a dedicated
  far-range map — decide in Phase 2 spike).
- Height fog: a single fullscreen pass (half-res target, depth-aware
  upsample+composite) implementing analytic exponential height fog; borrow
  the half-res/composite/early-termination scaffolding from
  `three-volumetric-pass` but skip its noise/cloud machinery (non-goal).
  Analytic height fog integrates in closed form — no raymarch needed for the
  noise-free case:

```glsl
// transmittance along view ray from camera to fragment, exponential height fog
float fogAmount(vec3 ro, vec3 rd, float dist) {
  float f = falloff; // 1/falloffHeight
  float c = density * exp(-(ro.y - baseHeight) * f);
  return clamp((c / max(f * rd.y, 1e-4)) * (1.0 - exp(-dist * rd.y * f)), 0.0, 1.0);
}
```

- Pass ordering: scene -> GTAO -> godrays illum+composite -> height fog ->
  bloom -> DoF -> motion blur -> ACES output. God rays before bloom so shafts
  bloom naturally.

**Bevy mapping:**

```rust
// camera entity, when volumetrics authored
commands.entity(camera).insert(VolumetricFogSettings {
    ambient_intensity: mapped_height_fog_density,
    // step_count / max_depth from quality tier
    ..default()
});
// sun entity, when godRays.enabled
commands.entity(sun).insert(VolumetricLight);
```

Bevy's volumetric fog is a single scattering medium; `heightFog` maps to the
medium density/ambient terms and `godRays.intensity` to the light's
volumetric contribution. Exact field mapping is a Phase 3 calibration task
against the web anchor (same policy as AO/bloom calibration anchors).

**Key Decisions:**

- [ ] Directional-sun-only promotion; other light types report
      `TN_RENDER_FEATURE_FALLBACK` with reason `unsupported-light-type`.
- [ ] Quality tier -> step count/resolution derived through the render-look
      target overrides ladder (no new quality list).
- [ ] Both features report requested/applied through the existing renderer
      feature-report shape even though they are atmosphere-authored (reuse
      `conformanceReport.ts` fields; add `volumetrics` entry).

**Data Changes:** `IAtmosphereProfileIr.volumetrics` + validators
(`TN_IR_ATMOSPHERE_VOLUMETRICS_*`); compiler capabilities
`("rendering", "volumetric-height-fog")` and
`("rendering", "volumetric-god-rays")`.

## 3. Integration Points

- Entry point: atmosphere authoring in scene source; `tn runtime
  set-rendering` extension for volumetrics fields; `cinematic` render-look
  preset may enable subtle height fog at high tier (decide during
  calibration — preset change is one line in
  `RENDER_LOOK_PROFILE_PRESETS`).
- Caller files: both adapters' atmosphere application paths.
- User-facing: yes — visible shafts/fog; inspector rows derive from schema.

## 4. Execution Phases

#### Phase 1: Portable schema + capability - Volumetrics validate and enroll.

**Files (max 5):** `packages/ir/src/types.ts`,
`packages/ir/src/rendering.ts`, `packages/ir/src/rendering.test.ts`,
`packages/compiler/src/emit/capabilities.ts` (+ test).

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `rendering.test.ts` | should reject negative falloffHeight | diagnostic emitted |
| `capabilities.test.ts` | should enroll god-rays capability only when enabled | capability present iff enabled |

#### Phase 2: Web height fog - Fog thins with altitude on web.

**Files (max 5):**
`packages/runtime-web-three/src/rendering/heightFogPass.ts` (+ test),
`render.ts` (composer wiring), `mapWorld.ts` (authoring routing).

- [ ] Half-res target, analytic integration, depth-aware composite, respects
      ACES ordering, teardown-enrolled.

**User Verification:** Fixture with a tall column: fog dense at base, clear
at top; capture.

#### Phase 3: Web god rays - Shadowed sun shafts on web.

**Files (max 5):**
`packages/runtime-web-three/src/rendering/godrays/` (vendored frag + illum +
bilateral + compositor), `render.ts` wiring.

- [ ] Vendor with license notice; bind sun shadow map; quality -> step
      count/half-res; verify no interaction bugs with DoF/motion blur
      ordering.

**User Verification:** Fixture: sun behind pillars, camera in shadowed side;
visible shafts between pillars that occlude correctly when a pillar blocks
the sun.

#### Phase 4: Bevy mapping - Same authored block lights up natively.

**Files (max 5):**
`runtime-bevy/crates/threenative_runtime/src/rendering.rs`,
`map_world/rendering.rs`, `tests/rendering.rs`.

- [ ] Insert/remove `VolumetricFogSettings` + `VolumetricLight` from authored
      state through the existing reconcile path; map density/intensity with
      calibration constants next to the existing anchors (rendering.rs lines
      ~25-29 pattern).

#### Phase 5: Parity gate - Focused fixture proves both adapters.

**Files (max 5):** conformance fixture catalog entry + focused verify
`verify:volumetrics` (region metrics: shaft region brighter than shadowed
neighbor; base-vs-top fog luminance gradient; both adapters).

## 5. Verification

```bash
pnpm build && pnpm typecheck && pnpm test
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime rendering
pnpm verify:conformance
pnpm verify:focused verify:volumetrics
pnpm verify:rendering-photoreal   # regression: existing photoreal gates hold
```

HIGH complexity: checkpoint via `prd-work-reviewer` after every phase; manual
visual checkpoints after Phases 2, 3, 4.

## 6. Acceptance Criteria

- [ ] `atmosphere.volumetrics` authored once produces height fog + shadowed
      shafts in both adapters within region-metric tolerances.
- [ ] Non-directional god-ray requests fall back with an honest diagnostic.
- [ ] Upstream license notice preserved and modifications marked (repo audit
      passes).
- [ ] Existing photoreal/rendering gates unchanged when volumetrics absent.
- [ ] Capability doc, STATUS index, parity table updated.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Web god rays need shadow-map access PRD-001 restructures | High | Sequence after PRD-001; Phase 3 opens with a spike binding cascade-0 map |
| Bevy volumetric medium model differs from web analytic fog | Medium | Region-metric calibration, not pixel parity (established policy); document residual in rendering residual contract rows |
| Half-res composite halos on thin geometry | Medium | Vendored bilateral filter; fixture includes thin-pillar edge region |
| three-volumetric-pass license unverified | Low | Verify before vendoring; only scaffolding concepts are needed, reimplement if unclear |
