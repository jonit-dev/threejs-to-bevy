# V7-04 Rich Portable UI Navigation and Input Parity

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 UI covers HUD/menu basics, but game UI needs navigation,
focus order, gamepad/touch input, safe-area behavior, and native parity
hardening.

## Integration Points

- Entry point: SDK UI declarations, input bindings, and UI events.
- Caller files: web UI renderer, Bevy UI mapper, input system, conformance
  reporter.
- User-facing: players can navigate UI with keyboard, gamepad, pointer, or touch
  where supported.

## Solution

Promote richer retained layout, focus order, navigation bindings, safe-area
metadata, and UI event emission while keeping React DOM adapter-private.

## Execution Phases

#### Phase 1: UI Navigation Contract - Focus and navigation validate.

**Files (max 5):**

- `packages/sdk/src/ui/*` - focus/navigation helpers.
- `packages/ir/src/ui*` - validation.
- `packages/compiler/src/*` - capture/emit.
- `packages/ir/fixtures/conformance/*` - UI navigation fixtures.
- `docs/ui.md` - V7 UI docs.

**Implementation:**

- [ ] Add focus order, navigation links, safe-area fields, and input action refs.
- [ ] Validate duplicate focus IDs, invalid links, unsupported layout features,
  and target-specific limitations.

#### Phase 2: Runtime Input Parity - UI navigation works in fixed traces.

**Files (max 5):**

- `packages/runtime-web-three/src/ui/*` - web navigation.
- `runtime-bevy/crates/threenative_runtime/src/ui*` - native UI navigation.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native tests.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `examples/v7-functional/*` - scene UI.

**Implementation:**

- [ ] Route keyboard/gamepad/pointer/touch events into UI focus and activation.
- [ ] Emit deterministic UI event observations.
- [ ] Document unsupported platform inputs with diagnostics.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] UI focus/navigation is portable for release-gated inputs.
- [ ] Web DOM and Bevy widget details remain adapter-private.
