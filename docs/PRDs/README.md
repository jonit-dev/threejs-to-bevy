# ThreeNative PRDs

This index separates current cleanup work from historical milestone batches.

## Current Initiatives

- [Versioned Debt Cleanup](archive/cleanup-versioned-debt.md): capability naming, typed
  verification tooling, template registry, fixture catalog, and docs front door
  migration.
- [IR Contract Drift Hardening](done/other/ir-contract-drift-hardening.md): contract
  source-of-truth policy, schema/type/Rust drift gates, validating runtime load
  path, and shared validation cleanup.
- [Example-Local Artifacts, Fixtures, and Docs Structure](done/artifact-fixture-layout-reorg.md):
  canonical artifact roots, example-local verification evidence, aggregate
  reports, shared IR fixture ownership, contextual docs grouping, and layout
  drift checks.
- [Verification Gates and Package Scripts Reorg](done/other/verification-gates-and-package-scripts-reorg.md):
  typed verify-tool gate ownership, wrapper-only legacy scripts, root
  `package.json` cleanup, recursive test ownership, and compatibility aliases.
- [AI-Consumable Distribution Contract](other/ai-consumable-distribution-contract.md):
  published declarations, schemas, capabilities, diagnostics, examples, and AI
  docs that make installed packages understandable without repository source.
- [Scene Lifecycle and Game Flow Contract](done/other/scene-lifecycle-and-flow-contract.md):
  scene modules, lifecycle phases, transitions, loading, overlays, persistent
  state, and cross-runtime scene manager parity.
- [Bundle Safety and Runtime Robustness Hardening](done/other/bundle-safety-runtime-robustness-hardening.md):
  bundle path containment, atomic emit, generated payload validation, runtime
  teardown, scatter guardrails, and conformance-backed runtime parity.
- [Post-V10 Runtime Gameplay Host Semantics](done/other/post-v10-runtime-gameplay-host.md):
  live rendered-entity ECS host behavior, lifecycle semantics, event windows,
  hooks, system locals, bounded async services, and runtime plugin diagnostics.
- [Post-V10 Durable Persistence and State-Preserving Reload](done/other/post-v10-persistence-hot-reload.md):
  durable Bevy save/settings backend, autosave/checkpoint restore, reload state
  policy, and cloud/filesystem boundary diagnostics.
- [Post-V10 Input, UI, and Platform UX Polish](done/other/post-v10-input-ui-platform-polish.md):
  host touch streams, settings-screen polish, UI mutation, nested scrolling,
  spatial navigation, focus narration, virtual keyboard behavior, and device
  diagnostics.
- [Post-V10 Rendering, Materials, Geometry, and Asset Residuals](done/other/post-v10-rendering-materials-geometry-residuals.md):
  runtime LOD, streamed terrain, material proof, instancing, asset streaming,
  glTF custom attribute policy, and advanced renderer diagnostics.
- [Post-V10 Animation, Physics, and Navigation Residuals](done/other/post-v10-animation-physics-navigation-residuals.md):
  animation masks, morph targets, UI animation, sloped mesh grounding,
  constraints, mesh narrow phase, dynamic navmesh, crowd steering, and advanced
  physics diagnostics.
- [Post-V10 Production Audio, Diagnostics, Profiling, and Packaging](done/other/post-v10-production-audio-diagnostics-packaging.md):
  live audio mixer/effects, audio device diagnostics, profiler/GPU timing
  reports, signed/mobile packaging preflight, repair hints, and debug rendering.

## Historical Milestone Archive

Numbered milestone folders (`v1` through `v9`) are historical planning batches.
They remain in place for link stability and are indexed under
[archive/milestones/README.md](archive/milestones/README.md).

Do not treat milestone folder names as the current product front door. Read
[../STATUS.md](../STATUS.md) for supported capability gates and
[../bevy-feature-parity.md](../bevy-feature-parity.md) for evidence anchors.
