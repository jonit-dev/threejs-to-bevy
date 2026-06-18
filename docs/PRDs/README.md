# ThreeNative PRDs

This index separates current cleanup work from historical milestone batches.

## Current Initiatives

- [Versioned Debt Cleanup](archive/cleanup-versioned-debt.md): capability naming, typed
  verification tooling, template registry, fixture catalog, and docs front door
  migration.
- [IR Contract Drift Hardening](other/ir-contract-drift-hardening.md): contract
  source-of-truth policy, schema/type/Rust drift gates, validating runtime load
  path, and shared validation cleanup.
- [Example-Local Artifacts, Fixtures, and Docs Structure](other/artifact-fixture-layout-reorg.md):
  canonical artifact roots, example-local verification evidence, aggregate
  reports, shared IR fixture ownership, contextual docs grouping, and layout
  drift checks.
- [Verification Gates and Package Scripts Reorg](other/verification-gates-and-package-scripts-reorg.md):
  typed verify-tool gate ownership, wrapper-only legacy scripts, root
  `package.json` cleanup, recursive test ownership, and compatibility aliases.
- [AI-Consumable Distribution Contract](other/ai-consumable-distribution-contract.md):
  published declarations, schemas, capabilities, diagnostics, examples, and AI
  docs that make installed packages understandable without repository source.
- [Scene Lifecycle and Game Flow Contract](other/scene-lifecycle-and-flow-contract.md):
  scene modules, lifecycle phases, transitions, loading, overlays, persistent
  state, and cross-runtime scene manager parity.

## Historical Milestone Archive

Numbered milestone folders (`v1` through `v9`) are historical planning batches.
They remain in place for link stability and are indexed under
[archive/milestones/README.md](archive/milestones/README.md).

Do not treat milestone folder names as the current product front door. Read
[../STATUS.md](../STATUS.md) for supported capability gates and
[../bevy-feature-parity.md](../bevy-feature-parity.md) for evidence anchors.
