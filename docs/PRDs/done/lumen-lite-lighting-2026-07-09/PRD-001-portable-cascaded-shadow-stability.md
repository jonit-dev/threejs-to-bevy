# PRD: Portable Cascaded Shadow Stability

`Planning Mode: Principal Architect`
`Complexity: 6 -> MEDIUM mode`
Score basis: +2 (6-10 files) +2 (multi-package: ir/compiler/web/bevy) +2
(new adapter-private shadow subsystem on web).

## 1. Context

**Problem:** Portable shadow quality resolves map size, filter, and cascade
count in both adapters, but the web adapter has no true cascade
stabilization: sun shadows shimmer and swim while the camera moves, and the
cascade split/max-distance behavior is not authored or matched across
runtimes. This is the single most visible "cheap renderer" tell.

**Goal:** A stable, texel-snapped cascaded directional shadow system on web,
and a matched portable cascade configuration (max distance, split scheme,
cascade blending, stabilization) that Bevy maps to its native
`CascadeShadowConfigBuilder`.

**Non-goals:** Point/spot shadow cascades; ray-traced shadows (PRD-005 turf);
per-object shadow LOD; WebGPU paths.

**Files Analyzed:**

- `docs/status/capabilities/rendering.md` - current shadow quality profile
  (low 512/basic/1 cascade, medium 1024/PCF/2, high 2048/soft PCF/4; "Web
  applies the filter/map settings to shadow-casting lights, while Bevy
  applies the map resource and camera filtering method").
- `packages/ir/src/types.ts` - `IAtmosphereProfileIr.shadows`
  (`mapSize`, `cascadeCount`).
- `packages/ir/src/runtimeConfig.ts` - render-look presets carrying
  `shadowQuality`.
- `packages/runtime-web-three/src/render.ts`, `rendering/` - where the web
  shadow pass must live.
- `runtime-bevy/crates/threenative_runtime/src/rendering.rs` - existing
  `CascadeShadowConfigBuilder` / `DirectionalLightShadowMap` usage.

**Current Behavior:**

- Web maps shadow quality to Three.js light shadow map size/filter only; the
  cascade count is effectively a Bevy-side concept.
- No portable control over shadow distance, split distribution, cascade
  blend, or stabilization.
- Moving-camera shimmer is visible in web captures; Bevy is stable because
  its cascades are engine-managed.

## 2. Solution

**Approach:**

- Port the cascade math from `StrandedKitty/three-csm` (MIT) into an
  adapter-private `DirectionalShadowController` inside
  `packages/runtime-web-three`: frustum splitting, per-cascade orthographic
  bounds, distance-scaled bias, and texel snapping.
- Extend the portable atmosphere shadow block with bounded fields:
  `maxDistance`, `splitScheme` (`"uniform" | "logarithmic" | "practical"`),
  `splitLambda` (practical-scheme blend, 0..1), `cascadeBlendFraction`,
  `stabilized` (boolean). Validate ranges in `packages/ir/src/rendering.ts`.
- Bevy maps the same fields onto `CascadeShadowConfigBuilder`
  (`maximum_distance`, `first_cascade_far_bound`, `overlap_proportion`,
  `num_cascades`); Bevy cascades are already stable, so `stabilized` is a
  no-op reported as `applied`.
- Both adapters report the resolved cascade profile through the existing
  shared bounded profile report so the conformance gate compares one shape.

### What to harvest from three-csm (and what to refuse)

Port from `src/CSMFrustum.ts` and `src/CSM.ts`:

- `uniformSplit()`, `logarithmicSplit()`, `practicalSplit()` - split-distance
  generation. Practical split is `lerp(uniform, logarithmic, lambda)` per
  break point; expose `lambda` as the portable `splitLambda`.
- `updateShadowBounds()` - fits each cascade's ortho camera to its frustum
  slice with a radius-based bounding sphere.
- Texel snapping (the stability core). The shape of the port:

```ts
// DirectionalShadowController.update(), per cascade
const shadowCam = cascade.light.shadow.camera;
const texelWidth = (shadowCam.right - shadowCam.left) / mapSize;
const texelHeight = (shadowCam.top - shadowCam.bottom) / mapSize;
// move the light center in whole texels only
center.x = Math.floor(center.x / texelWidth) * texelWidth;
center.y = Math.floor(center.y / texelHeight) * texelHeight;
```

Do NOT copy: the global `THREE.ShaderChunk` replacement, the assumption that
CSM lights are the scene's first directional lights, or direct
`onBeforeCompile` ownership of user materials. Cascade selection on web uses
one Three.js `DirectionalLight` per cascade owned by the controller (three-csm
does this too — acceptable, but the controller owns their lifecycle and they
are invisible to authored-scene queries and conformance entity counts).

**Key Decisions:**

- [x] Cascade math lives in a pure, unit-testable module
      (`packages/runtime-web-three/src/rendering/cascadeMath.ts`) separate
      from Three.js object management.
- [x] `splitLambda` default 0.5 matches Bevy's practical-ish default feel;
      calibration fixture decides the final anchor.
- [x] Fields absent -> current behavior unchanged (defaults preserve today's
      resolved profile exactly).

**Data Changes:** `IAtmosphereProfileIr.shadows` gains the five optional
fields above; compiler capability enrollment adds
`("rendering", "shadow-cascade-profile")` when any is authored.

## 3. Integration Points

- Entry point: authored atmosphere in scene source /
  `tn runtime set-rendering`; render-look presets may set `shadowQuality`
  which resolves these fields.
- Caller files: `packages/ir/src/rendering.ts` (validation),
  `packages/compiler/src/emit/capabilities.ts` (enrollment), both adapters'
  atmosphere application paths.
- User-facing: yes — visibly stable sun shadows; inspectable via the existing
  runtime feature report, no new UI surface required.

## 4. Execution Phases

#### Phase 1: Portable cascade fields - Authored cascade config validates and reaches both bundles.

**Files (max 5):**

- `packages/ir/src/types.ts` - extend shadow block.
- `packages/ir/src/rendering.ts` - range validation +
  `TN_IR_ATMOSPHERE_SHADOW_CASCADE_*` diagnostics.
- `packages/compiler/src/emit/capabilities.ts` - capability enrollment.
- `packages/ir/src/rendering.test.ts` - validator tests.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/ir/src/rendering.test.ts` | should reject splitLambda outside 0..1 | diagnostic code emitted |
| `packages/compiler/src/emit/capabilities.test.ts` | should enroll shadow-cascade-profile when maxDistance authored | manifest contains capability |

**User Verification:** Build a scene authoring `shadows.maxDistance`; bundle
manifest lists the capability; no diagnostics on valid input.

#### Phase 2: Web cascade math module - Split/fit/snap math is proven pure.

**Files (max 5):**

- `packages/runtime-web-three/src/rendering/cascadeMath.ts`
- `packages/runtime-web-three/src/rendering/cascadeMath.test.ts`

**Implementation:**

- [x] Port uniform/logarithmic/practical splits, frustum-slice ortho fit,
      texel snap, distance-scaled bias from three-csm; ASCII source; cite
      origin + MIT notice in the file header.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `cascadeMath.test.ts` | should produce monotonic split distances for all schemes | breaks strictly increasing, end == maxDistance |
| `cascadeMath.test.ts` | should snap center movement to whole texels | sub-texel camera translation yields identical light matrix |

#### Phase 3: Web DirectionalShadowController - Sun shadows stop shimmering in the running web adapter.

**Files (max 5):**

- `packages/runtime-web-three/src/rendering/directionalShadowController.ts`
- `packages/runtime-web-three/src/render.ts` - wire per-frame update.
- `packages/runtime-web-three/src/mapWorld.ts` - route authored fields.
- `packages/runtime-web-three/src/conformance.test.ts` - report shape.

**Implementation:**

- [x] Controller owns cascade lights, applies resolved profile, updates on
      camera move, reports the resolved bounded profile.
- [x] Feature report keeps today's shape plus the new resolved fields.

**User Verification:** Move the camera in a shadowed fixture scene; shadow
edges stay pinned (record before/after capture pair).

#### Phase 4: Bevy mapping + parity gate - Both runtimes resolve one cascade profile report.

**Files (max 5):**

- `runtime-bevy/crates/threenative_runtime/src/rendering.rs` - map fields to
  `CascadeShadowConfigBuilder`.
- `runtime-bevy/crates/threenative_runtime/tests/rendering.rs` - mapping test.
- `tools/verify/` fixture wiring for a `shadow-cascade-stability` focused
  check (reuse the feature-parity-visual-polish shadow fixture pattern; do
  not create a parallel list — enroll via the fixture catalog).

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `runtime-bevy/.../tests/rendering.rs` | should map splitScheme practical to overlap/far-bound config | builder values match expected transform of splitLambda |
| conformance fixture | cascade profile parity | web and native reports resolve identical bounded profile |

**User Verification:** `pnpm verify:conformance` fixture shows matching
requested/applied cascade profiles; screenshot pair shows comparable shadow
reach and softness.

## 5. Verification

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @threenative/runtime-web-three test -- cascade
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime rendering
pnpm verify:conformance
pnpm verify:focused verify:feature-parity-visual-polish
```

Checkpoint after each phase via `prd-work-reviewer`; Phase 3 additionally
needs manual visual verification (moving-camera capture).

## 6. Acceptance Criteria

- [x] Authored cascade fields validate, enroll capability, and default to
      today's behavior when absent.
- [x] Web sun shadows are texel-stable under camera movement (capture proof).
- [x] Bevy maps the same fields natively; both adapters emit one shared
      resolved-profile report shape.
- [x] No global ShaderChunk mutation, no `onBeforeCompile` takeover of user
      materials.
- [x] `docs/status/capabilities/rendering.md`, `docs/STATUS.md` index line,
      and `docs/bevy-feature-parity.md` updated.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Per-cascade extra lights change web light counts seen by other systems | Medium | Controller-owned lights excluded from entity/conformance queries; regression test |
| Bevy 0.14 builder cannot express arbitrary split arrays | Medium | Portable fields limited to what both can honor (scheme+lambda, not raw split arrays) |
| Texel snapping conflicts with existing shadow bias calibration | Low | Recalibrate via the shadow parity fixture before promotion |
