# PRD-004: Proof Gate Descriptor Manifests

## Status

Implemented

## Context

Verification is strong, but gate ownership is split. `tools/verify/src/cli/run.ts`
owns focused gate command specs and metadata. `tools/verify/src/release.ts`
owns release gate enrollment, artifact checks, timing budgets, and conflict
handling. Adding or changing a gate still requires several hand edits.

## Goal

Introduce descriptor-owned proof gates so focused dispatch, release
enrollment, artifact checks, timing budgets, and docs summaries derive from one
manifest shape.

## Non-Goals

- Do not migrate every gate at once.
- Do not remove special handling for gates with real artifact conflicts before
  equivalent descriptor fields exist.
- Do not change gate semantics while migrating.

## Requirements

1. Define a gate descriptor schema with command, setup, profile, owner,
   protected surface, artifacts, timing budget, release enrollment, and
   conflict policy.
2. Migrate a small gate family first.
3. Generate focused gate dispatch and release artifact checks from descriptors
   for migrated gates.
4. Add drift diagnostics for gates still hand-owned.

## Execution Phases

### Phase 1: Descriptor Schema

- [x] Add a typed descriptor and report shape.
- [x] Include artifact path declarations and timing budget categories.
- [x] Validate descriptor uniqueness, artifact path format, and profile names.

### Phase 2: Focused Gate Migration

- [x] Migrate 3-5 low-conflict gates from `FOCUSED_GATES`.
- [x] Generate `verify:focused` dispatch from descriptors for migrated gates.
- [x] Preserve `--no-setup` behavior.

### Phase 3: Release Gate Migration

- [x] Migrate release enrollment for the same gates.
- [x] Generate artifact existence checks from descriptor artifact declarations.
- [x] Keep conformance artifact conflict gates explicitly hand-owned until
      descriptor conflict-policy migration.

## Files Likely Touched

- `tools/verify/src/cli/run.ts`
- `tools/verify/src/release.ts`
- `tools/verify/src/gateDescriptors.ts`
- `tools/verify/src/gateDescriptors.test.ts`
- `package.json`
- `docs/status/capabilities/tooling-proof.md`

## Verification

- `pnpm build:verify-tools`
- `pnpm --filter @threenative/verify-tools test`
- `pnpm verify:focused <migrated-gate>`
- `pnpm verify:release` after release enrollment changes.

## Acceptance Criteria

- [x] Migrated gates have one descriptor-owned source for command, artifact,
      timing, owner, and release enrollment metadata.
- [x] Focused dispatch and release artifact checks use descriptor data.
- [x] Hand-owned gates are listed as migration gaps with stable diagnostics.
- [x] Release reports preserve current artifact paths and status fields.

## Implementation Notes

- The first descriptor-backed gate family covers `verify:agent-io`,
  `verify:session-cost`, and `verify:webview-package`, deriving focused
  dispatch, release enrollment, artifact report paths, owner/protected-surface
  metadata, and timing categories from `tools/verify/src/gateDescriptors.ts`.
- Conflict-prone conformance gates were not migrated in this slice. Their
  conflict handling is explicitly represented by the descriptor conflict-policy
  type and by dated migration-gap entries that keep those gates hand-owned until
  the next descriptor wave models their artifact conflicts end to end.
- Verification used `pnpm --filter @threenative/verify-tools test -- --run
  "gate descriptors"`.
