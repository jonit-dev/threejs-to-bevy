# ThreeNative PRDs

This index separates open planning work from completed PRDs and historical
milestone batches. For current implementation status, read
[../STATUS.md](../STATUS.md) first.

## Current Initiatives

Open PRDs live under `docs/PRDs/other/`. Treat these as the active planning
backlog unless a nested PRD says it has been superseded.

### Runtime And Gameplay Parity

- [GameBlocks-Informed Gameplay Accuracy](other/gameblocks-informed-gameplay-accuracy.md):
  use the useful portable semantics from GameBlocks as source material for
  ThreeNative-owned gameplay-block planning descriptors, pure script helpers,
  recipe metadata, and conformance proof without importing Three.js/Rapier/DOM
  runtime code.
- [Portable Scripting Character and Physics Contacts](other/portable-scripting-character-physics-contacts.md):
  richer primitive contact filtering, character movement observations, slope
  and push semantics, and stable diagnostics for unsupported physics breadth.
- [Portable Scripting Delayed Commands and Bounded Scheduling](other/portable-scripting-delayed-commands-scheduling.md):
  fixed-tick delayed command scheduling beyond timer helpers while keeping
  promises, workers, wall-clock timers, and platform schedulers unsupported.
- [Portable Scripting Particle Commands](other/portable-scripting-particle-commands.md):
  bounded script particle commands over declared emitter data with web/Bevy
  service logs and visual/runtime evidence.
- [Portable Scripting Audio Facade](other/portable-scripting-audio-facade.md):
  `ctx.audio` play/stop/query over declared audio IR with logical playback IDs,
  private runtime handles, and stable unsupported streaming/platform
  diagnostics.

### Authoring, Editor, And Plugins

- [Complete Structured Authoring Parity](other/complete-structured-authoring-parity.md):
  full structured source coverage for map/editor-owned data, CLI/MCP/editor
  operation parity with TypeScript-era authoring, bundle import, provenance, and
  round-trip proof without TypeScript reverse-generation.
- [Advanced Portable UI Composition and Screen Systems](other/advanced-portable-ui-composition-and-screen-systems.md):
  reusable retained UI components, theme tokens, screen stacks, modal/focus
  scopes, game UI recipes, responsive fit proof, and source-backed CLI/editor
  operations without making webview overlays the default portable UI path.
- [Optional React App Shell and Pre-Game Flow](other/optional-react-app-shell-and-pre-game-flow.md):
  bundle-local React/CSS app-shell startup for title, login, profile, settings,
  and launcher flows before initial game activation, using typed bridge
  messages without making React the portable game UI contract.
- [Editor-Ready Modular Authoring and Scripting Architecture](other/editor-ready-modular-authoring-and-scripting-architecture.md):
  source-of-truth boundaries, modular authoring graph/provenance, script module
  references, editor-safe source documents, and web/Bevy runtime parity.
- [Editor Script Body Code Mode](other/editor-script-body-code-mode.md):
  bounded code-mode workflow for creating, opening, editing, and validating
  project-local `src/scripts/**/*.ts` modules while preserving module/export
  script references as structured source data.
- [Source-Backed Plugin System](other/plugin-system.md):
  portable plugin manifests, deterministic source-backed install/remove
  operations, compiler provenance, runtime metadata parity, plugin verification
  gates, and a sample checkpoint-orb plugin proven working in a playable game.
- [Agent-Friendly Project Scaffolding and Visual Debugging Workflows](other/agent-friendly-project-and-visual-debugging-workflows.md):
  init/create front door, task-oriented help, doctor diagnostics, asset/model
  inspection, transform/camera guardrails, screenshot/video proof, runtime
  debug overlay, and racing template evidence.
- [Agent Game Planning Template and Init Scaffold](other/agent-game-planning-template-and-init-scaffold.md):
  scaffolded plan-first Markdown worksheet for agent-created games, default
  `tn init` inclusion, catalog-first asset sourcing instructions, and
  template-production drift checks.

### Advanced And Boundary Work

- [Portable Shader Material Parity](other/portable-shader-material-parity.md):
  constrained authored shader materials with explicit uniforms/textures,
  generated web GLSL and Bevy WGSL, stable diagnostics for raw/backend shader
  escape hatches, and visual parity evidence across both engines.
- [Portable Photoreal Rendering and Post-Processing](other/portable-photoreal-rendering-and-postprocessing.md):
  portable HDRI/environment lighting, AO, bloom, DOF, SSR, motion blur, and
  fallback diagnostics with Three.js implementations kept adapter-private and
  Bevy parity/reporting required before promoted claims.
- [Advanced Visual Effects, Lighting, and Material Depth](other/advanced-visual-effects-lighting-material-depth.md):
  umbrella reference for advanced lighting, material, atmosphere,
  post-processing, deferred renderer, virtual geometry, and custom
  post-processing boundaries.
- [Advanced Animation and Physics Depth](other/advanced-animation-physics-depth.md):
  umbrella reference for retargeting, IK, arbitrary blend-tree, constraint,
  triangle narrow-phase, vehicle, soft-body, and ragdoll boundaries.
- [External Services, Media, and Non-Portable Boundaries](other/external-services-media-boundaries.md):
  cloud/account storage, custom decoders, streaming/network audio, online
  services, alternate authoring models, 2D workflows, and backend-only
  diagnostic boundaries.

## Completed Reference PRDs

- [Camera and Post-Processing Boundaries](done/other/camera-post-processing-boundaries.md):
  depth-of-field report-only runtime semantics, target-profile diagnostics for
  auto exposure, motion blur, SSR/mirrors, deferred rendering, volumetrics, and
  custom post-processing, and compiler capability checks that avoid backend
  render-path selections.
- [Dense Scene LOD and Texture Delivery](done/other/dense-scene-lod-texture-delivery.md):
  camera-facing quad impostor metadata, web/native dense-content reports,
  target-profile texture variant diagnostics, deterministic baseline fallback
  selection, and continued diagnostic boundaries for arbitrary GPU instance
  buffers.
- [Animation, Morph, Mask, and Lightweight VFX Polish](done/other/animation-morph-mask-vfx-polish.md):
  morph target names/weights, animation masks, bounded blend residuals, and
  ThreeNative-owned particle/VFX commands with deterministic web/Bevy proof.

Completed PRDs live under `docs/PRDs/done/`. They remain linked for context,
evidence trails, and source-boundary decisions, but they are not active backlog.

Useful completed reference groups:

- Core authoring and provenance:
  [Agent-Safe Scene Authoring CLI](done/other/agent-safe-scene-authoring-cli.md),
  [Authoring Graph and Provenance Capture](done/other/authoring-graph-provenance-capture.md),
  [Modular SDK Authoring Declarations](done/other/modular-sdk-authoring-declarations.md),
  [Script Module References and Manifest](done/other/script-module-references-and-manifest.md),
  [TypeScript Authoring Facade and Script Ergonomics](done/other/typescript-authoring-facade-and-script-ergonomics.md).
- Game-production workflow:
  [Agent-Friendly 3D Game Creation Contract](done/other/agent-friendly-3d-game-creation-contract.md),
  [Playable Game Authoring Loop Hardening](done/other/game-authoring-loop-hardening.md),
  [Shippable Asset Source Catalog](done/other/shippable-asset-source-catalog.md),
  [Agentic Game Production Workflow](done/other/agentic-game-production-workflow.md),
  [Bowling Lane Agent-Friendly Scene Source Refactor](done/other/bowling-lane-agent-friendly-scene-source.md).
- Editor implementation references:
  [Editor Package Shell and Adapter Contract](done/other/editor-package-shell-and-adapter-contract.md),
  [Editor Source Path and Operation Bridge](done/other/editor-source-path-and-operation-bridge.md),
  [Editor Source Document Workbench](done/other/editor-source-document-workbench.md),
  [Editor Runtime Preview and Vibe UI Port](done/other/editor-runtime-preview-and-vibe-ui-port.md),
  [Functional Editor Viewport, Gizmo, and Selection](done/other/functional-editor-viewport-gizmo-and-selection.md),
  [Functional Editor Scene, Assets, and Environment](done/other/functional-editor-scene-assets-and-environment.md),
  [Functional Editor Operations, Modals, and Inspector Completion](done/other/functional-editor-operations-modals-and-inspector-completion.md),
  [Editor Functional Gap Closure](done/other/editor-functional-gap-closure.md),
  [Editor AI Chat ECS Control](done/other/editor-ai-chat-ecs-control.md).
- Runtime and parity references:
  [Web and Bevy Scripting Host Conformance](done/other/web-bevy-scripting-host-conformance.md),
  [SDK Physics Collider Contract Boundary](done/other/sdk-physics-collider-contract-boundary.md),
  [Render Look, Shadow, and Bloom Polish Profiles](done/other/render-look-shadow-bloom-polish.md),
  [Imported glTF Visual Fidelity](done/other/imported-gltf-visual-fidelity.md),
  [Scene Lifecycle and Game Flow Contract](done/other/scene-lifecycle-and-flow-contract.md),
  [Bundle Safety and Runtime Robustness Hardening](done/other/bundle-safety-runtime-robustness-hardening.md),
  [Native Game Loop State Parity](done/other/native-game-loop-state-parity.md),
  [Post-V10 Runtime Gameplay Host Semantics](done/other/post-v10-runtime-gameplay-host.md),
  [Post-V10 Durable Persistence and State-Preserving Reload](done/other/post-v10-persistence-hot-reload.md),
  [Post-V10 Input, UI, and Platform UX Polish](done/other/post-v10-input-ui-platform-polish.md),
  [Post-V10 Rendering, Materials, Geometry, and Asset Residuals](done/other/post-v10-rendering-materials-geometry-residuals.md),
  [Post-V10 Animation, Physics, and Navigation Residuals](done/other/post-v10-animation-physics-navigation-residuals.md),
  [Post-V10 Production Audio, Diagnostics, Profiling, and Packaging](done/other/post-v10-production-audio-diagnostics-packaging.md).
- Release and distribution:
  [Versioned Debt Cleanup](archive/cleanup-versioned-debt.md),
  [IR Contract Drift Hardening](done/other/ir-contract-drift-hardening.md),
  [Example-Local Artifacts, Fixtures, and Docs Structure](done/artifact-fixture-layout-reorg.md),
  [Verification Gates and Package Scripts Reorg](done/other/verification-gates-and-package-scripts-reorg.md),
  [Verification Strategy and Speed](done/verification-strategy-and-speed.md),
  [AI-Consumable Distribution Contract](done/other/ai-consumable-distribution-contract.md),
  [Target Profile Contract Hardening](done/other/target-profile-contract-hardening.md).

## Historical Milestone Archive

Numbered milestone folders (`v1` through `v10`) are historical planning
batches. They remain in place for link stability and are indexed under
[archive/milestones/README.md](archive/milestones/README.md).

Do not treat milestone folder names as the current product front door. Read
[../STATUS.md](../STATUS.md) for supported capability gates and
[../bevy-feature-parity.md](../bevy-feature-parity.md) for evidence anchors.
