# PRD-004: Executable Authoring Operation Descriptors

## Status

Done

## Context

`packages/authoring/src/operationRegistry.ts` already owns operation names,
descriptions, source families, path policy, and typed arguments. The descriptor
is strong enough for payload validation but not strong enough to drive adapter
surfaces. CLI usage strings, MCP argv construction, editor fallbacks, and smoke
lists therefore re-encode operation paths, flag names, positional order, and
validation constraints by hand.

This PRD makes descriptors executable incrementally. Existing hand-written
handlers can remain while usage, MCP argv construction, and eventually parsing
move behind descriptor-backed helpers.

## Goals

- Extend operation descriptors with optional adapter metadata, starting with
  CLI paths, positional order, flag names, help text, and simple constraints.
- Derive CLI usage/help and MCP argv construction from descriptor metadata for
  migrated operations.
- Add shared argument parsing and validation that CLI, MCP, and editor
  dispatch can consume.
- Migrate drift hot spots first.

## Non-Goals

- Require every registry operation to migrate in one change.
- Remove hand-written operation handlers before descriptor-backed parsing is
  proved.
- Expand the public authoring operation set.

## Requirements

1. Add an optional descriptor metadata block for CLI/adapter execution,
   including subcommand path, positional argument order, flag names,
   per-argument help, and simple constraints such as enum values or min/max.
2. Add helper APIs to render usage/help and parse adapter args from a
   descriptor while preserving current diagnostics for unmigrated operations.
3. Replace MCP `toolToCliArgv()` special cases for migrated operations with
   descriptor-derived argv construction.
4. Replace duplicated CLI usage text for migrated `sourceDocuments` operations
   with descriptor-rendered output.
5. Migrate in diagnostic order: MCP-special-cased operations, editor fallback
   switch cases, then remaining long-tail operations.

## Acceptance Criteria

- [x] A migrated operation has one descriptor-backed source for CLI path, flag
      names, positional order, and usage text.
- [x] MCP argv construction for migrated operations fails if required
      descriptor metadata is missing instead of silently guessing flags.
- [x] CLI and MCP tests prove at least one migrated numeric, boolean, vector,
      and enum-like argument path.
- [x] Unmigrated operations keep current behavior and are visible in the drift
      matrix from PRD-002 as intentional gaps.
- [x] Adding or renaming a migrated operation flag requires updating the
      descriptor, not MCP/editor/CLI copies.

## Verification

- [x] `pnpm --filter @threenative/authoring test`
- [x] `pnpm --filter @threenative/cli test`
- [x] MCP server tests covering generated tools and argv construction
- [x] Editor smoke gate for migrated operations

Note: the PRD-specific CLI source-document tests passed. A broader
`pnpm --filter @threenative/cli test` run reached unrelated desktop-web
packaging coverage and failed on dirty IR/runtime bundling changes outside this
PRD.

## Files Likely Touched

- `packages/authoring/src/operationRegistry.ts`
- `packages/cli/src/commands/sourceDocuments.ts`
- `packages/cli/src/commands/registry.ts`
- `packages/mcp-server/src/index.ts`
- `packages/editor/src/server/operationApi.ts`
- `tools/verify/src/editorRequiredOperations.ts`
