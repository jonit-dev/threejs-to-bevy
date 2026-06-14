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

- [ ] Cover loader errors, asset refs, material refs, lights, cameras,
  visibility, atmosphere, imported transform conventions, and environment
  instances.
- [ ] Emit native observed summaries for scene-visible behavior.
- [ ] Include stable failure messages.

#### Phase 2: V4 Scripting Host Hardening

**Files:**

- `runtime-bevy/crates/threenative_runtime/src/systems_*`
- `runtime-bevy/crates/threenative_runtime/tests/systems_*.rs`
- shared V4 fixture if extracted

**Implementation:**

- [ ] Preserve declared/undeclared service behavior.
- [ ] Preserve event, command, service-call, and patch log shapes.
- [ ] Cover transform and custom-component patches.
- [ ] Cover unsupported-host diagnostics.

## Verification Strategy

- `cd runtime-bevy && cargo test`
- `cd runtime-bevy && cargo test -p threenative_runtime --test systems_host --test systems_services --test systems_effects --test systems_context`
- `pnpm verify:v4`
- `pnpm verify:conformance`

## Acceptance Criteria

- [ ] Native tests cover every V5 feature that claims Bevy support.
- [ ] V4 native scripting behavior remains protected through V5 refactors.
- [ ] Native failures identify the contract area and fixture path where
  available.

