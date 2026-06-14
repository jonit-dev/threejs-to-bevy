# V6-06 Retained UI Runtime

Complexity: 8 -> HIGH mode

## Context

**Problem:** UI IR types exist, but retained UI rendering, input, focus, and
runtime parity are not implemented.

## Integration Points

- Entry point: SDK UI declarations and UI events.
- Caller files: compiler UI emit, web UI renderer, Bevy UI mapper, input/event
  queue, conformance reports.
- User-facing: a V6 game can show HUD/menu state and receive basic UI input.

## Solution

Implement a retained UI baseline: layout nodes, text, panels, buttons, basic
styling constraints, input/focus events, observations, and diagnostics.

## Execution Phases

#### Phase 1: UI Contract and Validation - UI bundles have accepted/rejected fixtures.

**Files (max 5):**

- `packages/sdk/src/ui/*` - retained UI helpers.
- `packages/ir/src/ui*` - schemas and validation.
- `packages/compiler/src/*` - capture/emit.
- `packages/ir/fixtures/conformance/*` - UI fixtures.
- `docs/ui.md` - V6 supported UI subset.

**Implementation:**

- [ ] Support layout nodes, text, panels, buttons, style tokens, and event IDs.
- [ ] Validate duplicate IDs, invalid references, unsupported style fields, and
  missing text/font assets if applicable.
- [ ] Keep React/DOM and Bevy widget handles adapter-private.

#### Phase 2: Runtime UI and Events - UI renders and emits input/focus events.

**Files (max 5):**

- `packages/runtime-web-three/src/ui/*` - web retained UI renderer.
- `runtime-bevy/crates/threenative_runtime/src/ui*` - Bevy UI mapping.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native UI evidence.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `examples/v6-functional/*` - HUD/menu proof.

**Implementation:**

- [ ] Render HUD text/buttons in web and Bevy where claimed.
- [ ] Deliver click/activate/focus events into the V6 event queue.
- [ ] Add runtime observations for UI tree and interaction events.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] V6 retained UI is a real runtime feature, not schema-only.
- [ ] UI in the V6 scene drives or reflects gameplay state.
