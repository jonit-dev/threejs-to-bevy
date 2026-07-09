# PRD-001: Adapter Surface Derivation Closure

## Status

Proposed

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

- [ ] Generate a machine-readable report of current CLI, MCP, editor, and
      editor-smoke gaps from `listAuthoringOperationDescriptors()`.
- [ ] Split gap reasons into durable categories instead of one generic reason
      string.
- [ ] Add tests that stale gap reasons fail when too broad or missing an owner.

### Phase 2: One Family End-To-End

- [ ] Pick the highest-value source family with existing descriptor metadata.
- [ ] Derive CLI usage, MCP argv, editor metadata, and smoke coverage from the
      descriptor.
- [ ] Remove that family from explicit gap lists.

### Phase 3: Ratchet

- [ ] Add a threshold that fails when gap counts increase without an explicit
      dated reason.
- [ ] Document the migration rule in the adapter-surface remediation bundle or
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

- [ ] At least one operation family is descriptor-derived across CLI, MCP,
      editor metadata, and smoke coverage.
- [ ] Adapter gap allowlists shrink and each remaining entry has a specific
      owner/category.
- [ ] New migrated operations fail if descriptor adapter metadata is missing.
- [ ] Drift diagnostics name the missing surface and the owning descriptor.
