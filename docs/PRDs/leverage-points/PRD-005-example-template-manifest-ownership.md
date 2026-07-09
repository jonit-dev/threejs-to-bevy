# PRD-005: Example And Template Manifest Ownership

## Status

Proposed

## Context

Generated-game proof requirements now live in project-local
`production.releaseProof`, but temporary fallback constants remain during the
migration. Templates, starters, examples, benchmark projects, package scripts,
generated instructions, and gates still encode related policy in several
places.

## Goal

Make examples and templates manifest-owned so build/proof/release expectations
derive from project metadata instead of hand-maintained lists.

## Non-Goals

- Do not promote every example to release evidence.
- Do not rewrite templates.
- Do not change example behavior except where metadata exposes an existing
  policy gap.

## Requirements

1. Add an examples manifest that classifies examples as release-enrolled,
   build-only, benchmark-only, fixture-only, archived, or experimental.
2. Retire generated-game fallback constants once config coverage is complete.
3. Add a template manifest per starter with generated instruction, API-card,
   package-script, and proof expectations.
4. Derive template and example gates from manifests.

## Execution Phases

### Phase 1: Example Manifest

- [ ] Define example classification fields and required proof metadata.
- [ ] Populate the manifest from current `threenative.config.json` files and
      existing gate constants.
- [ ] Add drift checks for unclassified examples.

### Phase 2: Remove Fallback Constants

- [ ] Retire `GENERATED_GAME_PROJECTS` and
      `GENERATED_GAME_BUILD_ONLY_PROJECTS` once manifest/config coverage is
      complete.
- [ ] Keep diagnostics for unknown keys, missing plan markers, and exemption
      reasons.
- [ ] Preserve existing generated-game gate output shape.

### Phase 3: Template Manifests

- [ ] Add per-template metadata for generated files, package scripts,
      instruction requirements, API-card expectations, and proof commands.
- [ ] Derive `verify:template-production` checks from manifest data.
- [ ] Fail when starter instructions or scripts drift from the manifest.

## Files Likely Touched

- `examples/*/threenative.config.json`
- `examples/manifest.json` or equivalent.
- `templates/*/threenative.template.json`
- `packages/cli/src/templates/registry.ts`
- `tools/verify/src/gameProductionGate.ts`
- `tools/verify/src/templateProductionGate.ts`
- `tools/verify/src/exampleBuildSweep.ts`

## Verification

- `pnpm verify:generated-games`
- `pnpm verify:example-build-sweep`
- `pnpm verify:template-production`
- `pnpm verify:smoke`

## Acceptance Criteria

- [ ] Every example is classified by manifest/config metadata.
- [ ] Generated-game gate no longer needs temporary fallback constants.
- [ ] Every maintained template has a manifest with script/instruction/proof
      expectations.
- [ ] Example/template drift diagnostics name the owning manifest field.
