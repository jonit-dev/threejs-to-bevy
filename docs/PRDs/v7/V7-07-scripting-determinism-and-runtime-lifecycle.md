# V7-07 Scripting Determinism and Runtime Lifecycle

Complexity: 8 -> HIGH mode

## Context

**Problem:** V6 gameplay systems expand script usage, so V7 needs stronger
determinism, lifecycle, replay, and state boundaries for larger script-heavy
fixtures.

## Integration Points

- Entry point: portable system declarations and fixed trace verification.
- Caller files: compiler bundler, web runner, Bevy QuickJS host, verify scripts.
- User-facing: larger gameplay scripts replay consistently across targets.

## Solution

Specify resource write ordering, schedule determinism, replay traces,
hot-reload invalidation boundaries, and narrowly justified system-local
persisted state.

## Execution Phases

#### Phase 1: Determinism Contract - Script-heavy fixtures have strict rules.

**Files (max 5):**

- `packages/compiler/src/scripts/*` - bundling/lifecycle validation.
- `packages/ir/src/systems*` - schema updates.
- `packages/ir/fixtures/conformance/*` - script-heavy fixtures.
- `docs/scripting.md` - lifecycle docs.
- `docs/scripting-api.md` - deterministic API docs.

**Implementation:**

- [ ] Define effect ordering for resource writes, events, commands, and
  services.
- [ ] Add replay trace metadata and system-local state rules if needed.
- [ ] Reject async, timers, arbitrary npm, platform APIs, and unsupported
  hot-reload assumptions.

#### Phase 2: Runtime Lifecycle Evidence - Web and Bevy replay traces match.

**Files (max 5):**

- `packages/runtime-web-three/src/systems/*` - replay/lifecycle support.
- `runtime-bevy/crates/threenative_runtime/src/systems/*` - QuickJS lifecycle.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native replay tests.
- `scripts/verify-v7*.mjs` - replay comparison.
- `examples/v7-functional/*` - script-heavy proof.

**Implementation:**

- [ ] Compare canonical logs for larger fixed traces.
- [ ] Add lifecycle diagnostics for invalid reload/state behavior.
- [ ] Record first mismatch path in V7 reports.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:v7`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] Script-heavy fixed traces replay equivalently across web and Bevy.
- [ ] Unsupported lifecycle behavior fails before runtime or with stable runtime
  diagnostics.
