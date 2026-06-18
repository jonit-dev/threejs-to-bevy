# V8-11 Rendering, Atmosphere, and Post-Processing Parity

Complexity: 9 -> HIGH mode

## Context

**Problem:** Rendering metadata covers fog, sky/horizon color, tone mapping,
exposure, dense-content observations, bloom, and MSAA, but native visual parity
for fog/sky, skyboxes, instancing/batching, broader anti-aliasing, and color
grading remains incomplete.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v5/V5-07-lighting-atmosphere-shadow-and-color-parity.md`,
`docs/PRDs/v7/V7-06-renderer-and-dense-content-runtime-parity.md`,
`docs/PRDs/v8/V8-06-camera-helpers-multi-view-and-render-targets.md`, and
`docs/PRDs/v8/V8-07-material-texture-shader-parity.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: runtime rendering config, environment scene IR,
  camera/runtime settings, web/Bevy render adapters, conformance, screenshots,
  and performance reports.
- [x] Caller file identified: SDK/environment APIs, compiler emit, IR
  validation, web renderer setup, Bevy renderer setup, and verify scripts.
- [x] Registration/wiring needed: capabilities, render settings mapping,
  screenshot fixtures, docs guards, and focused V8 gate.

**Is this user-facing?** Yes. Authors need visible atmosphere and quality
settings to behave consistently or fail before runtime.

## Solution

**Approach:**

- Prove existing fog/sky metadata as native visual output, not observation-only
  fields.
- Add bundle-local skybox/cubemap contracts with format diagnostics.
- Promote renderer-level instancing/batching only with measurable web/native
  evidence.
- Add FXAA/TAA/SMAA policy and color grading/filmic controls where both
  adapters can map or diagnose.

**Data Changes:** Skybox/cubemap asset refs, renderer quality settings,
instancing/batching observations, anti-aliasing/color grading policy fields,
and unsupported format diagnostics.

## Execution Phases

#### Phase 1: Native Fog and Sky Visual Parity - Existing metadata renders visibly

**Implementation:**

- [ ] Map promoted fog/sky fields to native visual output.
- [ ] Capture web/native screenshots with nonblank and region checks.
- [ ] Keep unsupported atmosphere features out of scope.

**Verification Plan:** Focused visual fixture and conformance observations.

#### Phase 2: Skybox and Cubemap Contract - Bundle-local skyboxes are portable

**Implementation:**

- [ ] Add skybox/cubemap asset refs and validation.
- [ ] Map web and Bevy skybox behavior for supported formats.
- [ ] Diagnose compressed or backend-only formats.

**Verification Plan:** Asset validation tests, runtime mapping tests, and
screenshot evidence.

#### Phase 3: Renderer Instancing and Batching - Dense content has runtime evidence

**Implementation:**

- [ ] Promote only renderer-level instancing/batching with draw/instance
  observations.
- [ ] Compare budget reports across web and Bevy.
- [ ] Avoid claiming visual LOD swapping unless separately implemented.

**Verification Plan:** Dense fixture, conformance reports, and budget artifacts.

#### Phase 4: Anti-Aliasing and Color Grading - Quality modes are explicit

**Implementation:**

- [ ] Add FXAA/TAA/SMAA support policy and diagnostics.
- [ ] Promote color grading/filmic controls with mapped web/native behavior.
- [ ] Document unsupported post effects.

**Verification Plan:** Focused unit/runtime tests plus visual comparisons.

#### Phase 5: Rendering Quality Gate - Evidence is aggregated

**Implementation:**

- [ ] Add `pnpm verify:v8:rendering-quality` or equivalent.
- [ ] Aggregate screenshots, conformance, budgets, and docs guard output.

**Verification Plan:** Gate writes `tools/verify/artifacts/rendering-quality/`.

## Acceptance Criteria

- [ ] Native fog/sky, skybox/cubemap support, instancing/batching evidence, and
  promoted quality modes are backed by tests and artifacts.
