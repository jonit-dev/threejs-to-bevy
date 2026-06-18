# V5-06 Textured Standard Material Parity

Complexity: 8 -> HIGH mode

## Context

**Problem:** Standard material texture slots exist in the contract surface, but
runtime application is still partial. V5 can promote texture slots only if the
SDK, IR, compiler, validation, web runtime, Bevy runtime, conformance, and scene
proof agree.

## Solution

Make texture slots a full accepted/rejected contract and apply them in both
runtimes with explicit diagnostics for unsupported or invalid cases.

## Execution Phases

#### Phase 1: Contract and Validation

**Files:**

- `packages/sdk/src/materials/MeshStandardMaterial.ts`
- `packages/compiler/src/emit/scene-to-world.ts`
- `packages/compiler/src/emit/assets.test.ts`
- `packages/ir/src/validate.ts`
- `packages/ir/fixtures/conformance/*`

**Implementation:**

- [x] Serialize supported texture slots deterministically.
- [x] Validate asset kind, supported format, missing files, and missing asset
  IDs.
- [x] Add accepted and rejected fixtures for base color, normal,
  metallic-roughness, emissive, occlusion, and alpha behavior if supported.

#### Phase 2: Runtime Mapping and Evidence

**Files:**

- `packages/runtime-web-three/src/assets.ts`
- `packages/runtime-web-three/src/mapWorld.ts`
- `packages/runtime-web-three/src/*.test.ts`
- `runtime-bevy/crates/threenative_runtime/src/assets.rs`
- `runtime-bevy/crates/threenative_runtime/src/map_world.rs`
- `runtime-bevy/crates/threenative_runtime/tests/*`

**Implementation:**

- [x] Resolve texture slots only from texture assets.
- [x] Apply supported slots to Three.js and Bevy materials.
- [x] Emit observations that expose applied texture refs.
- [x] Fail closed or document downgraded target behavior with stable
  diagnostics.

## Verification Strategy

- `pnpm --filter @threenative/sdk test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/runtime-web-three test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] Texture slot support is covered by accepted and rejected fixtures.
- [x] Web and Bevy observations prove applied texture refs or stable downgrade
  diagnostics.
- [x] The V5 functional scene includes visibly textured environment assets.

## Implementation Evidence

- SDK/compiler texture asset references serialize deterministically for
  base-color, normal, metallic-roughness, emissive, and occlusion slots.
- IR validation accepts complete texture-slot material fixtures and rejects
  missing, unsupported, and non-texture asset references with stable
  diagnostics.
- Web runtime maps validated texture assets to `MeshStandardMaterial` texture
  slots and records slot/asset URL metadata on the texture object for runtime
  inspection.
- Bevy runtime maps validated texture references to `StandardMaterial` image
  handles for the supported slots. Native image loading remains adapter-owned;
  invalid refs are still rejected by the shared IR validator before runtime.
- The `v5-drift-surface` conformance fixture now includes all supported texture
  slots, and the V5 functional scene seed builds with bundle-local textured
  environment assets.
