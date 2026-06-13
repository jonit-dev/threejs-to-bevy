# V2-01 ECS Gameplay Core

Complexity: 8 -> HIGH mode

## Context

**Problem:** V2 needs gameplay data and scheduling primitives that can express
arena movement, damage, spawning, resources, and events without leaking runtime
internals.

**Files Analyzed:** `docs/ROADMAP.md`, `docs/sdk.md`, `docs/ecs.md`,
`docs/ir.md`, `packages/sdk`, `packages/ir`, `packages/compiler`.

**Current Behavior:**

- V1 proves scene authoring and static bundle rendering.
- V2 requires `World`, `Entity`, `Component`, `System`, resources, events, game
  states, queries, command buffer, fixed update, and declared access.
- V3 concepts such as prefabs and changed-query semantics are out of V2.

## Solution

**Approach:**

- Add an ECS-first SDK surface that serializes to portable world/schema IR.
- Support custom component/resource/event schemas with deterministic output.
- Support queries with `with` and `without` filters plus declared read/write
  access.
- Support command-buffer spawn/despawn/component edits as scheduled gameplay
  effects.

```mermaid
flowchart LR
  SDK["World / Component / System"] --> Compiler["capture"]
  Compiler --> IR["world.ir.json + schemas"]
  IR --> Validator["validator"]
  Validator --> Runtimes["web + Bevy"]
```

**Data Changes:** Extends `world.ir.json`, component schemas, resource schemas,
event schemas, and `systems.ir.json`.

## Integration Points

**How will this feature be reached?**

- Entry point identified: user imports ECS APIs from `@threenative/sdk`.
- Caller file identified: compiler capture entry used by `tn build`.
- Registration/wiring needed: SDK exports, compiler emit mapping, IR schemas,
  validator rules.

**Is this user-facing?** Yes, public gameplay authoring API.

**Full user flow:**

1. User declares `Player`, `Health`, and `DamageEvent`.
2. User creates a `World` and registers systems with read/write declarations.
3. `tn build` emits schemas, systems metadata, resources, and initial entities.
4. Validator rejects missing schema fields or undeclared writes.

## Execution Phases

#### Phase 1: ECS Declarations - User can define gameplay data

**Files (max 5):**

- `packages/sdk/src/ecs/World.ts` - world/entity declaration API.
- `packages/sdk/src/ecs/schema.ts` - component/resource/event schemas.
- `packages/sdk/src/ecs/query.ts` - query declaration types.
- `packages/sdk/src/index.ts` - public exports.
- `packages/sdk/src/ecs/World.test.ts` - SDK tests.

**Implementation:**

- [ ] Add `World`, entity spawn, component schema, resource schema, and event
  schema APIs.
- [ ] Preserve stable entity IDs and schema names.
- [ ] Reject duplicate components/resources/events with stable errors.
- [ ] Keep APIs runtime-independent.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/sdk/src/ecs/World.test.ts` | `should declare entity components and resources` | Captured world contains stable IDs and schema names. |
| `packages/sdk/src/ecs/World.test.ts` | `should reject duplicate component schema names` | Error code is stable. |

**User Verification:**

- Action: Author a world with player and health components.
- Expected: SDK capture graph exposes deterministic ECS declarations.

#### Phase 2: ECS IR Emit - Gameplay data validates as bundle data

**Files (max 5):**

- `packages/ir/src/world.ts` - world/schema IR types.
- `packages/ir/src/systems.ts` - system metadata IR types.
- `packages/compiler/src/emit/ecs.ts` - SDK ECS to IR mapping.
- `packages/compiler/src/emit/ecs.test.ts` - emit tests.
- `packages/ir/src/validate.test.ts` - schema validation tests.

**Implementation:**

- [ ] Emit component, resource, and event schemas.
- [ ] Emit initial entities and resources.
- [ ] Emit system declarations without executable code yet.
- [ ] Validate entity references and schema conformance.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/compiler/src/emit/ecs.test.ts` | `should emit health and damage schemas` | Bundle includes component and event schema files. |
| `packages/ir/src/validate.test.ts` | `should reject component values outside schema` | Invalid component payload reports path and code. |

**User Verification:**

- Action: Run `tn build` on a gameplay fixture.
- Expected: Bundle contains valid world and schema IR.

#### Phase 3: Commands and Schedules - A gameplay system can request changes

**Files (max 5):**

- `packages/sdk/src/ecs/system.ts` - system declarations and access lists.
- `packages/sdk/src/ecs/commands.ts` - command buffer declarations.
- `packages/compiler/src/emit/systems.ts` - schedule metadata emit.
- `packages/ir/src/systems.ts` - schedule validation.
- `packages/compiler/src/emit/systems.test.ts` - tests.

**Implementation:**

- [ ] Support `fixedUpdate`, `update`, and `postUpdate` schedules.
- [ ] Support declared reads/writes and event read/write declarations.
- [ ] Support command declarations for spawn, despawn, add/remove/set
  component, and emit event.
- [ ] Reject undeclared writes.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `packages/compiler/src/emit/systems.test.ts` | `should emit fixed update system access` | System metadata lists schedule, reads, writes, and events. |
| `packages/ir/src/systems.test.ts` | `should reject undeclared component write` | Validator reports a system access diagnostic. |

**User Verification:**

- Action: Build a fixture with a damage system.
- Expected: `systems.ir.json` lists access and command effects.

## Verification Strategy

- `pnpm --filter @threenative/sdk test -- --run ecs`
- `pnpm --filter @threenative/compiler test -- --run ecs`
- `pnpm --filter @threenative/ir test -- --run schema`

## Acceptance Criteria

- [ ] ECS-first authoring emits deterministic IR.
- [ ] Component, resource, and event schemas validate initial data.
- [ ] Systems declare schedule and read/write access.
- [ ] V2 avoids prefabs, changed queries, and runtime-specific ECS APIs.

