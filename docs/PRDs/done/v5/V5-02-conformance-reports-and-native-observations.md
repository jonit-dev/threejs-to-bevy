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

- [x] Represent `Visibility.visible`, `MeshRenderer.visible`, material scalar
  fields, texture slot IDs, mesh primitive metadata, asset refs, and
  diagnostics.
- [x] Emit JSON-path-like mismatch locations.
- [x] Preserve machine-readable report stability.

#### Phase 2: Runtime Observation Producers

**Files:**

- `packages/runtime-web-three/src/*`
- `runtime-bevy/crates/threenative_runtime/src/conformance.rs`
- `runtime-bevy/crates/threenative_runtime/src/environment.rs`
- `runtime-bevy/crates/threenative_runtime/tests/*`

**Implementation:**

- [x] Add web and Bevy observations for the expanded schema.
- [x] Include entities, transforms, meshes, materials, texture refs, lights,
  cameras, visibility, environment IDs, and diagnostics.
- [x] Write stable native summary artifacts where practical.

## Verification Strategy

- `pnpm verify:conformance`
- `node --test scripts/verify-conformance.test.mjs`
- `pnpm --filter @threenative/runtime-web-three test`
- `cd runtime-bevy && cargo test -p threenative_runtime --test conformance`

## Acceptance Criteria

- [x] Conformance failures name fixture, runtime pair, bundle path, expected
  value, actual value, and artifact paths.
- [x] Native observations can be inspected without opening a Bevy window.
- [x] Web and native report producers read the same shared fixtures.

## Implementation Evidence

- `IConformanceReport` now includes stable asset, material, environment,
  visibility, mesh-renderer, diagnostic, and entity observations shared by web
  and Bevy report producers.
- `compareConformanceReports` emits JSON-path-like mismatch locations and can
  attach bundle paths plus runtime report artifact paths to diagnostics.
- The Bevy runtime exposes a headless `threenative_conformance` binary that
  writes inspectable native observation JSON without opening a Bevy window.
- `pnpm verify:conformance` now writes
  `packages/ir/artifacts/conformance/basic-scene/bevy.report.json` and records that path in
  `packages/ir/artifacts/conformance/verification-report.json`.
