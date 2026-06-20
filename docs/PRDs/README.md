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
- [Verification Strategy and Speed](done/verification-strategy-and-speed.md):
  test-vs-gate ownership, verification script classification, build-once
  release orchestration, gate profiles, and timing budgets.
- [AI-Consumable Distribution Contract](other/ai-consumable-distribution-contract.md):
  published declarations, schemas, capabilities, diagnostics, examples, and AI
  docs that make installed packages understandable without repository source.
- [Agent-Friendly Project Scaffolding and Visual Debugging Workflows](other/agent-friendly-project-and-visual-debugging-workflows.md):
  init/create front door, task-oriented help, doctor diagnostics, asset/model
  inspection, transform/camera guardrails, screenshot/video proof, runtime
  debug overlay, and racing template evidence.
- [Agent-Safe Scene Authoring CLI](done/other/agent-safe-scene-authoring-cli.md):
  shared authoring core, `tn scene ... --json` operations, schema/semantic
  validation, deterministic diagnostics, and AI-safe scene mutation workflow.
- [Authoring Graph and Provenance Capture](done/other/authoring-graph-provenance-capture.md):
  compiler-owned authoring graph, declaration provenance, source-path
  diagnostics, duplicate/conflict checks, and deterministic normalization.
- [Modular SDK Authoring Declarations](other/modular-sdk-authoring-declarations.md):
  data-first/module-first SDK declarations for scenes, entities, prefabs,
  resources, systems, input, UI, audio, and assets.
- [Script Module References and Manifest](other/script-module-references-and-manifest.md):
  source module/export script refs, generated script manifest, collision
  diagnostics, helper import policy, and generated-script source boundaries.
- [Web and Bevy Scripting Host Conformance](other/web-bevy-scripting-host-conformance.md):
  shared scripting service matrix, effect validation parity, ambient API
  diagnostics, and web/native conformance fixtures.
- [Modular Template Migration and Proof](other/modular-template-migration-and-proof.md):
  canonical template migration to modular authoring, CLI validation, web proof,
  and native proof where claimed.
- [Editor Snapshot and Source Patch Bridge](other/editor-snapshot-source-patch-bridge.md):
  source/generated/runtime document classification, structured source patches,
  live edit policy, and deterministic editor diffs.
- [Authoring MCP Wrapper](other/authoring-mcp-wrapper.md):
  optional MCP tools as thin wrappers over the same authoring core/CLI behavior.
- [Editor-Ready Modular Authoring and Scripting Architecture](other/editor-ready-modular-authoring-and-scripting-architecture.md):
  source-of-truth boundaries, modular authoring graph/provenance, script module
  references, editor-safe source documents, and web/Bevy runtime parity.
- [Advanced Visual Effects, Lighting, and Material Depth](other/advanced-visual-effects-lighting-material-depth.md):
  remaining advanced lighting, material, atmosphere, post-processing, deferred
  renderer, virtual geometry, and custom post-processing gaps.
- [Advanced Animation and Physics Depth](other/advanced-animation-physics-depth.md):
  remaining retargeting, IK, arbitrary blend-tree, constraint, triangle
  narrow-phase, vehicle, soft-body, and ragdoll gaps.
- [UI Platform and Desktop Residuals](other/ui-platform-desktop-residuals.md):
  remaining gesture, virtual keyboard, world UI, italic text, advanced grid,
  broad gamepad/touch UI, and desktop webview packaging gaps.
- [External Services, Media, and Non-Portable Boundaries](other/external-services-media-boundaries.md):
  cloud/account storage, custom decoders, streaming/network audio, online
  services, alternate authoring models, 2D workflows, and backend-only
  diagnostic boundaries.
- [Bevy Catalog Watchlist Residuals](other/bevy-catalog-watchlist-residuals.md):
  newly tracked upstream Bevy catalog gaps for ECS callbacks/query ergonomics,
  editable text/IME, UI viewport and drag behavior, window/cursor/power policy,
  runtime asset authoring/export, generated assets, and glTF extension
  processing.
- [Portable Scripting Runtime Query Diffing](done/other/portable-scripting-runtime-query-diffing.md):
  hidden runtime diffing for `changed` queries with deterministic web/Bevy
  component snapshots, explicit metadata compatibility, and conformance
  evidence.
- [Portable Scripting Character and Physics Contacts](other/portable-scripting-character-physics-contacts.md):
  richer primitive contact filtering, character movement observations, slope
  and push semantics, and stable diagnostics for unsupported physics breadth.
- [Portable Scripting Runtime Prefabs and Hierarchy Commands](done/other/portable-scripting-runtime-prefabs-hierarchy.md):
  bundle-local runtime prefab catalogs, deterministic instantiation, hierarchy
  mutation commands, and rendered entity ownership/teardown parity.
- [Portable Scripting Delayed Commands and Bounded Scheduling](other/portable-scripting-delayed-commands-scheduling.md):
  fixed-tick delayed command scheduling beyond timer helpers while keeping
  promises, workers, wall-clock timers, and platform schedulers unsupported.
- [Portable Scripting Particle Commands](other/portable-scripting-particle-commands.md):
  bounded script particle commands over declared emitter data with web/Bevy
  service logs and visual/runtime evidence.
- [Portable Scripting Audio Facade](other/portable-scripting-audio-facade.md):
  `ctx.audio` play/stop/query over declared audio IR with logical playback IDs,
  private runtime handles, and stable unsupported streaming/platform diagnostics.
- [Portable Scripting UI, Persistence, and Settings Facades](done/other/portable-scripting-ui-persistence-settings-facades.md):
  bounded `ctx.ui`, `ctx.persistence`, and `ctx.settings` APIs over retained UI
  and local-data IR without exposing DOM, native widget, filesystem, cloud, or
  platform handles.
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
