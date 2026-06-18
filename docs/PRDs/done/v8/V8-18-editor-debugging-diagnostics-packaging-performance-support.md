# V8-18 Editor, Debugging, Diagnostics, Packaging, and Performance Support

Complexity: 11 -> HIGH mode

## Context

**Problem:** V8 has structured editor snapshots and diffs, while V7 has
packaging/performance evidence, but scene hierarchy/property inspection, asset
preview, debug draw/FPS overlay, unsupported-feature diagnostics, large stress
fixtures, profiler captures, and package repair hints are still support-track
gaps.

**Files Analyzed:** `docs/bevy-feature-parity.md`, `docs/STATUS.md`,
`docs/ROADMAP.md`, `docs/PRDs/v8/V8-01-editor-project-snapshot-and-structured-diffs.md`,
`docs/PRDs/v7/V7-08-packaging-target-profiles-and-platform-diagnostics.md`,
and `docs/PRDs/v7/V7-09-performance-budgets-and-profiling-evidence.md`.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: editor CLI/UI, structured snapshots, optional
  overlay host, runtime debug draw, diagnostics reports, packaging CLI, profiler
  artifacts, and docs gates.
- [x] Caller file identified: CLI editor commands, SDK debug APIs, compiler
  emit, web/Bevy debug adapters, packaging commands, performance scripts, and
  docs checks.
- [x] Registration/wiring needed: inspector panels, debug draw capabilities,
  diagnostics taxonomy, stress fixtures, profiler reports, package repair hints,
  docs, and release gates.

**Is this user-facing?** Yes for authors and tool users. It should improve
inspection and repair workflows without changing the source of truth away from
structured SDK/ECS/IR data.

## Solution

**Approach:**

- Build scene hierarchy and property inspection over structured snapshots.
- Add asset preview, scene viewer, and gamepad/device viewer tools.
- Add debug draw and in-app diagnostics/FPS overlay.
- Add broader unsupported-feature diagnostics and package repair hints.
- Add large-scene stress fixtures and profiler/budget reports.

**Data Changes:** Inspector snapshot shape, debug draw declarations, diagnostic
codes, target-profile repair metadata, stress fixture reports, and profiler
artifact metadata.

## Execution Phases

#### Phase 1: Scene Hierarchy and Property Inspector - Edits round-trip through snapshots

**Implementation:**

- [ ] Add visual hierarchy/property panels over structured snapshots.
- [ ] Apply edits through `tn editor apply`.
- [ ] Avoid raw renderer or Bevy state as authoring source.

**Verification Plan:** Snapshot/apply/diff tests and editor fixture.

#### Phase 2: Asset Preview and Scene Viewer Tools - Bundle contents are inspectable

**Implementation:**

- [ ] Add asset preview and scene viewer diagnostics.
- [ ] Reuse input/gamepad viewer state from V8-14 where available.

**Verification Plan:** Inspection JSON tests and visual artifacts.

#### Phase 3: Debug Draw and In-App Diagnostics - Runtime state is visible

**Implementation:**

- [ ] Add lines, bounds, rays, text counters, FPS, and custom diagnostics.
- [ ] Map debug output in web and Bevy with observations.

**Verification Plan:** Debug draw tests and screenshot artifacts.

#### Phase 4: Packaging and Unsupported-Feature Diagnostics - Repair paths are actionable

**Implementation:**

- [ ] Add broader target-profile repair hints.
- [ ] Add stable unsupported networking/websocket/replication diagnostics.
- [ ] Improve packaging diagnostics without adding hosted services.

**Verification Plan:** CLI diagnostics and package repair tests.

#### Phase 5: Performance and Profiler Stress Evidence - Scale risks are measured

**Implementation:**

- [ ] Add large-scene fixtures for UI, text, lights, cubes, and animated models.
- [ ] Capture profiler data where practical.
- [ ] Emit machine-readable budget reports.

**Verification Plan:** Stress gate artifacts and docs guard.

## Acceptance Criteria

- [ ] Editor inspection, debug tooling, diagnostics, packaging repair, and
  performance evidence are planned as support tracks tied to structured data and
  release artifacts.
