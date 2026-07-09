# PRD-003: CLI Command Registry and Shared Arg Plumbing

## Status

Done

## Context

`packages/cli/src/index.ts` hand-maintains command metadata, dispatch, and help
rendering, while command families reimplement subcommand routing and flag
parsing. The repo already has typed registry patterns in archetypes and
templates; this PRD applies that pattern to `tn` commands and creates shared
argv plumbing that later authoring-operation descriptors can reuse.

## Goals

- Introduce an incremental typed CLI command registry.
- Derive top-level dispatch and help from registry definitions.
- Migrate commands in low-risk order while preserving current behavior.
- Extract shared argv normalization, flag reading, and scalar coercion.

## Non-Goals

- Rewrite every command family in one change.
- Change public CLI command names or usage semantics except where tests prove a
  documented bug fix.
- Replace authoring operation parsing before PRD-004.

## Requirements

1. Add `packages/cli/src/commands/registry.ts` with an
   `ICommandDefinition` shape containing at least `name`, `description`,
   `usage`, `handler`, and optional `subcommands`.
2. Replace top-level command help and dispatch with registry lookup for
   migrated commands, preserving a compatibility path for unmigrated commands
   until migration completes.
3. Migrate commands in risk order: single-handler commands first, then simple
   subcommand families, then large families such as `scene`, `game`, `asset`,
   `playtest`, and `sourceDocuments`.
4. Extract shared helpers for `--` normalization, `readFlag`, positional
   parsing, boolean/numeric coercion, and usage rendering as commands migrate.
5. Remove duplicated metadata and per-file help only after the corresponding
   command family is registry-backed and covered by tests.

## Acceptance Criteria

- [x] Top-level help and dispatch for migrated commands are derived from a
      single registry entry.
- [x] Registry integrity tests cover unique names, command lookup, help output,
      and handler presence.
- [x] Migrated commands keep existing JSON output and diagnostics unless a
      behavior change is explicitly tested.
- [x] Shared argv helpers are used by at least one migrated simple command and
      one migrated subcommand family.
- [x] The migration leaves a clear list of unmigrated command families and an
      explicit compatibility path.

## Verification

- [x] `pnpm --filter @threenative/cli test`
- [x] `pnpm check:docs` for docs that embed CLI usage
- [x] Focused manual smoke for representative migrated commands, using
      `--json` where supported

## Files Likely Touched

- `packages/cli/src/index.ts`
- `packages/cli/src/commands/registry.ts`
- `packages/cli/src/commands/help.ts`
- `packages/cli/src/commands/*`
- `packages/cli/src/index.test.ts`
- `docs/workflows/*`
- `docs/cookbook/*`
