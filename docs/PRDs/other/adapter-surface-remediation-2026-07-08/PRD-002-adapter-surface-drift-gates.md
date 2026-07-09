# PRD-002: Adapter Surface Drift Gates

## Status

Planned

## Context

The authoring registry, CLI, MCP server, editor, smoke lists, and command help
all keep overlapping operation or command truth by hand. The highest-leverage
first fix is not a refactor; it is a set of cheap gates that fail when a new
operation, command, editor action, or smoke requirement is present in one
surface but missing from another.

These gates should land before descriptor migrations so later refactors can be
incremental and mechanically checked.

## Goals

- Add explicit coverage matrices for authoring operations across CLI, MCP,
  editor, and smoke surfaces.
- Add editor operation consistency tests against authoring registry argument
  descriptors.
- Add CLI command registry integrity checks that can run before and during the
  registry migration.
- Use allowlists for intentional unsupported gaps, with reasons.

## Non-Goals

- Replace CLI command dispatch.
- Replace editor payload builders.
- Make all operation descriptors executable.

## Requirements

1. Add an authoring-operation coverage matrix test that compares registry names
   against CLI route exposure, MCP tool exposure, editor-enabled operation
   names, and `tools/verify/src/editorRequiredOperations.ts`.
2. Add explicit allowlists for intentional gaps; allowlist entries must include
   a reason and should fail if the registry operation disappears.
3. Add editor tests proving every enabled inspector/modal operation exists in
   the authoring registry.
4. Add editor tests proving payload builder output keys are a subset of the
   registry argument names for the target operation, except for explicitly
   documented composite recipe wrappers.
5. Add CLI integrity tests for unique command names, metadata/dispatch
   alignment, and help coverage, shaped so they can later point at the command
   registry from PRD-003.

## Acceptance Criteria

- [ ] Adding a new authoring operation without documenting CLI/MCP/editor/smoke
      coverage or an explicit gap fails a focused test.
- [ ] Adding an editor action for a non-existent operation fails a focused
      editor test.
- [ ] Adding a payload builder that emits unknown registry argument keys fails a
      focused editor test.
- [ ] Adding a CLI command metadata entry without dispatch/help coverage, or
      dispatch without metadata, fails a focused CLI test.
- [ ] Failure messages name the missing operation or command and the surface
      that is missing it.

## Verification

- [ ] `pnpm --filter @threenative/authoring test`
- [ ] `pnpm --filter @threenative/editor test`
- [ ] `pnpm --filter @threenative/cli test`
- [ ] Relevant editor smoke gate from `tools/verify`

## Files Likely Touched

- `packages/authoring/src/operationRegistry.ts`
- `packages/authoring/src/*test.ts`
- `packages/cli/src/index.test.ts`
- `packages/editor/src/adapters/editorModel.test.ts`
- `packages/editor/src/server/operationApi.test.ts`
- `tools/verify/src/editorRequiredOperations.ts`
- `tools/verify/src/*test.ts`

