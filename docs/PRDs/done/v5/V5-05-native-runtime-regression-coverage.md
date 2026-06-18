# V5-05 Native Runtime Regression Coverage

Complexity: 8 -> HIGH mode

## Context

**Problem:** V5 requires Rust/Bevy test evidence for native claims. Existing
native smoke checks are not enough for loader, renderer, environment, scripting
host, service facade, and diagnostics refactors.

## Solution

Add focused Rust regression suites that preserve V3/V4 behavior while V5
refactors and visual-quality promotions land.

## Execution Phases

#### Phase 1: Loader, Mapping, and Environment Coverage

**Files:**

- `runtime-bevy/crates/threenative_runtime/src/assets.rs`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs`
- `runtime-bevy/crates/threenative_runtime/src/rendering.rs`
- `runtime-bevy/crates/threenative_runtime/src/environment.rs`
- `runtime-bevy/crates/threenative_runtime/tests/*`

**Implementation:**

- [x] Cover loader errors, asset refs, material refs, lights, cameras,
  visibility, atmosphere, imported transform conventions, and environment
  instances.
- [x] Emit native observed summaries for scene-visible behavior.
- [x] Include stable failure messages.

#### Phase 2: V4 Scripting Host Hardening

**Files:**

- `runtime-bevy/crates/threenative_runtime/src/systems_*`
- `runtime-bevy/crates/threenative_runtime/tests/systems_*.rs`
- shared V4 fixture if extracted

**Implementation:**

- [x] Preserve declared/undeclared service behavior.
- [x] Preserve event, command, service-call, and patch log shapes.
- [x] Cover transform and custom-component patches.
- [x] Cover unsupported-host diagnostics.

## Verification Strategy

- `cd runtime-bevy && cargo test`
- `cd runtime-bevy && cargo test -p threenative_runtime --test systems_host --test systems_services --test systems_effects --test systems_context`
- `pnpm verify:v4`
- `pnpm verify:conformance`

## Acceptance Criteria

- [x] Native tests cover every V5 feature that claims Bevy support.
- [x] V4 native scripting behavior remains protected through V5 refactors.
- [x] Native failures identify the contract area and fixture path where
  available.

## Implementation Evidence

- Added loader error-path coverage for missing bundle roots in
  `threenative_loader`, preserving the reported source path.
- Expanded Bevy world-mapping regressions for missing mesh diagnostics,
  material references, directional/point/spot light values, camera mapping,
  visibility, transforms, and standard material scalar fields.
- Expanded environment regressions so observed summaries include scatter counts
  and spawned environment instances preserve authored IDs plus deterministic
  placement; existing V3 environment tests already cover glTF category
  normalization and imported transform conventions.
- Expanded V4 native scripting regressions for custom-component patches,
  declared event log shape, undeclared service diagnostics, and existing
  unsupported-host diagnostics.
