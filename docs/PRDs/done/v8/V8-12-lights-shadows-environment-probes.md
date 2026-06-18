# V8-12 Lights, Shadows, and Environment Probes

Complexity: 8 -> HIGH mode

## Context

**Problem:** Basic lights, shadow metadata, per-mesh shadow flags, and shadow
bias controls are promoted, but shadow filtering, point-light shadows, light
budgets/culling, environment maps, probes, and light debug visualization remain
gaps.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v5/V5-07-lighting-atmosphere-shadow-and-color-parity.md`, and
`docs/PRDs/v8/V8-11-rendering-atmosphere-post-processing-parity.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: SDK light/environment declarations, compiler
  emit, IR validation, web/Bevy mapping, conformance, visual verification, and
  debug overlays.
- [x] Caller file identified: SDK light APIs, compiler scene emit, IR
  validation, web map/render code, Bevy light mapping, and verify scripts.
- [x] Registration/wiring needed: capabilities, diagnostics, fixtures, docs, and
  focused light/shadow gate.

**Is this user-facing?** Yes. Authors need predictable shadows and environment
lighting before broader GI/lightmap work.

## Solution

**Approach:**

- Add shadow filtering quality fields and map only supported modes.
- Promote point-light shadow parity with visual evidence.
- Add dynamic light budget/culling observations and over-budget diagnostics.
- Add environment maps and bounded reflection/irradiance probe metadata before
  GI or lightmaps.
- Add light gizmo/debug visualization for authored volumes and probes.

**Data Changes:** Shadow filter settings, point-light shadow fields, light
budget metadata, environment map/probe refs, and debug visualization metadata.

## Execution Phases

#### Phase 1: Shadow Filtering Contract - Shadow quality is explicit

**Implementation:**

- [ ] Add PCF/filter quality enum and map limits.
- [ ] Validate unsupported combinations.
- [ ] Report web/native observations.

**Verification Plan:** SDK/IR tests, runtime mapping tests, and diagnostics.

#### Phase 2: Point-Light Shadow Parity - Point shadows have visual proof

**Implementation:**

- [ ] Validate and map point shadow settings.
- [ ] Capture visual evidence in one focused fixture.
- [ ] Keep unsupported cubemap-specific options diagnostic-only.

**Verification Plan:** Runtime tests plus web/native screenshot artifacts.

#### Phase 3: Light Budgets and Culling - Over-budget scenes are actionable

**Implementation:**

- [ ] Declare dynamic light limits and clustered/culling expectations.
- [ ] Emit over-budget diagnostics and observations.
- [ ] Include budget info in conformance reports.

**Verification Plan:** Budget fixture and diagnostic tests.

#### Phase 4: Environment Maps and Probes - Reflections are bounded

**Implementation:**

- [ ] Add environment map refs and reflection/irradiance probe metadata.
- [ ] Validate supported asset formats and probe bounds.
- [ ] Map web/native behavior where portable.

**Verification Plan:** Asset/runtime tests and visual evidence.

#### Phase 5: Light Debug Visualization - Authors can inspect light volumes

**Implementation:**

- [ ] Add debug observations or gizmo geometry for lights and probes.
- [ ] Keep output editor/debug-only.

**Verification Plan:** Debug geometry tests and docs guard.

## Acceptance Criteria

- [ ] Shadow filtering, point shadows, budgets, environment maps/probes, and
  debug visualizations are promoted only with cross-runtime evidence.
