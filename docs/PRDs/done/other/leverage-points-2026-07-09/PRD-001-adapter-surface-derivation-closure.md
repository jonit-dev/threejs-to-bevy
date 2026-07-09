# PRD-001: Adapter Surface Derivation Closure

## Status

Implemented

## Context

`packages/authoring/src/operationRegistry.ts` now owns operation names,
families, arguments, dispatch, and partial CLI adapter metadata. The current
drift gate is useful, but `tools/verify/src/adapterSurfaceDrift.test.ts` still
contains large `EDITOR_OPERATION_GAPS` and `EDITOR_SMOKE_GAPS` allowlists.
Those lists keep adapter drift visible, but they also encode that many
surfaces still need manual judgment.

## Goal

Make authoring operation descriptors the owning source for CLI/MCP/editor
adapter metadata and required smoke coverage for migrated operations.

## Non-Goals

- Do not migrate every operation in one change.
- Do not invent a second adapter registry.
- Do not expand the operation set except where needed to close drift for
  existing operations.

## Requirements

1. Classify every current adapter gap as `product-excluded`, `migration-gap`,
   or `covered-by-derived-smoke`.
2. Extend descriptors only where existing metadata cannot derive an adapter
   surface.
3. Derive editor operation metadata and smoke enrollment for at least one
   complete operation family.
4. Fail closed when a migrated descriptor lacks required adapter metadata.
5. Keep remaining allowlists small, reasoned, and checked for staleness.

## Execution Phases

### Phase 1: Gap Inventory

- [x] Generate a machine-readable report of current CLI, MCP, editor, and
      editor-smoke gaps from `listAuthoringOperationDescriptors()`.
- [x] Split gap reasons into durable categories instead of one generic reason
      string.
- [x] Add tests that stale gap reasons fail when too broad or missing an owner.

### Phase 2: One Family End-To-End

- [x] Pick the highest-value source family with existing descriptor metadata.
- [x] Derive CLI usage, MCP argv, editor metadata, and smoke coverage from the
      descriptor.
- [x] Remove that family from explicit gap lists.

### Phase 3: Ratchet

- [x] Add a threshold that fails when gap counts increase without an explicit
      dated reason.
- [x] Document the migration rule in the adapter-surface remediation bundle or
      this PRD bundle.

## Files Likely Touched

- `packages/authoring/src/operationRegistry.ts`
- `packages/editor/src/operations/editorOperationMetadata.ts`
- `packages/editor/src/server/operationApi.ts`
- `packages/editor/src/state/editorStore.ts`
- `packages/mcp-server/src/index.ts`
- `tools/verify/src/adapterSurfaceDrift.test.ts`
- `tools/verify/src/editorRequiredOperations.ts`

## Verification

- `pnpm --filter @threenative/authoring test`
- `pnpm --filter @threenative/cli test`
- `pnpm --filter @threenative/editor test`
- `pnpm verify:editor-required-operations`

## Acceptance Criteria

- [x] At least one operation family is descriptor-derived across CLI, MCP,
      editor metadata, and smoke coverage.
- [x] Adapter gap allowlists shrink and each remaining entry has a specific
      owner/category.
- [x] New migrated operations fail if descriptor adapter metadata is missing.
- [x] Drift diagnostics name the missing surface and the owning descriptor.

## Implementation Notes

- Authoring operation descriptors now carry executable CLI adapter metadata for
  migrated scene/material/runtime/UI operations, and selected CLI/MCP/source
  document surfaces derive argv/usage from those descriptors.
- Editor metadata and required-operation smoke coverage use descriptor-backed
  operation metadata for the migrated family while remaining gaps keep explicit
  owner/category entries and stale-gap tests.
- Verification used the authoring/CLI/editor focused tests and
  `pnpm verify:editor-required-operations`.
