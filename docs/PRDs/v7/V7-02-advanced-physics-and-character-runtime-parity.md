# V7-02 Advanced Physics and Character Runtime Parity

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 covers common collision and character interaction, but deeper
games need shape casts, richer sensors, contact filtering, and stronger
character runtime behavior.

## Integration Points

- Entry point: portable physics service calls and character declarations.
- Caller files: SDK physics helpers, IR validation, web/native physics adapters,
  gameplay event queue.
- User-facing: scripts can query and react to richer physics behavior without
  backend handles.

## Solution

Promote backend-neutral shape/overlap casts, sensors, filters, deterministic
contact ordering, and stronger character behavior while keeping Rapier/Bevy
handles adapter-private.

## Execution Phases

#### Phase 1: Query and Filter Contract - Advanced physics data validates.

**Files (max 5):**

- `packages/sdk/src/physics/*` - shape/overlap query helpers.
- `packages/ir/src/physics*` - validation.
- `packages/compiler/src/*` - capture/emit.
- `packages/ir/fixtures/conformance/*` - accepted/rejected fixtures.
- `docs/scripting-api.md` - service API docs.

**Implementation:**

- [x] Add backend-neutral shape cast, overlap, sensor, and filter declarations.
- [x] Validate shape parameters, masks, query permissions, and unsupported
  solver features.
- [x] Reject engine-specific handles with stable diagnostics.

#### Phase 2: Runtime Parity - Fixed traces produce equivalent observations.

**Files (max 5):**

- `packages/runtime-web-three/src/physics/*` - runtime queries.
- `runtime-bevy/crates/threenative_runtime/src/physics*` - native mapping.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native tests.
- `packages/runtime-web-three/src/*.test.ts` - web tests.
- `examples/v7-functional/*` - scene proof.

**Implementation:**

- [x] Implement shape/overlap query observations for fixed traces.
- [x] Add deterministic contact ordering and stronger character-controller
  traces.
- [x] Document target drift where exact solver parity is impossible.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] Advanced physics features are portable or explicitly rejected.
- [x] Contact/query ordering is deterministic for release-gated traces.
