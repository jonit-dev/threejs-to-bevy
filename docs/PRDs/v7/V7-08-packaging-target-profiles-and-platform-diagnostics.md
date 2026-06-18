# V7-08 Packaging Target Profiles and Platform Diagnostics

Complexity: 8 -> HIGH mode

## Context

**Problem:** Native runtime evidence exists, but V7 needs credible desktop
packaging, target-profile selection, artifact layout, and platform diagnostics
without changing the TypeScript authoring boundary.

## Integration Points

- Entry point: CLI packaging commands and `tn` project config.
- Caller files: CLI command registry, bundle builder, Bevy runtime loader,
  verify scripts.
- User-facing: a project can produce predictable desktop run artifacts.

## Solution

Add a desktop packaging slice with target profiles, packaged bundle loading,
artifact conventions, and diagnostics. Mobile app-store scope remains out.

## Execution Phases

#### Phase 1: Target Profile Contract - Packaging config is validated.

**Files (max 5):**

- `packages/cli/src/commands/*` - package command/config.
- `packages/compiler/src/*` - target profile validation if needed.
- `packages/ir/src/*` - profile capability checks if needed.
- `templates/*` - package script wiring if promoted.
- `docs/developer-workflow.md` - packaging docs.

**Implementation:**

- [x] Define desktop target profiles and artifact layout.
- [x] Validate unsupported target/profile combinations.
- [x] Keep mobile and online publishing out of V7.

#### Phase 2: Packaged Runtime Evidence - Packaged artifacts load the bundle.

**Files (max 5):**

- `runtime-bevy/*` - packaged bundle loading support.
- `scripts/verify-v7*.mjs` - packaging evidence.
- `scripts/*.test.mjs` - packaging report tests.
- `docs/verify-v7.md` - artifact docs.
- `tools/verify/artifacts/milestones/v7/*` - generated report outputs.

**Implementation:**

- [x] Produce predictable packaged desktop artifacts.
- [x] Verify packaged bundle loading and target-profile diagnostics.
- [x] Record artifact paths and first failure in `verify:v7`.

## Verification Strategy

- `pnpm --filter @threenative/cli test`
- `pnpm verify:v7`
- `cd runtime-bevy && cargo test`

## Acceptance Criteria

- [x] Desktop packaging has predictable local artifacts and diagnostics.
- [x] V7 does not claim mobile store, online publishing, or service scope.
