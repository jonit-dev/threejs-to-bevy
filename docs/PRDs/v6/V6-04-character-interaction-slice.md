# V6-04 Character Interaction Slice

Complexity: 8 -> HIGH mode

## Context

**Problem:** Input, walkability, and collision pieces exist separately, but V6
needs one practical character interaction path for a small playable 3D game.

## Integration Points

- Entry point: SDK character/controller helper or component recipe.
- Caller files: input map, physics collision events, gameplay schedule, web and
  Bevy runtime mapping.
- User-facing: a player-like entity moves, blocks, grounds, and interacts in the
  V6 scene.

## Solution

Provide a narrow character interaction slice: movement intent, simple grounding,
blocking, collision response sufficient for small games, and interact/use
events. Avoid engine-specific controller handles.

## Execution Phases

#### Phase 1: Character Contract - Authors can declare portable character intent.

**Files (max 5):**

- `packages/sdk/src/character/*` - character helper.
- `packages/ir/src/*` - character component validation.
- `packages/compiler/src/*` - capture/emit.
- `packages/sdk/src/*.test.ts` - helper tests.
- `docs/sdk.md` - supported character recipe.

**Implementation:**

- [ ] Define character movement intent and grounding/blocking metadata.
- [ ] Validate collider dependency and input/action references.
- [ ] Reject slope, step, navmesh, or controller features deferred to V7.

#### Phase 2: Runtime Interaction - Fixed input moves and interacts consistently.

**Files (max 5):**

- `packages/runtime-web-three/src/*` - character update behavior.
- `runtime-bevy/crates/threenative_runtime/src/*` - native observation/support.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native trace tests.
- `examples/v6-functional/*` - scene proof seed.
- `docs/bevy-feature-parity.md` - V6 character status.

**Implementation:**

- [ ] Run movement intent through the V6 schedule and physics events.
- [ ] Emit interaction events for declared targets.
- [ ] Capture web/native traces proving movement, block, ground, and interact
  outcomes.

## Verification Strategy

- `pnpm --filter @threenative/sdk test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] A character can move, collide/block, ground, and interact in the V6 scene.
- [ ] Unsupported advanced controller behavior has stable diagnostics or V7
  deferral docs.
