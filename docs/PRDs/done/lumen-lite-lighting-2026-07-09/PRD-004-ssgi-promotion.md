# PRD: SSGI Promotion (Dynamic Indirect Diffuse)

`Planning Mode: Principal Architect`
`Complexity: 8 -> HIGH mode`
Score basis: +2 (10+ files across shader/pass/report/gate) +2 (multi-package)
+2 (new temporal-reprojection system) +2 (complex state: history buffers,
camera-motion invalidation).

## 1. Context

**Problem:** `renderer.screenSpaceGlobalIllumination` exists in the IR
(`quality: "low" | "medium"`) but is a diagnostic-only request emitting
`TN_RENDER_FEATURE_FALLBACK` in both adapters. Scenes get no dynamic color
bleeding or emissive spill; lighting reads static.

**Goal:** Promote SSGI with real rendered proof:

- Web (WebGL): an adapter-owned SSGI pass built from the
  `0beqz/realism-effects` (MIT) algorithms — diffuse hemisphere sampling,
  screen-space ray marching against depth, beauty-buffer light gathering,
  temporal reprojection — with the pass lifecycle rewritten to fit our
  composer (no monkey-patching).
- Bevy 0.14: no SSGI exists natively. Promote a documented bounded
  approximation (the SSAO-precedent policy): deferred-path SSAO plus a
  calibrated dynamic ambient/irradiance response anchored to the web result,
  reported honestly as `appliedMode: "approximation"`.

**Non-goals:** WebGPU `SSGINode` (tracked as the future high tier — see
appendix), specular GI/SSR changes (already promoted separately), off-screen
GI (PRD-005), surfel caches.

**Files Analyzed:**

- `packages/ir/src/runtimeConfig.ts` -
  `IRendererScreenSpaceGlobalIlluminationIr` (exists).
- `packages/compiler/src/emit/capabilities.ts` - SSGI already enrolls
  `("rendering", "screen-space-global-illumination")`.
- `packages/ir/src/conformanceReport.ts` - requested/applied feature report.
- `packages/runtime-web-three/src/render.ts` - composer; GTAO, motion-blur
  temporal-history precedents.
- `runtime-bevy/crates/threenative_runtime/src/rendering.rs` - SSAO
  approximation precedent ("bounded ambient term approximation around the
  calibrated intensity anchor").
- `0beqz/realism-effects` - `SSGI` shader chain and temporal reprojection.

**Current Behavior:**

- Both adapters preserve requested state and emit rollout-gap diagnostics.
- Web already runs GTAO (depth+normal G-buffer-ish inputs exist) and
  temporal accumulation for motion blur (history-texture lifecycle solved
  once already).

## 2. Solution

### What to harvest from realism-effects (and what to refuse)

Take the algorithms:

- Diffuse hemisphere sampling around the G-buffer normal (cosine-weighted).
- Screen-space ray march against the depth buffer with binary-search
  refinement; on hit, gather radiance from the previous frame's beauty
  buffer weighted by BRDF/PDF.
- Miss fallback: environment/ambient term (our authored environment map
  intensity), so rays leaving the screen degrade gracefully.
- Temporal reprojection: velocity from camera matrices (we have
  current/previous view-projection from the motion-blur pass), neighborhood
  clamping, confidence-based blend, hit-distance-aware history weighting.

Refuse the architecture:

- It monkey-patches `RenderPass.prototype.render` globally — our pass slots
  into the existing composer instead.
- Known upstream bugs to not inherit: a duplicated `"medium"` branch in the
  quality presets and a double-dispose of one render target in
  `SSGIPass.dispose()`. Write dispose tests.

### Web pass structure (adapter-private)

```text
inputs:  depth, normal (reuse GTAO's reconstruction path), previous beauty,
         current/previous camera matrices
SSGIPass (half-res, quality-scaled ray count/steps)
  -> TemporalResolvePass (history + velocity + clamp)
  -> upsample + additive composite into beauty BEFORE bloom/tonemapping
output:  indirect diffuse added to lit scene; report applied
```

Quality mapping (extend IR to `"low" | "medium" | "high"` in this PRD):
low = 4 rays/8 steps half-res, medium = 8/12 half-res, high = 8/16 full-res
temporal. Exact anchors set by the calibration fixture.

### Bevy bounded approximation

Bevy 0.14 cannot march screen rays for diffuse GI. Follow the AO precedent
exactly (`rendering.md` lines 53-59 pattern):

- Enable/boost `ScreenSpaceAmbientOcclusion` on the camera when SSGI is
  requested (deferred path is already accepted for SSR scenes).
- Add a calibrated scene-wide indirect response: scale `AmbientLight`
  brightness and environment-map intensity by an anchor derived from the
  fixture's web SSGI luminance lift, so a native scene with SSGI requested
  is measurably brighter in indirectly-lit regions than one without.
- Report `appliedMode: "approximation"` with a documented residual row in
  `SHARED_RESIDUAL_CONTRACT_ROWS` (classified, not silent). Emissive-bleed
  parity is explicitly a residual: the fixture asserts direction (indirect
  region lifts when SSGI on) in both adapters, and color-bleed hue only on
  web.

**Key Decisions:**

- [x] SSGI composites before tonemapping (linear light), after AO.
- [x] Temporal history invalidates on teleport/scene-swap via the same reset
      rules as the motion-blur history (first use, resize, view change).
- [x] `quality: "high"` is web-promoted only at desktop tier; the ladder in
      `RENDER_LOOK_TARGET_PROFILE_OVERRIDES` owns that clamp.

**Data Changes:** Extend the existing SSGI IR interface with `"high"` quality
and optional `intensity` (0..2, anchor 1) + `radius` (world-space, bounded).
No new capability id (already enrolled).

## 3. Integration Points

- Entry point: `tn runtime set-rendering` already mutates renderer feature
  fields; editor inspector rows already derive from the schema. Extending the
  schema flows through existing surfaces.
- Caller files: web composer wiring in `render.ts`; Bevy camera/ambient setup
  in `rendering.rs`.
- User-facing: yes — visible color bleed/emissive spill on web, brighter
  bounce response on native, plus honest feature reports.

## 4. Execution Phases

#### Phase 1: Schema extension + report shape - Quality high/intensity/radius validate everywhere.

**Files (max 5):** `packages/ir/src/runtimeConfig.ts`,
`packages/ir/src/rendering.ts` (+ tests), `packages/ir/src/conformanceReport.ts`.

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `rendering.test.ts` | should accept quality high and bounded intensity | no diagnostic |
| `conformanceReport` tests | should carry appliedMode approximation | report round-trips |

#### Phase 2: Web SSGI pass (spatial only) - Color bleeding appears on web, no temporal yet.

**Files (max 5):**
`packages/runtime-web-three/src/rendering/ssgi/ssgiPass.ts`,
`ssgi/ssgi.frag.ts` (shader source module), `render.ts` wiring,
`ssgi/ssgiPass.test.ts`.

- [x] Hemisphere sampling + depth march + previous-beauty gather + env-miss
      fallback; half-res + upsample; dispose test (upstream double-dispose
      bug regression).

**User Verification:** Fixture: white room, one saturated red wall, neutral
sun. Floor near the wall shows red bleed when enabled, none when disabled.

#### Phase 3: Temporal resolve - SSGI is stable under motion.

**Files (max 5):** `ssgi/temporalResolvePass.ts` (+ test), `render.ts`.

- [x] Reprojection with current/previous matrices (reuse motion-blur history
      ownership pattern), neighborhood clamp, confidence blend, reset rules.

**User Verification:** Orbit the fixture camera: no smearing trails, no
boiling; capture GIF/frames.

#### Phase 4: Bevy approximation + residual classification - Native responds to SSGI honestly.

**Files (max 5):**
`runtime-bevy/crates/threenative_runtime/src/rendering.rs` (+ test), residual
contract rows file (locate `SHARED_RESIDUAL_CONTRACT_ROWS` owner), Bevy
conformance report plumbing.

- [x] SSAO enable + calibrated ambient/environment lift; report
      `approximation`; classified residual row for color-bleed hue.

#### Phase 5: Parity gate + promotion - SSGI leaves diagnostic-only status.

**Files (max 5):** fixture catalog entry (`photoreal-ssgi-red-wall-test`),
`tools/verify` focused check `verify:ssgi`, capability/status/parity doc
updates.

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| focused verify | indirect region lifts when SSGI on | both adapters, monotone with intensity |
| focused verify | web bleed region gains red hue | web-only hue assertion |
| focused verify | reports match requested/applied contract | web `baseline`, native `approximation`, no fallback diagnostic |

## 5. Verification

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @threenative/runtime-web-three test -- ssgi
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime rendering
pnpm verify:conformance
pnpm verify:focused verify:ssgi
pnpm verify:rendering-photoreal
pnpm verify:focused verify:rendering-residuals
```

HIGH mode: `prd-work-reviewer` checkpoint every phase; manual visual
checkpoints after Phases 2, 3, 4 (motion stability cannot be asserted by
region metrics alone).

## 6. Acceptance Criteria

- [x] Web renders spatially+temporally stable indirect diffuse from on-screen
      surfaces and emissives; disabled = today's image bit-for-bit.
- [x] Native scenes respond to the same authored field with a calibrated,
      classified approximation — never a silent no-op, never an unreported
      divergence.
- [x] `TN_RENDER_FEATURE_FALLBACK` for SSGI is gone on both adapters.
- [x] Upstream bugs (duplicate preset branch, double dispose) have explicit
      regression tests.
- [x] rendering.md, STATUS.md, bevy-feature-parity.md, residual rows updated.

## Completion Record (2026-07-10)

- Independent HIGH-mode review approved all phases and the final promotion.
- Schema/source/CLI/editor surfaces carry low/medium/high quality plus bounded
  intensity and radius; mobile web clamps high to the shared medium ceiling.
- Web owns spatial ray marching, four-step hit refinement, depth-aware
  upsampling, bilateral temporal denoise, reprojection/clamping, continuous
  history scheduling for static scenes, reset, and idempotent disposal.
- Bevy owns the documented SSAO plus calibrated ambient/environment
  approximation and reports the classified color-bleed residual.
- `pnpm verify:focused verify:ssgi` passes disabled/authored/high causal checks,
  web red-bleed and static-noise checks, clean shader/runtime console checks,
  and a three-pose orbit proof. The final orbit metrics recorded camera
  displacement `0.06992`, ghosting `0.00164`, and boiling `0.00163` MAE.
- Runtime-web tests pass `369/369`, IR tests pass `351/351`, native atmosphere
  tests pass `11/11`, CLI tests pass `395/395`, editor tests pass `105/105`,
  cookbook/docs/conformance/residual gates pass, and the focused SSGI gate is
  green. The broad photoreal gate still reports the pre-existing whole-pipeline
  web/native color rendition drift tracked for the milestone calibration pass;
  no SSGI-specific focused diagnostic remains.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebGL SSGI too slow at default tier | High | Half-res + low ray counts by default; the shared ladder clamps mobile-web high requests to medium; measure in the visual-performance gate |
| Temporal ghosting in gameplay (fast motion) | Medium | Confidence/clamp tuning; playtest capture in verification; fall back to spatial-only at low quality |
| Native approximation over-brightens authored looks | Medium | Anchor calibration against fixture; approximation applies only when SSGI explicitly requested |
| Reading previous beauty buffer conflicts with composer pass order | Medium | Phase 2 opens with a composer-order spike; documented ordering contract in render.ts |

## Appendix: Future WebGPU tier (do not build now)

When the web adapter gains a WebGPU renderer path (`renderPath` already
exists in the IR), the official Three.js `SSGINode`
(`examples/jsm/tsl/display/SSGINode.js`) is the intended replacement:
horizon-based sampling with occlusion bitfields, separate AO+GI MRT outputs,
TRAA integration. The IR schema in this PRD is deliberately
technique-agnostic (`quality`/`intensity`/`radius`) so that swap changes no
authored content. Bevy's real SSGI story likewise arrives with a future Bevy
upgrade (solari/GI work post-0.14); the approximation report contract makes
that upgrade a drop-in promotion.
