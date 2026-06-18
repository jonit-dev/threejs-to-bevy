# V8-10 Asset Load Sync, glTF Scene Access, and Inspection

Complexity: 9 -> HIGH mode

## Context

**Problem:** Bundle-local glTF scenes and textures load in web and Bevy, but
authors still need multi-asset load barriers, query/update access for spawned
glTF nodes, structured scene inspection, and dev-time asset watch diagnostics.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/PRDs/v3/V3-01-scene-asset-bundling-and-budgets.md`,
`docs/PRDs/v6/V6-08-asset-and-diagnostic-hardening.md`,
`docs/PRDs/v8/V8-01-editor-project-snapshot-and-structured-diffs.md`, and
`docs/PRDs/v8/V8-05-optional-react-webview-overlay.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: asset declarations, model scene instances,
  runtime asset services, editor snapshot/inspection commands, and optional
  overlay/editor panels.
- [x] Caller file identified: SDK asset helpers, compiler manifest emit, IR
  validation, web/Bevy asset loaders, CLI editor commands, and conformance.
- [x] Registration/wiring needed: asset groups, node handle registry,
  inspection output, watch diagnostics, fixtures, docs, and gates.

**Is this user-facing?** Yes. Authors need predictable loading and inspection
for model-heavy scenes without making glTF internals a runtime source of truth.

## Solution

**Approach:**

- Add declared asset groups/barriers and deterministic loading traces.
- Expose stable handles for named glTF nodes and portable operations: transform,
  visibility, material override, and lookup.
- Generate structured scene inspection JSON over entities, model nodes, assets,
  cameras, materials, and diagnostics.
- Add watch diagnostics for changed, missing, unsupported, and rebuild-required
  dependencies without claiming state-preserving hot reload.

**Data Changes:** Asset barrier metadata, glTF node handle metadata, inspection
JSON shape, and dev-time watch diagnostic codes.

## Execution Phases

#### Phase 1: Multi-Asset Load Synchronization - Gameplay waits on required assets

**Implementation:**

- [ ] Add asset group/barrier declarations.
- [ ] Start gameplay only after required assets resolve or emit actionable
  failures.
- [ ] Record load traces in web/native observations.

**Verification Plan:** Manifest tests, web/native loading trace tests, and
conformance fixture.

#### Phase 2: glTF Scene Entity Access - Named model nodes have stable handles

**Implementation:**

- [ ] Expose named node query/update handles for transforms and visibility.
- [ ] Add material override support where portable.
- [ ] Reject ambiguous or missing node refs.

**Verification Plan:** SDK/IR tests, web glTF mapping tests, Bevy scene
observation tests.

#### Phase 3: Scene Inspection Workflow - Inspection is structured and deterministic

**Implementation:**

- [ ] Emit inspection JSON for entities, assets, model nodes, cameras,
  materials, and diagnostics.
- [ ] Support CLI/editor commands that read bundle data, not raw runtime state.
- [ ] Add deterministic snapshots and diffs.

**Verification Plan:** Snapshot/diff tests against inspection JSON.

#### Phase 4: Dev-Time Watch Diagnostics - Asset changes produce explicit policy

**Implementation:**

- [ ] Report changed, missing, and unsupported dependencies.
- [ ] Distinguish rebuild, reload, and unsupported state-preserving hot reload.
- [ ] Keep diagnostics path-based and bundle-relative.

**Verification Plan:** CLI/watch tests and diagnostic shape assertions.

## Acceptance Criteria

- [ ] Asset barriers, glTF node access, inspection output, and watch diagnostics
  are validated and testable.
- [ ] Hot reload remains diagnostic-only unless a later PRD promotes runtime
  state policy.
