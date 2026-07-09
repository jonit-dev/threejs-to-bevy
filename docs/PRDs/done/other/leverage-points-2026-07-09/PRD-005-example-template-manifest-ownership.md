# PRD-005: Example And Template Manifest Ownership

## Status

Implemented

## Context

Generated-game proof requirements now live in project-local
`production.releaseProof`, example lifecycle policy lives in
`examples/manifest.json`, and maintained starter expectations live in
per-template manifests. Templates, starters, examples, benchmark projects,
package scripts, generated instructions, and gates now have owning manifest
fields instead of hand-maintained gate lists.

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

- [x] Define example classification fields and required proof metadata.
- [x] Populate the manifest from current `threenative.config.json` files and
      existing gate constants.
- [x] Add drift checks for unclassified examples.

### Phase 2: Remove Fallback Constants

- [x] Retire `GENERATED_GAME_PROJECTS` and
      `GENERATED_GAME_BUILD_ONLY_PROJECTS` once manifest/config coverage is
      complete.
- [x] Keep diagnostics for unknown keys, missing plan markers, and exemption
      reasons.
- [x] Preserve existing generated-game gate output shape.

### Phase 3: Template Manifests

- [x] Add per-template metadata for generated files, package scripts,
      instruction requirements, API-card expectations, and proof commands.
- [x] Derive `verify:template-production` checks from manifest data.
- [x] Fail when starter instructions or scripts drift from the manifest.

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

- [x] Every example is classified by manifest/config metadata.
- [x] Generated-game gate no longer needs temporary fallback constants.
- [x] Every maintained template has a manifest with script/instruction/proof
      expectations.
- [x] Example/template drift diagnostics name the owning manifest field.

## Implementation Notes

- `examples/manifest.json` owns lifecycle classification for release-enrolled,
  build-only, benchmark-only, fixture-only, archived, and experimental examples.
  Generated-game release/build-only gates derive from that manifest and
  project-local `production.releaseProof` config instead of fallback constants.
- Maintained starters now declare generated files, package scripts,
  instruction/API-card expectations, and proof commands in
  `templates/*/threenative.template.json`; `verify:template-production`
  derives checks from those manifests.
- Verification used `pnpm verify:template-production`,
  `pnpm verify:example-build-sweep`, and focused verify-tools manifest slices.
