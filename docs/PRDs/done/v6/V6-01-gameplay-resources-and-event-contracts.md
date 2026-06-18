# V6-01 Gameplay Resources and Event Contracts

Complexity: 8 -> HIGH mode

## Context

**Problem:** Resources and events exist as partial schema/service concepts, but
small games need first-class portable state and event contracts that work in web
and native scripting.

## Integration Points

- Entry point: `@threenative/sdk` gameplay declarations and captured systems.
- Caller files: compiler capture/emit paths, web system runner, Bevy QuickJS
  host, conformance reporter.
- User-facing: TypeScript authors declare resources/events and systems consume
  them through the portable context.

## Solution

Promote resources and events as declared SDK/IR contracts with validation,
runtime snapshots, effect logs, diagnostics, and conformance observations.

## Execution Phases

#### Phase 1: SDK, IR, and Validation - Authors can declare resources and events explicitly.

**Files (max 5):**

- `packages/sdk/src/ecs/*` - resource/event authoring helpers.
- `packages/ir/src/*` - resource/event schemas and validation.
- `packages/compiler/src/*` - capture and emit declarations.
- `packages/ir/fixtures/conformance/*` - accepted/rejected fixtures.
- `docs/ecs.md` - supported V6 resource/event contract.

**Implementation:**

- [ ] Add deterministic resource and event declaration shapes.
- [ ] Validate duplicate IDs, unsupported value shapes, undeclared access, and
  event payload schemas.
- [ ] Keep declarations serializable and independent of runtime handles.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/ir/src/validate.test.ts` | `should accept declared resources and events when schemas match` | Valid fixture passes. |
| `packages/ir/src/validate.test.ts` | `should reject undeclared resource writes when systems request them` | Emits stable `TN_IR_*` diagnostic. |

#### Phase 2: Runtime Access and Observations - Web and Bevy expose the same resource/event behavior.

**Files (max 5):**

- `packages/runtime-web-three/src/*` - context snapshot and event queue support.
- `runtime-bevy/crates/threenative_runtime/src/*` - QuickJS context support.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native evidence.
- `packages/ir/fixtures/conformance/*` - report expectations.
- `docs/scripting-api.md` - V6 API surface.

**Implementation:**

- [ ] Provide deterministic read snapshots and validated resource write effects.
- [ ] Queue events in schedule order and expose canonical event logs.
- [ ] Add conformance observations for resource values and event delivery.

## Verification Strategy

- `pnpm --filter @threenative/sdk test`
- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] Resource and event contracts are accepted/rejected by shared validation.
- [ ] Web and Bevy runtime evidence shows equivalent snapshots, writes, and
  event logs for a fixed trace.
