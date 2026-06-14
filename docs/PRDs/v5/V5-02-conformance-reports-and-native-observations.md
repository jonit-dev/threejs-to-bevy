# V5-02 Conformance Reports and Native Observations

Complexity: 8 -> HIGH mode

## Context

**Problem:** Current conformance output is too coarse for V5. It must localize
runtime mismatches to material fields, texture slots, visibility, assets,
diagnostics, and native observations.

## Solution

Expand the shared conformance report schema and add Bevy observed-scene summary
artifacts that can be compared with web output.

## Execution Phases

#### Phase 1: Report Schema Expansion

**Files:**

- `packages/ir/src/conformanceReport.ts`
- `scripts/verify-conformance.mjs`
- `scripts/verify-conformance.test.mjs`
- `packages/ir/src/*conformance*.test.ts`

**Implementation:**

- [ ] Represent `Visibility.visible`, `MeshRenderer.visible`, material scalar
  fields, texture slot IDs, mesh primitive metadata, asset refs, and
  diagnostics.
- [ ] Emit JSON-path-like mismatch locations.
- [ ] Preserve machine-readable report stability.

#### Phase 2: Runtime Observation Producers

**Files:**

- `packages/runtime-web-three/src/*`
- `runtime-bevy/crates/threenative_runtime/src/conformance.rs`
- `runtime-bevy/crates/threenative_runtime/src/environment.rs`
- `runtime-bevy/crates/threenative_runtime/tests/*`

**Implementation:**

- [ ] Add web and Bevy observations for the expanded schema.
- [ ] Include entities, transforms, meshes, materials, texture refs, lights,
  cameras, visibility, environment IDs, and diagnostics.
- [ ] Write stable native summary artifacts where practical.

## Verification Strategy

- `pnpm verify:conformance`
- `node --test scripts/verify-conformance.test.mjs`
- `pnpm --filter @threenative/runtime-web-three test`
- `cd runtime-bevy && cargo test -p threenative_runtime --test conformance`

## Acceptance Criteria

- [ ] Conformance failures name fixture, runtime pair, bundle path, expected
  value, actual value, and artifact paths.
- [ ] Native observations can be inspected without opening a Bevy window.
- [ ] Web and native report producers read the same shared fixtures.

