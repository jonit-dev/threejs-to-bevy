# ThreeNative PRDs

This index separates open planning work from completed PRDs and historical
milestone batches. For current implementation status, read
[../STATUS.md](../STATUS.md) first.

## Completed Initiatives

### Agent Ergonomics (2026-07-05)

The [agent-ergonomics bundle](done/agent-ergonomics-2026-07-05/README.md)
operationalized `CHALLENGES.md`: measure whether agents can build games
through ThreeNative at reasonable token cost, then fix the measured
frictions. Execution order mattered; PRD-000 landed first, PRD-001 measured
the baseline, and PRD-002 through PRD-005 landed the ergonomics fixes.

- [Convention Alignment](done/agent-ergonomics-2026-07-05/PRD-000-convention-alignment.md):
  convention-first design rule plus a KISS pass on the script context —
  source-authored axis mapping behind `getAxis`, `transform.position`
  property access, engine-owned `fixedDelta` clamping, proof-time rounding,
  and prescriptive legacy-idiom diagnostics, with web/Bevy conformance
  evidence.
- [Agent Authoring Benchmark](done/agent-ergonomics-2026-07-05/PRD-001-agent-authoring-benchmark.md):
  neutral scoring harness and run protocol measuring tokens-to-playable for
  identical game prompts under vanilla Three.js vs ThreeNative; produces the
  kill/continue verdict. First pilot evidence is in
  `tools/verify/artifacts/agent-benchmark/pilot-2026-07/`; ThreeNative
  exceeded the 2x token threshold on both comparable prompts.
- [Authoring Cookbook](done/agent-ergonomics-2026-07-05/PRD-002-authoring-cookbook.md):
  18 CI-validated, pattern-sized worked examples exposed via `tn cookbook`
  and indexed in generated starter agent instructions.
- [Single-Command Iteration Loop](done/agent-ergonomics-2026-07-05/PRD-003-single-command-iteration-loop.md):
  `tn iterate` collapses validate/build/screenshot/playtest into one JSON
  response with guaranteed preview teardown.
- [Prescriptive Diagnostics](done/agent-ergonomics-2026-07-05/PRD-004-prescriptive-diagnostics.md):
  structured `fix` field on the shared diagnostic contract for the top
  agent-hit rejection codes, with snippet-validity tests and MCP parity.
- [Meta-Layer Compression](done/agent-ergonomics-2026-07-05/PRD-005-meta-layer-compression.md):
  STATUS.md becomes a <=250-line enforced index over per-capability docs;
  the current generated-game release gate audits the two production-plan
  examples in this repo plus a build-only sweep for the remaining example.
  Supersedes
  [Docs Front Door Compaction](done/other/docs-front-door-compaction.md).

### UI System Remediation (2026-07-08)

The [UI System Remediation bundle](other/ui-system-remediation-2026-07-08/README.md)
closed the 2026-07-08 UI inspection: web retained-UI actions are
script-observable, UI/native parity claims are truth-graded, TSX authoring and
typed UI APIs cover text input/components, presentation semantics are bounded,
conformance reports structural/behavioral/visual UI evidence, the editor has a
read-only retained UI preview, and native UI hygiene has binding-cache plus
diagnostic coverage.

### Systems Code Quality Remediation (2026-07-08)

The [systems code quality remediation bundle](done/other/system-code-quality-remediation-2026-07-08/README.md)
closed the four urgent rows from the deep diagnostic: native scripted
spawn/despawn live reconciliation, native/web loop scheduling contract
fixtures, IR document contract truth hardening, and compiler bundle
planner/writer separation.

## Current Initiatives

Open PRDs usually live under `docs/PRDs/other/`. The near-term proof
infrastructure bundle lives under
`docs/PRDs/proof-first-engine-loop-2026-07-05/`; broader capability, docs,
refactor, and packaging work stays in `other/` until pulled into an active
execution bundle.

### Runtime And Gameplay Parity

- [Agent Proof Loop Scenario Ratchet](done/PRD-001-agent-proof-loop-scenario-ratchet.md):
  makes committed scenario playtests the default generated-game proof unit,
  adds QA scenario coverage reporting, ratchets generated-game gates away from
  ephemeral one-shot movement proof, and polishes watch-mode repair events.
- [Humanoid Course Stair Traversal Proof](done/PRD-002-humanoid-course-stair-traversal-proof.md):
  closes the remaining web-first humanoid-course scenario proof after the ramp
  and pushed-ball PRDs; native/desktop proof stays deferred by the native path
  decision until a shipped-game need lifts the freeze.
- [Declarative Gameplay Flow: Spawners, Game-Flow State Machines, Sequencer](done/proof-first-engine-loop-2026-07-05/PRD-008-declarative-gameplay-flow-spawners-sequencer.md):
  data-first `Spawner` component, bounded `GameFlow` state machines, and a
  typed-track `Sequence` timeline so waves, macro game state, and cutscenes
  need zero script, with web/Bevy conformance traces.
- [Portable Scripting Character and Physics Contacts](done/PRD-013-portable-scripting-character-physics-contacts.md):
  richer primitive contact filtering, character movement observations, slope
  and push semantics, and stable diagnostics for unsupported physics breadth.
- [Portable Scripting Delayed Commands and Bounded Scheduling](done/PRD-011-portable-scripting-delayed-commands-scheduling.md):
  fixed-tick delayed command scheduling beyond timer helpers while keeping
  promises, workers, wall-clock timers, and platform schedulers unsupported.
- [Portable Scripting Particle Commands](done/PRD-012-portable-scripting-particle-commands.md):
  bounded script particle commands over declared emitter data with web/Bevy
  service logs and visual/runtime evidence.
- [Portable Scripting Audio Facade](done/proof-first-engine-loop-2026-07-05/PRD-010-portable-scripting-audio-facade.md):
  `ctx.audio` play/stop/query over declared audio IR with logical playback IDs,
  private runtime handles, and stable unsupported streaming/platform
  diagnostics, backed by the `script-audio-facade` conformance fixture.
- [Runtime-Proven Efficient Scale](done/proof-first-engine-loop-2026-07-05/PRD-007-runtime-proven-efficient-scale.md) - done:
  measured dense-world performance proof, target-profile budget enforcement,
  instancing/LOD benchmark gates, native/web metric sidecars, and texture
  variant delivery budgets.
- [Native Parity Closure and Proof Loop](proof-first-engine-loop-2026-07-05/PRD-018-native-parity-closure-and-proof-loop.md):
  is freeze-gated by the native path decision; the proposed Bevy ports and
  generalized native proof harness remain non-actionable until a shipped-game
  need provides web evidence, native proof evidence, and a focused gate.
- [Native Render Parity and Performance](proof-first-engine-loop-2026-07-05/PRD-019-native-render-parity-and-performance.md):
  is freeze-gated by the native path decision; it documents Bevy adapter gaps
  exposed by humanoid-physics-course
  (directional shadows hardcoded off, authored lights discarded under
  atmosphere, emissive below bloom threshold, missing tangents and texture
  color-space roles, static HUD bindings) and native performance
  anti-patterns (debug-build launch, per-frame QuickJS and Rapier rebuilds,
  per-frame asset re-uploads), but should not start without a documented
  shipped-game need and focused native gate.

### Authoring, Editor, And Plugins
- [Adapter Surface Remediation](other/adapter-surface-remediation-2026-07-08/README.md):
  slices the current four urgent adapter-surface rows from the 2026-07-08
  diagnostic into generated-game proof enrollment, shared adapter drift gates,
  CLI command registry and arg plumbing, executable authoring operation
  descriptors, and editor operation metadata plus composite recipes.
- [Agent Token Efficiency IO Budget](other/agent-token-efficiency-io-budget.md):
  makes agent-facing CLI output compact by default, removes playtest
  `effectLog`/full `observations` from stdout, keeps deep logs as artifacts,
  adds compact playtest reports, and gates documented command stdout size.
- [Agent Token Efficiency Loop and API Card](other/agent-token-efficiency-loop-and-api-card.md):
  funnels generated-project agents through `tn iterate`, ships a compact
  source-validated API card in starters, and makes game-plan stdout artifact
  backed instead of long-lived full-plan context.
- [Agent Benchmark Token Cost Metrics and Rerun](other/agent-benchmark-token-cost-rerun.md):
  extends benchmark artifacts with cached/uncached token, tool-output,
  failed-command, and cost-weighted fields, then reruns the unchanged pilot
  protocol against the audit's <=0.5x raw-token target. Historical V2
  re-aggregation evidence is in
  `tools/verify/artifacts/agent-benchmark/token-cost-version-2-2026-07-07/`;
  fresh scaffold-first rerun evidence passes in
  `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/`.
- [Derived Resource Declarations](done/agent-native-authoring-loop-2026-07-07/PRD-013-derived-resource-declarations.md):
  round-4 tactical fix to infer `resourceReads` and `resourceWrites` from
  script resource access, apply deterministic declarations or exact fixes, and
  make the top undeclared-resource failure class impossible for literal helper
  calls.
- [Runtime Resource Parity Diagnostics](done/agent-native-authoring-loop-2026-07-07/PRD-014-runtime-resource-parity-diagnostics.md):
  closes the round-4 projectile-velocity black box by proving declared
  resources reach runtime state, recording resource observations in playtest
  artifacts, and emitting named diagnostics when schema-declared values are not
  observed at runtime.
- [Write-Time Validation And Retry Ratchet](done/agent-native-authoring-loop-2026-07-07/PRD-015-write-time-validation-and-retry-ratchet.md):
  routes source-writing commands through validate-before-write and extends
  benchmark metrics with same-diagnostic and identical-assertion retry-chain
  gates.
- [Equal-Proof Benchmark Protocol](done/agent-native-authoring-loop-2026-07-07/PRD-016-equal-proof-benchmark-protocol.md):
  replaces the unequal `<=0.5x` raw-token gate with equal mechanic proof,
  three repeats per condition, continuity plus beyond-one-shot prompts, and a
  decision report for round 5.
- [Typed TypeScript Game Spec](done/agent-native-authoring-loop-2026-07-07/PRD-017-typed-typescript-game-spec.md):
  closed as an experimental opt-in authoring surface; guided round-5 evidence
  showed about `0.95x` direct ThreeNative tokens and a missed failed-command
  budget, so it does not become the default starter surface.
- [Vanilla-Lift Pipeline Decision](done/agent-native-authoring-loop-2026-07-07/PRD-018-vanilla-lift-pipeline-decision.md):
  closed without starting a vanilla-lift prototype; guided round-5 evidence
  showed direct ThreeNative below vanilla at equal proof, so the trigger did not
  fire.
- [Contract De-Sprawl Through Authoring Modules And Runtime Trace Contracts](done/proof-first-engine-loop-2026-07-05/PRD-004-contract-de-sprawl-authoring-runtime-traces.md):
  splits authoring operation implementation by source family, introduces
  focused runtime trace contracts, and shrinks native mapping hotspots behind
  behavior-preserving conformance tests.
- [Actor Archetypes and Typed Scripting](done/proof-first-engine-loop-2026-07-05/PRD-009-actor-archetypes-and-typed-scripting.md):
  generated typed script context and id unions, `defineBehavior`
  source-owned system metadata, and reusable actor archetypes
  (`character`, `vehicle`, `pickup`, `camera-boom`, `prop-static`) with
  provenance, CLI/registry operations, starter guidance, and compact API-card
  examples.
- [Complete Structured Authoring Parity](done/complete-structured-authoring-parity.md):
  full structured source coverage for map/editor-owned data, CLI/MCP/editor
  operation parity with TypeScript-era authoring, bundle import, provenance, and
  round-trip proof without TypeScript reverse-generation.
- [Advanced Portable UI Composition and Screen Systems](done/other/advanced-portable-ui-composition-and-screen-systems.md):
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
- [Docs Front Door Compaction](done/other/docs-front-door-compaction.md):
  keeps `STATUS.md`, parity docs, and the PRD index sharp by moving historical
  evidence to appendices and adding docs checks for current commands, gaps, and
  roadmap-to-PRD links. Superseded and closed by
  [Meta-Layer Compression](done/agent-ergonomics-2026-07-05/PRD-005-meta-layer-compression.md).

### Advanced And Boundary Work

- [Cinematic Default Look](done/proof-first-engine-loop-2026-07-05/PRD-005-cinematic-default-look.md):
  promote `cinematic`/`stylized` render-look profiles with per-target quality
  ladders, make cinematic the zero-config default for new projects, and gate
  the default look against regression with committed reference evidence.
- [Believable Worlds: Heightfield Terrain and Biome Dressing](done/proof-first-engine-loop-2026-07-05/PRD-006-believable-world-terrain-and-biome-dressing.md):
  rendered+collidable heightfield terrain on both runtimes,
  compiler-expanded deterministic scatter layers, and `tn world generate` /
  `tn world proof` biome source/proof commands with catalog provenance.
- [Portable Shader Material Parity](proof-first-engine-loop-2026-07-05/PRD-014-portable-shader-material-parity.md):
  constrained authored shader materials with explicit uniforms/textures,
  generated web GLSL and Bevy WGSL, stable diagnostics for raw/backend shader
  escape hatches, and visual parity evidence across both engines.
- [Portable Photoreal Rendering and Post-Processing](proof-first-engine-loop-2026-07-05/PRD-015-portable-photoreal-rendering-and-postprocessing.md):
  portable HDRI/environment lighting, AO, bloom, DOF, SSR, motion blur, and
  fallback diagnostics with Three.js implementations kept adapter-private and
  Bevy parity/reporting required before promoted claims.
- [Advanced Animation and Physics Depth](proof-first-engine-loop-2026-07-05/PRD-016-advanced-animation-physics-depth.md):
  umbrella reference for retargeting, IK, arbitrary blend-tree, constraint,
  triangle narrow-phase, vehicle, soft-body, and ragdoll boundaries.
- [External Services, Media, and Non-Portable Boundaries](done/PRD-003-external-services-media-boundaries.md):
  cloud/account storage, custom decoders, streaming/network audio, online
  services, alternate authoring models, 2D workflows, and backend-only
  diagnostic boundaries.
- [Signed Installers And Store Packaging](proof-first-engine-loop-2026-07-05/PRD-017-signed-installers-store-packaging.md):
  credential-aware dry-run and signed desktop packaging, installer artifact
  reports, store metadata preflight, and release-gate evidence without leaking
  secrets.

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
  [GameBlocks-Informed Gameplay Accuracy](done/gameblocks-informed-gameplay-accuracy.md),
  [Game Development Velocity Kits](done/game-development-velocity-kits.md),
  [Agent Game Planning Template and Init Scaffold](done/agent-game-planning-template-and-init-scaffold.md),
  [Agent Token Efficiency Scaffold-First Game Plan Apply](done/other/agent-token-efficiency-scaffold-first.md),
  [Agent-Friendly Project Scaffolding and Visual Debugging Workflows](done/agent-friendly-project-and-visual-debugging-workflows.md),
  [Agent-Friendly 3D Game Creation Contract](done/other/agent-friendly-3d-game-creation-contract.md),
  [Playable Game Authoring Loop Hardening](done/other/game-authoring-loop-hardening.md),
  [Playtest Self-Verification Polish](done/playtest-self-verification-polish.md),
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
  [Advanced Visual Effects, Lighting, and Material Depth](done/advanced-visual-effects-lighting-material-depth.md),
  [Web and Bevy Scripting Host Conformance](done/other/web-bevy-scripting-host-conformance.md),
  [SDK Physics Collider Contract Boundary](done/other/sdk-physics-collider-contract-boundary.md),
  [Render Look, Shadow, and Bloom Polish Profiles](done/other/render-look-shadow-bloom-polish.md),
  [Imported glTF Visual Fidelity](done/other/imported-gltf-visual-fidelity.md),
  [Scene Lifecycle and Game Flow Contract](done/other/scene-lifecycle-and-flow-contract.md),
  [Bundle Safety and Runtime Robustness Hardening](done/other/bundle-safety-runtime-robustness-hardening.md),
  [Native Game Loop State Parity](done/other/native-game-loop-state-parity.md),
  [Post-V10 Runtime Gameplay Host Semantics](done/other/post-v10-runtime-gameplay-host.md),
  [Third-Person Orbit Movement Rig Residuals](done/other/third-person-orbit-movement-rig-residuals.md),
  [Post-V10 Durable Persistence and State-Preserving Reload](done/other/post-v10-persistence-hot-reload.md),
  [Post-V10 Input, UI, and Platform UX Polish](done/other/post-v10-input-ui-platform-polish.md),
  [Post-V10 Rendering, Materials, Geometry, and Asset Residuals](done/other/post-v10-rendering-materials-geometry-residuals.md),
  [Post-V10 Animation, Physics, and Navigation Residuals](done/other/post-v10-animation-physics-navigation-residuals.md),
  [Post-V10 Production Audio, Diagnostics, Profiling, and Packaging](done/other/post-v10-production-audio-diagnostics-packaging.md).
- Release and distribution:
  [Versioned Debt Cleanup](archive/cleanup-versioned-debt.md),
  [Source Size SRP Refactor Plan](done/source-size-srp-refactor-plan.md),
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
