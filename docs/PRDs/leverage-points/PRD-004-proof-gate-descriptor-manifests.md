# PRD-004: Proof Gate Descriptor Manifests

## Status

Proposed

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

- [ ] Add a typed descriptor and JSON/report shape.
- [ ] Include artifact path declarations and timing budget categories.
- [ ] Validate descriptor uniqueness, artifact path format, and profile names.

### Phase 2: Focused Gate Migration

- [ ] Migrate 3-5 low-conflict gates from `FOCUSED_GATES`.
- [ ] Generate `verify:focused` dispatch from descriptors for migrated gates.
- [ ] Preserve `--no-setup` behavior.

### Phase 3: Release Gate Migration

- [ ] Migrate release enrollment for the same gates.
- [ ] Generate artifact existence checks from descriptor artifact declarations.
- [ ] Model conformance artifact conflicts explicitly.

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

- [ ] Migrated gates have one descriptor-owned source for command, artifact,
      timing, owner, and release enrollment metadata.
- [ ] Focused dispatch and release artifact checks use descriptor data.
- [ ] Hand-owned gates are listed as migration gaps with stable diagnostics.
- [ ] Release reports preserve current artifact paths and status fields.
