# V6-02 Gameplay System Scheduling and State

Complexity: 8 -> HIGH mode

## Context

**Problem:** V4 proves primitive systems can run, but common games need a
predictable schedule model with resource/event access and stable effect
ordering.

## Integration Points

- Entry point: portable system declarations in authored TypeScript.
- Caller files: compiler system emit, web system runner, Bevy QuickJS host,
  verification trace runner.
- User-facing: gameplay systems run in documented stages without target-specific
  code.

## Solution

Define a small V6 schedule model over the existing scripting host: startup,
update, fixed update where supported, declared reads/writes, resources, events,
and deterministic effect ordering.

## Execution Phases

#### Phase 1: Schedule Contract - Systems declare when and how they run.

**Files (max 5):**

- `packages/sdk/src/systems/*` - stage and state authoring helpers.
- `packages/compiler/src/systems/*` - schedule capture/emit.
- `packages/ir/src/systems*` - validation.
- `packages/compiler/src/systems.test.ts` - emitted schedule tests.
- `docs/scripting-api.md` - V6 schedule docs.

**Implementation:**

- [ ] Specify allowed V6 stages and deterministic ordering rules.
- [ ] Validate declared component/resource/event permissions.
- [ ] Reject async, timers, direct runtime handles, and undeclared state.

#### Phase 2: Cross-Runtime Trace - Fixed inputs produce equivalent effects.

**Files (max 5):**

- `packages/runtime-web-three/src/systems/*` - runner updates.
- `runtime-bevy/crates/threenative_runtime/src/systems/*` - runner updates.
- `runtime-bevy/crates/threenative_runtime/tests/*` - trace tests.
- `scripts/verify-v6*.mjs` - future trace artifact wiring.
- `docs/verify-v6.md` - trace artifact contract.

**Implementation:**

- [ ] Run the same schedule trace in web and Bevy.
- [ ] Canonicalize effect logs with stable numeric normalization.
- [ ] Surface schedule mismatches with `TN_VERIFY_V6_*` diagnostics.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] V6 schedule behavior is deterministic for a fixed trace.
- [ ] Unsupported lifecycle/state behavior fails before runtime with stable
  diagnostics.
