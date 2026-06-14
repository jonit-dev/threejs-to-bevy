# V7-06 Renderer and Dense Content Runtime Parity

Complexity: 8 -> HIGH mode

## Context

**Problem:** V5/V6 expose dense content and visual features, but runtime LOD
swapping, native instancing, imported asset edge cases, and post-processing
remain partial or target-specific.

## Integration Points

- Entry point: environment/source asset metadata and renderer capability flags.
- Caller files: web environment renderer, Bevy environment mapper, performance
  reports, conformance observations.
- User-facing: dense scenes have predictable behavior and diagnostics across
  runtime targets.

## Solution

Close practical renderer/content gaps where portable, and explicitly defer or
reject backend-specific features.

## Execution Phases

#### Phase 1: Runtime Content Contract - LOD/instancing claims are precise.

**Files (max 5):**

- `packages/ir/src/environment*` - LOD/instancing validation updates.
- `packages/compiler/src/emit/*` - emission tests.
- `packages/ir/fixtures/conformance/*` - renderer fixtures.
- `docs/v3/environment-scene-ir.md` - content metadata docs.
- `docs/bevy-feature-parity.md` - drift status.

**Implementation:**

- [ ] Define runtime LOD selection/swap behavior and instancing observations.
- [ ] Validate imported transform/material edge cases and unsupported content.
- [ ] Select one narrow post-processing slice only if it can be portable.

#### Phase 2: Runtime Mapping and Evidence - Dense content behavior is observed.

**Files (max 5):**

- `packages/runtime-web-three/src/environment/*` - web runtime behavior.
- `runtime-bevy/crates/threenative_runtime/src/environment*` - native mapping.
- `runtime-bevy/crates/threenative_runtime/tests/*` - native evidence.
- `scripts/verify-v7*.mjs` - artifact checks.
- `examples/v7-functional/*` - dense content proof.

**Implementation:**

- [ ] Capture runtime LOD, instancing, imported asset, and post-processing
  observations.
- [ ] Add performance report links for dense content proof.
- [ ] Emit diagnostics for never-portable renderer features.

## Verification Strategy

- `pnpm --filter @threenative/compiler test`
- `pnpm verify:conformance`
- `pnpm verify:v7`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [ ] Runtime LOD/instancing claims are backed by web and Bevy evidence.
- [ ] Backend-specific renderer features are deferred or rejected explicitly.
